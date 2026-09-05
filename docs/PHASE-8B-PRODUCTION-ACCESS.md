# PHASE 8B — Production Access & Operational Safety

## Safety model

- `GET` monitoring endpoints remain read-oriented.
- Every operational `POST` under `/api` requires `X-Dashboard-Api-Key` when `ENVIRONMENT=PRODUCTION`.
- Sandbox/local development keeps the existing workflow without the production API key gate.
- Production startup requires `DASHBOARD_API_KEY` with at least 32 characters.
- `DASHBOARD_ALLOWED_ORIGINS` is an explicit browser-origin allowlist; do not use `*`.
- Real production secrets must stay outside GitHub and must never be copied into `.env.example`.
- Khanza remains read-only and the source of truth.
- Patient CREATE remains disabled unless `SATUSEHAT_PATIENT_CREATE_ENABLED=true` is explicitly configured.

## Production configuration checklist

1. Set `ENVIRONMENT=PRODUCTION`.
2. Generate a random `DASHBOARD_API_KEY` (>=32 characters) and keep it in the deployment secret store/local `.env`, never in Git.
3. Set `DASHBOARD_ALLOWED_ORIGINS` to the exact dashboard origin(s), comma-separated.
4. Provide only `SATUSEHAT_PRODUCTION_*` credentials and endpoint values.
5. Keep `SATUSEHAT_PATIENT_CREATE_ENABLED=false` until CREATE has a separately approved workflow.
6. Keep the Node backend bound behind the intended network/reverse-proxy boundary; do not expose port 3000 directly to the public internet unless the deployment design explicitly requires it.
7. Restart backend after configuration changes and verify `/health` shows `PRODUCTION`, production POST protection enabled, and Patient CREATE disabled unless deliberately approved.

## Minimal smoke validation

- `GET /health` without credentials: must respond and expose only non-secret safety state.
- In production, `POST /api/resources/:id/retry` without `X-Dashboard-Api-Key`: must return `401 OPERATIONAL_ACCESS_REQUIRED` and must not change the resource.
- With the correct key: the same endpoint may perform the explicitly requested operational action.
- No migration, schema reset, or source-data mutation is part of this phase.
