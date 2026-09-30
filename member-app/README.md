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