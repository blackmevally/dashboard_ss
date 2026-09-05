import { controlDb } from '../../database/pool.js';
import { findPatientByMedicalRecord } from './patientRepository.js';
import { lookupPatientIhs } from './ihsService.js';
import { markFailure } from '../../queue/resourceQueue.js';

/**
 * Process one Patient resource that has already been claimed by the queue.
 * Khanza remains the source of truth; the worker only reads pasien and performs
 * a SATUSEHAT Patient lookup. It never creates/updates the Khanza Patient.
 */
export async function processPatientResource(resource) {
  const noRkmMedis = String(resource?.no_rkm_medis || resource?.source_key || '').trim();
  if (!noRkmMedis) {
    await markFailure(resource.id, {
      errorCode: 'PATIENT_SOURCE_KEY_MISSING',
      errorMessage: 'Resource Patient tidak memiliki no_rkm_medis/source_key',
      retryable: false
    });
    return;
  }

  const patient = await findPatientByMedicalRecord(noRkmMedis);
  if (!patient) {
    await markFailure(resource.id, {
      errorCode: 'PATIENT_SOURCE_NOT_FOUND',
      errorMessage: `Patient ${noRkmMedis} tidak ditemukan di Khanza`,
      retryable: false
    });
    return;
  }

  await lookupPatientIhs(resource.id, patient, true);
}

export async function logPatientHandlerReady() {
  await controlDb.query(
    `INSERT INTO integration_log (level, component, message, context)
     VALUES ('INFO', 'patient-handler', 'Patient resource handler registered', $1)`,
    [JSON.stringify({ mode: 'MONITORING_ONLY', operation: 'SATUSEHAT_PATIENT_LOOKUP' })]
  );
}
