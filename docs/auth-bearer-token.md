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
   - Mobile: secure storage (Keychain / Keystore, mis. `flutter_secure_storage` atau `expo-secure-store`).
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

> Endpoint login/logout dibuat di tiket autentikasi berikutnya. Endpoint tersebut memakai helper
> `App\Services\Auth\ApiTokenService` (lihat di bawah).

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
