import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const optional = (name, fallback = '') => process.env[name] || fallback;
const booleanEnv = (name, fallback = false) => String(process.env[name] ?? fallback).toLowerCase() === 'true';

const environment = String(process.env.ENVIRONMENT || 'SANDBOX').trim().toUpperCase();
if (!['SANDBOX', 'PRODUCTION'].includes(environment)) {
  throw new Error('ENVIRONMENT must be SANDBOX or PRODUCTION');
}

const satusehatConfig = environment === 'PRODUCTION'
  ? {
      baseUrl: optional('SATUSEHAT_PRODUCTION_BASE_URL'),
      authUrl: optional('SATUSEHAT_PRODUCTION_AUTH_URL'),
      clientId: optional('SATUSEHAT_PRODUCTION_CLIENT_ID'),
      clientSecret: optional('SATUSEHAT_PRODUCTION_CLIENT_SECRET'),
      organizationId: optional('SATUSEHAT_PRODUCTION_ORGANIZATION_ID')
    }
  : {
      baseUrl: optional('SATUSEHAT_SANDBOX_BASE_URL', process.env.SATUSEHAT_BASE_URL || ''),
      authUrl: optional('SATUSEHAT_SANDBOX_AUTH_URL', process.env.SATUSEHAT_AUTH_URL || ''),
      clientId: optional('SATUSEHAT_SANDBOX_CLIENT_ID', process.env.SATUSEHAT_CLIENT_ID || ''),
      clientSecret: optional('SATUSEHAT_SANDBOX_CLIENT_SECRET', process.env.SATUSEHAT_CLIENT_SECRET || ''),
      organizationId: optional('SATUSEHAT_SANDBOX_ORGANIZATION_ID', process.env.SATUSEHAT_ORGANIZATION_ID || '')
    };

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  environment,
  postgres: {
    host: required('PGHOST'),
    port: Number(process.env.PGPORT || 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD')
  },
  // Khanza is intentionally read-only and remains the source of truth.
  khanza: {
    host: optional('KHANZA_DB_HOST', '127.0.0.1'),
    port: Number(process.env.KHANZA_DB_PORT || 3306),
    database: optional('KHANZA_DB_NAME', 'sik'),
    user: optional('KHANZA_DB_USER', 'readonly_satusehat'),
    password: optional('KHANZA_DB_PASSWORD'),
    ssl: process.env.KHANZA_DB_SSL === 'true'
  },
  satusehat: {
    enabled: booleanEnv('SATUSEHAT_ENABLED'),
    environment,
    // Patient creation is disabled by default and must never be enabled
    // implicitly by switching environments.
    patientCreateEnabled: booleanEnv('SATUSEHAT_PATIENT_CREATE_ENABLED'),
    ...satusehatConfig
  }
};

if (environment === 'PRODUCTION' && env.satusehat.enabled) {
  const missing = ['baseUrl', 'authUrl', 'clientId', 'clientSecret', 'organizationId']
    .filter(key => !env.satusehat[key]);
  if (missing.length) {
    throw new Error(`Production SATUSEHAT configuration incomplete: ${missing.join(', ')}`);
  }
}
