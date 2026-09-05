# PHASE 8C — Production Go-Live Gate

## Tujuan

Menentukan apakah dashboard **layak masuk Production** tanpa mengaktifkan Production secara otomatis.

Gate ini bersifat read-only: tidak memanggil endpoint SATUSEHAT Production, tidak mengubah data Khanza, tidak mengubah control-plane, dan tidak melakukan migration.

## Keputusan

- `GO_CANDIDATE`: seluruh pemeriksaan runtime gate lulus.
- `NO_GO`: minimal satu pemeriksaan blocking gagal.
- `GO_CANDIDATE` bukan berarti deploy otomatis; operator tetap melakukan review dan approval Production.

## Blocking checks

1. `ENVIRONMENT=PRODUCTION`.
2. `SATUSEHAT_ENABLED=true` bila integrasi Production akan dijalankan.
3. `SATUSEHAT_PRODUCTION_BASE_URL`, `AUTH_URL`, `CLIENT_ID`, `CLIENT_SECRET`, dan `ORGANIZATION_ID` tersedia. Secret tidak pernah ditampilkan oleh endpoint gate.
4. `DASHBOARD_API_KEY` tersedia dan minimal 32 karakter.
5. `DASHBOARD_ALLOWED_ORIGINS` berisi origin dashboard yang eksplisit; wildcard `*` dilarang.
6. `SATUSEHAT_PATIENT_CREATE_ENABLED=false` untuk go-live awal. CREATE harus melalui approval/workflow terpisah.
7. PostgreSQL control-plane dapat diakses.
8. Database Khanza dapat diakses.
9. Tidak ada migration/reset schema sebagai bagian dari go-live.

## Runtime gate

```text
GET /api/production-readiness
```

Endpoint mengembalikan `200` dengan `decision=GO_CANDIDATE` bila semua check lulus, atau `409` dengan `decision=NO_GO` dan daftar `blocking_checks` bila ada check gagal.

Endpoint ini **tidak** melakukan live call ke SATUSEHAT Production.

## Operator smoke checklist

### A. Sandbox tetap aman

- Backend masih dapat berjalan dengan `ENVIRONMENT=SANDBOX`.
- Patient CREATE tetap `false`.
- Tidak ada migration.
- Worker tetap menggunakan handler resource yang eksplisit.

### B. Sebelum Production

- Siapkan secret Production di secret store atau `.env` deployment; jangan commit secret ke GitHub.
- Set origin dashboard Production secara exact.
- Pastikan akses database Khanza tetap read-only.
- Pastikan reverse proxy/firewall menjadi boundary akses backend; jangan membuka port 3000 langsung ke internet tanpa desain keamanan yang disetujui.
- Review queue/retry/stale-processing dan jalur rollback.

### C. Setelah konfigurasi Production

1. Restart backend.
2. `GET /health` harus menunjukkan `PRODUCTION`, POST protection aktif, dan Patient CREATE disabled.
3. `GET /api/production-readiness` harus menghasilkan `GO_CANDIDATE`.
4. Lakukan verifikasi auth/token SATUSEHAT Production hanya pada saat operator memang telah menyetujui live smoke check.
5. Pantau dashboard dan queue sebelum memperluas traffic.

## Rollback

Rollback tidak membutuhkan migration:

1. Hentikan worker bila diperlukan.
2. Kembalikan `ENVIRONMENT=SANDBOX` atau nonaktifkan `SATUSEHAT_ENABLED` sesuai prosedur deployment.
3. Restart backend.
4. Verifikasi `/health`.
5. Jangan mengubah data sumber Khanza untuk melakukan rollback.

## Larangan fase ini

- Jangan mengaktifkan Patient CREATE secara otomatis.
- Jangan mengirim resource Production hanya untuk mengetes readiness gate.
- Jangan membuat migration/drop/rollback schema.
- Jangan menaruh credential Production di repository.
- Jangan menaruh API key di frontend browser.
