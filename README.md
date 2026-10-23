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
| `RECEIPTS_DISK` | `receipts` | Disk penyimpanan bukti transfer: `receipts` (volume privat lokal, default) atau `s3` (S3-compatible) |
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
   - Disk bukti transfer dipilih hanya lewat variabel lingkungan `RECEIPTS_DISK` (`receipts` atau `s3`). Disk `receipts` terkunci di kode: driver `local`, root `storage_path('app/private')`, visibility `private`, dan `throw => true` sehingga kegagalan tulis selalu menjadi exception. Driver dan path disk tidak dapat diubah lewat env; pindah penyimpanan cukup lewat `RECEIPTS_DISK`.
   - **Pindah ke S3-compatible (AWS S3, Cloudflare R2, MinIO)**:
     1. Pasang adapter: `composer require league/flysystem-aws-s3-v3` (commit `composer.json` dan `composer.lock`).
     2. Isi variabel berikut di env server (Variables Railway), tanpa menyimpan nilainya di repository: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, serta `AWS_ENDPOINT` untuk R2/MinIO (dan `AWS_USE_PATH_STYLE_ENDPOINT=true` bila penyedia membutuhkannya).
     3. Set `RECEIPTS_DISK=s3`, lalu redeploy.
     4. Berkas lama pada volume tidak otomatis berpindah; salin manual ke bucket bila diperlukan.

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
   - **Respons Error Validasi**: File tidak valid menghasilkan `422` dengan key `receipt_image` (bukan `500`). `ReceiptStorage::rules()` menyediakan aturan siap pakai untuk FormRequest (`required`, `file`, `mimetypes:image/jpeg,image/png,image/webp`, `max:2048`); validasi isi di service tetap berjalan sebagai lapis kedua.
   - **Kegagalan Tulis**: Bila penulisan ke disk gagal (izin volume, disk penuh, dsb.), `ReceiptStorage::store()` melempar `RuntimeException` ("Gagal menyimpan bukti transfer"); path tidak pernah dikembalikan untuk file yang tidak tersimpan.

5. **Service `ReceiptStorage`**:
   - Tersedia service reusable `App\Services\ReceiptStorage` (`store()`, `get()`, `delete()`, `exists()`, `response()`, `validate()`, `rules()`) yang siap digunakan langsung oleh modul transaksi dan perpanjangan membership pada SCRUM-69 (Sprint 3).

6. **Dukungan Seeder**:
   - `TransactionSeeder` otomatis menyalin gambar dummy bukti transfer langsung ke disk privat `receipts` (tidak ada bukti transfer pada disk `public`). Tester dapat langsung menguji akses bukti transfer dummy via endpoint terautentikasi `GET /api/v1/transactions/{transaction}/receipt` di staging.
   - **Catatan Format Path**: Bukti dummy seeder memakai path `receipts/transfer_{id}.jpg` (serta `receipts/dummy_transfer_pending.jpg` dan `receipts/dummy_invalid_transfer.jpg`), berbeda dari format upload asli `receipts/{tahun}/{bulan}/{uuid}.{ext}`.

7. **Verifikasi Persistensi & Izin di Staging**:
   1. Buka Console service API di Railway, jalankan `php artisan tinker`, lalu:
      ```php
      Storage::disk('receipts')->put('receipts/_probe.txt', 'ok');
      Storage::disk('receipts')->exists('receipts/_probe.txt'); // harus true
      ```
   2. Redeploy service, buka tinker lagi, lalu cek `Storage::disk('receipts')->exists('receipts/_probe.txt')`. Hasil `true` berarti volume persisten. Hapus berkas probe setelahnya (`Storage::disk('receipts')->delete('receipts/_probe.txt')`).
   3. Cari baris `ERROR receipts storage not writable by` di log Railway; baris ini dicetak script startup bila folder `receipts` tidak dapat ditulis.
   4. Bila gagal karena izin, opsi solusi adalah menjalankan container sebagai root dengan variabel `RAILWAY_RUN_UID=0` (periksa dokumentasi Railway tentang Volumes dan `RAILWAY_RUN_UID` sebelum memakainya; variabel ini tidak tercantum pada halaman referensi Volumes, dan image yang menolak berjalan sebagai root tidak akan bisa memakainya, sehingga perbaikan izin harus dilakukan lewat script startup).

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

## Dokumentasi API (OpenAPI)

Kontrak API (OpenAPI 3.1, prefix `/api/v1`) untuk aplikasi mobile dan Admin Web:

| Berkas | Isi |
|--------|-----|
| `api/docs/openapi.yaml` | Dokumen utama: info, servers (lokal + staging), security Bearer, daftar path |
| `api/docs/openapi/paths/*.yaml` | Definisi endpoint per area (auth, me, health, plans, public, operational-hours, classes, instructors, schedules, receipts) |
| `api/docs/openapi/components/*.yaml` | Skema, respons, dan parameter bersama |
| `docs/postman/revira-gym-auth.postman_collection.json` | Koleksi Postman (variabel `{{baseUrl}}` dan `{{token}}`) |

Endpoint yang belum dibuat ditandai `x-status: planned` dan tag **Sprint 2**; endpoint tanpa tanda itu sudah ada di kode.

### Cara Melihat

```bash
# Dari root repo: buat file HTML dokumentasi lalu buka di browser
npx @redocly/cli build-docs api/docs/openapi.yaml -o api-docs.html

# Atau gabungkan jadi satu file lalu tempel ke https://editor.swagger.io
npx @redocly/cli bundle api/docs/openapi.yaml -o openapi.bundled.yaml
```

### Validasi

```bash
# Jalankan dari root repo (konfigurasi di redocly.yaml)
npx @redocly/cli lint api/docs/openapi.yaml
```

### Konvensi format respons

Berlaku untuk tiket implementasi SCRUM-51, SCRUM-52, SCRUM-54, SCRUM-55, SCRUM-56, dan SCRUM-93:
- **API Resource**: Respons wajib lewat API Resource; jangan me-return model Eloquent langsung.
- **Datetime**: ISO 8601 dengan offset `+08:00` (contoh `2026-10-12T07:00:00+08:00`; di Resource: `->toIso8601String()`), BUKAN default Eloquent UTC (`.000000Z`).
- **Kolom date** (`schedule_date`, `start_date`, `end_date`): string `Y-m-d` (`->format('Y-m-d')`), jangan diserialisasi sebagai datetime karena bisa mundur satu hari.
- **Kolom time** (`open_time`, `close_time`, `start_time`, `end_time`): "HH:MM" (5 karakter).
- **Uang** (`price`, `amount`): integer rupiah (`(int)` di Resource) walau kolom DB decimal.

### Aturan

**PR yang mengubah endpoint (route, request, respons, atau status code) wajib memperbarui OpenAPI dan koleksi Postman dalam PR yang sama.** Saat endpoint Sprint 2 selesai dibuat, hapus `x-status: planned` dan tag `Sprint 2` pada endpoint tersebut, lalu sesuaikan contoh dengan tes.

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

Proyek ini menggunakan **GitHub Actions** untuk menjalankan pemeriksaan otomatis per folder monorepo dengan arsitektur **Lane + Gate**:

### Struktur Workflow Utama (`.github/workflows/ci.yml`)
Workflow utama dieksekusi pada setiap `pull_request` dengan target branch `dev` tanpa path filter, dilengkapi mekanisme `concurrency` per PR (`cancel-in-progress: true` untuk membatalkan run usang otomatis saat ada commit baru pada PR yang sama).

Alur kerja CI terdiri dari:
1. **Job `changes`**: Menggunakan `dorny/paths-filter` untuk mendeteksi perubahan pada subdirektori (`api/**`, `member-app/**`, `admin-web/**`) maupun perubahan konfigurasi CI (`.github/workflows/**`). Perubahan pada `.github/workflows/**` memicu seluruh lane.
2. **Lane Jobs**: Setiap lane dieksekusi secara modular jika folder terkait atau konfigurasi CI mengalami perubahan:
   - **Lane `api` (`.github/workflows/ci-api.yml`)**: Setup PHP 8.4, cache Composer, `composer install`, linter **Laravel Pint** (`./vendor/bin/pint --test`), dan pengujian unit/fitur **PHPUnit** (`php artisan test`) dengan in-memory SQLite.
   - **Lane `member-app` (`.github/workflows/ci-member-app.yml`)**: Setup Node.js 24 sesuai `member-app/.nvmrc`, cache npm, `npm ci`, validasi tipe TypeScript (`npx tsc --noEmit`), dan linter **Expo ESLint** (`npm run lint`).
   - **Lane `admin-web` (`.github/workflows/ci-admin-web.yml`)**: Setup Node.js 24 sesuai `admin-web/.nvmrc`, cache npm, `npm ci`, linter **ESLint** (`npm run lint`), dan kompilasi build produksi (`npm run build`).
3. **Job `ci-gate`**: Job agregator tunggal dengan nama job persis dan unik `ci-gate`. Job ini mengevaluasi hasil akhir dari `changes` dan ketiga lane (`needs: [changes, api, member-app, admin-web]`). CI Gate akan gagal (exit code 1) jika job `changes` tidak sukses (`result != 'success'`), atau jika ada lane yang mengalami kegagalan (`failure`) maupun pembatalan (`cancelled`). Lane yang dilewati (`skipped`) karena foldernya tidak berubah dianggap sah/lulus.

### Cara Menjalankan Pemeriksaan di Lokal Sebelum Push
Untuk memastikan pipeline CI selalu hijau, jalankan perintah verifikasi di direktori masing-masing sebelum push:

**Backend (`api/`)**:
```bash
cd api
./vendor/bin/pint --test
php artisan test
```

**Mobile App (`member-app/`)**:
```bash
cd member-app
npm ci
npx tsc --noEmit
npm run lint
```

**Admin Web (`admin-web/`)**:
```bash
cd admin-web
npm ci
npm run lint
npm run build
```

## Aturan Kerja

- **Branch**: Buat branch dari `dev`, dengan penamaan `feature/SCRUM-xx-deskripsi`.
- **Pull Request (PR)**: PR diajukan ke `dev`. PR ke `dev` wajib lulus pemeriksaan status `ci-gate` dan mendapatkan minimal 1 approval review — aturan ini **sudah aktif sejak 19 Oktober 2026** (ditegakkan via GitHub Ruleset). Metode merge yang diizinkan hanya **Merge commit** (tanpa squash atau rebase). Branch `main` hanya untuk rilis.
- **Commit**: Commit diawali kunci Jira, mis. `SCRUM-34: setup boilerplate`. Jangan menyertakan trailer Co-Authored-By atau trailer AI.
- **Environment**: Jangan pernah commit berkas `.env`.
