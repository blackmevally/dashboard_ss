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

---

# PHASE 9 — Production Deployment

Aplikasi disiapkan untuk deployment pada dua target production:

- **Windows 10/11 + XAMPP + Google Chrome Kiosk**
- **Xubuntu + Apache/PHP + Chromium Kiosk**

Prinsip deployment: development dilakukan pada `dev`, validasi dilakukan sebelum `main` dipakai sebagai production, dan mesin production hanya melakukan clone/pull repository serta konfigurasi environment lokal.

## Struktur Deployment

```text
deploy/
├── windows/
│   ├── start-kiosk.bat
│   └── README.md
└── xubuntu/
    ├── start-kiosk.sh
    ├── apache.conf
    └── README.md
```

## 9A — Windows Production

### Prasyarat

- Windows 10/11
- XAMPP
- Git
- Google Chrome

### Clone repository

```powershell
cd C:\xampp\htdocs
git clone https://github.com/blackmevally/dashboard_ss.git
cd dashboard_ss
git checkout main
```

Untuk development/test lokal:

```powershell
git checkout dev
git pull origin dev
```

### Konfigurasi

Buat konfigurasi lokal sesuai struktur konfigurasi aplikasi. Jangan commit password, API key, token, sertifikat, atau credential database production.

### Test

Jalankan Apache dari XAMPP, kemudian buka aplikasi melalui URL localhost yang sesuai.

### Kiosk

Edit `deploy/windows/start-kiosk.bat` dan sesuaikan `URL`, kemudian jalankan:

```text
deploy\windows\start-kiosk.bat
```

Untuk auto-start setelah login Windows, buat shortcut script tersebut dan masukkan ke:

```text
shell:startup
```

Panduan lengkap tersedia di `deploy/windows/README.md`.

## 9B — Xubuntu Production

### Prasyarat

- Xubuntu 22.04 LTS atau lebih baru
- Git
- Apache2
- PHP dan extension yang dibutuhkan aplikasi
- Chromium

### Install paket dasar

```bash
sudo apt update
sudo apt install -y git curl unzip apache2 php libapache2-mod-php php-cli php-mysql php-curl php-mbstring php-xml php-zip chromium
```

### Clone repository

```bash
cd /var/www
sudo git clone https://github.com/blackmevally/dashboard_ss.git
cd dashboard_ss
sudo git checkout main
sudo chown -R www-data:www-data /var/www/dashboard_ss
```

Untuk development/test lokal:

```bash
sudo git checkout dev
sudo git pull origin dev
```

### Apache

Gunakan konfigurasi yang disediakan:

```bash
sudo cp deploy/xubuntu/apache.conf /etc/apache2/sites-available/dashboard_ss.conf
sudo a2ensite dashboard_ss.conf
sudo a2enmod rewrite
sudo systemctl reload apache2
```

Jika document root berbeda, sesuaikan `deploy/xubuntu/apache.conf` sebelum mengaktifkannya.

### Kiosk

```bash
chmod +x deploy/xubuntu/start-kiosk.sh
./deploy/xubuntu/start-kiosk.sh
```

Untuk auto-start, tambahkan script ke **Settings → Session and Startup → Application Autostart**.

Panduan lengkap tersedia di `deploy/xubuntu/README.md`.

## 9C — Local / Production Configuration

Credential dan konfigurasi mesin tidak disimpan di Git.

Contoh file lokal yang diabaikan:

```text
config/config.local.php
config/database.local.php
.env
```

`.gitignore` juga mengecualikan runtime log, cache, dan backup lokal.

Jika aplikasi membutuhkan contoh konfigurasi, commit hanya file template seperti `config.example.php` tanpa credential nyata.

## 9D — Production Update

### Windows

```powershell
cd C:\xampp\htdocs\dashboard_ss
git checkout main
git pull origin main
```

Restart Apache/Chrome kiosk jika diperlukan.

### Xubuntu

```bash
cd /var/www/dashboard_ss
sudo git checkout main
sudo git pull origin main
sudo systemctl reload apache2
```

Restart Chromium kiosk jika diperlukan.

## 9E — Production Recovery Checklist

Jika dashboard tidak tampil:

1. Periksa koneksi jaringan.
2. Periksa Apache/XAMPP.
3. Periksa PHP dan konfigurasi lokal.
4. Periksa koneksi database/API.
5. Jalankan `git status`.
6. Periksa commit dengan `git log -5`.
7. Ambil update dengan `git pull origin main` bila memang diperlukan.
8. Restart service web.
9. Jalankan kembali browser kiosk.

**Jangan menjalankan `git reset --hard` di production tanpa memastikan backup dan perubahan lokal aman.**

## 9F — Production Flow

```text
Development
    |
    v
  branch dev
    |
    v
Testing / Validation
    |
    v
  branch main
    |
    v
 GitHub
    |
    +------------------+
    |                  |
    v                  v
 Windows            Xubuntu
 XAMPP/Apache        Apache/PHP
 Chrome Kiosk        Chromium Kiosk
    |                  |
    +--------+---------+
             |
             v
            TV
```

## Production Checklist

### Application

- [ ] Repository berhasil di-clone
- [ ] Branch production benar (`main`)
- [ ] Konfigurasi production/local sudah dibuat
- [ ] Database/API dapat diakses
- [ ] Tidak ada credential di Git
- [ ] Error production sudah diperiksa
- [ ] Asset CSS/JS berjalan
- [ ] Fitur utama berhasil diuji

### Windows

- [ ] XAMPP/Apache berjalan
- [ ] Aplikasi dapat dibuka melalui localhost
- [ ] Chrome kiosk berjalan
- [ ] Auto-start aktif jika diperlukan
- [ ] Windows tidak masuk sleep
- [ ] Resolusi TV benar

### Xubuntu

- [ ] Apache aktif
- [ ] PHP aktif
- [ ] Repository berada di `/var/www/dashboard_ss`
- [ ] Permission benar
- [ ] Chromium kiosk berjalan
- [ ] Auto-start aktif jika diperlukan
- [ ] Xubuntu tidak suspend
- [ ] Resolusi TV benar
