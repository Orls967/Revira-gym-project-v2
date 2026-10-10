# Autentikasi API: Bearer Token (Laravel Sanctum)

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
`is_active` bernilai `true` hanya jika ada membership berstatus `active` yang `end_date`-nya belum lewat (hari terakhir masih dihitung aktif).

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
| `pending` | Pendaftaran/perpanjangan terbaru menunggu verifikasi admin | `false` |
| `rejected` | Pendaftaran/perpanjangan terbaru ditolak | `false` |
| `expired` | Membership terakhir sudah berakhir | `false` |
| `none` | Belum pernah mendaftar membership; `plan`, `start_date`, `end_date` bernilai `null` | `false` |

Jika ada membership yang sedang berlaku, data itu yang ditampilkan walaupun ada catatan lebih baru (mis. perpanjangan yang masih `pending`).
Jika tidak ada, yang ditampilkan adalah catatan membership terbaru. `start_date`/`end_date` bisa `null` untuk status `pending` dan `rejected`.

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
