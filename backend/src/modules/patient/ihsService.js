import { controlDb } from '../../database/pool.js';
import { searchPatientByNik } from '../../satusehat/fhirClient.js';

export function maskNik(nik) {
  const value = String(nik || '');
  if (value.length < 8) return '********';
  return `${value.slice(0, 4)}********${value.slice(-4)}`;
}

export async function lookupPatientIhs(resourceId, nik) {
  const normalizedNik = String(nik || '').trim();

  try {
    const result = await searchPatientByNik(normalizedNik);
    const entry = result.data?.entry || [];
    const patientId = entry[0]?.resource?.id || null;

    if (!patientId) {
      await markFailed(resourceId, 'PATIENT_NOT_FOUND', 'Patient IHS tidak ditemukan melalui NIK');
      return { found: false, patientId: null };
    }

    await controlDb.query(
      `UPDATE integration_resource
       SET satusehat_id = $1,
           status = 'SUCCESS',
           http_status = $2,
           error_code = NULL,
           error_message = NULL,
           last_attempt_at = CURRENT_TIMESTAMP,
           last_success_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [patientId, result.status, resourceId]
    );

    return { found: true, patientId };
  } catch (error) {
    await markFailed(
      resourceId,
      error.code || 'IHS_LOOKUP_FAILED',
      error.message,
      error.httpStatus
    );
    return { found: false, patientId: null, failed: true, errorCode: error.code };
  }
}

async function markFailed(resourceId, code, message, httpStatus = null) {
  await controlDb.query(
    `UPDATE integration_resource
     SET status = 'FAILED',
         attempt_count = attempt_count + 1,
         http_status = $1,
         error_code = $2,
         error_message = $3,
         last_attempt_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [httpStatus, code, message, resourceId]
  );

  await controlDb.query(
    `INSERT INTO integration_error
      (resource_id, attempt_no, error_code, error_message, http_status)
     SELECT id, attempt_count, $1, $2, $3
     FROM integration_resource
     WHERE id = $4`,
    [code, message, httpStatus, resourceId]
  );
}
