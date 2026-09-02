import { env } from '../config/env.js';
import { searchPatientByNik } from './fhirClient.js';

const args = process.argv.slice(2);
const nikIndex = args.indexOf('--nik');
const nik = nikIndex >= 0 ? args[nikIndex + 1] : '9271060312000001';
const allowNonSandbox = args.includes('--allow-non-sandbox');

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exitCode = 1;
}

function isSandboxUrl(url) {
  return /api-satusehat-stg\.dto\.kemkes\.go\.id/i.test(String(url || ''));
}

console.log('SATUSEHAT Sandbox Validation');
console.log('=============================');
console.log(`FHIR URL : ${env.satusehat.baseUrl || '(empty)'}`);
console.log(`OAuth URL: ${env.satusehat.authUrl || '(empty)'}`);
console.log(`Enabled  : ${env.satusehat.enabled}`);
console.log(`NIK      : ${String(nik).slice(0, 4)}********${String(nik).slice(-4)}`);

if (!env.satusehat.enabled) fail('SATUSEHAT_ENABLED=false. Set SATUSEHAT_ENABLED=true untuk validasi live.');
if (!env.satusehat.baseUrl) fail('SATUSEHAT_BASE_URL belum diisi.');
if (!env.satusehat.authUrl) fail('SATUSEHAT_AUTH_URL belum diisi.');
if (!env.satusehat.clientId || !env.satusehat.clientSecret) fail('SATUSEHAT_CLIENT_ID/SECRET belum lengkap.');
if (!allowNonSandbox && !isSandboxUrl(env.satusehat.baseUrl)) fail('Refusing non-sandbox FHIR URL. Gunakan endpoint staging SATUSEHAT atau --allow-non-sandbox.');
if (!/^\d{16}$/.test(String(nik))) fail('--nik harus tepat 16 digit.');

if (process.exitCode) process.exit();

try {
  const result = await searchPatientByNik(String(nik));
  const entries = result.data?.entry || [];
  const patients = entries.map((entry) => entry.resource).filter(Boolean);

  console.log(`\n✔ OAuth + FHIR GET berhasil (HTTP ${result.status})`);
  console.log(`✔ Bundle total : ${result.data?.total ?? entries.length}`);
  console.log(`✔ Entry count  : ${entries.length}`);

  if (patients.length) {
    for (const patient of patients) {
      console.log(`  - Patient.id : ${patient.id || '(none)'}`);
      console.log(`    Name       : ${patient.name?.[0]?.text || '(none)'}`);
      console.log(`    BirthDate  : ${patient.birthDate || '(none)'}`);
      console.log(`    Gender     : ${patient.gender || '(none)'}`);
    }
  } else {
    console.log('  - Patient tidak ditemukan. Ini tetap merupakan hasil API yang valid; jangan langsung POST Create tanpa verifikasi data.');
  }

  console.log('\nRESULT: PASS');
} catch (error) {
  console.error(`\n✖ Validation failed: ${error.message}`);
  if (error.code) console.error(`  code       : ${error.code}`);
  if (error.httpStatus) console.error(`  HTTP status: ${error.httpStatus}`);
  if (error.response) console.error(`  response   : ${JSON.stringify(error.response)}`);
  process.exitCode = 1;
}
