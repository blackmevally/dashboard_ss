import { env } from '../config/env.js';
import { getAccessToken } from './oauthClient.js';

function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function fhirRequest(path, options = {}) {
  const token = await getAccessToken();
  const url = joinUrl(env.satusehat.baseUrl, path);

  const headers = {
    Accept: 'application/fhir+json',
    'Content-Type': 'application/fhir+json',
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000)
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(`SATUSEHAT FHIR request failed: HTTP ${response.status}`);
    error.code = 'FHIR_HTTP_ERROR';
    error.httpStatus = response.status;
    error.response = data;
    throw error;
  }

  return { status: response.status, data };
}

export async function searchPatientByNik(nik) {
  if (!/^\d{16}$/.test(String(nik || ''))) {
    const error = new Error('NIK must contain exactly 16 digits');
    error.code = 'INVALID_NIK';
    throw error;
  }

  return fhirRequest(`/Patient?identifier=https://fhir.kemkes.go.id/id/nik|${encodeURIComponent(nik)}`);
}
