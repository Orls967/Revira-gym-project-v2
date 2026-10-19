# Autentikasi API: Bearer Token (Laravel Sanctum)

> **Penting:** Sumber kontrak API utama adalah `api/docs/openapi.yaml`. Dokumen ini hanya menjelaskan alur token; bila ada perbedaan, OpenAPI yang berlaku.

Dokumen ini menjelaskan cara klien (aplikasi mobile member dan Admin Web) memakai token API. Dibuat di SCRUM-39.

## Keputusan desain

- Kedua klien memakai **Bearer token** (personal access token Sanctum), **bukan** cookie/SPA session.
  Alasannya, aplikasi mobile tidak punya cookie browser, dan dengan satu mekanisme yang sama kedua klien jadi konsisten.
- Token **tidak kedaluwarsa** untuk tahap awal (`expiration = null` di `api/config/sanctum.php`).
  Nilai ini bisa diubah lewat env `SANCTUM_EXPIRATION` (dalam menit) dan **wajib ditinjau ulang sebelum rilis**.

## Aturan untuk klien

1. Semua endpoint ada di bawah prefix `/api/v1`.
2. Saat login, kirim `device_name` sesuai klien:
   - Aplikasi mobile member: `mobile`
   - Admin Web: `admin-web`

   Nilai ini disimpan sebagai nama token, supaya token tiap perangkat bisa dibedakan dan dicabut.
3. Simpan token yang diterima (format `<id>|<string acak>`) di tempat aman:
   - Mobile: secure storage (Keychain / Keystore) lewat `expo-secure-store`.
   - Admin Web: simpan di memori/state aplikasi; hindari menaruhnya di tempat yang mudah dibaca skrip pihak ketiga.
4. Kirim token di **setiap** request ke route yang dilindungi:

   ```http
   Authorization: Bearer 1|AbCdEf...
   Accept: application/json
   ```

5. Jika menerima **401** dengan body berikut, token tidak ada, salah, atau sudah dicabut. Hapus token lokal dan arahkan user ke halaman login.

   ```json
   { "message": "Unauthenticated." }
   ```

6. Saat logout, panggil endpoint logout supaya token dicabut di server, lalu hapus token lokal.

## Endpoint login dan logout

Kontrak ini dipakai aplikasi mobile dan Admin Web. **Jangan diubah tanpa kabar ke tim frontend (Amel dan Akbar).**
Postman collection siap pakai: [`docs/postman/revira-gym-auth.postman_collection.json`](postman/revira-gym-auth.postman_collection.json).

### `POST /api/v1/login`

Berlaku untuk admin dan member. Klien menentukan layar tujuan dari field `data.user.role` (`admin` atau `member`).
Dibatasi **5 percobaan per menit** per IP.

Body:

```json
{ "email": "member@example.com", "password": "password", "device_name": "mobile" }
```

`device_name` wajib `mobile` atau `admin-web`.

| Status | Kapan | Body |
|--------|-------|------|
| 200 | Login berhasil | lihat contoh di bawah |
| 401 | Email tidak terdaftar **atau** password salah (sengaja tidak dibedakan) | `{ "message": "Email atau password salah." }` |
| 422 | Validasi gagal (field kosong, format email salah, `device_name` tidak dikenal) | `{ "message": "...", "errors": { "field": ["..."] } }` |
| 429 | Lebih dari 5 percobaan dalam 1 menit | `{ "message": "Too Many Attempts." }` |

Contoh respons 200:

```json
{
  "message": "Login berhasil",
  "data": {
    "token": "1|AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd",
    "token_type": "Bearer",
    "user": { "id": 1, "name": "Member Contoh", "email": "member@example.com", "role": "member" }
  }
}
```

> Di halaman login, 401 berarti kredensial salah: tampilkan `message` ke user. Aturan "401 = hapus token lokal" di atas
> berlaku untuk route lain yang dilindungi.

### `POST /api/v1/logout`

Butuh header `Authorization: Bearer <token>`. Hanya mencabut token yang dipakai pada request ini; token di perangkat lain tetap aktif.

| Status | Body |
|--------|------|
| 200 | `{ "message": "Logout berhasil" }` |
| 401 | `{ "message": "Unauthenticated." }` |

### `POST /api/v1/register` (SCRUM-92)

Registrasi akun member dari aplikasi mobile. Akun selalu ber-role `member` (field `role` dari input diabaikan).
Setelah berhasil, member **langsung login**: respons berisi token dengan bentuk yang sama seperti login.
Endpoint ini hanya membuat akun; pemilihan paket membership dan pembayaran adalah alur terpisah.
Dibatasi **5 percobaan per menit** per IP.

Body:

```json
{
  "name": "Member Baru",
  "email": "baru@example.com",
  "phone_number": "081234567890",
  "password": "rahasia123",
  "password_confirmation": "rahasia123",
  "device_name": "mobile"
}
```

| Field | Aturan |
|-------|--------|
| `name` | wajib, maks. 100 karakter |
| `email` | wajib, format email, maks. 150 karakter, belum terdaftar. Disimpan huruf kecil. |
| `phone_number` | wajib, nomor Indonesia. Boleh diawali `08`, `+62`, atau `62`, boleh pakai spasi/strip; disimpan sebagai `08xxxxxxxxxx` (10–13 digit). |
| `password` | wajib, min. 8 karakter, harus sama dengan `password_confirmation` |
| `device_name` | wajib `mobile` |

| Status | Kapan | Body |
|--------|-------|------|
| 201 | Registrasi berhasil | sama seperti respons 200 login, dengan `message: "Registrasi berhasil"` |
| 422 | Validasi gagal (termasuk email sudah terdaftar) | `{ "message": "...", "errors": { "field": ["..."] } }` |
| 429 | Lebih dari 5 percobaan dalam 1 menit | `{ "message": "Too Many Attempts." }` |

### `GET /api/v1/me` (SCRUM-92)

Profil member pemilik token beserta status keanggotaannya. Butuh header `Authorization: Bearer <token>` dan **hanya untuk role `member`** (admin mendapat 403; Admin Web bisa memakai `GET /api/v1/user`).

Aplikasi mobile memakai **`data.membership.is_active`** untuk mengaktifkan tombol booking (SCRUM-26 AC1).
`is_active` bernilai `true` hanya jika ada membership berstatus `active` yang berlaku hari ini (WITA): `start_date <= hari ini <= end_date` (hari pertama dan terakhir ikut dihitung). Perpanjangan yang sudah disetujui tetapi belum mulai **tidak** membuat member aktif lebih awal (SCRUM-71).

Contoh respons 200:

```json
{
  "data": {
    "id": 2,
    "name": "Member Contoh",
    "email": "member@example.com",
    "phone_number": "081234567890",
    "profile_photo": null,
    "role": "member",
    "membership": {
      "is_active": true,
      "status": "active",
      "plan": { "id": 1, "name": "Bulanan", "duration_days": 30 },
      "start_date": "2026-09-20",
      "end_date": "2026-10-20"
    }
  }
}
```

Nilai `membership.status`:

| Status | Arti | `is_active` |
|--------|------|-------------|
| `active` | Membership sedang berlaku | `true` |
| `upcoming` | Membership sudah disetujui tetapi `start_date` masih di masa depan (mis. perpanjangan setelah masa lama habis) | `false` |
| `pending` | Pendaftaran/perpanjangan terbaru menunggu verifikasi admin | `false` |
| `rejected` | Pendaftaran/perpanjangan terbaru ditolak | `false` |
| `expired` | Membership terakhir sudah berakhir | `false` |
| `none` | Belum pernah mendaftar membership; `plan`, `start_date`, `end_date` bernilai `null` | `false` |

Urutan prioritas data yang ditampilkan:

1. Membership yang berlaku hari ini, walaupun ada catatan lebih baru (mis. perpanjangan yang masih `pending` atau perpanjangan yang sudah disetujui dan menunggu tanggal mulai).
2. Jika tidak ada, membership `upcoming` dengan `start_date` paling awal.
3. Jika tidak ada juga, catatan membership terbaru. `start_date`/`end_date` bisa `null` untuk status `pending` dan `rejected`.

**Catatan untuk tim mobile dan Admin Web:** nilai `upcoming` baru ditambahkan di SCRUM-71 (`is_active: false`). Saat ini belum dipakai frontend; tangani saat layar membership/booking dibuat, mis. tampilkan "Membership mulai {start_date}" dan nonaktifkan tombol booking untuk sesi sebelum tanggal itu.

| Status | Body |
|--------|------|
| 200 | lihat contoh di atas |
| 401 | `{ "message": "Unauthenticated." }` |
| 403 | `{ "message": "Anda tidak memiliki akses ke sumber daya ini." }` |

### Akun Uji Coba (Seeder & Manual)
 
Database seeder (`php artisan db:seed`) telah menyediakan akun uji coba bawaan yang mencakup seluruh variasi status:
- **Admin**: `admin@revira.test`
- **Member**: `member1@revira.test` s/d `member5@revira.test`
- **Password**: default `'password'` di lingkungan lokal/testing. Di lingkungan staging (Railway), `APP_ENV` harus disetel `staging` dan `SEED_PASSWORD` wajib diisi dengan password yang aman (seeder menolak berjalan jika kosong atau default).
 
Catatan: `ClassScheduleSeeder` menghasilkan jadwal kelas relatif terhadap tanggal hari ini (7 hari ke depan); seeding berulang bersifat idempoten bila dieksekusi di hari yang sama.
 
Lihat detail variasi status membership dan akun pada [`README.md`](../README.md) di bagian **Akun Uji (Seeder)**.
 
Bila ingin membuat akun secara manual lewat tinker (folder `api/`), gunakan `forceCreate` karena kolom `role` diproteksi dari mass-assignment:
 
```bash
php artisan tinker --execute='App\Models\User::forceCreate(["name" => "Admin Contoh", "email" => "admin@example.com", "password" => "password", "role" => "admin"]);'
php artisan tinker --execute='App\Models\User::forceCreate(["name" => "Member Contoh", "email" => "member@example.com", "password" => "password", "role" => "member"]);'
```

Password otomatis di-hash oleh cast model `User`.

## Route contoh yang dilindungi

| Method | Endpoint       | Keterangan                                |
|--------|----------------|-------------------------------------------|
| GET    | `/api/v1/user` | Mengembalikan data user pemilik token     |

Route baru yang butuh login cukup diberi middleware `auth:sanctum`:

```php
Route::middleware('auth:sanctum')->group(function () {
    // route yang butuh login
});
```

## Pembatasan akses per peran (SCRUM-40)

Route yang hanya boleh diakses peran tertentu memakai middleware `role` (`App\Http\Middleware\EnsureRole`), **selalu setelah `auth:sanctum`**:

```php
Route::middleware(['auth:sanctum', 'role:admin'])->prefix('admin')->group(function () {
    // route khusus admin
});

Route::middleware(['auth:sanctum', 'role:member'])->prefix('member')->group(function () {
    // route khusus member
});

// Lebih dari satu peran: pisahkan dengan koma
Route::middleware(['auth:sanctum', 'role:admin,member'])->get('/contoh', ...);
```

Nama peran yang valid hanya `admin` dan `member`. Salah ketik (mis. `role:admn`) tidak menimbulkan error, tetapi semua user akan mendapat 403.

| Status | Kapan | Body |
|--------|-------|------|
| 401 | Token tidak ada, salah, atau sudah dicabut | `{ "message": "Unauthenticated." }` |
| 403 | Token valid, tetapi peran user tidak termasuk daftar | `{ "message": "Anda tidak memiliki akses ke sumber daya ini." }` |

Aturan untuk klien: **403 berbeda dengan 401**. Token tetap valid, jadi **jangan** hapus token lokal atau arahkan ke login; tampilkan `message` atau arahkan user ke halaman yang sesuai perannya.

Route uji untuk membuktikan middleware (ada di Postman collection):

| Method | Endpoint               | Peran yang diizinkan | Respons 200 |
|--------|------------------------|----------------------|-------------|
| GET    | `/api/v1/admin/ping`   | `admin`              | `{ "message": "pong", "role": "admin" }` |
| GET    | `/api/v1/member/ping`  | `member`             | `{ "message": "pong", "role": "member" }` |

## Jam operasional (admin, SCRUM-51)

CRUD jam buka-tutup gym per hari. Semua endpoint memakai `auth:sanctum` + `role:admin` (tamu 401, member 403).

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET    | `/api/v1/admin/operational-hours` | 200, `{ "data": [...] }` terurut Senin sampai Minggu |
| POST   | `/api/v1/admin/operational-hours` | 201, `{ "message": "Jam operasional berhasil dibuat.", "data": {...} }` |
| GET    | `/api/v1/admin/operational-hours/{id}` | 200, `{ "data": {...} }` |
| PUT    | `/api/v1/admin/operational-hours/{id}` | 200, `{ "message": "Jam operasional berhasil diperbarui.", "data": {...} }` |
| DELETE | `/api/v1/admin/operational-hours/{id}` | 200, `{ "message": "Jam operasional berhasil dihapus." }` |

Body POST dan PUT (PUT mengganti seluruh field, aturan sama dengan POST):

```json
{ "day_of_week": "Senin", "open_time": "06:00", "close_time": "21:00", "is_closed": false }
```

Aturan:

- `day_of_week` wajib, salah satu dari `Senin`, `Selasa`, `Rabu`, `Kamis`, `Jumat`, `Sabtu`, `Minggu` (sesuai enum migration). Satu baris per hari; hari yang sudah ada ditolak 422 (`Jam operasional untuk hari ini sudah ada.`).
- `is_closed` wajib, boolean. Bila `true` (libur), `open_time` dan `close_time` boleh dikosongkan dan nilai yang dikirim **diabaikan**; keduanya disimpan `null`.
- Bila `is_closed` `false`: `open_time` dan `close_time` wajib berformat `HH:MM`, dan jam tutup harus setelah jam buka (sama dengan jam buka juga ditolak).
- `{id}` yang tidak ada mendapat 404 `{ "message": "Data tidak ditemukan." }`.

Contoh item `data`:

```json
{
  "id": 7,
  "day_of_week": "Minggu",
  "open_time": null,
  "close_time": null,
  "is_closed": true,
  "created_at": "2026-10-10T08:00:00+08:00",
  "updated_at": "2026-10-10T08:00:00+08:00"
}
```

## Kelas (admin, SCRUM-52)

CRUD kelas gym. Semua endpoint memakai `auth:sanctum` + `role:admin` (tamu 401, member 403). Kelas hanya punya jumlah peserta minimum; **tidak ada kapasitas maksimum**.

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET    | `/api/v1/admin/classes` | 200, paginasi Laravel `{ "data": [...], "links": {...}, "meta": {...} }` |
| POST   | `/api/v1/admin/classes` | 201, `{ "message": "Kelas berhasil dibuat.", "data": {...} }` |
| GET    | `/api/v1/admin/classes/{id}` | 200, `{ "data": {...} }` |
| PUT    | `/api/v1/admin/classes/{id}` | 200, `{ "message": "Kelas berhasil diperbarui.", "data": {...} }` |
| DELETE | `/api/v1/admin/classes/{id}` | 200, `{ "message": "Kelas berhasil dihapus." }` |

Query string `GET /api/v1/admin/classes` (semuanya opsional, nilai tidak valid mendapat 422):

| Parameter | Keterangan |
|-----------|------------|
| `is_active` | `true`/`false` (atau `1`/`0`). Tanpa parameter ini, kelas aktif dan nonaktif sama-sama tampil. |
| `search` | Cari nama kelas yang mengandung teks ini (maks 100 karakter, tidak peka huruf besar/kecil). `%` dan `_` dicari apa adanya, bukan wildcard. |
| `page` | Nomor halaman, minimal 1. |
| `per_page` | 1-100, default 15. |

Body POST dan PUT:

```json
{
  "name": "Yoga Pagi",
  "description": "Yoga untuk pemula",
  "min_participants": 3,
  "default_instructor_id": 1,
  "is_active": true
}
```

Aturan:

- `name` wajib, maks 100 karakter. `description` opsional (boleh `null`), maks 1000 karakter.
- `min_participants` wajib, bilangan bulat **1-1000** (0, negatif, pecahan, dan nilai di atas 1000 ditolak 422).
- `default_instructor_id` opsional (boleh `null`); bila diisi harus ID instruktur yang **aktif** (422 `Instruktur tidak ditemukan atau tidak aktif.`). Pada PUT, instruktur yang sudah terpasang boleh dikirim ulang walau kini nonaktif, agar kelas tetap bisa diubah; mengganti ke instruktur lain tetap wajib yang aktif.
- `is_active` opsional, default `true`. Pada PUT, bila tidak dikirim nilainya tidak berubah.
- Kelas **tidak bisa dinonaktifkan** (PUT `is_active: false` pada kelas aktif) selama masih punya jadwal mendatang (definisi sama dengan instruktur, scope `ClassSchedule::upcoming()`). Dibalas 409 `Kelas tidak dapat dinonaktifkan karena masih memiliki jadwal mendatang. Silakan batalkan jadwal tersebut lebih dulu.` dan tidak ada field yang berubah. Kelas yang sudah nonaktif tetap bisa diubah.
- Field lain seperti kapasitas maksimum diabaikan.
- Kelas yang sudah punya jadwal **tidak bisa dihapus**: 409 `{ "message": "Kelas tidak dapat dihapus karena sudah memiliki jadwal. Silakan nonaktifkan kelas (is_active = false) sebagai alternatif." }`. Nonaktifkan lewat PUT dengan `is_active: false`.
- `{id}` yang tidak ada mendapat 404 `{ "message": "Data tidak ditemukan." }`.

Kelas nonaktif tidak boleh dipilih untuk jadwal baru. Backend jadwal (SCRUM-55) memakai scope `GymClass::active()`.

## Instruktur (admin, SCRUM-54)

CRUD instruktur. Semua endpoint memakai `auth:sanctum` + `role:admin` (tamu 401, member 403).

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET    | `/api/v1/admin/instructors` | 200, paginasi Laravel `{ "data": [...], "links": {...}, "meta": {...} }` |
| POST   | `/api/v1/admin/instructors` | 201, `{ "message": "Instruktur berhasil dibuat.", "data": {...} }` |
| GET    | `/api/v1/admin/instructors/{id}` | 200, `{ "data": {...} }` |
| PUT    | `/api/v1/admin/instructors/{id}` | 200, `{ "message": "Instruktur berhasil diperbarui.", "data": {...} }` |
| DELETE | `/api/v1/admin/instructors/{id}` | 200, `{ "message": "Instruktur berhasil dihapus." }` |

Query string `GET /api/v1/admin/instructors` (semuanya opsional, nilai tidak valid mendapat 422):

| Parameter | Keterangan |
|-----------|------------|
| `is_active` | `true`/`false` (atau `1`/`0`). Tanpa parameter ini, instruktur aktif dan nonaktif sama-sama tampil. Pakai `is_active=true` untuk pilihan instruktur di form kelas/jadwal. |
| `search` | Cari nama instruktur yang mengandung teks ini (maks 100 karakter, tidak peka huruf besar/kecil). `%` dan `_` dicari apa adanya, bukan wildcard. |
| `page` | Nomor halaman, minimal 1. |
| `per_page` | 1-100, default 15. |

Body POST dan PUT:

```json
{
  "name": "Budi Santoso",
  "specialization": "Yoga",
  "phone_number": "081234567890",
  "is_active": true
}
```

Aturan:

- `name` wajib, maks 100 karakter (422 `Nama instruktur wajib diisi.` / `Nama instruktur maksimal 100 karakter.`).
- `specialization` opsional (boleh `null`), maks 100 karakter.
- `phone_number` opsional (boleh `null`); bila diisi harus nomor Indonesia `08` + 8-11 digit. Format `+62`/`62`, spasi, dan tanda hubung diterima lalu disimpan sebagai `08xxx` (422 `Nomor HP harus nomor Indonesia yang diawali 08, +62, atau 62.`).
- `is_active` opsional, default `true`. Pada PUT, bila tidak dikirim nilainya tidak berubah.
- Instruktur **tidak bisa dinonaktifkan** (PUT `is_active: false` pada instruktur aktif) selama masih punya jadwal mendatang, yaitu jadwal berstatus `scheduled`/`ongoing` yang jam selesainya belum lewat (`schedule_date` setelah hari ini, atau hari ini dengan `end_time` setelah jam sekarang, WITA). Dibalas 409 `Instruktur tidak dapat dinonaktifkan karena masih memiliki jadwal mendatang. Silakan pindahkan jadwal ke instruktur lain atau batalkan jadwal tersebut lebih dulu.` dan tidak ada field yang berubah. Jadwal yang sudah lewat, selesai, atau dibatalkan tidak menghalangi, begitu juga sesi hari ini yang jam selesainya sudah lewat walau statusnya belum diubah ke `completed`. Instruktur yang sudah nonaktif tetap bisa diubah.
- Instruktur **tidak bisa dihapus** bila sudah dipakai (FK `restrict`), dan dibalas 409:
  - punya jadwal, termasuk jadwal yang dibatalkan: `Instruktur tidak dapat dihapus karena sudah memiliki jadwal. Silakan pindahkan jadwal ke instruktur lain lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.`
  - masih menjadi `default_instructor_id` suatu kelas: `Instruktur tidak dapat dihapus karena masih menjadi instruktur default kelas. Silakan ganti instruktur default kelas tersebut lebih dulu, atau nonaktifkan instruktur (is_active = false) sebagai alternatif.`
- `{id}` yang tidak ada mendapat 404 `{ "message": "Data tidak ditemukan." }`.

## Jadwal kelas (admin, SCRUM-55)

CRUD jadwal sesi kelas beserta statusnya. Semua endpoint memakai `auth:sanctum` + `role:admin` (tamu 401, member 403). Semua tanggal dan jam dalam WITA (`Asia/Makassar`); timestamp dikirim dengan offset `+08:00`.

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET    | `/api/v1/admin/class-schedules` | 200, paginasi Laravel `{ "data": [...], "links": {...}, "meta": {...} }` |
| POST   | `/api/v1/admin/class-schedules` | 201, `{ "message": "Jadwal berhasil dibuat.", "data": {...} }` |
| GET    | `/api/v1/admin/class-schedules/{id}` | 200, `{ "data": {...} }` |
| PUT    | `/api/v1/admin/class-schedules/{id}` | 200, `{ "message": "Jadwal berhasil diperbarui.", "data": {...} }` |
| PATCH  | `/api/v1/admin/class-schedules/{id}/status` | 200, `{ "message": "Status jadwal berhasil diperbarui.", "data": {...} }` |
| DELETE | `/api/v1/admin/class-schedules/{id}` | 200, `{ "message": "Jadwal berhasil dihapus." }` |

Query string `GET /api/v1/admin/class-schedules` (semuanya opsional, nilai tidak valid mendapat 422). Hasil terurut berdasarkan tanggal lalu jam mulai.

| Parameter | Keterangan |
|-----------|------------|
| `date_from` | Tanggal awal `YYYY-MM-DD`, inklusif. |
| `date_to` | Tanggal akhir `YYYY-MM-DD`, inklusif; tidak boleh sebelum `date_from`. |
| `class_id` | ID kelas. |
| `status` | `scheduled`, `ongoing`, `completed`, atau `cancelled`. |
| `page` | Nomor halaman, minimal 1. |
| `per_page` | 1-100, default 15. |

Contoh item `data`:

```json
{
  "id": 10,
  "class_id": 1,
  "class_name": "Yoga Pagi",
  "instructor_id": 1,
  "instructor_name": "Budi Santoso",
  "schedule_date": "2026-10-17",
  "start_time": "07:00",
  "end_time": "08:00",
  "status": "scheduled",
  "cancel_reason": null,
  "participants_count": 4,
  "min_participants": 3,
  "created_at": "2026-10-16T10:00:00+08:00",
  "updated_at": "2026-10-16T10:00:00+08:00"
}
```

`participants_count` menghitung peserta yang tidak membatalkan booking (`booked` dan `attended`). `min_participants` diambil dari kelas.

Body POST dan PUT:

```json
{ "class_id": 1, "instructor_id": 1, "schedule_date": "2026-10-17", "start_time": "07:00", "end_time": "08:00" }
```

Aturan buat/ubah (422 kecuali disebut lain):

- `class_id` wajib, kelas **aktif** (`Kelas tidak ditemukan atau tidak aktif.`). `instructor_id` wajib, instruktur **aktif** (`Instruktur tidak ditemukan atau tidak aktif.`). Pada PUT, kelas/instruktur yang sudah terpasang boleh dikirim ulang walau kini nonaktif.
- `schedule_date` `YYYY-MM-DD`, tidak di masa lalu (`Tanggal jadwal tidak boleh di masa lalu.`). Untuk hari ini, `start_time` belum boleh lewat (`Jam mulai sudah lewat.`).
- `start_time` dan `end_time` `HH:MM`; jam selesai harus setelah jam mulai (`Jam selesai harus setelah jam mulai.`), jadi sesi tidak bisa melewati tengah malam.
- **Tumpang tindih instruktur**: satu instruktur tidak boleh punya dua sesi yang jamnya bertumpuk di tanggal yang sama. Error di field `instructor_id`, contoh `Instruktur sudah memiliki jadwal lain pada 2026-10-17 pukul 07:00-08:00 yang bertumpuk dengan jadwal ini.` Jadwal yang dibatalkan tidak dihitung; jam yang hanya bersentuhan (selesai 08:00, mulai 08:00) boleh. Pada PUT, jadwal itu sendiri dikecualikan.
- Jadwal baru selalu `scheduled`; `status` di body diabaikan.
- Jadwal yang **sudah punya peserta** (termasuk yang membatalkan booking) tidak bisa diganti kelasnya: 422 di field `class_id` `Kelas jadwal tidak dapat diganti karena jadwal sudah memiliki peserta. Batalkan jadwal ini lalu buat jadwal baru untuk kelas lain.` Tanggal, jam, dan instruktur tetap boleh digeser.
- PUT hanya untuk jadwal berstatus `scheduled`. Selain itu 409 `Jadwal berstatus cancelled tidak dapat diubah. Hanya jadwal berstatus scheduled yang dapat diubah.`

Status (`PATCH .../status`, body `{ "status": "cancelled", "cancel_reason": "Instruktur berhalangan hadir" }`). Transisi lain, atau status yang sama, ditolak 422 di field `status`:

| Dari | Ke | Syarat |
|------|----|--------|
| `scheduled` | `cancelled` | `cancel_reason` wajib, maks 255 (`Alasan pembatalan wajib diisi bila jadwal dibatalkan.`) |
| `scheduled` | `ongoing`, `completed` | waktu mulai sudah lewat |
| `ongoing` | `completed` | - |
| `ongoing` | `cancelled` | `cancel_reason` wajib |
| `cancelled` | `scheduled` | waktu mulai belum lewat, kelas dan instruktur masih aktif, dan tidak bertumpuk dengan jadwal lain instruktur itu |

`completed` adalah status akhir. `cancel_reason` dikosongkan (`null`) bila status bukan `cancelled`.

Hapus:

- Hanya jadwal yang **belum punya peserta sama sekali**, termasuk peserta yang sudah membatalkan booking (FK `restrict`). Selain itu 409 `Jadwal tidak dapat dihapus karena sudah memiliki peserta. Batalkan jadwal lewat PATCH /admin/class-schedules/{id}/status dengan status cancelled.`
- `{id}` yang tidak ada mendapat 404 `{ "message": "Data tidak ditemukan." }`.

Untuk backend lain: scope `ClassSchedule::upcoming()` (status `scheduled`/`ongoing` yang jam selesainya belum lewat) dan `ClassSchedule::overlapping()` tersedia di model.

## Jadwal kelas publik + polling status (SCRUM-56)

Tanpa autentikasi (token boleh dikirim, hasilnya sama) dan memakai rate limiter `public-api` (120 request/menit per IP, berbagi kuota dengan endpoint publik lain; lewat batas 429).

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET | `/api/v1/class-schedules?date_from=&date_to=` | 200, `{ "data": [...] }` tanpa paginasi |
| GET | `/api/v1/class-schedules/status?updated_since=&date_from=&date_to=` | 200 `{ "data": [...] }` dengan header `ETag`, atau 304 tanpa body |

**Rentang tanggal** (keduanya, inklusif, `YYYY-MM-DD`, WITA): tanpa parameter, hari ini sampai 6 hari ke depan (7 hari). Bila hanya `date_from`, sampai 6 hari setelahnya; bila hanya `date_to`, mulai 6 hari sebelumnya. 422 bila format salah, `date_to` sebelum `date_from` (`Tanggal akhir tidak boleh sebelum tanggal awal.`), atau lebih dari 31 hari (`Rentang tanggal maksimal 31 hari.`).

Item daftar publik (semua status ikut tampil, terurut tanggal lalu jam mulai; tanpa `instructor_id`, kontak instruktur, maupun data peserta):

```json
{
  "id": 10,
  "class_id": 1,
  "class_name": "Yoga Pagi",
  "instructor_name": "Budi Santoso",
  "schedule_date": "2026-10-17",
  "start_time": "07:00",
  "end_time": "08:00",
  "status": "cancelled",
  "cancel_reason": "Instruktur berhalangan hadir",
  "participants_count": 4,
  "min_participants": 3,
  "updated_at": "2026-10-16T11:20:00+08:00"
}
```

Item polling: `{ "id": 10, "status": "cancelled", "participants_count": 4, "min_participants": 3, "updated_at": "2026-10-16T11:20:00+08:00" }`.

Aturan polling:

- `updated_since` opsional, ISO 8601 dengan offset (`2026-10-16T10:00:00+08:00` atau `...Z`, boleh pecahan detik). Encode `+` sebagai `%2B`; `+` yang tidak di-encode tetap dibaca benar. Format lain 422.
- Filter **inklusif** (`updated_at >= updated_since`) karena `updated_at` presisi detik. Item terakhir bisa muncul lagi; klien menimpa item dengan `id` yang sama. Kirim `updated_at` terbesar yang sudah diterima (dari daftar publik atau polling sebelumnya).
- `updated_at` jadwal ikut berubah saat admin mengubah jadwal/status, saat peserta booking/membatalkan/dihapus (`$touches` di model `ClassParticipant`), dan saat `min_participants` kelas berubah (hanya jadwal hari ini dan setelahnya).
- Jadwal yang dihapus admin tidak terlihat di polling; muat ulang daftar publik saat layar dibuka.
- ETag dihitung dari isi respons. Kirim `If-None-Match: <ETag>` dengan URL yang sama; bila tidak berubah, server membalas 304 tanpa body. `Cache-Control: no-cache, private`. Header `ETag` ikut diekspos lewat CORS (`exposed_headers` di `config/cors.php`), jadi klien browser dari origin yang diizinkan bisa membacanya.
- Panduan klien: polling hanya saat layar jadwal aktif, tiap 15-30 detik; berhenti saat app di latar belakang; bila error (5xx/jaringan/429) mundur bertahap (30 s, 60 s, 120 s, maks 5 menit).

Booking (SCRUM-70) sudah mengikuti aturan ini. Untuk backend lain: ubah peserta lewat model Eloquent (`create`/`save`/`delete`) agar `touches` berjalan. Update massal lewat query builder (`ClassParticipant::where(...)->update()`) tidak memperbarui jadwal; panggil `ClassSchedule::whereKey(...)->touch()` secara manual.

## Booking kelas oleh member (SCRUM-70)

Semua endpoint memakai `auth:sanctum` + `role:member` (tamu 401, admin 403). Kontrak lengkap di `api/docs/openapi/paths/bookings.yaml`.

| Method | Endpoint | Respons sukses |
|--------|----------|----------------|
| GET    | `/api/v1/member/bookings` | 200, `{ "data": [...] }` tanpa paginasi |
| POST   | `/api/v1/member/class-schedules/{id}/booking` | 201, `{ "message": "Booking kelas berhasil.", "data": {...} }` |
| DELETE | `/api/v1/member/class-schedules/{id}/booking` | 200, `{ "message": "Booking kelas berhasil dibatalkan.", "data": {...} }` |

`{id}` adalah ID sesi (`class_schedules.id`). Tanpa body. Bentuk `data` (satu booking):

```json
{
  "id": 31,
  "status": "booked",
  "booked_at": "2026-10-16T10:00:00+08:00",
  "updated_at": "2026-10-16T10:00:00+08:00",
  "schedule": {
    "id": 10,
    "class_id": 1,
    "class_name": "Yoga Pagi",
    "instructor_name": "Budi Santoso",
    "schedule_date": "2026-10-17",
    "start_time": "07:00",
    "end_time": "08:00",
    "status": "scheduled",
    "cancel_reason": null,
    "participants_count": 5,
    "min_participants": 3
  }
}
```

`status` booking: `booked`, `attended`, atau `cancelled`. `schedule.status` adalah status sesi (`cancelled` = dibatalkan admin).

**Booking** (B7):
- Sesi harus `scheduled` dan jam mulainya belum lewat (WITA). Tanpa batas kapasitas.
- Member harus aktif pada `schedule_date` (`start_date <= schedule_date <= end_date`, aturan SCRUM-71). Perpanjangan yang sudah disetujui berlaku untuk sesi di periodenya.
- Booking ulang setelah batal mengaktifkan kembali baris lama (ID sama, `booked_at` diperbarui) karena UNIQUE `(class_schedule_id, user_id)`.

**Batal** (B8): hanya booking milik sendiri berstatus `booked`, sebelum jam mulai sesi. Baris tidak dihapus, status menjadi `cancelled`.

**Daftar booking**: booking milik sendiri (semua status) untuk sesi yang jam selesainya belum lewat, termasuk sesi yang dibatalkan admin, terurut tanggal lalu jam mulai.

| Status | Kapan | Body |
|--------|-------|------|
| 404 | Sesi tidak ada | `{ "message": "Data tidak ditemukan." }` |
| 404 | Batal, tetapi member tidak punya booking di sesi itu (termasuk booking milik orang lain) | `{ "message": "Booking tidak ditemukan." }` |
| 409 | Sudah booking (`booked`/`attended`) | `{ "message": "Anda sudah booking sesi kelas ini." }` |
| 422 | Pelanggaran aturan, selalu di field `booking` | `Membership tidak aktif pada tanggal sesi.`, `Sesi kelas ini sudah dibatalkan.`, `Sesi kelas ini sudah dimulai atau selesai.`, `Sesi kelas ini sudah dimulai atau sudah lewat.`, `Booking ini sudah dibatalkan.`, `Booking tidak dapat dibatalkan karena sesi kelas sudah dimulai.` |

Setiap booking/batal langsung mengubah `participants_count` dan `updated_at` sesi, sehingga terlihat di `GET /admin/class-schedules`, `GET /class-schedules`, dan polling `GET /class-schedules/status`.

Untuk backend lain: logika ada di `App\Services\Bookings\BookingService` (`book`, `cancel`); baris sesi dikunci `lockForUpdate` selama transaksi. Scope `ClassSchedule::notEnded()` (jam selesai belum lewat, semua status) dan method `ClassSchedule::hasStarted()` tersedia.

## Helper untuk backend

`App\Services\Auth\ApiTokenService`:

| Method                                   | Fungsi                                              |
|------------------------------------------|-----------------------------------------------------|
| `createToken(User $user, string $deviceName)` | Membuat token baru; `->plainTextToken` dikirim ke klien |
| `revokeCurrentToken(User $user)`         | Mencabut token yang dipakai pada request ini (logout) |
| `revokeAllTokens(User $user)`            | Mencabut semua token user (logout semua perangkat)  |

Konstanta nama perangkat: `ApiTokenService::DEVICE_MOBILE` (`mobile`) dan `ApiTokenService::DEVICE_ADMIN_WEB` (`admin-web`).

## Uji cepat (tinker + Postman/curl)

1. Buat token lewat tinker (di folder `api/`):

   ```bash
   php artisan tinker --execute='echo App\Models\User::first()->createToken("mobile")->plainTextToken;'
   ```

2. Panggil route yang dilindungi:

   ```bash
   curl -H "Accept: application/json" -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/user
   ```

   Di Postman: tab **Authorization** → Type **Bearer Token** → isi token.

3. Hasil yang diharapkan:
   - Token valid → `200` + data user.
   - Tanpa token / token salah / token sudah dicabut → `401` + `{"message":"Unauthenticated."}`.

4. Cabut token lewat tinker:

   ```bash
   php artisan tinker --execute='App\Models\User::first()->tokens()->delete();'
   ```
