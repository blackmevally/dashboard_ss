import { Router } from 'express';
import { controlDb } from '../../database/pool.js';

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
    params.push(limit, offset);
    const result = await controlDb.query(`
      SELECT id, resource_type, source_system, source_table, source_key, no_rawat,
             no_rkm_medis, satusehat_id, status, attempt_count, max_attempts,
             next_retry_at, http_status, error_code, error_message,
             first_seen_at, last_attempt_at, last_success_at, updated_at
      FROM integration_resource
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    res.json({ ok: true, data: result.rows, pagination: { limit, offset, count: result.rowCount } });
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
