import { Router } from 'express';
import { discoverPatients } from './patientService.js';
import { findPatientByMedicalRecord } from './patientRepository.js';
import { lookupPatientIhs, maskNik } from './ihsService.js';
import { controlDb } from '../../database/pool.js';

export const patientRouter = Router();

patientRouter.post('/discover', async (req, res, next) => {
  try {
    const result = await discoverPatients({
      limit: req.body?.limit,
      offset: req.body?.offset
    });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

patientRouter.get('/:noRkmMedis/profile', async (req, res, next) => {
  try {
    const patient = await findPatientByMedicalRecord(req.params.noRkmMedis);
    if (!patient) return res.status(404).json({ ok: false, error: 'PATIENT_NOT_FOUND' });

    res.json({
      ok: true,
      patient: {
        no_rkm_medis: patient.no_rkm_medis,
        nama: patient.nm_pasien,
        nik: maskNik(patient.no_ktp),
        jk: patient.jk || null,
        tgl_lahir: patient.tgl_lahir || null
      }
    });
  } catch (error) {
    next(error);
  }
});

patientRouter.post('/:noRkmMedis/lookup-ihs', async (req, res, next) => {
  try {
    const patient = await findPatientByMedicalRecord(req.params.noRkmMedis);
    if (!patient) return res.status(404).json({ ok: false, error: 'PATIENT_NOT_FOUND' });

    const upsert = await controlDb.query(
      `INSERT INTO integration_resource
        (resource_type, source_system, source_table, source_key, no_rkm_medis, status)
       VALUES ('Patient', 'KHANZA', 'pasien', $1, $1, 'DISCOVERED')
       ON CONFLICT (resource_type, source_system, source_key)
       DO UPDATE SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, satusehat_id, status`,
      [String(patient.no_rkm_medis)]
    );

    const resource = upsert.rows[0];
    if (resource.satusehat_id) {
      return res.json({
        ok: true,
        patient: {
          no_rkm_medis: patient.no_rkm_medis,
          nama: patient.nm_pasien,
          nik: maskNik(patient.no_ktp)
        },
        found: true,
        created: false,
        patientId: resource.satusehat_id,
        alreadyMapped: true
      });
    }

    const result = await lookupPatientIhs(resource.id, patient);

    res.json({
      ok: true,
      patient: {
        no_rkm_medis: patient.no_rkm_medis,
        nama: patient.nm_pasien,
        nik: maskNik(patient.no_ktp)
      },
      ...result
    });
  } catch (error) {
    next(error);
  }
});
