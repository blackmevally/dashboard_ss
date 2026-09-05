import crypto from 'node:crypto';
import { controlDb } from '../database/pool.js';
import { claimNextResource, markFailure } from './resourceQueue.js';
import { env } from '../config/env.js';
import { processPatientResource, logPatientHandlerReady } from '../modules/patient/patientWorker.js';

const WORKER_ID = `worker-${crypto.randomUUID()}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 3000);

// Handlers are intentionally registered explicitly. An unknown resource type is
// never marked SUCCESS; this prevents the worker from silently losing work.
const handlers = new Map();

export function registerHandler(resourceType, handler) {
  if (!resourceType || typeof handler !== 'function') {
    throw new TypeError('registerHandler requires a resource type and function');
  }
  handlers.set(resourceType, handler);
}

registerHandler('Patient', processPatientResource);

async function log(message, context = {}) {
  await controlDb.query(
    `INSERT INTO integration_log (level, component, message, context)
     VALUES ('INFO', 'worker', $1, $2)`,
    [message, JSON.stringify({ workerId: WORKER_ID, ...context })]
  );
}

async function processOne() {
  // SATUSEHAT must be explicitly enabled before any outbound call is attempted.
  if (!env.satusehat.enabled) return false;

  // Only claim resources for which a real handler is registered.
  const types = process.env.WORKER_RESOURCE_TYPES
    ? process.env.WORKER_RESOURCE_TYPES.split(',').map((v) => v.trim()).filter(Boolean)
    : [...handlers.keys()];

  for (const resourceType of types) {
    const handler = handlers.get(resourceType);
    if (!handler) continue;

    const resource = await claimNextResource({ workerId: WORKER_ID, resourceType });
    if (!resource) continue;

    try {
      await handler(resource);
    } catch (error) {
      await markFailure(resource.id, {
        errorCode: error.code || 'HANDLER_ERROR',
        errorMessage: error.message || 'Unhandled worker error',
        httpStatus: error.httpStatus ?? null,
        response: error.response ?? null
      });
      console.error(`[${WORKER_ID}] resource ${resource.id} failed:`, error);
    }
    return true;
  }

  return false;
}

let stopping = false;

async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[${WORKER_ID}] received ${signal}; shutting down`);
  try {
    await log('Worker stopped', { signal });
  } finally {
    await controlDb.end();
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function run() {
  if (!env.satusehat.enabled) {
    console.log(`[${WORKER_ID}] SATUSEHAT is disabled; worker is idle until enabled.`);
  }
  console.log(`[${WORKER_ID}] started; poll=${POLL_MS}ms environment=${env.environment}`);
  await log('Worker started', {
    pollMs: POLL_MS,
    satusehatEnabled: env.satusehat.enabled,
    environment: env.environment
  });
  await logPatientHandlerReady();

  while (!stopping) {
    try {
      const processed = await processOne();
      if (!processed) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    } catch (error) {
      console.error(`[${WORKER_ID}] loop error:`, error);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
}

run().catch(async (error) => {
  console.error(error);
  try { await controlDb.end(); } catch {}
  process.exitCode = 1;
});
