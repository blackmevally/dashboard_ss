# PHASE 7C — Patient Flow Smoke Run

Tujuan: menjalankan satu Patient nyata melalui queue tanpa membuat Patient SATUSEHAT otomatis.

## Prasyarat

- PostgreSQL control-plane aktif.
- Khanza MySQL/MariaDB aktif dan akun monitoring bersifat read-only.
- `ENVIRONMENT=SANDBOX` untuk validasi awal.
- `SATUSEHAT_ENABLED=true` hanya jika credential Sandbox sudah benar.

## Jalur yang diharapkan

`KHANZA pasien -> DISCOVERED -> MAPPED -> READY -> PROCESSING -> SATUSEHAT Patient lookup -> SUCCESS/RETRY/FAILED`

## Jalankan backend

```bash
cd backend
npm install
npm start
```

## Jalankan worker

Terminal kedua:

```bash
cd backend
npm run worker
```

Worker hanya mengambil `READY`/`RETRY` yang memiliki handler terdaftar. Handler Patient melakukan lookup SATUSEHAT dan tidak mengubah tabel `pasien` Khanza.

## Siapkan satu Patient

Dari dashboard, masukkan satu `no_rkm_medis` yang memang ada di Khanza.

Atau gunakan API:

```bash
curl -X POST http://localhost:3000/api/patients/<NO_RM>/prepare
```

Response yang diharapkan:

```json
{
  "ok": true,
  "status": "READY"
}
```

Setelah itu worker akan mengambil resource tersebut.

## Pantau hasil

```bash
curl http://localhost:3000/api/resources/monitoring
```

Dan health:

```bash
curl http://localhost:3000/health
```

Hasil sukses untuk Patient harus menunjukkan `SUCCESS` dan `satusehat_id`. Hasil gagal harus masuk Error Center dengan `error_code` dan advisory; tidak ada auto-create Patient.

## Production gate

Jangan ubah ke `ENVIRONMENT=PRODUCTION` sebelum satu flow Sandbox ini berhasil dan konfigurasi Production lengkap. Production juga harus memakai credential Production yang terpisah.
