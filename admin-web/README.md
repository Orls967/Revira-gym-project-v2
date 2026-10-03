# Admin Web - Revira Gym BJM

Aplikasi web admin desktop-first untuk manajemen operasional Revira Gym. Proyek ini dibangun menggunakan React (Vite) dengan TypeScript dan Tailwind CSS v3.

## Prasyarat
- **Node.js**: Versi 24 LTS (Sesuai dengan spesifikasi tim pada berkas `.nvmrc`).

## Struktur Folder
Direktori utama di dalam `src/` dibagi menjadi berikut untuk memisahkan logika dan antarmuka:

- `src/pages/`: Berisi komponen halaman *placeholder* dan utama untuk setiap modul admin (Dashboard, Jam Operasional, Kelas & Jadwal, Instruktur, Paket Keanggotaan, Transaksi, Member).
- `src/components/layout/`: Berisi komponen struktural kerangka antarmuka desktop-first (seperti `AdminLayout`, Sidebar sisi kiri, dan Topbar atas).
- `src/lib/`: Modul utilitas inti, termasuk klien API (`api.ts`) untuk penanganan token Bearer.
- `src/routes/`: Konfigurasi alur navigasi dan *protected routing* untuk membatasi akses role.

## Cara Menjalankan Aplikasi

Pastikan Anda sudah berada di dalam direktori `admin-web/` sebelum mengeksekusi perintah berikut.

1. **Instalasi dependensi:**
   ```bash
   npm install

2. **Persiapan Environment:**
   ```bash
   cp .env.example .env
1. **Jalankan Dev Server:**
   ```bash
   npm run dev
1. **Akses Website:**
   Buka http://localhost:5173 di desktop anda, Aplikasi ini tidak dirancang untuk tampilan layar mobile.
