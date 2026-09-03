import { Router } from 'express';
import { controlDb } from '../../database/pool.js';

export const monitoringRouter = Router();

monitoringRouter.get('/summary', async (_req, res, next) => {
  try {
    const [status, errors, recent] = await Promise.all([
      controlDb.query(`SELECT status, COUNT(*)::int AS count FROM integration_resource GROUP BY status ORDER BY status`),
      controlDb.query(`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours')::int AS last_24h FROM integration_error`),
      controlDb.query(`SELECT COUNT(*) FILTER (WHERE satusehat_id IS NOT NULL)::int AS mapped, COUNT(*) FILTER (WHERE satusehat_id IS NULL)::int AS unmapped FROM integration_resource WHERE resource_type = 'Patient'`)
    ]);

    const byStatus = Object.fromEntries(status.rows.map(row => [row.status, row.count]));
    res.json({
      ok: true,
      mode: 'monitoring-only',
      resources: byStatus,
      errors: errors.rows[0],
      patient: recent.rows[0]
    });
  } catch (error) { next(error); }
});

monitoringRouter.get('/recommendations', async (_req, res, next) => {
  try {
    const result = await controlDb.query(`
      SELECT error_code, http_status, COUNT(*)::int AS occurrences,
             MAX(created_at) AS last_seen,
             MIN(error_message) AS sample_message
      FROM integration_error
      GROUP BY error_code, http_status
      ORDER BY occurrences DESC, last_seen DESC
      LIMIT 50
    `);

    const recommendations = result.rows.map(row => {
      const code = String(row.error_code || '').toUpperCase();
      const status = Number(row.http_status || 0);
      let advice = 'Periksa response SATUSEHAT dan payload/resource terkait sebelum melakukan perubahan.';

      if (status === 400 || status === 422) advice = 'Validasi payload FHIR: field wajib, format identifier, value/code, dan struktur reference.';
      else if (status === 401) advice = 'Periksa access token, expiry, client credentials, dan konfigurasi environment tanpa mengubah data klinis.';
      else if (status === 403) advice = 'Periksa hak akses/project SATUSEHAT dan endpoint yang digunakan.';
      else if (status === 404) advice = 'Periksa endpoint, resource ID, dan reference yang dirujuk oleh payload.';
      else if (status >= 500) advice = 'Indikasi error sisi server/upstream; simpan response dan lakukan pemantauan ulang sebelum tindakan manual.';
      else if (code.includes('TOKEN')) advice = 'Periksa alur autentikasi dan masa berlaku token.';

      return { ...row, advice };
    });

    res.json({ ok: true, mode: 'monitoring-only', recommendations });
  } catch (error) { next(error); }
});
