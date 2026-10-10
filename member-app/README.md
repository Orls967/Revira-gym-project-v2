# Revira Gym - Member App

Aplikasi mobile untuk member Revira Gym BJM berbasis Expo dan React Native.

## Struktur Folder
- `src/app/` : Routing dan halaman berbasis Expo Router
- `src/components/` : Komponen antarmuka (UI) modular
- `src/constants/` : Tema warna dan konstanta sistem
- `src/hooks/` : Custom React hooks
- `src/lib/` : Integrasi API (`api.ts`) dan manajemen autentikasi (`auth.ts`)

## Cara Menjalankan
1. Masuk ke direktori: `cd member-app`
2. Pasang dependensi: `npm install`
3. Salin environment: `cp .env.example .env`
4. Isi variabel `EXPO_PUBLIC_API_URL` di file `.env`
5. Jalankan server: `npx expo start -c`
6. Buka aplikasi menggunakan **Expo Go** pada perangkat Android fisik dengan memindai QR code.

## Build APK Preview (EAS)
- **Versi**: Expo SDK 57, Node 24 (lihat `.nvmrc`), package Android `com.revira.gym`.
- **Kepemilikan Project**: Project EAS (`@ichigo216s-team/member-app`) dimiliki oleh organisasi Expo tim (`ichigo216s-team`). Anggota tim diundang ke organisasi Expo untuk mendapatkan akses build, dan login CLI (`eas login`) memakai akun pribadi masing-masing yang sudah menjadi anggota organisasi.
- **Prasyarat**: `npm i -g eas-cli`, lalu jalankan `eas login` dengan akun pribadi Expo yang telah tergabung ke organisasi `ichigo216s-team`.

### Cara Build
1. `cd member-app`
2. `eas login`
3. `eas build -p android --profile preview`
4. Setelah selesai, EAS menampilkan link/QR unduhan APK. Profil `preview` memakai `EXPO_PUBLIC_API_URL` staging yang ditetapkan di `eas.json`.

### Cara Instal APK di HP Android
1. Buka link unduhan dari build EAS (atau pindai QR) di HP, lalu unduh file `.apk`.
2. Buka file APK. Jika diminta, izinkan **Instal dari sumber tidak dikenal** untuk browser/file manager yang dipakai.
3. Ketuk **Instal**, lalu buka aplikasi.

### Catatan Keystore & Build Profile
- Keystore Android dikelola oleh EAS di organisasi `ichigo216s-team` (dibuat otomatis saat build pertama).
- Backup keystore (`eas credentials`) sudah diunduh dan disimpan di luar repo. Jangan commit `*.jks`, `*.keystore`, atau `credentials.json`.
- Profil `production` menghasilkan Android App Bundle (`app-bundle` / AAB).
- `EXPO_PUBLIC_API_URL` WAJIB ada di setiap profile (`preview` dan `production`) di `eas.json` karena file `.env` tidak ikut diunggah ke EAS (di-gitignore).
- Untuk sementara, profile `production` memakai URL staging dan harus diganti ke URL produksi saat build rilis (SCRUM-81, Sprint 4).
- Nilai variabel `EXPO_PUBLIC_*` tertanam di dalam APK/AAB dan bukan rahasia, jadi jangan pernah menaruh rahasia pada variabel `EXPO_PUBLIC_*`.
