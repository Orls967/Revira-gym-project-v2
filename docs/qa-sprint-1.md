# Laporan QA Sprint 1 (SCRUM-50)

- **Tanggal Pengujian**: 15 Oktober 2026
- **Branch / SHA Diuji**: `dev` @ `b0f0a2acf9ad41324b116b56175d7c0ade058a51`
- **Staging API URL**: `https://revira-gym-project-production.up.railway.app` (prefix `/api/v1`)
- **Perangkat Android**: 2 Perangkat fisik (diuji oleh Akbar)
- **Penguji**: Tim QA Revira Gym

---

## Ringkasan

### Status Checklist per Butir

| Butir | Deskripsi | Status | Alasan |
|---|---|---|---|
| **Butir 1** | Auth API (Staging) | **SELESAI** | Seluruh skenario auth API berhasil diuji langsung ke staging, termasuk uji login, validasi register, eskalasi peran, dan throttle 429. |
| **Butir 2** | Middleware Role | **SELESAI** | Validasi pembatasan role admin dan member, akses tanpa token, serta proteksi route model binding terbukti aman. |
| **Butir 3** | Staging | **SEBAGIAN** | Endpoint `/health` dan login akun seed terverifikasi; pengecekan internal console Railway berstatus MANUAL karena Railway CLI tidak terpasang di workstation penguji. |
| **Butir 4** | Aplikasi Mobile | **MANUAL (Menunggu Akbar)** | Pengujian aplikasi mobile Android dikerjakan secara terpisah oleh Akbar. |
| **Butir 5** | Admin Web | **GAGAL** | Gagal pada tahap build dan dev server karena error sintaks JSX di `Login.tsx` serta inkonsistensi key LocalStorage; fitur dashboard dan alur login belum dapat diuji interaksinya. |
| **Butir 6** | CI (Continuous Integration) | **SELESAI** | Verifikasi merge PR dan status pipeline checks via GitHub CLI terbukti hijau pada `ci-api` dan `ci-member-app`. |
| **Butir 7** | Kebersihan Repo | **SELESAI** | Audit repo menunjukkan file terlacak bebas rahasia dan identitas commit bersih; namun ditemukan kebocoran password staging di deskripsi PR lama serta Secret Scanning belum aktif. |

### Rekapitulasi Temuan

- **Blocker**: 3 temuan (QA-01, QA-02, QA-08)
- **Mayor**: 4 temuan (QA-03, QA-05b, QA-06, QA-07)
- **Minor**: 3 temuan (QA-04, QA-05a, QA-09)

### Status Tiket Blocker

1. **QA-01**: Perbaikan sintaks JSX pada `admin-web/src/pages/Login.tsx` -> **Draf tiket disiapkan**
2. **QA-02**: Sinkronisasi key LocalStorage auth token di `admin-web` -> **Draf tiket disiapkan**
3. **QA-08**: Pembersihan kebocoran password staging di deskripsi PR dan rotasi `SEED_PASSWORD` -> **Draf tiket disiapkan**

---

## Endpoint yang Diuji

Pemetaan endpoint mengacu pada `api/routes/api.php` dan `api/bootstrap/app.php` pada branch `dev`:

| Method | Endpoint | Middleware | Keterangan |
|---|---|---|---|
| `GET` | `/api/v1/health` | (none) | Pemantauan status service API |
| `POST` | `/api/v1/login` | `throttle:5,1` | Login admin dan member |
| `POST` | `/api/v1/register` | `throttle:5,1,register` | Registrasi member mobile |
| `POST` | `/api/v1/logout` | `auth:sanctum` | Pencabutan token aktif |
| `GET` | `/api/v1/me` | `auth:sanctum`, `role:member` | Profil & ringkasan membership member |
| `GET` | `/api/v1/user` | `auth:sanctum` | Data user terautentikasi |
| `GET` | `/api/v1/membership-plans` | `throttle:public-api` | Katalog paket publik |
| `GET` | `/api/v1/operational-hours` | `throttle:public-api` | Jam operasional publik |
| `GET` | `/api/v1/classes` | `throttle:public-api` | Daftar kelas publik |
| `GET` | `/api/v1/transactions/{id}/receipt` | `auth:sanctum` | Penyajian bukti transfer terproteksi |
| `GET` | `/api/v1/admin/ping` | `auth:sanctum`, `role:admin` | Ping khusus admin |
| `GET` | `/api/v1/admin/membership-plans` | `auth:sanctum`, `role:admin` | CRUD paket membership (admin) |
| `POST` | `/api/v1/admin/membership-plans` | `auth:sanctum`, `role:admin` | Simpan paket membership baru |
| `GET` | `/api/v1/admin/membership-plans/{id}` | `auth:sanctum`, `role:admin` | Detail paket membership |
| `PUT` | `/api/v1/admin/membership-plans/{id}` | `auth:sanctum`, `role:admin` | Perbarui paket membership |
| `DELETE` | `/api/v1/admin/membership-plans/{id}` | `auth:sanctum`, `role:admin` | Hapus paket membership |
| `GET` | `/api/v1/admin/operational-hours` | `auth:sanctum`, `role:admin` | Daftar jam operasional (admin) |
| `POST` | `/api/v1/admin/operational-hours` | `auth:sanctum`, `role:admin` | Tambah jam operasional |
| `GET` | `/api/v1/admin/operational-hours/{id}` | `auth:sanctum`, `role:admin` | Detail jam operasional |
| `PUT` | `/api/v1/admin/operational-hours/{id}` | `auth:sanctum`, `role:admin` | Perbarui jam operasional |
| `DELETE` | `/api/v1/admin/operational-hours/{id}` | `auth:sanctum`, `role:admin` | Hapus jam operasional |
| `GET` | `/api/v1/member/ping` | `auth:sanctum`, `role:member` | Ping khusus member |

---

## Hasil Uji per Butir

| Kasus Uji | Diharapkan | Aktual | Status |
|---|---|---|---|
| **Prasyarat: Reseed Staging** | Akun `member1@revira.test` berstatus membership aktif (`is_active: true`) | Status `expired` (`is_active: false`, `start_date: 2026-09-06`, `end_date: 2026-10-06`) | **GAGAL** |
| **3. Health Check API** | 200 OK, `status: ok` | 200 OK (`status: ok`, waktu respons `0.805s`) | **LULUS** |
| **1.a Login Admin** | 200 OK, memuat token, `role: admin` | 200 OK (`role: admin`, `token: <token>`) | **LULUS** |
| **1.a Login Member** | 200 OK, memuat token, `role: member` | 200 OK (`role: member`, `token: <token>`) | **LULUS** |
| **1.b Login Password Salah** | 401 Unauthorized, pesan API seragam | 401 Unauthorized (`{"message":"Email atau password salah."}`) | **LULUS** |
| **1.c Login Tanpa Body** | 422 Unprocessable Content dengan error validasi | 422 (`errors: email, password, device_name`) | **LULUS** |
| **1.c Login Format Email Salah** | 422 Unprocessable Content dengan error validasi | 422 (`errors: email`) | **LULUS** |
| **1.d Logout Token Valid** | 200 OK ("Logout berhasil"), token dicabut | 200 OK (`{"message":"Logout berhasil"}`) | **LULUS** |
| **1.d Akses Endpoint Pasca-Logout** | 401 Unauthorized saat token yang sama digunakan ke `/user` | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.e Logout Tanpa Token** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.f Register: Email Kosong** | 422 Unprocessable Content | 422 (`The email field is required.`) | **LULUS** |
| **1.f Register: Email Duplikat** | 422 Unprocessable Content | 422 (`The email has already been taken.`) | **LULUS** |
| **1.f Register: Password Lemah / Mismatch** | 422 Unprocessable Content | 422 (`The password field confirmation does not match...`) | **LULUS** |
| **1.f Register: Tanpa Body** | 422 Unprocessable Content | 422 (`errors: name, email, phone_number, password, device_name`) | **LULUS** |
| **1.f Register Valid (qa-s1)** | 201 Created, token ada, `role: member` | 201 Created (`role: member`, `token: <token>`) | **LULUS** |
| **1.g Register Sisip `role: admin`** | 201 Created, role tetap `member` | 201 Created, `user.role: member`; cek `/me` mengonfirmasi `role: member` | **LULUS** |
| **1.h /me Token Member** | 200 OK dengan ringkasan status membership | 200 OK (`role: member`, `membership: {...}`) | **LULUS** |
| **1.h /me Token Admin** | 403 Forbidden (dicegah middleware `role:member`) | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **1.h /me Tanpa Token** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.h /me Token Rusak** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.i /user Token Member** | 200 OK | 200 OK (`role: member`) | **LULUS** |
| **1.i /user Token Admin** | 200 OK | 200 OK (`role: admin`) | **LULUS** |
| **1.i /user Tanpa Token** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.i /transactions/1/receipt Tanpa Token** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **1.i /transactions/1/receipt Member Lain** | 403 Forbidden (kebijakan pemilik transaksi) | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **1.i /transactions/1/receipt Token Admin** | 200 OK atau 404 jika file belum tersedia | 404 Not Found (`"Bukti transfer tidak ditemukan."`) | **LULUS** |
| **1.j Throttle Login 429 (Terakhir)** | 429 Too Many Attempts setelah kuota 5/menit habis | 429 dicapai pada percobaan ke-6. Header `retry-after: 53`. Akun lain dari IP sama ikut terkunci: Ya. Kunci pulih setelah ~55.7 detik | **LULUS** |
| **2. Token Admin ke /member/ping** | 403 Forbidden | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Token Member ke /admin/ping** | 403 Forbidden | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Token Member ke /admin/operational-hours** | 403 Forbidden | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Token Member ke /admin/membership-plans** | 403 Forbidden | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Token Member ke /admin/operational-hours/999999** | 403 Forbidden (bukan 404) | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Token Member ke /admin/membership-plans/999999** | 403 Forbidden (bukan 404) | 403 Forbidden (`"Anda tidak memiliki akses ke sumber daya ini."`) | **LULUS** |
| **2. Tanpa Token ke /admin/ping** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **2. Tanpa Token ke /member/ping** | 401 Unauthorized | 401 Unauthorized (`{"message":"Unauthenticated."}`) | **LULUS** |
| **5. admin-web: `npm run lint`** | Lulus linting tanpa error | Gagal (3 error: 1 parsing error di `Login.tsx`, 2 no-explicit-any di `useFetch.ts` & `auth.ts`) | **GAGAL** |
| **5. admin-web: `npm run build`** | Berhasil mem-build bundel produksi | Gagal exit code 2: `error TS1005: ')' expected` di `src/pages/Login.tsx:93` | **GAGAL** |
| **5. admin-web: Runtime Dev Server** | Halaman login tampil di browser | Error Overlay Vite: `[PARSE_ERROR] Adjacent JSX elements must be wrapped in an enclosing tag` | **GAGAL** |
| **5. admin-web: Alur Login & Sesi** | Admin login, simpan sesi, proteksi rute | Belum dapat diuji karena aplikasi gagal build/compile | **TIDAK DIUJI** |

---

## Hasil Cek Staging dan GitHub (A1-A7)

### A0. Ketersediaan Alat
- `railway CLI`: **Tidak terpasang** di mesin lokal (`zsh: command not found: railway`).
- `gh CLI`: **Tersedia** (`gh version 2.102.0`), terotentikasi sebagai `Orls967` dengan scope `gist, read:org, repo, workflow`.

### A1. Variabel Railway (Service API)
- **Status**: **MANUAL (Akses tidak tersedia)**
- *Catatan*: Railway CLI tidak terpasang. Verifikasi nilai variabel harus dicek melalui Dashboard Railway pada tab Variables:
  - `APP_ENV` harus `staging`
  - `APP_DEBUG` harus `false`
  - `SEED_PASSWORD` harus berstatus terisi nilai kuat (bukan default `'password'`)

### A2. Sumber Deployment Staging
- **Status**: **MANUAL (Akses tidak tersedia)**
- *Catatan*: Periksa melalui tab Settings service API di Dashboard Railway:
  - Repositori: `Revira-gym-project-v2`
  - Branch: `dev`
  - Target commit SHA: `b0f0a2acf9ad41324b116b56175d7c0ade058a51` (sesuai `git rev-parse origin/dev`)

### A3. Status Migrasi di Container Staging
- **Status**: **MANUAL (Akses tidak tersedia)**
- *Catatan*: Jalankan perintah berikut di Console Railway service API:
  ```bash
  php artisan migrate:status
  ```
  Pastikan 16 migration berikut seluruhnya berstatus **Ran**:
  1. `0001_01_01_000000_create_users_table`
  2. `0001_01_01_000001_create_cache_table`
  3. `0001_01_01_000002_create_jobs_table`
  4. `2026_09_28_093057_create_personal_access_tokens_table`
  5. `2026_10_01_000000_add_role_to_users_table`
  6. `2026_10_01_010000_add_profile_fields_to_users_table`
  7. `2026_10_01_010416_create_membership_plans_table`
  8. `2026_10_01_010635_create_memberships_table`
  9. `2026_10_01_011011_create_transactions_table`
  10. `2026_10_01_020000_update_memberships_and_transactions_defaults`
  11. `2026_10_02_100000_create_instructors_table`
  12. `2026_10_02_100100_create_operational_hours_table`
  13. `2026_10_02_100200_create_classes_table`
  14. `2026_10_02_100300_create_class_schedules_table`
  15. `2026_10_02_100400_create_class_participants_table`
  16. `2026_10_02_100500_create_notification_logs_table`

### A4. Reseed Staging
- **Status**: **MANUAL (Akses tidak tersedia)**
- *Temuan Pra-cek*: Pada pengujian awal, akun `member1@revira.test` masih memiliki membership berstatus `expired` (`end_date: 2026-10-06`), menandakan reseed belum dijalankan ulang.
- *Langkah Manual*: Jalankan perintah ini di Console Railway service API:
  ```bash
  php artisan db:seed --force
  ```
  Verifikasi setelah reseed:
  ```bash
  php artisan tinker --execute="$u=App\Models\User::where('email','member1@revira.test')->first(); $m=$u?->memberships()->latest('id')->first(); echo json_encode(['status'=>$m?->status,'start'=>(string)$m?->start_date,'end'=>(string)$m?->end_date]);"
  ```
  Status `member1` diharapkan menjadi `active` dengan `end_date` sekitar H+3.

### A5. CI pada PR Merge Terakhir
- **PR terakhir yang menyentuh `api/`**: **PR #8** (`feature/scrum 51: endpoint crud operational hours`)
  - Hasil `gh pr checks 8`: **✓ All checks were successful** (Lane `API CI/Lint & Test (API)` hijau, durasi 14s).
- **PR terakhir yang menyentuh `member-app/`**: **PR #3** (`SCRUM-80: setup EAS dan profile preview`)
  - Hasil `gh pr checks 3`: **✓ All checks were successful** (Lane `Member App CI/Typecheck` hijau, durasi 24s).

### A6. Audit Rahasia pada Deskripsi PR
- **Status Repositori Saat Ini (`Orls967/Revira-gym-project-v2`)**: Seluruh 10 PR (terbuka dan merged) bersih dari kebocoran password nyata, token, atau secret.
- **Temuan Kebocoran di Repositori Asal (`Orls967/Revira-gym-project#18`)**:
  - Pada PR #18 (SCRUM-44), bagian "Cara Uji" mencantumkan kredensial seeder staging secara terbuka:
    - Baris: `Email: member5@revira.test`
    - Baris: `Password: ****` (terdapat string password staging nyata, bukan kata default 'password').
  - Hal ini dicatat sebagai temuan **Blocker (QA-08)**.

### A7. Ruleset dan Keamanan Repositori GitHub
- **Ruleset `protect-dev` (ID: 24711046)**:
  - Status Enforcement: **Active**
  - Target Branches: `~DEFAULT_BRANCH` (`dev`) dan `refs/heads/main`
  - Aturan: Deletion diblokir, force push (`non_fast_forward`) diblokir, metode merge hanya diperbolehkan `merge`.
- **Security & Analysis (`.security_and_analysis`)**:
  - `secret_scanning`: **Disabled**
  - `secret_scanning_push_protection`: **Disabled**
  - Hal ini dicatat sebagai temuan **Minor (QA-09)**.

---

## Temuan

| ID | Platform | Severity | Ringkasan | Langkah Reproduksi | Diharapkan vs Aktual | Bukti | Tiket |
|---|---|---|---|---|---|---|---|
| **QA-01** | Admin Web | **Blocker** | Sintaks JSX rusak pada `Login.tsx` (kelebihan tag penutup `</div>`) | 1. `cd admin-web`<br>2. Jalankan `npm run build` | **Diharapkan**: Aplikasi berhasil di-build.<br>**Aktual**: Kompilasi gagal dengan `error TS1005: ')' expected`. | `admin-web/src/pages/Login.tsx:93`<br>Commit: `083b8d3`<br>PR: `#19` | Draf Tiket 1 |
| **QA-02** | Admin Web | **Blocker** | Inkonsistensi nama key LocalStorage token auth antara `auth.ts` dan `api.ts` | 1. Buka `admin-web/src/lib/auth.ts`<br>2. Buka `admin-web/src/lib/api.ts` | **Diharapkan**: Interceptor membaca token yang disimpan saat login.<br>**Aktual**: `auth.ts` menyimpan di key `'token'`, `api.ts` membaca `'auth_token'`. Request berikutnya tanpa token dan redirect loop ke `/login`. | `admin-web/src/lib/auth.ts:1` vs `admin-web/src/lib/api.ts:13`<br>Commit: `f67b37d`<br>PR: `#20` | Draf Tiket 2 |
| **QA-03** | Staging | **Mayor** | Data seeder keanggotaan staging belum di-reseed | 1. Login sebagai `member1@revira.test`<br>2. Panggil `GET /api/v1/me` | **Diharapkan**: Membership `member1` aktif (`is_active: true`).<br>**Aktual**: Membership `expired` (`end_date: 2026-10-06`). | Respons staging `/me`: `status: "expired"`, `end_date: "2026-10-06"`. | Draf Tiket 4 |
| **QA-04** | Admin Web | **Minor** | Penggunaan tipe `any` melanggar aturan linter ESLint | 1. `cd admin-web`<br>2. Jalankan `npm run lint` | **Diharapkan**: Linting bersih tanpa error.<br>**Aktual**: 2 error `@typescript-eslint/no-explicit-any`. | `admin-web/src/hooks/useFetch.ts:15`<br>`admin-web/src/lib/auth.ts:3` | - |
| **QA-05a** | Dokumentasi | **Minor** | Pernyataan status folder pada README.md usang | Baca README.md baris 35, 47, 340-344 | **Diharapkan**: Dokumentasi sesuai kondisi branch `dev`.<br>**Aktual**: Menyebut `api/` belum dibuat, `admin-web/` belum tersedia, dan CI masih template. | `README.md:35, 47, 340-344` | - |
| **QA-05b** | Dokumentasi | **Mayor** | Instruksi `php artisan storage:link` untuk bukti transfer menyesatkan | Baca README.md baris 271-272 | **Diharapkan**: Menjelaskan akses bukti transfer lewat disk privat terproteksi.<br>**Aktual**: Menyuruh membuat symlink public web. | `README.md:271-272` | Draf Tiket 5 |
| **QA-06** | API | **Mayor** | Rate limiting login berbasis IP mengunci seluruh user dari IP yang sama | 1. Kirim 5 request login gagal berturut-turut<br>2. Coba login dengan akun valid lain dari IP sama | **Diharapkan**: Throttle mengunci akun spesifik atau membatasi per user + IP.<br>**Aktual**: HTTP 429 mengunci IP global (termasuk login akun lain) selama ~56 detik. | Respons HTTP 429 pada percobaan ke-6, header `retry-after: 53`. | Draf Tiket 6 |
| **QA-07** | Repo / CI | **Mayor** | Tidak ada workflow CI untuk `admin-web`, menyebabkan bug build lolos ke `dev` | Periksa `.github/workflows/` | **Diharapkan**: PR `admin-web` divalidasi CI otomatis.<br>**Aktual**: Workflow `ci-admin-web.yml.example` belum aktif sehingga bug QA-01 lolos merge. | `.github/workflows/ci-admin-web.yml.example` | Draf Tiket 7 |
| **QA-08** | Repo / Keamanan | **Blocker** | Kebocoran password staging pada deskripsi PR SCRUM-44 | Buka deskripsi PR #18 di repositori `Orls967/Revira-gym-project` | **Diharapkan**: Bagian Cara Uji bebas dari kredensial rahasia staging.<br>**Aktual**: Password seeder staging ditulis gamblang pada teks PR. | PR `Orls967/Revira-gym-project#18` baris Cara Uji: `Password: ****` | Draf Tiket 3 |
| **QA-09** | Repo / Keamanan | **Minor** | GitHub Secret Scanning dan Push Protection belum diaktifkan | Jalankan `gh api repos/Orls967/Revira-gym-project-v2 --jq '.security_and_analysis'` | **Diharapkan**: Secret scanning aktif.<br>**Aktual**: Seluruh fitur secret scanning bernilai `disabled`. | API response `.security_and_analysis` | - |

---

## Draf Tiket Blocker

### Tiket 1 (QA-01)
* **Judul**: Perbaikan: Sintaks JSX rusak pada Login.tsx (kelebihan tag penutup div)
* **Platform**: Admin Web
* **Keterkaitan**: SCRUM-50
* **Deskripsi**:
  File `admin-web/src/pages/Login.tsx` memiliki kelebihan tag penutup `</div>` pada baris 93. Hal ini menyebabkan `npm run build` gagal dengan `error TS1005: ')' expected` dan Vite dev server melempar parse error overlay, sehingga antarmuka login admin tidak dapat diakses sama sekali.
* **Langkah Reproduksi**:
  1. `cd admin-web`
  2. Jalankan `npm run build`
* **Kriteria Selesai**:
  1. Hapus tag `</div>` penutup berlebih pada baris 93 `admin-web/src/pages/Login.tsx`.
  2. `npm run build` berjalan sukses tanpa error kompilasi.
  3. Workflow CI untuk `admin-web` diaktifkan dan berstatus hijau pada PR.

---

### Tiket 2 (QA-02)
* **Judul**: Perbaikan: Sinkronisasi nama key LocalStorage token otentikasi admin-web
* **Platform**: Admin Web
* **Keterkaitan**: SCRUM-50
* **Deskripsi**:
  Terdapat inkonsistensi nama key LocalStorage antara modul helper auth (`admin-web/src/lib/auth.ts`) dan client axios (`admin-web/src/lib/api.ts`). Modul `auth.ts` menyimpan token login ke key `'token'` dan `'user'`, sedangkan request interceptor pada `api.ts` membaca dari key `'auth_token'`. Akibatnya, setiap panggilan API admin setelah login tidak membawa Authorization header, API membalas 401, dan response interceptor memaksa kembali ke `/login`.
* **Langkah Reproduksi**:
  1. Amati `setAuth` di `admin-web/src/lib/auth.ts:3-6` yang menulis ke `'token'`.
  2. Amati interceptor di `admin-web/src/lib/api.ts:13-16` yang membaca dari `'auth_token'`.
* **Kriteria Selesai**:
  1. Samakan penamaan key LocalStorage pada kedua berkas (misal seragam `'token'` dan `'user'` atau `'auth_token'` dan `'auth_user'`).
  2. Token berhasil disisipkan pada header `Authorization: Bearer <token>` di setiap request admin.
  3. Sesi admin bertahan saat refresh halaman (F5) dan navigasi antar-halaman dashboard.

---

### Tiket 3 (QA-08)
* **Judul**: Perbaikan: Rotasi password seeder staging dan pembersihan kebocoran kredensial di deskripsi PR
* **Platform**: Repo / Staging Keamanan
* **Keterkaitan**: SCRUM-50
* **Deskripsi**:
  Deskripsi PR #18 (SCRUM-44) pada repositori `Orls967/Revira-gym-project` memuat password akun seeder staging secara terbuka pada bagian Cara Uji. Hal ini merupakan pelanggaran keamanan serius karena password dapat dilihat oleh seluruh kolaborator repositori publik/tim.
* **Langkah Reproduksi**:
  1. Buka halaman PR #18 di GitHub.
  2. Baca bagian "Cara Uji", poin 5 Kredensial seeder staging.
* **Kriteria Selesai**:
  1. Edit deskripsi PR #18 di GitHub untuk menghapus nilai password staging.
  2. Perbarui nilai `SEED_PASSWORD` di Variables Railway service API dengan password rahasia baru yang kuat.
  3. Jalankan `php artisan db:seed --force` di Railway untuk menerapkan password baru ke seluruh akun seeder staging.

---

## Butir 4: Aplikasi Mobile (Akbar)

*Pengujian dilakukan secara fisik di perangkat Android nyata oleh Akbar. Hasil berikut menunggu konfirmasi:*

| Merek / Model HP | Versi Android | Sumber Build (APK preview SCRUM-80 / Expo Go) | Login Berhasil | Sesi Bertahan Setelah Tutup Paksa | Logout Berhasil | Mode Pesawat (Error Handling Wajar) | Catatan Pengujian |
|---|---|---|---|---|---|---|---|
| (Menunggu hasil Akbar) | - | - | - | - | - | - | Menunggu input hasil uji Akbar |
| (Menunggu hasil Akbar) | - | - | - | - | - | - | Menunggu input hasil uji Akbar |

---

## Data Uji yang Dibuat

Selama pengujian registrasi dan validasi eskalasi peran pada Butir 1, dua akun uji telah dibuat di database staging:

1. `qa-s1-1792063881@revira.test` (User ID: `7`, Name: "QA Member Valid")
2. `qa-s1-1792063949@revira.test` (User ID: `8`, Name: "QA Escalation Test")

### Perintah Pembersihan Data Uji

Untuk menghapus data akun sementara ini dari staging, jalankan query berikut melalui Console / Tinker Railway:

```php
// Cek data akun uji terlebih dahulu
$users = App\Models\User::where('email', 'like', 'qa-s1-%@revira.test')->get(['id', 'email', 'name']);

// Hapus akun uji jika tidak ada dependensi relasi yang mengunci (foreign key)
App\Models\User::where('email', 'like', 'qa-s1-%@revira.test')->delete();
```

*(Catatan: Jika terdapat foreign key constraint pada tabel `memberships` atau `transactions`, bersihkan entitas anak terlebih dahulu sebelum menghapus baris `users`).*

---

## Tindak Lanjut

1. **Perbaikan Segera (Blocker)**:
   - Selesaikan perbaikan `Login.tsx` (QA-01) dan key LocalStorage (QA-02) agar modul admin-web dapat diverifikasi kembali.
   - Rotasi `SEED_PASSWORD` di Railway dan bersihkan deskripsi PR #18 (QA-08).
2. **Pengaktifan Pipeline CI Admin-Web (QA-07)**:
   - Ubah nama `.github/workflows/ci-admin-web.yml.example` menjadi `ci-admin-web.yml` agar pemeriksaan build dan linting frontend admin berjalan otomatis di setiap PR.
3. **Penyempurnaan Rate Limiter Login (QA-06)**:
   - Terapkan rate limiter kustom berbasis kombinasi email dan IP (misalnya `RateLimiter::for('login', ...)`), bukan IP global tunggal, agar brute force terhadap satu akun tidak memblokir pengguna sah lain dari IP bersama.
4. **Reseed Database Staging (QA-03)**:
   - Eksekusi `php artisan db:seed --force` di Railway Console untuk memperbarui status membership `member1` menjadi aktif kembali.
5. **Pembaruan Dokumentasi README (QA-05a & QA-05b)**:
   - Hapus instruksi `php artisan storage:link` dan sinkronkan panduan direktori proyek.
