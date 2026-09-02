import pg from 'pg';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const { Pool } = pg;

export const controlDb = new Pool({
  host: env.postgres.host,
  port: env.postgres.port,
  database: env.postgres.database,
  user: env.postgres.user,
  password: env.postgres.password,
  max: 10,
  idleTimeoutMillis: 30000
});

// This account MUST be provisioned as read-only in Khanza.
export const khanzaDb = mysql.createPool({
  host: env.khanza.host,
  port: env.khanza.port,
  database: env.khanza.database,
  user: env.khanza.user,
  password: env.khanza.password,
  ssl: env.khanza.ssl ? {} : undefined,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});
