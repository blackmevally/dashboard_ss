import { controlDb } from '../../database/pool.js';
import { findPatients } from './patientRepository.js';

const normalize = (value) => value == null ? null : String(value).trim();

export async function discoverPatients({ limit = 100, offset = 0 } = {}) {
  const patients = await findPatients({ limit, offset });
  if (!patients.length) return { discovered: 0, resources: [] };

  const client = await controlDb.connect();
  const resources = [];

  try {
    await client.query('BEGIN');

    for (const patient of patients) {
      const sourceKey = normalize(patient.no_rkm_medis);
      if (!sourceKey) continue;

      const result = await client.query(
        `INSERT INTO integration_resource
          (resource_type, source_system, source_table, source_key, no_rkm_medis, status)
         VALUES ('Patient', 'KHANZA', 'pasien', $1, $1, 'DISCOVERED')
         ON CONFLICT (resource_type, source_system, source_key)
         DO UPDATE SET
           no_rkm_medis = EXCLUDED.no_rkm_medis,
           updated_at = CURRENT_TIMESTAMP
         RETURNING id, resource_type, source_key, no_rkm_medis, satusehat_id, status`,
        [sourceKey]
      );

      resources.push(result.rows[0]);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { discovered: resources.length, resources };
}
