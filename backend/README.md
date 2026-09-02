# SATUSEHAT Control Plane Backend

Backend service for the SATUSEHAT integration control plane.

## Principles

- Khanza MySQL/MariaDB is the source of truth.
- This PostgreSQL database stores integration state, mappings, queue/dependencies, payload history, errors, logs, and sync cursors.
- Do not copy the complete Khanza database into PostgreSQL.
- Initial connector operation must be READ ONLY against Khanza.
- Sending to SATUSEHAT is disabled until connection/configuration is explicitly enabled.

## Planned modules

- `patient` — Khanza `pasien` discovery and IHS Patient handling
- `practitioner` — `pegawai`
- `organization` — `departemen` and SATUSEHAT organization mapping
- `location` — `poliklinik` and location mapping
- `encounter` — `reg_periksa`
- `queue` — state machine, dependency checks, retry
- `scheduler` — recurring synchronization jobs
- `satusehat` — OAuth/FHIR API client

## First implementation target

`pasien -> Patient discovery -> IHS mapping -> integration_resource`

Only after this flow is tested should Encounter and downstream clinical resources be enabled.
