import { Router } from 'express';
import { controlDb } from '../../database/pool.js';
import { getAdvisory } from './advisoryEngine.js';

export const advisoryRouter = Router();

advisoryRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const params = [limit];
    const result = await controlDb.query(`
      SELECT e.id, e.resource_id, e.attempt_no, e.error_code, e.error_message,
             e.http_status, e.created_at,
             r.resource_type, r.source_key, r.status
      FROM integration_error e
      JOIN integration_resource r ON r.id = e.resource_id
      ORDER BY e.id DESC
      LIMIT $1
    `, params);

    const data = result.rows.map(error => ({
      ...error,
      advisory: getAdvisory(error)
    }));

    res.json({ ok: true, data, mode: 'MONITORING_ONLY' });
  } catch (error) {
    next(error);
  }
});

advisoryRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await controlDb.query(`
      SELECT e.id, e.resource_id, e.attempt_no, e.error_code, e.error_message,
             e.http_status, e.response, e.created_at,
             r.resource_type, r.source_key, r.status
      FROM integration_error e
      JOIN integration_resource r ON r.id = e.resource_id
      WHERE e.id = $1
    `, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ ok: false, error: 'ADVISORY_SOURCE_NOT_FOUND' });
    }

    const error = result.rows[0];
    res.json({ ok: true, data: { ...error, advisory: getAdvisory(error) }, mode: 'MONITORING_ONLY' });
  } catch (error) {
    next(error);
  }
});
