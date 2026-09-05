import crypto from 'node:crypto';
import { env } from '../config/env.js';

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// GET monitoring remains readable. Operational POST actions require an API key
// only in PRODUCTION; SANDBOX/local development keeps the existing workflow.
export function requireOperationalAccess(req, res, next) {
  if (req.method !== 'POST' || env.environment !== 'PRODUCTION') return next();

  const supplied = req.get('X-Dashboard-Api-Key');
  if (!supplied || !safeEqual(supplied, env.dashboard.apiKey)) {
    res.setHeader('WWW-Authenticate', 'ApiKey');
    return res.status(401).json({
      ok: false,
      error: 'OPERATIONAL_ACCESS_REQUIRED',
      message: 'Production operational actions require X-Dashboard-Api-Key'
    });
  }

  next();
}
