# Sistem Informasi & Manajemen Revira Gym BJM

Sistem Informasi & Manajemen Revira Gym BJM adalah aplikasi monorepo untuk pengelolaan operasional gym, manajemen administrasi, dan layanan member Revira Gym Banjarmasin.

## Tech Stack

| Bagian | Teknologi / Stack | Keterangan |
|---|---|---|
| `api/` | Laravel + Sanctum + MySQL | Backend REST API & Autentikasi |
| `admin-web/` | React (Vite) + Tailwind | Aplikasi web admin (desktop-first) |
| `member-app/` | React Native (Expo) | Aplikasi mobile member (Android) |

## Versi Terkunci

- **Node**: 24 LTS (lihat `.nvmrc`)
- **PHP**: 8.4.x (standardisasi tim & Railway; pasang lokal via `brew install php@8.4`)
- **Laravel**: 13.34.0
- **Composer**: 2.9.5
- **Expo SDK**: 57 (React Native)

## Struktur Folder

```text
.
├── .github/
│   └── pull_request_template.md
├── admin-web/          # Aplikasi web admin (React, Vite, Tailwind)
├── docs/               # Dokumentasi proyek
├── member-app/         # Aplikasi mobile member (React Native, Expo)
├── .gitignore
├── .nvmrc
└── README.md
```

> *Catatan: Folder `api/` dibuat nanti oleh `composer create-project` (SCRUM-34).*

## Cara Menjalankan

- **`api/`**:
  1. Masuk ke direktori: `cd api`
  2. Install dependensi: `composer install`
  3. Salin environment file: `cp .env.example .env`
  4. Generate application key: `php artisan key:generate`
  5. Pastikan database `revira_gym` sudah dibuat pada server MariaDB/MySQL lokal
  6. Jalankan migrasi: `php artisan migrate`
  7. Jalankan development server: `php artisan serve`
- **`admin-web/`**: belum tersedia, diisi di SCRUM-45 (admin-web)
- **`member-app/`**:
  1. Masuk ke direktori: `cd member-app`
  2. Install dependensi: `npm install`
  3. Siapkan environment: salin `.env.example` menjadi `.env`
  4. Atur nilai `EXPO_PUBLIC_API_URL` di file `.env` (gunakan URL staging Railway atau IP lokal Laravel backend)
  5. Jalankan server: `npx expo start -c`
  6. Buka aplikasi lewat **Expo Go** di HP Android nyata dengan memindai QR code

## Deploy Staging (Railway)

Deployment staging untuk backend API berjalan di platform **Railway** dengan konfigurasi:
- **Root Directory**: `api` (konfigurasi di Service Settings dashboard Railway)
- **Builder**: Nixpacks (menggunakan `api/railway.json`, melayani traffic dengan Nginx + PHP-FPM bawaan Nixpacks)
- **Healthcheck Endpoint**: `/api/v1/health`

> **Penting (Node Version)**: Environment variable `NIXPACKS_NODE_VERSION=22` **WAJIB** diisi di Railway. Nixpacks secara default mendeteksi `package.json` di `api/` lalu menjalankan `npm run build` menggunakan Node 18, sedangkan Vite membutuhkan Node 20+ sehingga build akan gagal tanpa variabel ini.

### Environment Variables di Railway

Daftarkan variabel lingkungan berikut pada tab **Variables** service API di Railway:

| Variable | Contoh Nilai Staging | Keterangan |
|---|---|---|
| `APP_NAME` | `Revira Gym` | Nama aplikasi |
| `APP_ENV` | `staging` | Environment aplikasi |
| `APP_KEY` | `base64:...` | Generate via `php artisan key:generate --show` |
| `APP_DEBUG` | `false` | Wajib `false` pada staging/production |
| `APP_URL` | `https://revira-gym-project-production.up.railway.app` | URL domain publik Railway (HTTPS) |
| `APP_TIMEZONE` | `Asia/Makassar` | Timezone aplikasi (WITA) |
| `APP_LOCALE` | `id` | Bahasa default aplikasi |
| `DB_CONNECTION` | `mysql` | Driver database |
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` | Host MySQL dari service Railway MySQL |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` | Port MySQL dari service Railway MySQL |
| `DB_DATABASE` | `${{MySQL.MYSQLDATABASE}}` | Nama database MySQL di Railway |
| `DB_USERNAME` | `${{MySQL.MYSQLUSER}}` | Username database MySQL |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` | Password database MySQL |
| `CORS_ALLOWED_ORIGINS` | `https://admin-staging.domain.com,https://member-staging.domain.com` | Origin frontend yang diizinkan (dipisahkan koma) |
| `NIXPACKS_NODE_VERSION` | `22` | **Wajib**: Mengunci Node 22 agar build asset Vite berhasil |

### Menjalankan Migrasi Database

1. **Otomatis (Pre-deploy Command)**:
   - Telah dikonfigurasi melalui `api/railway.json`:
     ```json
     "preDeployCommand": "php artisan migrate --force"
     ```
   - Setiap deployment baru akan mengeksekusi migrasi terlebih dahulu sebelum container baru melayani request. Apabila migrasi gagal, deployment akan dibatalkan tanpa menghentikan service aktif.

2. **Manual (Dashboard / CLI)**:
   - **Dashboard**: Buka service API di Railway > buka tab **Deployments** atau **Command/Terminal** > jalankan:
     ```bash
     php artisan migrate --force
     ```
   - **Railway CLI**:
     ```bash
     railway run php artisan migrate --force
     ```

### URL Staging API & Verifikasi

- **Staging API URL**:
  ```text
  STAGING_API_URL=https://revira-gym-project-production.up.railway.app
  ```
- **Endpoint Verifikasi**: `GET /api/v1/health`
  ```bash
  curl -i https://revira-gym-project-production.up.railway.app/api/v1/health
  ```

## Continuous Integration (CI)

Proyek ini menggunakan **GitHub Actions** untuk menjalankan pemeriksaan otomatis per folder monorepo:

### 1. Lane `api/` (`.github/workflows/ci-api.yml`)
- **Pemicu (Trigger)**: Otomatis berjalan saat ada `pull_request` dengan target branch `dev` yang mengubah file di `api/**` atau file workflow itu sendiri. Dilengkapi `concurrency` (run lama otomatis dibatalkan jika ada push baru ke PR yang sama).
- **Pemeriksaan yang Dijalankan**:
  1. Setup environment PHP 8.4 dengan ekstensi yang dibutuhkan (`pdo_mysql`, `pdo_sqlite`, dll.) serta cache Composer.
  2. `composer install` dependensi dari `composer.lock`.
  3. Linter kode menggunakan **Laravel Pint** dalam mode verifikasi (`./vendor/bin/pint --test`).
  4. Pengujian fitur/unit test menggunakan **PHPUnit** (`php artisan test`) dengan in-memory SQLite (`DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`).

### 2. Cara Menjalankan Lint & Test di Lokal Sebelum Push
Untuk memastikan pipeline CI selalu hijau, jalankan perintah berikut di direktori `api/` sebelum push:

```bash
cd api

# Cek style kode (Pint mode test)
./vendor/bin/pint --test

# Jalankan test suite
php artisan test
```

### 3. Lane Lain (`admin-web/` dan `member-app/`)
Kerangka CI untuk frontend admin dan mobile app telah disiapkan dalam bentuk template:
- `.github/workflows/ci-admin-web.yml.example`
- `.github/workflows/ci-member-app.yml.example`

Workflow ini sengaja belum diaktifkan (ekstensi `.example`) karena foldernya masih kosong. Aktifkan dengan me-rename file (menghapus `.example`) saat SCRUM-45 (admin-web) dan SCRUM-42 (member-app) dikerjakan.

## Aturan Kerja

- **Branch**: Buat branch dari `dev`, dengan penamaan `feature/SCRUM-xx-deskripsi`.
- **Pull Request (PR)**: PR diajukan ke `dev`, minimal 1 review. Branch `main` hanya untuk rilis.
- **Commit**: Commit diawali kunci Jira, mis. `SCRUM-34: setup boilerplate`.
- **Environment**: Jangan pernah commit `.env`.
