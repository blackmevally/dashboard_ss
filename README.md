# Dashboard SATUSEHAT Control Plane

Control-plane dashboard untuk integrasi SIMRS Khanza ↔ SATUSEHAT.

## Prinsip

- Khanza tetap menjadi source of truth.
- Dashboard membaca data Khanza secara read-only/incremental.
- PostgreSQL menyimpan state integrasi, mapping, dependency, queue, payload, error, retry, log, dan cursor.
- Pengiriman ke SATUSEHAT dilakukan melalui worker yang mengikuti dependency resource.

## Arsitektur

```text
Khanza MySQL/MariaDB
        |
        | READ ONLY / incremental sync
        v
Khanza Connector
        |
        v
SATUSEHAT Control Plane (PostgreSQL)
        |
        +--> Queue / Dependency Engine
        |
        +--> Web Dashboard
        |
        v
SATUSEHAT FHIR API
```

## Resource awal

Patient, Practitioner, Organization, Location, Encounter, Condition, Procedure, Observation, Laboratory, Radiology, Medication, Immunization, AllergyIntolerance, Composition, Provenance, dan Task/TTE.

## Status

`DISCOVERED → MAPPED → READY → PROCESSING → SUCCESS`

Failure path:

`FAILED → RETRY → PROCESSING`

Dependency states:

`WAITING_DEPENDENCY`, `BLOCKED`

## Branch development

Development aktif pada branch `dev`.
