import { env } from '../config/env.js';

let cachedToken = null;
let expiresAt = 0;

export function assertSatusehatEnabled() {
  if (!env.satusehat.enabled) {
    const error = new Error('SATUSEHAT integration is disabled');
    error.code = 'SATUSEHAT_DISABLED';
    throw error;
  }
}

export async function getAccessToken() {
  assertSatusehatEnabled();

  if (cachedToken && Date.now() < expiresAt - 60_000) {
    return cachedToken;
  }

  if (!env.satusehat.authUrl || !env.satusehat.clientId || !env.satusehat.clientSecret) {
    const error = new Error('SATUSEHAT OAuth configuration is incomplete');
    error.code = 'SATUSEHAT_CONFIG_INCOMPLETE';
    throw error;
  }

  const body = new URLSearchParams({
    client_id: env.satusehat.clientId,
    client_secret: env.satusehat.clientSecret
  });

  const response = await fetch(env.satusehat.authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.access_token) {
    const error = new Error('SATUSEHAT OAuth request failed');
    error.code = 'SATUSEHAT_OAUTH_FAILED';
    error.httpStatus = response.status;
    error.response = data;
    throw error;
  }

  cachedToken = data.access_token;
  expiresAt = Date.now() + Number(data.expires_in || 900) * 1000;
  return cachedToken;
}
