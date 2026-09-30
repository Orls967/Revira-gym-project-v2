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
- **PHP**: 8.5.6
- **Laravel**: 13.33.0
- **Composer**: 2.9.5
- **Expo SDK**: ditentukan saat setup member-app (SCRUM-42)

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
- **`member-app/`**: belum tersedia, diisi di SCRUM-42 (member-app)

## Deploy Staging (Railway)

Deployment staging untuk backend API berjalan di platform **Railway** dengan konfigurasi:
- **Root Directory**: `api` (konfigurasi di Service Settings dashboard Railway)
- **Builder**: Nixpacks (menggunakan `api/railway.json`, melayani traffic dengan Nginx + PHP-FPM bawaan Nixpacks)
- **Healthcheck Endpoint**: `/api/v1/health`

### Environment Variables di Railway

Daftarkan variabel lingkungan berikut pada tab **Variables** service API di Railway:

| Variable | Contoh Nilai Staging | Keterangan |
|---|---|---|
| `APP_NAME` | `Revira Gym` | Nama aplikasi |
| `APP_ENV` | `staging` | Environment aplikasi |
| `APP_KEY` | `base64:...` | Generate via `php artisan key:generate --show` |
| `APP_DEBUG` | `false` | Wajib `false` pada staging/production |
| `APP_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` | URL domain publik Railway (HTTPS) |
| `APP_TIMEZONE` | `Asia/Makassar` | Timezone aplikasi (WITA) |
| `APP_LOCALE` | `id` | Bahasa default aplikasi |
| `DB_CONNECTION` | `mysql` | Driver database |
| `DB_HOST` | `${{MySQL.MYSQLHOST}}` | Host MySQL dari service Railway MySQL |
| `DB_PORT` | `${{MySQL.MYSQLPORT}}` | Port MySQL dari service Railway MySQL |
| `DB_DATABASE` | `${{MySQL.MYSQLDATABASE}}` | Nama database MySQL di Railway |
| `DB_USERNAME` | `${{MySQL.MYSQLUSER}}` | Username database MySQL |
| `DB_PASSWORD` | `${{MySQL.MYSQLPASSWORD}}` | Password database MySQL |
| `CORS_ALLOWED_ORIGINS` | `https://admin-staging.domain.com,https://member-staging.domain.com` | Origin frontend yang diizinkan (dipisahkan koma) |

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

### URL Staging API

Setelah domain publik dibuat/aktif di dashboard Railway (Networking > Generate Domain), isi baris di bawah ini:

```text
STAGING_API_URL=
```

## Aturan Kerja

- **Branch**: Buat branch dari `dev`, dengan penamaan `feature/SCRUM-xx-deskripsi`.
- **Pull Request (PR)**: PR diajukan ke `dev`, minimal 1 review. Branch `main` hanya untuk rilis.
- **Commit**: Commit diawali kunci Jira, mis. `SCRUM-34: setup boilerplate`.
- **Environment**: Jangan pernah commit `.env`.
