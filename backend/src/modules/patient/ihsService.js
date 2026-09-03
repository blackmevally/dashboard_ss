import crypto from 'node:crypto';
import { controlDb } from '../../database/pool.js';
import { createPatientByNik, searchPatientByNik } from '../../satusehat/fhirClient.js';
import { markFailure, markSuccess } from '../../queue/resourceQueue.js';
import { resolvePatientIhs } from './ihsResolver.js';

export function maskNik(nik) {
  const value = String(nik || '');
  if (value.length < 8) return '********';
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

function genderToFhir(jk) {
  const value = String(jk || '').trim().toUpperCase();
  if (value === 'L' || value === 'M' || value === 'MALE') return 'male';
  if (value === 'P' || value === 'F' || value === 'FEMALE') return 'female';
  return null;
}

function normalizeBirthDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function buildPatientPayload(patient, nik) {
  const gender = genderToFhir(patient?.jk);
  const birthDate = normalizeBirthDate(patient?.tgl_lahir);
  if (!gender || !birthDate || !String(patient?.nm_pasien || '').trim()) return null;

  return {
    resourceType: 'Patient',
    identifier: [{ use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: String(nik).trim() }],
    name: [{ use: 'official', text: String(patient.nm_pasien).trim() }],
    birthDate,
    gender,
    ...(patient.alamat ? { address: [{ use: 'home', text: String(patient.alamat).trim() }] } : {}),
    ...(patient.no_tlp ? { telecom: [{ system: 'phone', value: String(patient.no_tlp).trim(), use: 'mobile' }] } : {})
  };
}

async function getResource(resourceId) {
  const result = await controlDb.query('SELECT * FROM integration_resource WHERE id = $1 LIMIT 1', [resourceId]);
  return result.rows[0] ?? null;
}

async function setProcessing(resourceId) {
  const result = await controlDb.query(
    `UPDATE integration_resource
     SET status = 'PROCESSING', attempt_count = attempt_count + 1,
         last_attempt_at = CURRENT_TIMESTAMP, locked_at = CURRENT_TIMESTAMP,
         locked_by = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('DISCOVERED', 'READY', 'RETRY')
     RETURNING *`,
    [resourceId, `patient-${crypto.randomUUID()}`]
  );
  return result.rows[0] ?? null;
}

async function savePayload(resourceId, direction, payload, httpStatus = null, response = null) {
  await controlDb.query(
    `INSERT INTO integration_payload (resource_id, direction, payload, http_status, response)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)`,
    [resourceId, direction, JSON.stringify(payload ?? {}), httpStatus, response == null ? null : JSON.stringify(response)]
  );
}

export async function lookupPatientIhs(resourceId, patient) {
  const processing = await setProcessing(resourceId);
  if (!processing) throw new Error('Patient resource is not in a processable state');

  const nik = String(patient?.no_ktp || '').trim();

  if (!/^\d{16}$/.test(nik)) {
    await markFailure(resourceId, {
      errorCode: 'PATIENT_NIK_INVALID',
      errorMessage: 'NIK pasien Khanza tidak valid atau belum tersedia',
      httpStatus: null,
      retryable: false
    });

    return {
      found: false,
      created: false,
      failed: true,
      errorCode: 'PATIENT_NIK_INVALID',
      resolution: 'REVIEW',
      candidates: []
    };
  }

  try {
    const result = await searchPatientByNik(nik);
    await savePayload(resourceId, 'INBOUND', result.data, result.status, result.data);

    const resolution = resolvePatientIhs(result.data, nik);

    if (resolution.outcome === 'MATCHED') {
      await markSuccess(resourceId, { satusehatId: resolution.patientId });
      return {
        found: true,
        created: false,
        patientId: resolution.patientId,
        resolution: 'MATCHED',
        candidates: resolution.candidates
      };
    }

    if (resolution.outcome === 'AMBIGUOUS') {
      await markFailure(resourceId, {
        errorCode: 'PATIENT_MULTIPLE_MATCHES',
        errorMessage: 'SATUSEHAT mengembalikan lebih dari satu Patient untuk NIK yang sama; mapping diblokir untuk review',
        httpStatus: result.status,
        response: result.data,
        retryable: false
      });
      return {
        found: false,
        created: false,
        failed: true,
        errorCode: 'PATIENT_MULTIPLE_MATCHES',
        resolution: 'AMBIGUOUS',
        candidates: resolution.candidates
      };
    }

    if (resolution.outcome === 'REVIEW') {
      await markFailure(resourceId, {
        errorCode: 'PATIENT_IDENTIFIER_MISMATCH',
        errorMessage: 'Response Patient tidak memiliki identifier NIK yang cocok persis; mapping diblokir untuk review',
        httpStatus: result.status,
        response: result.data,
        retryable: false
      });
      return {
        found: false,
        created: false,
        failed: true,
        errorCode: 'PATIENT_IDENTIFIER_MISMATCH',
        resolution: 'REVIEW',
        candidates: resolution.candidates
      };
    }

    await markFailure(resourceId, {
      errorCode: 'PATIENT_NOT_FOUND',
      errorMessage: 'Tidak ditemukan Patient SATUSEHAT untuk NIK; lookup tetap read-only dan tidak membuat Patient otomatis',
      httpStatus: result.status,
      response: result.data
    });
    return {
      found: false,
      created: false,
      failed: true,
      errorCode: 'PATIENT_NOT_FOUND',
      resolution: 'NOT_FOUND',
      candidates: []
    };
  } catch (error) {
    await markFailure(resourceId, {
      errorCode: error.code || 'IHS_LOOKUP_FAILED',
      errorMessage: error.message,
      httpStatus: error.httpStatus || null,
      response: error.response || null
    });
    return { found: false, created: false, failed: true, errorCode: error.code || 'IHS_LOOKUP_FAILED' };
  }
}

export async function createPatientIhs(resourceId, patient, nik = patient?.no_ktp, alreadyProcessing = false) {
  // Explicit dashboard CREATE calls can start from DISCOVERED/READY/RETRY.
  // Lookup -> create is already PROCESSING and must not increment the attempt twice.
  if (!alreadyProcessing) {
    const current = await getResource(resourceId);
    if (!current) throw new Error('Patient resource not found');
    if (current.status !== 'PROCESSING') {
      const processing = await setProcessing(resourceId);
      if (!processing) throw new Error('Patient resource is not in a processable state');
    }
  }

  const payload = buildPatientPayload(patient, nik);
  if (!payload) {
    await markFailure(resourceId, {
      errorCode: 'PATIENT_DATA_INCOMPLETE',
      errorMessage: 'Data minimum Patient tidak lengkap: nama, tanggal lahir, atau jenis kelamin',
      httpStatus: null
    });
    return { created: false, failed: true, errorCode: 'PATIENT_DATA_INCOMPLETE' };
  }

  await savePayload(resourceId, 'OUTBOUND', payload);

  try {
    const result = await createPatientByNik({
      nik: String(nik || '').trim(),
      name: patient.nm_pasien,
      birthDate: payload.birthDate,
      gender: payload.gender,
      address: patient.alamat,
      phone: patient.no_tlp
    });

    const createdResource = result.data;
    await savePayload(resourceId, 'INBOUND', createdResource, result.status, createdResource);

    const patientId = createdResource?.id || null;
    if (!patientId) {
      await markFailure(resourceId, {
        errorCode: 'PATIENT_CREATE_NO_ID',
        errorMessage: 'SATUSEHAT menerima request tetapi response tidak berisi Patient.id',
        httpStatus: result.status,
        response: createdResource
      });
      return { created: false, failed: true, errorCode: 'PATIENT_CREATE_NO_ID' };
    }

    await markSuccess(resourceId, { satusehatId: patientId });
    return { created: true, patientId };
  } catch (error) {
    await markFailure(resourceId, {
      errorCode: error.code || 'IHS_CREATE_FAILED',
      errorMessage: error.message,
      httpStatus: error.httpStatus || null,
      response: error.response || null
    });
    return { created: false, failed: true, errorCode: error.code || 'IHS_CREATE_FAILED' };
  }
}
