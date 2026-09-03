import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const optional = (name, fallback = '') => process.env[name] || fallback;

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  postgres: {
    host: required('PGHOST'),
    port: Number(process.env.PGPORT || 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD')
  },
  // Khanza is intentionally optional during the control-plane bootstrap.
  // The dashboard must be able to migrate/start without a Khanza credential.
  // When Khanza monitoring is enabled, provide the read-only connection values.
  khanza: {
    host: optional('KHANZA_DB_HOST', '127.0.0.1'),
    port: Number(process.env.KHANZA_DB_PORT || 3306),
    database: optional('KHANZA_DB_NAME', 'sik'),
    user: optional('KHANZA_DB_USER', 'readonly_satusehat'),
    password: optional('KHANZA_DB_PASSWORD'),
    ssl: process.env.KHANZA_DB_SSL === 'true'
  },
  satusehat: {
    enabled: process.env.SATUSEHAT_ENABLED === 'true',
    baseUrl: process.env.SATUSEHAT_BASE_URL || '',
    authUrl: process.env.SATUSEHAT_AUTH_URL || '',
    clientId: process.env.SATUSEHAT_CLIENT_ID || '',
    clientSecret: process.env.SATUSEHAT_CLIENT_SECRET || '',
    organizationId: process.env.SATUSEHAT_ORGANIZATION_ID || ''
  }
};
