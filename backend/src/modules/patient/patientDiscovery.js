import { controlDb } from '../../database/pool.js';
import { findPatientByMedicalRecord } from './patientRepository.js';
import { assertTransition } from '../../queue/status.js';

/**
 * Prepare one Khanza Patient for the queue without touching the Khanza source.
 * This is the explicit PHASE 7B bridge:
 * DISCOVERED -> MAPPED -> READY.
 */
export async function discoverAndPreparePatient(noRkmMedis) {
  const patient = await findPatientByMedicalRecord(noRkmMedis);
  if (!patient) return null;

  const result = await controlDb.query(
    `INSERT INTO integration_resource
      (resource_type, source_system, source_table, source_key, no_rkm_medis, status)
     VALUES ('Patient', 'KHANZA', 'pasien', $1, $1, 'DISCOVERED')
     ON CONFLICT (resource_type, source_system, source_key)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [String(patient.no_rkm_medis)]
  );

  let resource = result.rows[0];

  // Do not reset resources that are already processing, successful, or under review.
  if (['DISCOVERED', 'MAPPED'].includes(resource.status)) {
    if (resource.status === 'DISCOVERED') assertTransition('DISCOVERED', 'MAPPED');
    const mapped = await controlDb.query(
      `UPDATE integration_resource
       SET status = 'MAPPED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'DISCOVERED'
       RETURNING *`,
      [resource.id]
    );
    resource = mapped.rows[0] || resource;
  }

  if (resource.status === 'MAPPED') {
    assertTransition('MAPPED', 'READY');
    const ready = await controlDb.query(
      `UPDATE integration_resource
       SET status = 'READY', next_retry_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'MAPPED'
       RETURNING *`,
      [resource.id]
    );
    resource = ready.rows[0] || resource;
  }

  return { patient, resource };
}

export async function discoverPatientByMedicalRecord(noRkmMedis) {
  return discoverAndPreparePatient(noRkmMedis);
}
