import crypto from 'node:crypto';
import { controlDb } from '../database/pool.js';
import { assertTransition } from './status.js';

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_SECONDS = 30;

function retryDelaySeconds(attempt) {
  return Math.min(RETRY_BASE_SECONDS * (2 ** Math.max(0, attempt - 1)), 3600);
}

export async function claimNextResource({ workerId = crypto.randomUUID(), resourceType } = {}) {
  const client = await controlDb.connect();
  try {
    await client.query('BEGIN');
    const params = [DEFAULT_MAX_ATTEMPTS];
    let typeClause = '';
    if (resourceType) {
      params.push(resourceType);
      typeClause = `AND r.resource_type = $${params.length}`;
    }

    const { rows } = await client.query(`
      SELECT r.*
      FROM integration_resource r
      WHERE r.status IN ('READY', 'RETRY')
        AND (r.next_retry_at IS NULL OR r.next_retry_at <= CURRENT_TIMESTAMP)
        AND r.attempt_count < COALESCE(r.max_attempts, $1)
        ${typeClause}
        AND NOT EXISTS (
          SELECT 1
          FROM integration_dependency d
          JOIN integration_resource dep ON dep.id = d.depends_on_resource_id
          WHERE d.resource_id = r.id
            AND d.dependency_type = 'REQUIRED'
            AND dep.status <> 'SUCCESS'
        )
      ORDER BY r.id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `, params);

    if (!rows.length) {
      await client.query('COMMIT');
      return null;
    }

    const resource = rows[0];
    assertTransition(resource.status, 'PROCESSING');
    const updated = await client.query(`
      UPDATE integration_resource
      SET status = 'PROCESSING',
          attempt_count = attempt_count + 1,
          last_attempt_at = CURRENT_TIMESTAMP,
          locked_at = CURRENT_TIMESTAMP,
          locked_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `, [resource.id, workerId]);

    await client.query(
      `INSERT INTO integration_log (level, component, resource_id, message, context)
       VALUES ('INFO', 'queue', $1, 'Resource claimed for processing', $2)`,
      [resource.id, JSON.stringify({ workerId })]
    );
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function markSuccess(resourceId, { satusehatId = null } = {}) {
  const result = await controlDb.query(`
    UPDATE integration_resource
    SET status = 'SUCCESS', satusehat_id = COALESCE($2, satusehat_id),
        last_success_at = CURRENT_TIMESTAMP, next_retry_at = NULL,
        locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status = 'PROCESSING'
    RETURNING *
  `, [resourceId, satusehatId]);
  return result.rows[0] ?? null;
}

export async function markFailure(resourceId, { errorCode = 'PROCESSING_ERROR', errorMessage = 'Processing failed', httpStatus = null, response = null } = {}) {
  const client = await controlDb.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT * FROM integration_resource WHERE id = $1 FOR UPDATE', [resourceId]);
    if (!current.rows.length) throw new Error('Resource not found');
    const r = current.rows[0];
    const maxAttempts = r.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
    const exhausted = r.attempt_count >= maxAttempts;
    const nextStatus = exhausted ? 'BLOCKED' : 'RETRY';
    assertTransition(r.status, nextStatus);
    const delay = exhausted ? null : retryDelaySeconds(r.attempt_count);

    const updated = await client.query(`
      UPDATE integration_resource
      SET status = $2, error_code = $3, error_message = $4, http_status = $5,
          next_retry_at = CASE WHEN $6::int IS NULL THEN NULL ELSE CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 second') END,
          locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [resourceId, nextStatus, errorCode, errorMessage, httpStatus, delay]);

    await client.query(`
      INSERT INTO integration_error (resource_id, attempt_no, error_code, error_message, http_status, response)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [resourceId, r.attempt_count, errorCode, errorMessage, httpStatus, response]);
    await client.query(`
      INSERT INTO integration_log (level, component, resource_id, message, context)
      VALUES ($1, 'queue', $2, $3, $4)
    `, [exhausted ? 'ERROR' : 'WARN', resourceId, exhausted ? 'Resource blocked after max attempts' : 'Resource scheduled for retry', JSON.stringify({ retryDelaySeconds: delay, attempt: r.attempt_count, maxAttempts })]);
    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function retryResource(resourceId) {
  const result = await controlDb.query(`
    UPDATE integration_resource
    SET status = 'RETRY', next_retry_at = CURRENT_TIMESTAMP,
        error_code = NULL, error_message = NULL,
        locked_at = NULL, locked_by = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND status IN ('FAILED', 'BLOCKED')
    RETURNING *
  `, [resourceId]);
  if (!result.rows[0]) return null;
  await controlDb.query(
    `INSERT INTO integration_log (level, component, resource_id, message)
     VALUES ('INFO', 'queue', $1, 'Manual retry requested')`,
    [resourceId]
  );
  return result.rows[0];
}
