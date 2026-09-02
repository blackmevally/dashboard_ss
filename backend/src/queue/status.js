export const RESOURCE_STATUS = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  MAPPED: 'MAPPED',
  READY: 'READY',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  RETRY: 'RETRY',
  WAITING_DEPENDENCY: 'WAITING_DEPENDENCY',
  BLOCKED: 'BLOCKED'
});

const transitions = {
  DISCOVERED: ['MAPPED', 'READY', 'WAITING_DEPENDENCY', 'BLOCKED'],
  MAPPED: ['READY', 'WAITING_DEPENDENCY', 'BLOCKED'],
  READY: ['PROCESSING', 'WAITING_DEPENDENCY', 'BLOCKED'],
  PROCESSING: ['SUCCESS', 'FAILED', 'RETRY'],
  FAILED: ['RETRY', 'BLOCKED'],
  RETRY: ['PROCESSING', 'WAITING_DEPENDENCY', 'BLOCKED'],
  WAITING_DEPENDENCY: ['READY', 'BLOCKED'],
  BLOCKED: ['RETRY'],
  SUCCESS: []
};

export function canTransition(from, to) {
  return transitions[from]?.includes(to) ?? false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid resource status transition: ${from} -> ${to}`);
  }
}
