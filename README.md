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
Untuk panduan instalasi dan menjalankan aplikasi mobile, silakan baca [member-app/README.md](./member-app/README.md).

## Deploy Staging (Railway)

Deployment staging untuk backend API berjalan di platform **Railway** menggunakan container Dockerfile:
- **Root Directory**: `api` (konfigurasi di Service Settings dashboard Railway)
- **Builder**: Dockerfile (`api/Dockerfile`, berbasis `serversideup/php:8.4-fpm-nginx` yang melayani HTTP di port 8080 secara non-root)
- **Config Path**: `/api/railway.json` (Railway tidak mengikuti Root Directory untuk file config, sehingga path file config harus disetel ke `/api/railway.json`)
- **Port Publik**: `8080` (domain publik Railway dipetakan ke target port 8080)
- **Healthcheck Endpoint**: `/api/v1/health`

> **Alasan Penggunaan Dockerfile**: PHP bawaan Nixpacks di Railway tidak memuat plugin autentikasi `caching_sha2_password` pada ekstensi `mysqlnd`, sehingga koneksi ke service MySQL 8 Railway gagal dengan error `SQLSTATE[HY000] [2054] The server requested authentication method unknown to the client`. Image Docker kustom berbasis PHP 8.4 resmi menyertakan dukungan penuh `caching_sha2_password`, memastikan aplikasi dapat terhubung ke MySQL 8 tanpa perlu mengubah konfigurasi database Railway.

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
| `SESSION_DRIVER` | `database` | Driver session database |
| `CACHE_STORE` | `database` | Driver cache database |
| `QUEUE_CONNECTION` | `database` | Driver queue database |
| `RECEIPTS_DISK` | `receipts` | Disk penyimpanan bukti transfer (default receipts untuk volume privat lokal, atau s3 bila menggunakan S3) |
| `SEED_PASSWORD` | `<password-khusus-staging>` | Password default untuk seeder akun member/admin di staging |

### Penyimpanan Persisten Bukti Transfer (SCRUM-48)

Filesystem container di platform Railway bersifat non-permanen (ephemeral), sehingga file pada storage container lokal akan hilang setiap kali container dideploy ulang (redeploy). Bukti transfer pembayaran member wajib disimpan di tempat persisten dan aman.

1. **Keputusan Penyimpanan**:
   - **Pilihan Utama (Default)**: **Railway Volume** yang dipasang khusus ke path storage privat container (`/var/www/html/storage/app/private`), **bukan** ke seluruh direktori `storage` agar struktur internal framework, log, dan cache container tidak tertimpa volume mount kosong.
     - Alasan: Bukti transfer tetap persisten saat deploy container baru tanpa ketergantungan pada layanan cloud eksternal berbayar.
     - **Catatan Izin Akses (Permissions)**: Railway memasang Volume dengan kepemilikan user `root` (`root:root`). Script startup `/etc/entrypoint.d/99-storage-permissions.sh` otomatis dijalankan saat container boot untuk membuat direktori `storage/app/private/receipts` dan menyesuaikan kepemilikan `/var/www/html/storage/app/private` ke user `www-data:www-data` (`ug+rwx`). Apabila container berjalan pada lingkungan non-root, kegagalan `chown` hanya mencetak peringatan dan proses container tetap berjalan normal tanpa crash.
   - **Alternatif (S3-Compatible Object Storage)**:
     - Mendukung penyimpanan cloud berbasis S3 (seperti AWS S3, Cloudflare R2, MinIO, atau Supabase Storage).
     - Dipilih hanya bila ada kebutuhan di luar Railway (misalnya pencadangan otomatis berkala, multi-region, atau pemindahan hosting produksi keluar Railway).

2. **Abstraksi Disk via Environment Variable**:
   - Disk bukti transfer dipilih secara fleksibel melalui variabel lingkungan `RECEIPTS_DISK` (default `receipts` yang mengarah ke `storage_path('app/private')`).
   - Apabila ingin beralih ke S3, cukup ubah nilai `RECEIPTS_DISK=s3` dan daftarkan variabel lingkungan `AWS_*` (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_ENDPOINT`) di tab Variables Railway tanpa mengubah kode program dan tanpa menyimpan kredensial di repository.

3. **Disk Privat & Akses Terautentikasi**:
   - Bukti transfer disimpan pada disk privat (`storage/app/private/receipts/{tahun}/{bulan}/`), **bukan** pada disk public, sehingga tidak dapat diakses langsung melalui URL publik browser tanpa otentikasi.
   - File disajikan secara privat melalui endpoint terautentikasi:
     - `GET /api/v1/transactions/{transaction}/receipt`
     - **Otorisasi**: Hanya dapat diakses oleh Admin atau Member pemilik transaksi bersangkutan (member lain menerima `403 Forbidden`; request tanpa token menerima `401 Unauthorized`).
     - **Header Keamanan**: Header `Content-Type` disajikan sesuai isi berkas asli, dilengkapi `X-Content-Type-Options: nosniff` untuk mencegah MIME-sniffing dan `Cache-Control: private, no-store` guna melindungi kerahasiaan data finansial member.
   - *Catatan Scope*: Endpoint pembuatan transaksi dan upload bukti transfer (`POST`) dikerjakan pada SCRUM-69 (Sprint 3).

4. **Aturan Validasi Berkas**:
   - **Tipe File**: Hanya `JPG`, `PNG`, dan `WEBP` yang diizinkan. Validasi dilakukan berdasarkan inspeksi konten asli file (magic bytes / MIME type asli dari isi berkas via PHP `finfo`), bukan sekadar ekstensi nama file. Ekstensi palsu (misalnya file PHP atau teks yang dinamai `.jpg`) ditolak otomatis.
   - **Ukuran Maksimum**: 2 MB (2048 KB).
   - **Penamaan Acak**: Menggunakan UUID (misalnya `receipts/2026/10/{uuid}.jpg`) untuk mencegah nama bertabrakan dan menjamin kerahasiaan berkas.
   - **Struktur Folder**: `receipts/{tahun}/{bulan}/`.

5. **Service `ReceiptStorage`**:
   - Tersedia service reusable `App\Services\ReceiptStorage` (`store()`, `get()`, `delete()`, `exists()`, `response()`, `validate()`) yang siap digunakan langsung oleh modul transaksi dan perpanjangan membership pada SCRUM-69 (Sprint 3).

6. **Dukungan Seeder**:
   - `TransactionSeeder` otomatis menyalin gambar dummy bukti transfer langsung ke disk privat `receipts` (tidak ada bukti transfer pada disk `public`). Tester dapat langsung menguji akses bukti transfer dummy via endpoint terautentikasi `GET /api/v1/transactions/{transaction}/receipt` di staging.

### Migrasi Database & Seeding Staging

1. **Migrasi Otomatis (Saat Container Start)**:
   - Migrasi berjalan otomatis setiap kali container baru menyala melalui mekanisme `AUTORUN_ENABLED=true` (`php artisan migrate --force`).
   - Apabila migrasi database gagal saat startup, container akan keluar dengan status error, deploy dianggap gagal oleh Railway, dan container versi lama tetap melayani traffic publik.

2. **Seeding Database Staging**:
   - Pastikan variabel `SEED_PASSWORD` sudah diisi terlebih dahulu di tab **Variables** Railway dengan nilai rahasia khusus staging (berbeda dari lokal).
   - Jalankan seeder secara manual dari **Console / Command** service Railway:
     ```bash
     php artisan db:seed --force
     ```
   - **PENTING**: Dilarang menjalankan `php artisan migrate:fresh` di staging agar data operasional tidak terhapus.

### URL Staging API & Verifikasi

- **Staging API URL**:
  ```text
  STAGING_API_URL=https://revira-gym-project-production.up.railway.app
  ```
- **Endpoint Verifikasi**: `GET /api/v1/health`
  ```bash
  curl -i https://revira-gym-project-production.up.railway.app/api/v1/health
  ```

## Autentikasi API (Bearer Token)

Aplikasi mobile member dan Admin Web sama-sama memakai **Bearer token Laravel Sanctum** (bukan cookie/session).
Kirim header `Authorization: Bearer <token>` di setiap request ke route yang dilindungi `auth:sanctum`; tanpa token valid, API membalas `401 {"message":"Unauthenticated."}`.
Aturan lengkap (nilai `device_name`, penyimpanan token, logout, uji cepat) ada di [`docs/auth-bearer-token.md`](docs/auth-bearer-token.md).

### Pembatasan Akses per Peran (Middleware `role`)

Route yang hanya boleh diakses peran tertentu memakai middleware `role` (`api/app/Http/Middleware/EnsureRole.php`), **selalu dipasang setelah `auth:sanctum`**. Gunakan pola berikut supaya konsisten satu tim:

```php
// Route khusus admin
Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    // ...
});

// Route khusus member
Route::middleware(['auth:sanctum', 'role:member'])->prefix('member')->group(function () {
    // ...
});

// Route yang boleh diakses lebih dari satu peran: pisahkan dengan koma
Route::middleware(['auth:sanctum', 'role:admin,member'])->get('/contoh', ...);
```

| Status | Kapan | Body |
|--------|-------|------|
| 401 | Token tidak ada, salah, atau sudah dicabut | `{ "message": "Unauthenticated." }` |
| 403 | Token valid, tetapi peran user tidak termasuk daftar | `{ "message": "Anda tidak memiliki akses ke sumber daya ini." }` |

Route uji `GET /api/v1/admin/ping` dan `GET /api/v1/member/ping` tersedia untuk membuktikan middleware ini (lihat `api/tests/Feature/RoleMiddlewareTest.php`).

## Akun Uji (Seeder)

Untuk mempermudah pengujian otentikasi, otorisasi, transaksi, dan jadwal kelas di lingkungan pengembangan lokal maupun staging, seeder database telah menyediakan kumpulan akun dan data awal yang mencakup seluruh skenario status.

### Tabel Akun Uji

| Email | Role | Status Membership | Keterangan Pengujian |
|---|---|---|---|
| `admin@revira.test` | `admin` | - | Akun pengelola / admin sistem (verifikasi pembayaran, manajemen kelas) |
| `member1@revira.test` | `member` | Active (H-3 kedaluwarsa) | Uji notifikasi pengingat H-3 kedaluwarsa & booking kelas |
| `member2@revira.test` | `member` | Pending | Uji membership baru menunggu verifikasi transaksi |
| `member3@revira.test` | `member` | Expired + Rejected Extension | Uji membership kedaluwarsa dan perpanjangan yang ditolak |
| `member4@revira.test` | `member` | Active | Anggota aktif, peserta kelas Yoga |
| `member5@revira.test` | `member` | Active | Anggota aktif, peserta kelas Yoga |

### Aturan Password Seeder
- Password seluruh akun uji dibaca dari file konfigurasi `api/config/seeding.php` yang merujuk pada environment variable `SEED_PASSWORD` (dengan fallback default `'password'` di lingkungan lokal/testing).
- **Wajib di Staging**: Di lingkungan staging (misalnya Railway), `SEED_PASSWORD` **wajib diisi dengan nilai yang kuat dan aman**. Jika `SEED_PASSWORD` dibiarkan kosong atau tetap bernilai default `'password'`, seeder akan menolak dieksekusi dan melempar `RuntimeException`.
- **Kerahasiaan Password Staging**: Password akun seed di staging berbeda dari lokal dan tidak ditulis di repo; minta ke Orlando (PIC backend) lewat chat pribadi. Jangan menulis nilainya di mana pun.

### Menjalankan Seeder
```bash
cd api

# Lingkungan LOKAL: Reset database dan jalankan seeder dari awal
php artisan migrate:fresh --seed

# Lingkungan STAGING: Cukup jalankan seeder (DILARANG migrate:fresh di staging!)
php artisan db:seed

# Membuat symlink storage agar bukti transfer dapat diakses lewat web
php artisan storage:link
```

### Catatan Penting Eksekusi Seeder:
1. **Keamanan Environment & Aturan Staging**:
   - `DatabaseSeeder` memiliki guard keamanan lingkungan yang ketat: seeding **hanya diizinkan** pada lingkungan `local`, `testing`, dan `staging`.
   - Di Railway, pastikan `APP_ENV=staging` agar seeder dapat dijalankan.
   - Pada lingkungan `production`, proses seeding akan dibatalkan seketika dengan exception `RuntimeException`.
   - **Perbedaan Lokal vs Staging**: Di lokal, gunakan `php artisan migrate:fresh --seed` untuk reset bersih. Di staging, **`migrate:fresh` DILARANG KERAS** karena staging dipakai bersama dan perintah tersebut akan menghapus seluruh data buatan tester. Di staging cukup jalankan `php artisan db:seed` (aman diulang, hanya memperbarui data seed tanpa menyentuh data tester).
2. **Karakteristik Idempotensi & Jadwal Relatif**:
   - `ClassScheduleSeeder` membuat jadwal kelas untuk jendela 7 hari ke depan secara relatif terhadap tanggal hari ini (`now('Asia/Makassar')`). Jadwal dari run sebelumnya tidak dihapus maupun diperbarui.
   - `php artisan db:seed` **pada hari yang sama** idempoten: tidak ada baris yang bertambah.
   - `php artisan db:seed` **pada hari berbeda** menambah jadwal untuk jendela baru tanpa menghapus jadwal run sebelumnya. Akibatnya:
     - jumlah jadwal mendatang bertambah (contoh: 7 menjadi 14),
     - satu tanggal bisa memiliki lebih dari satu sesi,
     - sesi berstatus `cancelled` ikut bertambah.
   - Ini bukan bug data tester. Jangan hapus baris jadwal secara manual untuk "merapikan" di staging, karena staging dipakai bersama.
   - Untuk daftar jadwal yang bersih, gunakan `php artisan migrate:fresh --seed` **di lokal**. Di staging `migrate:fresh` dilarang; tester cukup mengabaikan sesi ganda atau memfilter berdasarkan tanggal dan status.
   - `ClassParticipantSeeder` hanya menempelkan peserta ke sesi dengan `schedule_date >= hari ini`.
3. **Storage Bukti Transfer Dummy**:
   - Seeder otomatis menyalin gambar dummy bukti transfer (`dummy_transfer_pending.jpg`) langsung ke storage disk privat `receipts` (tidak disalin ke disk `public`).
   - Bukti transfer dapat diakses secara privat lewat endpoint terautentikasi `GET /api/v1/transactions/{transaction}/receipt`.
   - Dengan pemasangan Railway Volume pada path `/var/www/html/storage/app/private` (SCRUM-48), seluruh file bukti transfer di disk privat tetap aman dan tidak hilang saat container dideploy ulang di staging.

## Continuous Integration (CI)

Proyek ini menggunakan **GitHub Actions** untuk menjalankan pemeriksaan otomatis per folder monorepo:

### 1. Lane `api/` (`.github/workflows/ci-api.yml`)
- **Pemicu (Trigger)**: Otomatis berjalan saat ada `pull_request` dengan target branch `dev` yang mengubah file di `api/**` atau file workflow itu sendiri. Dilengkapi `concurrency` (run lama otomatis dibatalkan jika ada push baru ke PR yang sama).
- **Pemeriksaan yang Dijalankan**:
  1. Setup environment PHP 8.4 dengan ekstensi yang dibutuhkan (`pdo_mysql`, `pdo_sqlite`, dll.) serta cache Composer.
  2. `composer install` dependensi dari `composer.lock`.
  3. Linter kode menggunakan **Laravel Pint** dalam mode verifikasi (`./vendor/bin/pint --test`).
  4. Pengujian fitur/unit test menggunakan **PHPUnit** (`php artisan test`) dengan in-memory SQLite (`DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`).

### 2. Lane `member-app/` (`.github/workflows/ci-member-app.yml`)
- **Pemicu (Trigger)**: Otomatis berjalan saat ada `pull_request` dengan target branch `dev` yang mengubah file di `member-app/**` atau file workflow itu sendiri. Dilengkapi `concurrency` (run lama otomatis dibatalkan jika ada push baru ke PR yang sama).
- **Pemeriksaan yang Dijalankan**:
  1. Setup environment Node.js 24 sesuai `member-app/.nvmrc` dan cache dependensi npm (`member-app/package-lock.json`).
  2. `npm ci` untuk instalasi dependensi secara bersih dan deterministik.
  3. Validasi tipe data TypeScript menggunakan `npx tsc --noEmit`.

### 3. Cara Menjalankan Pemeriksaan di Lokal Sebelum Push
Untuk memastikan pipeline CI selalu hijau, jalankan perintah berikut di direktori masing-masing sebelum push:

**Backend (`api/`)**:
```bash
cd api

# Cek style kode (Pint mode test)
./vendor/bin/pint --test

# Jalankan test suite
php artisan test
```

**Mobile App (`member-app/`)**:
```bash
cd member-app

# Sinkronisasi dependensi
npm ci

# Validasi tipe TypeScript
npx tsc --noEmit
```

### 4. Lane Lain (`admin-web/`)
Kerangka CI untuk frontend admin telah disiapkan dalam bentuk template:
- `.github/workflows/ci-admin-web.yml.example`

Workflow ini sengaja belum diaktifkan (ekstensi `.example`) karena foldernya masih kosong. Aktifkan dengan me-rename file (menghapus `.example`) saat SCRUM-45 (admin-web) dikerjakan.

## Aturan Kerja

- **Branch**: Buat branch dari `dev`, dengan penamaan `feature/SCRUM-xx-deskripsi`.
- **Pull Request (PR)**: PR diajukan ke `dev`, minimal 1 review. Branch `main` hanya untuk rilis.
- **Commit**: Commit diawali kunci Jira, mis. `SCRUM-34: setup boilerplate`.
- **Environment**: Jangan pernah commit `.env`.
