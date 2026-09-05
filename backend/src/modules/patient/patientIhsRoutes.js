import { Router } from 'express';
import { findPatientByMedicalRecord } from './patientRepository.js';
import { getPatientResource } from './patientIhsRepository.js';
import { lookupPatientIhs, maskNik } from './ihsService.js';
import { discoverAndPreparePatient } from './patientDiscovery.js';
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

// Explicit PHASE 7B action: discover one Khanza Patient and move only the
// control-plane resource through DISCOVERED -> MAPPED -> READY.
patientIhsRouter.post('/:noRkmMedis/prepare', async (req, res, next) => {
  try {
    const result = await discoverAndPreparePatient(req.params.noRkmMedis);
    if (!result) return res.status(404).json({ ok: false, error: 'PATIENT_NOT_FOUND' });
    res.json({
      ok: true,
      resource_id: result.resource.id,
      patient: publicPatient(result.patient),
      status: result.resource.status,
      mode: 'CONTROL_PLANE_PREPARE'
    });
  } catch (error) { next(error); }
});

// Monitoring only: lookup reads SATUSEHAT state but does not create or update Patient.
patientIhsRouter.post('/:noRkmMedis/lookup', async (req, res, next) => {
  try {
    const patient = await findPatientByMedicalRecord(req.params.noRkmMedis);
    if (!patient) return res.status(404).json({ ok: false, error: 'PATIENT_NOT_FOUND' });
    const resource = await ensureResource(patient);
    if (resource.satusehat_id) {
      return res.json({
        ok: true,
        resource_id: resource.id,
        patient: publicPatient(patient),
        found: true,
        patientId: resource.satusehat_id,
        alreadyMapped: true,
        mode: 'MONITORING_ONLY'
      });
    }
    const result = await lookupPatientIhs(resource.id, patient);
    res.json({ ok: true, resource_id: resource.id, patient: publicPatient(patient), ...result, mode: 'MONITORING_ONLY' });
  } catch (error) { next(error); }
});

patientIhsRouter.get('/resource/:id', async (req, res, next) => {
  try {
    const resource = await getPatientResource(req.params.id);
    if (!resource) return res.status(404).json({ ok: false, error: 'PATIENT_RESOURCE_NOT_FOUND' });
    res.json({ ok: true, data: resource, mode: 'MONITORING_ONLY' });
  } catch (error) { next(error); }
});
