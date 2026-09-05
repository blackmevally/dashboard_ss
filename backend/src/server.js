import express from 'express';
import { env } from './config/env.js';
import { controlDb, khanzaDb } from './database/pool.js';
import { patientRouter } from './modules/patient/patientRoutes.js';
import { patientIhsRouter } from './modules/patient/patientIhsRoutes.js';
import { resourceRouter } from './modules/resource/resourceRoutes.js';
import { advisoryRouter } from './modules/advisory/advisoryRoutes.js';
import { requireOperationalAccess } from './security/operationalAccess.js';

const app = express();
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && env.dashboard.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Dashboard-Api-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/health', async (_req, res) => {
  const result = {
    service: 'dashboard_ss-backend',
    status: 'ok',
    environment: env.environment,
    satusehat: {
      enabled: env.satusehat.enabled,
      environment: env.satusehat.environment,
      patient_create_enabled: env.satusehat.patientCreateEnabled
    },
    operational_access: {
      post_protection: env.environment === 'PRODUCTION',
      api_key_configured: Boolean(env.dashboard.apiKey),
      allowed_origins_configured: env.dashboard.allowedOrigins.length
    },
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

// Read-only production go-live gate. It never calls SATUSEHAT and never
// changes source/control-plane data, so operators can inspect readiness safely.
app.get('/api/production-readiness', async (_req, res) => {
  const checks = {
    environment_production: env.environment === 'PRODUCTION',
    satusehat_enabled: env.satusehat.enabled,
    production_satusehat_configured: env.environment !== 'PRODUCTION' || Boolean(
      env.satusehat.baseUrl &&
      env.satusehat.authUrl &&
      env.satusehat.clientId &&
      env.satusehat.clientSecret &&
      env.satusehat.organizationId
    ),
    dashboard_api_key_configured: env.environment !== 'PRODUCTION' || env.dashboard.apiKey.length >= 32,
    exact_cors_allowlist: env.dashboard.allowedOrigins.length > 0 && !env.dashboard.allowedOrigins.includes('*'),
    patient_create_disabled: env.satusehat.patientCreateEnabled === false,
    control_plane_database: false,
    khanza_database: false,
    no_migration_required: true
  };

  try {
    await controlDb.query('SELECT 1');
    checks.control_plane_database = true;
  } catch {}

  try {
    await khanzaDb.query('SELECT 1');
    checks.khanza_database = true;
  } catch {}

  const blocking = Object.entries(checks)
    .filter(([, value]) => value === false)
    .map(([name]) => name);
  const ready = blocking.length === 0;

  res.status(ready ? 200 : 409).json({
    ok: ready,
    mode: 'READ_ONLY_GO_LIVE_GATE',
    satusehat_live_call_performed: false,
    source_data_mutated: false,
    control_plane_mutated: false,
    checks,
    blocking_checks: blocking,
    decision: ready ? 'GO_CANDIDATE' : 'NO_GO'
  });
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'SATUSEHAT Control Plane API',
    version: '0.1.0',
    mode: 'Khanza source-of-truth / integration control-plane',
    environment: env.environment,
    satusehat_enabled: env.satusehat.enabled,
    patient_create_enabled: env.satusehat.patientCreateEnabled,
    operational_post_protection: env.environment === 'PRODUCTION'
  });
});

// Monitoring GET endpoints remain readable. All operational POST actions are
// protected by X-Dashboard-Api-Key when ENVIRONMENT=PRODUCTION.
app.use('/api', requireOperationalAccess);
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
  console.log(`dashboard_ss backend listening on :${env.port} (${env.environment})`);
});
