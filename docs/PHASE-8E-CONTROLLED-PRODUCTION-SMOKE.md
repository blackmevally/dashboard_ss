# PHASE 8E — Controlled Production Smoke Check

## Tujuan

Memvalidasi jalur Production secara terkendali setelah deployment configuration siap. Fase ini **tidak otomatis mengaktifkan Production** dan tidak mengaktifkan Patient CREATE.

## Precondition

- PHASE 8C menghasilkan `GO_CANDIDATE`.
- Production secret tersedia di deployment secret store atau `.env` server dan tidak berada di repository.
- `SATUSEHAT_PATIENT_CREATE_ENABLED=false`.
- Khanza menggunakan akun read-only.
- Reverse proxy/firewall sudah menjadi boundary akses backend.
- Tidak ada migration, schema reset, atau perubahan source data.

## Smoke sequence

### 1. Backend health

```text
GET /health
```

Expected:

- `status=ok`
- `environment=PRODUCTION`
- `satusehat.enabled=true`
- `satusehat.patient_create_enabled=false`
- `operational_access.post_protection=true`
- PostgreSQL `ok`
- Khanza `ok`

### 2. Readiness gate

```text
GET /api/production-readiness
```

Expected:

```text
HTTP 200
decision=GO_CANDIDATE
```

Gate ini read-only dan tidak melakukan live call SATUSEHAT Production.

### 3. Monitoring read path

```text
GET /api/resources/monitoring
```

Expected:

- HTTP 200
- `mode=MONITORING_ONLY`
- resource/status/queue metrics dapat dibaca
- tidak ada source-data mutation

### 4. Operational POST protection

Pilih satu resource yang sudah ada dan **tidak sedang diproses**.

Tanpa API key:

```text
POST /api/resources/<ID>/retry
```

Expected:

```text
HTTP 401
error=OPERATIONAL_ACCESS_REQUIRED
```

Pastikan status resource tidak berubah.

Jangan menaruh API key di frontend/browser.

### 5. SATUSEHAT Production authentication

Hanya setelah operator memberikan approval live smoke check, lakukan satu verifikasi OAuth/token menggunakan credential Production. Jangan menggunakan Patient CREATE.

Expected:

- OAuth berhasil.
- Token diterima.
- Secret/token tidak ditulis ke log atau dashboard.

Jika authentication gagal: **NO-GO**, hentikan smoke flow dan jangan retry berulang.

### 6. Controlled Patient lookup

Gunakan **satu Patient yang memang telah disetujui untuk smoke check** dan gunakan lookup read-only.

Expected path:

```text
Khanza
  -> READY
  -> PROCESSING
  -> SATUSEHAT Patient lookup
  -> SUCCESS / FAILED / RETRY
```

`SUCCESS` hanya bila Patient berhasil di-resolve secara konservatif. `NOT_FOUND`, `AMBIGUOUS`, atau identifier mismatch harus tetap menjadi hasil yang dapat ditindaklanjuti; jangan melakukan auto-create.

## Abort conditions

Hentikan smoke check bila terjadi:

- credential Production salah/expired;
- endpoint Production tidak sesuai;
- PostgreSQL atau Khanza degraded;
- Khanza account ternyata dapat menulis;
- POST protection tidak aktif;
- Patient CREATE aktif tanpa approval;
- response Patient ambigu atau identifier mismatch;
- worker menghasilkan perubahan source data;
- error berulang tanpa diagnosis.

## Rollback

Jika smoke check gagal:

1. Stop worker bila diperlukan.
2. Nonaktifkan `SATUSEHAT_ENABLED` atau kembalikan environment sesuai deployment rollback plan.
3. Restart backend.
4. Verifikasi `/health`.
5. Jangan melakukan migration.
6. Jangan mengubah data pasien Khanza untuk memaksa smoke check berhasil.

## Exit criteria

PHASE 8E dinyatakan **PASS** bila:

- health Production sehat;
- readiness gate `GO_CANDIDATE`;
- monitoring GET sehat;
- operational POST protection terbukti;
- OAuth Production berhasil pada approved live smoke check;
- satu Patient lookup read-only berhasil diproses tanpa auto-create/source mutation;
- rollback path diketahui dan dapat dijalankan.

Jika salah satu blocking item gagal: **NO-GO**.

## Batasan

PHASE 8E bukan bulk migration, bukan bulk synchronization, dan bukan aktivasi Patient CREATE. Setelah PASS, perluasan traffic/resource dilakukan bertahap dengan monitoring queue dan Error Center.
