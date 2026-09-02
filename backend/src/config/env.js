import 'dotenv/config';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

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
  khanza: {
    host: required('KHANZA_DB_HOST'),
    port: Number(process.env.KHANZA_DB_PORT || 3306),
    database: required('KHANZA_DB_NAME'),
    user: required('KHANZA_DB_USER'),
    password: required('KHANZA_DB_PASSWORD'),
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
