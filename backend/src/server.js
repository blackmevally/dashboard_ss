import express from 'express';
import { env } from './config/env.js';
import { controlDb, khanzaDb } from './database/pool.js';
import { patientRouter } from './modules/patient/patientRoutes.js';
import { patientIhsRouter } from './modules/patient/patientIhsRoutes.js';
import { resourceRouter } from './modules/resource/resourceRoutes.js';
import { advisoryRouter } from './modules/advisory/advisoryRoutes.js';

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = origin && /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  const result = {
    service: 'dashboard_ss-backend',
    status: 'ok',
    satusehat_enabled: env.satusehat.enabled,
    database: { control_plane: 'unknown', khanza: 'unknown' }
  };

  try {
    await controlDb.query('SELECT 1');
    result.database.control_plane = 'ok';
  } catch {
    result.database.control_plane = 'error';
    result.status = 'degraded';
  }

  try {
    await khanzaDb.query('SELECT 1');
    result.database.khanza = 'ok';
  } catch {
    result.database.khanza = 'error';
    result.status = 'degraded';
  }

  res.status(result.status === 'ok' ? 200 : 503).json(result);
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'SATUSEHAT Control Plane API',
    version: '0.1.0',
    mode: 'Khanza source-of-truth / integration control-plane'
  });
});

app.use('/api/patients', patientRouter);
app.use('/api/patients', patientIhsRouter);
app.use('/api/resources', resourceRouter);
app.use('/api/advisories', advisoryRouter);
app.get('/api/errors', (req, res, next) => {
  req.url = `/errors/list${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  resourceRouter.handle(req, res, next);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    ok: false,
    error: 'INTERNAL_ERROR',
    message: env.nodeEnv === 'production' ? 'Internal server error' : error.message
  });
});

app.listen(env.port, () => {
  console.log(`dashboard_ss backend listening on :${env.port}`);
});
