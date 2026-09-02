import { controlDb } from '../../database/pool.js';

export async function getPatientResource(resourceId) {
  const { rows } = await controlDb.query(
    `SELECT * FROM integration_resource
     WHERE id = $1 AND resource_type = 'Patient'
     LIMIT 1`,
    [resourceId]
  );
  return rows[0] ?? null;
}

export async function getPatientResourceByMedicalRecord(noRkmMedis) {
  const { rows } = await controlDb.query(
    `SELECT * FROM integration_resource
     WHERE resource_type = 'Patient'
       AND source_system = 'KHANZA'
       AND source_key = $1
     LIMIT 1`,
    [String(noRkmMedis)]
  );
  return rows[0] ?? null;
}
