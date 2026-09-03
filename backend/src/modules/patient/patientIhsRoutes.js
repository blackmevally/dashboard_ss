import { Router } from 'express';
import { findPatientByMedicalRecord } from './patientRepository.js';
import { getPatientResource } from './patientIhsRepository.js';
import { maskNik } from './ihsService.js';
import { controlDb } from '../../database/pool.js';

export const patientIhsRouter = Router();

async function ensureResource(patient) {
  const result = await controlDb.query(
    `INSERT INTO integration_resource
      (resource_type, source_system, source_table, source_key, no_rkm_medis, status)
     VALUES ('Patient', 'KHANZA', 'pasien', $1, $1, 'DISCOVERED')
     ON CONFLICT (resource_type, source_system, source_key)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [String(patient.no_rkm_medis)]
  );
  return result.rows[0];
}

const publicPatient = patient => ({
  no_rkm_medis: patient.no_rkm_medis,
  nama: patient.nm_pasien,
  nik: maskNik(patient.no_ktp)
});

// Monitoring-only: inspect local Patient mapping/IHS state without contacting or modifying SATUSEHAT.
patientIhsRouter.get('/:noRkmMedis/status', async (req, res, next) => {
  try {
    const patient = await findPatientByMedicalRecord(req.params.noRkmMedis);
    if (!patient) return res.status(404).json({ ok: false, error: 'PATIENT_NOT_FOUND' });

    const resource = await ensureResource(patient);
    const errors = await controlDb.query(
      `SELECT id, attempt_no, error_code, error_message, http_status, created_at
       FROM integration_error WHERE resource_id = $1 ORDER BY id DESC LIMIT 10`,
      [resource.id]
    );

    res.json({
      ok: true,
      mode: 'monitoring-only',
      patient: publicPatient(patient),
      resource_id: resource.id,
      satusehat_id: resource.satusehat_id,
      status: resource.status,
      http_status: resource.http_status,
      error_code: resource.error_code,
      error_message: resource.error_message,
      attempt_count: resource.attempt_count,
      last_attempt_at: resource.last_attempt_at,
      last_success_at: resource.last_success_at,
      errors: errors.rows
    });
  } catch (error) { next(error); }
});

patientIhsRouter.get('/resource/:id', async (req, res, next) => {
  try {
    const resource = await getPatientResource(req.params.id);
    if (!resource) return res.status(404).json({ ok: false, error: 'PATIENT_RESOURCE_NOT_FOUND' });
    res.json({ ok: true, mode: 'monitoring-only', data: resource });
  } catch (error) { next(error); }
});
