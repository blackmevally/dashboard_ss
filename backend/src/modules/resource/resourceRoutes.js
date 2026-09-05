import { Router } from 'express';
import { controlDb } from '../../database/pool.js';
import { retryResource } from '../../queue/resourceQueue.js';

export const resourceRouter = Router();

resourceRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const where = [];
    if (req.query.type) { params.push(req.query.type); where.push(`resource_type = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`status = $${params.length}`); }
    if (req.query.no_rawat) { params.push(req.query.no_rawat); where.push(`no_rawat = $${params.length}`); }
    if (req.query.no_rkm_medis) { params.push(req.query.no_rkm_medis); where.push(`no_rkm_medis = $${params.length}`); }
    const countParams = [...params];
    params.push(limit, offset);
    const [result, count] = await Promise.all([
      controlDb.query(`
        SELECT id, resource_type, source_system, source_table, source_key, no_rawat,
               no_rkm_medis, satusehat_id, status, attempt_count, max_attempts,
               next_retry_at, locked_at, locked_by, http_status, error_code, error_message,
               first_seen_at, last_attempt_at, last_success_at, updated_at
        FROM integration_resource
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      controlDb.query(`
        SELECT COUNT(*)::int AS count
        FROM integration_resource
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      `, countParams)
    ]);
    res.json({ ok: true, data: result.rows, pagination: { limit, offset, count: result.rowCount, total: count.rows[0]?.count ?? 0 } });
  } catch (error) { next(error); }
});

// Single read model for the dashboard: the complete integration flow across
// Khanza resources, processing states, dependencies, responses and failures.
resourceRouter.get('/monitoring', async (_req, res, next) => {
  try {
    const [resources, byType, recentFailures, flow] = await Promise.all([
      controlDb.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
          COUNT(*) FILTER (WHERE status = 'RETRY')::int AS retry,
          COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
          COUNT(*) FILTER (WHERE status = 'BLOCKED')::int AS blocked,
          COUNT(*) FILTER (WHERE status = 'WAITING_DEPENDENCY')::int AS waiting_dependency,
          COUNT(*) FILTER (WHERE status IN ('DISCOVERED','MAPPED','READY'))::int AS pending,
          COUNT(*) FILTER (WHERE satusehat_id IS NOT NULL)::int AS mapped,
          COUNT(*) FILTER (
            WHERE status = 'PROCESSING'
              AND COALESCE(locked_at, updated_at) < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
          )::int AS stale_processing
        FROM integration_resource
      `),
      controlDb.query(`
        SELECT resource_type,
               COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'SUCCESS')::int AS success,
               COUNT(*) FILTER (WHERE status IN ('FAILED','BLOCKED'))::int AS failed,
               COUNT(*) FILTER (WHERE status IN ('RETRY','PROCESSING'))::int AS active,
               COUNT(*) FILTER (
                 WHERE status = 'PROCESSING'
                   AND COALESCE(locked_at, updated_at) < CURRENT_TIMESTAMP - INTERVAL '10 minutes'
               )::int AS stale_processing,
               MAX(updated_at) AS last_activity
        FROM integration_resource
        GROUP BY resource_type
        ORDER BY resource_type
      `),
      controlDb.query(`
        SELECT e.id, e.resource_id, e.attempt_no, e.error_code, e.error_message,
               e.http_status, e.created_at, r.resource_type, r.source_key,
               r.no_rkm_medis, r.status
        FROM integration_error e
        JOIN integration_resource r ON r.id = e.resource_id
        ORDER BY e.id DESC
        LIMIT 20
      `),
      controlDb.query(`
        SELECT
          COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::int AS outbound_payloads,
          COUNT(*) FILTER (WHERE direction = 'INBOUND')::int AS inbound_payloads,
          COUNT(*) FILTER (WHERE http_status BETWEEN 200 AND 299)::int AS successful_responses,
          COUNT(*) FILTER (WHERE http_status >= 400)::int AS failed_responses
        FROM integration_payload
      `)
    ]);

    const snapshot = resources.rows[0] || {};
    const critical = Number(snapshot.failed || 0) + Number(snapshot.blocked || 0);
    const stale = Number(snapshot.stale_processing || 0);
    const health = critical > 0 || stale > 0 ? 'CRITICAL' : Number(snapshot.retry || 0) + Number(snapshot.waiting_dependency || 0) > 0 ? 'WARNING' : 'HEALTHY';

    res.json({
      ok: true,
      data: {
        mode: 'MONITORING_ONLY',
        generated_at: new Date().toISOString(),
        health,
        health_reasons: {
          failed_or_blocked: critical,
          stale_processing: stale,
          retry: Number(snapshot.retry || 0),
          waiting_dependency: Number(snapshot.waiting_dependency || 0)
        },
        resources: snapshot,
        by_type: byType.rows,
        flow: flow.rows[0],
        recent_failures: recentFailures.rows
      }
    });
  } catch (error) { next(error); }
});

resourceRouter.get('/errors/list', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const result = await controlDb.query(`
      SELECT e.*, r.resource_type, r.source_key, r.status
      FROM integration_error e JOIN integration_resource r ON r.id = e.resource_id
      ORDER BY e.id DESC LIMIT $1
    `, [limit]);
    res.json({ ok: true, data: result.rows });
  } catch (error) { next(error); }
});

resourceRouter.get('/summary', async (_req, res, next) => {
  try {
    const [status, errors, rejected] = await Promise.all([
      controlDb.query(`SELECT status, COUNT(*)::int AS count FROM integration_resource GROUP BY status ORDER BY status`),
      controlDb.query(`SELECT COUNT(*)::int AS count FROM integration_error WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'`),
      controlDb.query(`SELECT COUNT(*)::int AS count FROM integration_resource WHERE http_status BETWEEN 400 AND 499`)
    ]);
    res.json({
      ok: true,
      data: {
        status: status.rows,
        errors_24h: errors.rows[0]?.count ?? 0,
        client_rejections: rejected.rows[0]?.count ?? 0,
        mode: 'MONITORING_ONLY'
      }
    });
  } catch (error) { next(error); }
});

// Explicit manual recovery control. It only moves FAILED/BLOCKED resources
// to RETRY; the worker remains responsible for actual processing.
resourceRouter.post('/:id/retry', async (req, res, next) => {
  try {
    const resourceId = Number(req.params.id);
    if (!Number.isInteger(resourceId) || resourceId <= 0) {
      return res.status(400).json({ ok: false, error: 'INVALID_RESOURCE_ID' });
    }

    const resource = await retryResource(resourceId);
    if (!resource) {
      const current = await controlDb.query(
        'SELECT id, resource_type, source_key, status, attempt_count, max_attempts, error_code, error_message FROM integration_resource WHERE id = $1',
        [resourceId]
      );
      if (!current.rows.length) return res.status(404).json({ ok: false, error: 'RESOURCE_NOT_FOUND' });
      return res.status(409).json({
        ok: false,
        error: 'RESOURCE_NOT_RETRYABLE',
        data: current.rows[0]
      });
    }

    res.json({
      ok: true,
      mode: 'MANUAL_RETRY',
      data: {
        resource_id: resource.id,
        resource_type: resource.resource_type,
        source_key: resource.source_key,
        status: resource.status,
        attempt_count: resource.attempt_count,
        next_retry_at: resource.next_retry_at
      }
    });
  } catch (error) { next(error); }
});

resourceRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await controlDb.query('SELECT * FROM integration_resource WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ ok: false, error: 'RESOURCE_NOT_FOUND' });
    const resource = result.rows[0];
    const [deps, errors, payloads] = await Promise.all([
      controlDb.query(`SELECT d.*, dep.resource_type, dep.source_key, dep.satusehat_id, dep.status AS dependency_status
                       FROM integration_dependency d JOIN integration_resource dep ON dep.id = d.depends_on_resource_id
                       WHERE d.resource_id = $1 ORDER BY d.id`, [resource.id]),
      controlDb.query('SELECT * FROM integration_error WHERE resource_id = $1 ORDER BY id DESC LIMIT 50', [resource.id]),
      controlDb.query('SELECT id, direction, http_status, response, created_at FROM integration_payload WHERE resource_id = $1 ORDER BY id DESC LIMIT 20', [resource.id])
    ]);
    res.json({ ok: true, data: { ...resource, dependencies: deps.rows, errors: errors.rows, payloads: payloads.rows } });
  } catch (error) { next(error); }
});
