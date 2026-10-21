# Laporan QA Sprint 3 (SCRUM-107)

- **Tanggal Penyusunan**: 19 Oktober 2026
- **Tanggal Eksekusi**: Belum diisi
- **Branch**: `feature/SCRUM-107-qa-sprint-3-test-cases`
- **Dev SHA yang Diuji**: `b203b3a` (origin/dev yang di-merge)
- **Staging API URL**: https://revira-gym-project-production.up.railway.app/api/v1
- **Sumber Requirement**: Jira (https://orlandosss.atlassian.net) — diekstrak 19 Oktober 2026
- **Cakupan Tiket**: SCRUM-103, SCRUM-24, SCRUM-25, SCRUM-104, SCRUM-105, SCRUM-26, SCRUM-27, SCRUM-31
- **Perangkat Android**:
  - HP 1: Belum diisi (Brand, Android version, lebar layar dp)
  - HP 2: Belum diisi (Brand, Android version, lebar layar dp)
- **Penguji**: Belum diisi

---

## Ringkasan

### Cakupan Test Case per Tiket

| Tiket | Judul Singkat | AC | TC yang Mencakup |
|-------|---------------|----|-----------------|
| SCRUM-103 | API Pengajuan Membership & Upload Bukti | AC1–AC4 | TC3-01, TC3-01b, TC3-02–TC3-09 (10 TC) |
| SCRUM-24 | API List Transaksi & Approve/Reject | AC1–AC4 | TC3-10–TC3-16, TC3-15b, TC3-15c, TC3-16b (10 TC) |
| SCRUM-25 | API Booking, Validasi Member Aktif & Cancel | AC1–AC4 | TC3-17–TC3-23, TC3-17b, TC3-19b, TC3-20b, TC3-21b, TC3-21c, TC3-23b (13 TC) |
| SCRUM-104 | Daftar & Filter Member: API + Admin Web | AC1–AC3 | TC3-24–TC3-27, TC3-25b, TC3-25c, TC3-25d (7 TC) |
| SCRUM-105 | UI Pendaftaran & Upload Bukti (Mobile) | AC1–AC5 | TC3-28–TC3-32, TC3-31b (6 TC) |
| SCRUM-26 | UI Booking & Batal Booking Kelas (Mobile) | AC1–AC5 | TC3-33–TC3-37b, TC3-35b (7 TC) |
| SCRUM-27 | Admin Web FE Verifikasi & Cancel Kelas | AC1–AC3 | TC3-38, TC3-38b, TC3-39, TC3-40 (4 TC) |
| SCRUM-31 | WA Smart Button CTA & Optimasi Mobile | AC1–AC3 | TC3-41–TC3-43 (3 TC) |

**Total Test Case: 60**

---

## Endpoint yang Diuji

| Method | Endpoint | Middleware | Keterangan |
|--------|----------|------------|------------|
| `POST` | `/api/v1/member/memberships` | `auth:sanctum`, `role:member` | Pengajuan membership baru / perpanjangan (multipart/form-data) |
| `GET` | `/api/v1/transactions/{transaction}/receipt` | `auth:sanctum` | Akses bukti transfer terproteksi (privat) |
| `GET` | `/api/v1/member/bookings` | `auth:sanctum`, `role:member` | Daftar booking member |
| `GET` | `/api/v1/admin/transactions` | `auth:sanctum`, `role:admin` | List transaksi pending |
| `POST` | `/api/v1/admin/transactions/{transaction}/approve` | `auth:sanctum`, `role:admin` | Approve transaksi |
| `POST` | `/api/v1/admin/transactions/{transaction}/reject` | `auth:sanctum`, `role:admin` | Reject transaksi |
| `GET` | `/api/v1/admin/members` | `auth:sanctum`, `role:admin` | Daftar & filter member |
| `POST` | `/api/v1/member/class-schedules/{classSchedule}/booking` | `auth:sanctum`, `role:member` | Booking sesi kelas |
| `DELETE` | `/api/v1/member/class-schedules/{classSchedule}/booking` | `auth:sanctum`, `role:member` | Batal booking sesi kelas |
| `GET` | `/api/v1/class-schedules/status` | `throttle:public-api`, `cache.headers:no_cache;etag` | Polling counter peserta (endpoint publik) |
| `PATCH` | `/api/v1/admin/class-schedules/{classSchedule}/status` | `auth:sanctum`, `role:admin` | Batalkan sesi kelas (admin) |

Catatan: endpoint GET `/api/v1/admin/members` (SCRUM-104) masih perlu deploy/verifikasi sebelum pengujian. Kontrak endpoint SCRUM-103, SCRUM-24, dan SCRUM-25 mengikuti rincian test case di bawah.

---

## Data Uji

Akun seed:
- admin@revira.test
- member1@revira.test
- member2@revira.test
- member3@revira.test
- member4@revira.test
- member5@revira.test

Kondisi awal akun mengikuti MembershipSeeder/TransactionSeeder. Password minta ke Orlando lewat chat pribadi.

Bukti transfer dummy: `api/database/seeders/assets/dummy_transfer_pending.jpg`. File ini digunakan sebagai bukti transfer dummy; foto bukti pembayaran nyata dilarang digunakan.

Paket dari seeder:
- Paket Bulanan - 30 hari - Rp150.000
- Triwulan - 90 hari - Rp400.000
- Tahunan - 365 hari - Rp1.500.000

Jadwal kelas mengikuti ClassScheduleSeeder.

---

## Test Case

### SCRUM-103 — API Pengajuan Membership & Upload Bukti Transfer

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-01** | SCRUM-103 · AC1 · AC2 · B1 · B10 | Member login, belum pernah punya membership berstatus `active` agar `record_type = registration`. File JPEG valid < 2 MB dan harga paket yang dipilih diketahui tersedia. | 1. Catat harga paket yang dipilih. 2. POST `/api/v1/member/memberships` dengan `multipart/form-data`: `membership_plan_id`, `start_date` = hari ini (WITA), `payment_method = transfer`, `receipt_image` = file JPEG valid < 2 MB. 3. Verifikasi respons berisi data `membership` dan `transaction` dengan status pending. 4. Verifikasi `record_type = registration` dan nilai `transaction.amount` sama dengan harga paket yang dicatat serta bertipe integer. 5. Lakukan lebih dari 10 request pengajuan dalam satu menit pada fixture uji untuk memeriksa rate limit. 6. Saat akses DB/backend tersedia, verifikasi kedua record dibuat dalam satu transaksi DB; response API saja tidak membuktikan atomicity. | 201 Created. Percobaan request di atas 10 kali dalam satu menit menghasilkan 429. Body memuat membership dan transaction berstatus pending; `record_type = registration`; `amount` sama dengan harga paket saat pengajuan dan berupa integer rupiah. Atomicity dibuktikan dengan evidence DB/backend saat eksekusi, bukan hanya response. | API | Belum | B1: record_type registration dan atomicity; B10: bukti transfer serta amount dibandingkan dengan harga paket.  |
| **TC3-01b** | SCRUM-103 · B1 · B10 | Member login yang sudah pernah punya membership active sebelumnya. Saat ini tidak ada membership active/pending. | 1. POST pengajuan membership baru dengan data valid (transfer + `receipt_image`). 2. Verifikasi response memuat `record_type = extension`. | 201 Created. `record_type = extension` karena member pernah memiliki membership active. | API | Belum | B1: record_type extension; B10: bukti transfer dan amount sesuai harga paket. |
| **TC3-02** | SCRUM-103 · AC1 · AC2 · B10 | Member login, belum punya membership aktif/pending. | 1. POST `/api/v1/member/memberships` dengan `payment_method = transfer` **tanpa** field `receipt_image`. | 422 Unprocessable Content. Pesan: "Bukti transfer wajib diunggah untuk pembayaran transfer." | API | Belum | B10: transfer wajib sertakan bukti |
| **TC3-03** | SCRUM-103 · AC2 · B10 | Member login, belum punya membership aktif/pending. | 1. POST `/api/v1/member/memberships` dengan `payment_method = on_the_spot` tanpa field `receipt_image`. | 201 Created. Pengajuan on_the_spot berhasil; membership berstatus `pending` dan transaksi terbuat tanpa kolom bukti transfer. | API | Belum | B10: on_the_spot tanpa bukti adalah alur valid |
| **TC3-04** | SCRUM-103 · AC2 | Member login, belum punya membership aktif/pending. | 1. POST `/api/v1/member/memberships` dengan `receipt_image` berupa file PNG berukuran **> 2 MB**. | 422 Unprocessable Content. Pesan: "Ukuran file bukti transfer maksimal 2 MB." | API | Belum | Validasi ReceiptStorage: ukuran |
| **TC3-05** | SCRUM-103 · AC2 | Member login, belum punya membership aktif/pending. | 1. POST `/api/v1/member/memberships` dengan `receipt_image` berupa file `.pdf` (bukan JPEG/PNG/WebP). | 422 Unprocessable Content. Pesan: "Format bukti transfer harus JPG, PNG, atau WEBP." | API | Belum | Validasi ReceiptStorage: format |
| **TC3-06** | SCRUM-103 · AC3 · B2 | Member login dan **sudah punya membership berstatus `pending`**. | 1. POST `/api/v1/member/memberships` dengan data valid (payment_method apa saja). | 422 Unprocessable Content. Pesan: "Masih ada pengajuan yang menunggu verifikasi." | API | Belum | B2: pengajuan ganda ditolak |
| **TC3-07** | SCRUM-103 · AC3 · B3 | Member login, belum punya membership pending. | 1. POST `/api/v1/member/memberships` dengan `start_date` = **kemarin** (WITA). | 422 Unprocessable Content. Pesan: "Tanggal mulai minimal hari ini." | API | Belum | B3: start_date minimal hari ini |
| **TC3-08** | SCRUM-103 · AC3 · B3 | Member login, punya membership active dengan end_date di masa depan (misal 31 Des). | 1. POST `/api/v1/member/memberships` dengan `start_date` yang tumpang tindih dengan periode membership active tersebut. | 422 Unprocessable Content. Pesan: "Periode membership baru bertabrakan dengan masa aktif yang sedang berjalan." | API | Belum | B3: no overlap dengan membership active |
| **TC3-09** | SCRUM-103 · AC4 | Member login, belum punya membership pending/aktif. | 1. POST pengajuan valid (transfer + receipt_image JPEG valid). Catat `transaction.id`. 2. GET `/api/v1/transactions/{transaction}/receipt` tanpa token. 3. GET endpoint yang sama dengan token member pemilik. 4. GET endpoint yang sama dengan token admin. 5. GET endpoint yang sama dengan token member lain. | Langkah 2: 401 Unauthorized. Langkah 3 dan 4: 200 OK dengan gambar bukti. Langkah 5: 403 Forbidden. | API | Belum | AC4: bukti transfer hanya dapat diakses pemilik atau admin. |

---

### SCRUM-24 — API List Transaksi Pending & Approve/Reject

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-10** | SCRUM-24 · AC1 | Admin login. Terdapat minimal 1 transaksi `pending` di DB. | GET `/api/v1/admin/transactions`. | 200 OK. Daftar transaksi `pending` memuat data member, paket, nominal, metode bayar, dan tautan privat bukti transfer. | API | Belum | AC1: daftar transaksi pending. |
| **TC3-11** | SCRUM-24 · AC4 | Token **member** (bukan admin). | GET `/api/v1/admin/transactions` dengan token member. | 403 Forbidden. | API | Belum | AC4: hanya admin. |
| **TC3-12** | SCRUM-24 · AC4 | Tanpa token. | GET `/api/v1/admin/transactions` tanpa token. | 401 Unauthorized. | API | Belum | AC4: autentikasi wajib. |
| **TC3-13** | SCRUM-24 · AC2 · B4 | Admin login. Ada transaksi `pending` dengan `start_date` = hari ini atau masa depan dan durasi paket diketahui. | 1. Catat `start_date` dan `duration_days` paket. 2. POST approve ke `/api/v1/admin/transactions/{transaction}/approve`. 3. Periksa status transaksi/membership dan tanggal akhir. | 200 OK. Transaksi `verified`; `verified_by` dan `verified_at` terisi; membership `active`; `start_date` tetap; `end_date = start_date + duration_days paket - 1`. | API | Belum | B4: verifikasi field dan perhitungan end_date; approve sukses 200. |
| **TC3-14** | SCRUM-24 · AC2 · B4 | Admin login. Ada transaksi `pending` dengan `start_date` = **tanggal lampau** (sudah lewat) dan durasi paket diketahui. | 1. Catat tanggal mulai dan durasi paket. 2. POST `/api/v1/admin/transactions/{transaction}/approve`. 3. Periksa tanggal mulai/akhir dan status. | 200 OK. Transaksi `verified`; membership `active`; `start_date` digeser ke tanggal approve WITA; `end_date` sesuai durasi paket. | API | Belum | B4: tanggal lampau digeser ke tanggal approve WITA; approve sukses 200. |
| **TC3-15** | SCRUM-24 · AC3 · B5 | Admin login. Ada transaksi `pending`. | POST `/api/v1/admin/transactions/{transaction}/reject` dengan `{reject_reason: "Bukti transfer tidak jelas"}`. | 200 OK. Transaksi dan membership berstatus `rejected`; `reject_reason` tersimpan. | API | Belum | B5: reject flow dengan alasan. |
| **TC3-15b** | SCRUM-24 · AC3 · B5 | Admin login. Ada transaksi `pending`. | POST `/api/v1/admin/transactions/{transaction}/reject` tanpa `reject_reason` (field tidak ada atau kosong). | 422 Unprocessable Content. Pesan: "Alasan penolakan wajib diisi." | API | Belum | B5: alasan wajib. |
| **TC3-15c** | SCRUM-24 · B5 | Prasyarat: TC3-15 telah Lulus dan transaksi/membership terkait berstatus rejected. Member mengajukan membership baru sebagai baris baru. | 1. Member POST pengajuan membership baru (baris baru) ke `/api/v1/member/memberships` dengan data valid. | 201 Created. Membership baru terbuat (baris baru, bukan update baris lama). `record_type` sesuai B1. | API | Belum | B5: "member boleh mengajukan ulang (baris baru)" setelah reject |
| **TC3-16** | SCRUM-24 · B4 · B5 | Ada transaksi yang sudah `verified` atau `rejected`, serta transaksi `pending` yang periode membership-nya overlap dengan masa aktif. | 1. POST approve/reject transaksi yang sudah diproses melalui `/api/v1/admin/transactions/{transaction}/approve` atau `/reject`. 2. POST approve transaksi pending yang overlap melalui `/api/v1/admin/transactions/{transaction}/approve`. | Pemrosesan ulang ditolak dengan 409 Conflict dan pesan "Transaksi ini sudah diproses (status: ...)." Approve transaksi yang overlap ditolak dengan 409 Conflict. | API | Belum | B4 dan B5: proses ulang ditolak; overlap saat approve menghasilkan 409. |
| **TC3-16b** | SCRUM-24 · B5 | Admin login. Ada transaksi `pending`. | POST `/api/v1/admin/transactions/{transaction}/reject` dengan `reject_reason` sepanjang 256 karakter. | 422 Unprocessable Content. Pesan: "Alasan penolakan maksimal 255 karakter." | API | Belum | B5: validasi maksimal 255 karakter. |

---

### SCRUM-25 — API Booking, Validasi Member Aktif & Cancel Kelas

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-17** | SCRUM-25 · AC1 · B6 · B7 | Member dengan membership `active` yang memenuhi `start_date ≤ tanggal sesi ≤ end_date` (WITA). Ada sesi kelas `scheduled` yang belum dimulai. | 1. Pastikan tanggal sesi berada dalam periode membership aktif (`start_date <= tanggal sesi <= end_date`, WITA). 2. POST booking ke `/api/v1/member/class-schedules/{classSchedule}/booking`. 3. Ulangi POST booking untuk member dan sesi yang sama. | Langkah 2: 201 Created. Pesan: "Booking kelas berhasil." Booking terbuat dan `participants_count` bertambah 1. Langkah 3: 409 Conflict. Pesan: "Anda sudah booking sesi kelas ini." | API | Menunggu deploy staging | B6: definisi member aktif; B7: member aktif pada tanggal sesi dan sesi scheduled belum dimulai. |
| **TC3-17b** | SCRUM-25 · B6 | Member yang punya 2 membership `active` tidak tumpang tindih: membership A berjalan (end_date bulan ini), membership B adalah perpanjangan (start_date = besok setelah A berakhir). | 1. Verifikasi di DB bahwa kedua baris berstatus `active`. 2. Cek response `/me` atau endpoint profil member. | Kedua baris berstatus `active` di DB. Sistem tidak menolak keberadaan 2 membership active selama periodenya tidak overlap. | API | Menunggu deploy staging | B6: "Boleh ada 2 membership active asalkan periodenya tidak tumpang tindih" |
| **TC3-18** | SCRUM-25 · AC1 · B6 · B7 | Member **tidak punya** membership active (status expired, none, atau pending). | 1. POST booking ke sesi yang tersedia. | 422 Unprocessable Content. Pesan: "Membership tidak aktif pada tanggal sesi." | API | Menunggu deploy staging | B6: member tidak aktif ditolak. |
| **TC3-19** | SCRUM-25 · AC1 · B7 | Prasyarat: TC3-17 telah Lulus dan menghasilkan booking yang digunakan; booking tersebut dibatalkan sebelum langkah rebook. | 1. Pastikan booking dari TC3-17 berstatus dibatalkan. 2. POST booking ulang ke sesi yang sama. | 201 Created. Pesan: "Booking kelas berhasil." Baris booking lama diaktifkan kembali (bukan baris baru). `participants_count` bertambah. | API | Menunggu deploy staging | B7: rebook reaktifkan baris lama |
| **TC3-19b** | SCRUM-25 · B7 | Member aktif. Sesi kelas dengan `participants_count` yang sudah sama dengan atau melebihi `min_participants`. | 1. POST booking ke `/api/v1/member/class-schedules/{classSchedule}/booking`. | 201 Created. Pesan: "Booking kelas berhasil." Booking berhasil meski jumlah peserta sudah ≥ `min_participants`; `participants_count` bertambah. | API | Menunggu deploy staging | B7: "Tanpa batas kapasitas (hanya min_participants)" — booking tetap bisa meski kuota min sudah terpenuhi |
| **TC3-20** | SCRUM-25 · AC2 | Prasyarat: member aktif dan sesi tersedia. Booking untuk pengukuran dibuat pada langkah pengujian ini. | 1. GET `/api/v1/class-schedules/status`. Catat `participants_count`. 2. Lakukan booking ke `/api/v1/member/class-schedules/{classSchedule}/booking`. 3. GET `/api/v1/class-schedules/status` lagi. | `participants_count` bertambah 1 setelah booking. Nilai hanya menghitung booking yang tidak dibatalkan. | API | Menunggu deploy staging | AC2: counter ter-update setelah booking |
| **TC3-20b** | SCRUM-25 · AC2 | Prasyarat: TC3-17 telah Lulus dan menghasilkan booking aktif milik member yang digunakan pada pengujian ini. | 1. Catat `participants_count` sebelum batal. 2. Batalkan booking. 3. GET `/api/v1/class-schedules/status`. | `participants_count` **berkurang 1** setelah batal. Nilai hanya menghitung booking tidak dibatalkan. | API | Menunggu deploy staging | AC2: counter ter-update setelah batal booking |
| **TC3-21** | SCRUM-25 · AC3 · B8 | Prasyarat: TC3-17 telah Lulus dan menghasilkan booking aktif milik member pada sesi yang belum dimulai. | DELETE `/api/v1/member/class-schedules/{classSchedule}/booking` untuk booking milik member tersebut. | Booking berhasil dibatalkan. Booking berstatus `cancelled`; `participants_count` berkurang. | API | Menunggu deploy staging | B8: "Member boleh membatalkan booking miliknya sampai sesi dimulai" |
| **TC3-21b** | SCRUM-25 · B8 | Prasyarat: tersedia booking aktif milik member pada sesi yang sudah dimulai. | DELETE `/api/v1/member/class-schedules/{classSchedule}/booking` dengan token member pemilik booking. | 422 Unprocessable Content. Pesan: "Booking tidak dapat dibatalkan karena sesi kelas sudah dimulai." | API | Menunggu deploy staging | B8: batas "sampai sesi dimulai" — tidak bisa batal setelah sesi mulai |
| **TC3-21c** | SCRUM-25 · AC3 · B8 | Prasyarat: Member A memiliki booking aktif pada sesi X; Member B tidak memiliki booking pada sesi tersebut. | Member B mencoba DELETE `/api/v1/member/class-schedules/{classSchedule}/booking` pada sesi milik Member A. | 404 Not Found. Pesan: "Booking tidak ditemukan." | API | Menunggu deploy staging | B8: "booking miliknya" — batal hanya untuk booking sendiri |
| **TC3-22** | SCRUM-25 · AC4 · B9 | Admin login. Ada sesi `scheduled` dengan minimal 1 booking `booked`. Catat seluruh booking yang berstatus `booked`. Sesi belum dimulai. | 1. PATCH `/api/v1/admin/class-schedules/{classSchedule}/status` dengan body `{status: "cancelled", cancel_reason: "Peserta kurang dari minimum"}`. 2. Periksa status sesi. 3. Pastikan semua booking `booked` berubah menjadi `cancelled`. | Sesi berhasil dibatalkan; seluruh booking yang sebelumnya `booked` pada sesi tersebut berstatus `cancelled`. | API | Menunggu deploy staging | B9: alasan wajib, sesi dibatalkan sebelum mulai, seluruh booking booked ikut cancelled. Verifikasi data booking memerlukan response/akses backend yang tersedia. |
| **TC3-23** | SCRUM-25 · AC4 · B9 | Admin login. Ada sesi kelas yang ingin dibatalkan. | 1. PATCH cancel sesi tanpa field `cancel_reason` (atau kosong). | 422 Unprocessable Content. Pesan: "Alasan pembatalan wajib diisi bila jadwal dibatalkan." | API | Menunggu deploy staging | B9: alasan wajib |
| **TC3-23b** | SCRUM-25 · B9 | Admin login. Ada sesi yang **sudah dimulai** atau selesai. | PATCH `/api/v1/admin/class-schedules/{classSchedule}/status` dengan body `{status: "cancelled", cancel_reason: "Pengujian pembatalan sesi yang sudah dimulai."}`. | 422 Unprocessable Content. Pesan: "Jadwal yang sudah dimulai tidak dapat dibatalkan." | API | Menunggu deploy staging | B9: "kapan saja sebelum sesi dimulai" — pembatalan tidak bisa setelah sesi mulai |

---

### SCRUM-104 — Daftar & Filter Member: API + Admin Web

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-24** | SCRUM-104 · AC1 · B11 | Admin login. DB memiliki member dengan berbagai status. | 1. GET `/api/v1/admin/members`. | 200 OK. Daftar user ber-role `member` dengan status keanggotaan terkini, nama paket, start_date, end_date, nomor HP. Format paginasi Laravel (15 per halaman). | API | Belum | AC1: list member |
| **TC3-25** | SCRUM-104 · AC1 · B11 | Admin login. DB memiliki member dengan status `active`, `pending`, `expired`. | 1. GET `/api/v1/admin/members?status=active`. 2. GET `/api/v1/admin/members?status=pending`. 3. GET `/api/v1/admin/members?status=expired`. 4. Coba filter paket: GET `/api/v1/admin/members?plan_id=<id>`. 5. Coba pencarian: GET `/api/v1/admin/members?search=<nama atau email atau hp>`. | Setiap request hanya mengembalikan member sesuai filter. Filter paket dan pencarian nama/email/HP berfungsi. | API | Belum | B11: filter status, paket, dan pencarian |
| **TC3-25b** | SCRUM-104 · B11 | Admin login. DB memiliki minimal 16 member ber-role member. | 1. GET `/api/v1/admin/members`. 2. Amati jumlah item per halaman dan field paginasi. 3. GET halaman berikutnya (jika ada). | Halaman pertama berisi maksimal **15** item. Respons menyertakan field paginasi Laravel (current_page, last_page, total, dsb.). Halaman berikutnya dapat diakses dan berisi item selanjutnya. | API | Belum | B11: "paginasi 15 per halaman" |
| **TC3-25c** | SCRUM-104 · B11 | Admin login. DB memiliki member yang **hanya** punya pengajuan dengan `verification_status = rejected` (tidak ada membership active/pending/expired). | 1. GET `/api/v1/admin/members?status=none`. 2. Periksa member tersebut muncul dengan status terkini `none`. 3. GET dengan `status=active`, `status=pending`, dan `status=expired`; periksa member tersebut tidak muncul pada masing-masing hasil. | Filter `status=none` mengembalikan member tersebut sebagai `none`; filter `active`, `pending`, dan `expired` tidak mengembalikannya. | API | Belum | B11: member yang hanya punya pengajuan rejected dihitung none. Keberadaan filter perlu diverifikasi dari kontrak API/repository. |
| **TC3-25d** | SCRUM-104 · B11 | Admin login. Siapkan empat member pembanding: satu dengan membership `active` dan `pending` serta `expired`; satu dengan `pending` dan `expired` tanpa `active`; satu dengan `expired` tanpa `active`/`pending`; dan satu tanpa membership yang memenuhi status tersebut (termasuk hanya pengajuan rejected). | 1. GET `/api/v1/admin/members`. 2. Periksa status terkini masing-masing dari empat member pembanding. | Status yang dikembalikan membuktikan urutan prioritas: member pertama `active`, kedua `pending`, ketiga `expired`, keempat `none`. | API | Belum | B11: prioritas `active > pending > expired > none`; kondisi data adalah setup pengujian, bukan data produksi. Perlu verifikasi akses/filter dari kontrak API/repository. |
| **TC3-26** | SCRUM-104 · AC2 | Admin login di Admin Web; dapat mengamati request API dan menggunakan filter tanpa mengubah production data. | 1. Buka halaman Member dan amati state loading selama request daftar berlangsung. 2. Gunakan filter yang tidak menghasilkan data dan verifikasi state empty. 3. Dengan kondisi pengujian aman (misalnya mock/intercept lokal atau environment test), buat request API gagal/response error dan verifikasi state error. 4. Uji filter status, pencarian, dan navigasi paginasi; pulihkan kondisi request normal. | State loading tampil saat request berlangsung; empty tampil bila hasil filter kosong; error tampil saat API gagal/response error; data, filter, dan paginasi berfungsi saat request normal. | Admin Web | Belum | AC2: halaman Member Admin Web. Gunakan environment/mock pengujian untuk mensimulasikan error; jangan mengubah production data. |
| **TC3-27** | SCRUM-104 · AC3 | Token member / tanpa token. | 1. GET `/api/v1/admin/members` dengan token member. 2. GET tanpa token. | Token member: 403 Forbidden. Tanpa token: 401 Unauthorized. | API | Belum | AC3: akses hanya admin |

---

### SCRUM-105 — UI Pendaftaran & Upload Bukti (Mobile)

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-28** | SCRUM-105 · AC1 · AC4 | User login di aplikasi mobile. Belum punya membership aktif/pending. | 1. Buka layar pendaftaran membership. 2. Pilih paket. 3. Pilih tanggal mulai (hari ini atau lebih). 4. Pilih metode bayar `transfer`. 5. Upload bukti transfer dari galeri. 6. Lihat ringkasan (data diri diambil dari profil `/me`). 7. Submit. | Setiap langkah form tampil secara multi-langkah. Data diri pada ringkasan berasal dari profil akun. Submit berhasil. Layar menampilkan "Menunggu verifikasi". Status pada `/me` ter-refresh. | Mobile | Belum | AC1, AC4: alur pendaftaran penuh |
| **TC3-29** | SCRUM-105 · AC1 | User login. Pilih metode `bayar di tempat`. | 1. Isi form pendaftaran dengan `payment_method = on_the_spot`. 2. Pastikan field upload bukti **tidak muncul**. 3. Submit. | Field upload bukti tidak ditampilkan saat metode bayar di tempat. Submit berhasil dengan status `pending`. | Mobile | Belum | B10 dari SCRUM-103: on_the_spot tidak perlu bukti |
| **TC3-30** | SCRUM-105 · AC2 | User login. Layar upload bukti terbuka. | 1. Ketuk tombol upload. Pilih dari **galeri**. 2. Ulangi, pilih dari **kamera**. 3. Pilih gambar besar (> 2 MB). 4. Amati proses kompresi dan preview. 5. Ganti gambar dengan yang lain. | Gambar dikompres otomatis hingga < 2 MB sebelum dikirim. Preview gambar tampil. Tombol ganti berfungsi. Loading state tampil selama proses kompresi/upload. | Mobile | Belum | AC2: expo-image-picker + kompresi otomatis |
| **TC3-31** | SCRUM-105 · AC3 | User login. | 1. Submit form dengan `start_date` kemarin. 2. Submit form saat member sudah punya membership pending. | Pesan error dari server (422 per field) tampil jelas di layar untuk masing-masing kondisi. Setiap field yang error menampilkan pesan yang bisa dibaca user. | Mobile | Belum | AC3: error server per field tampil di UI (B2, B3) |
| **TC3-31b** | SCRUM-105 · AC3 | User login. Layar upload bukti terbuka. | 1. Pilih file berukuran > 2 MB dan gagal dikompres. 2. Pilih file berformat tidak didukung (misal PDF). | Pesan error ukuran/format tampil jelas di layar (dari validasi server maupun client). | Mobile | Belum | AC3: "pesan error… ukuran/format file… tampil jelas di layar" |
| **TC3-32** | SCRUM-105 · AC5 | HP Android nyata berukuran layar 360dp dan 412dp. | 1. Buka layar pendaftaran di HP 360dp. 2. Buka di HP 412dp. 3. Amati layout, font, tombol, dan form di kedua ukuran. | Seluruh elemen UI tampil benar (tidak terpotong, tidak overflow) di kedua ukuran layar. | Mobile | Belum | AC5: responsif di HP Android nyata |

---

### SCRUM-26 — UI Booking & Batal Booking Kelas (Mobile)

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-33** | SCRUM-26 · AC1 · B6 · B7 | Member login dengan membership `active` yang memenuhi `start_date ≤ tanggal sesi ≤ end_date` (WITA). Ada sesi `scheduled` yang belum dimulai. | 1. Buka daftar jadwal kelas. 2. Pastikan tanggal sesi berada di dalam periode membership (`start_date ≤ tanggal sesi ≤ end_date`, WITA). 3. Pilih sesi yang tersedia. 4. Ketuk tombol Booking. 5. Konfirmasi. | Tombol Booking aktif (tidak disabled) untuk member yang membership-nya aktif pada tanggal sesi. Booking berhasil. | Mobile | Belum | B6: definisi member aktif; B7: member aktif pada tanggal sesi dan sesi scheduled belum dimulai |
| **TC3-34** | SCRUM-26 · AC1 | Member **tidak aktif** (expired/none) login di app. | 1. Buka daftar jadwal. 2. Lihat tombol pada sesi yang tersedia. | Tombol Booking tampil disabled atau tidak muncul. Alasan ketidakaktifan ditampilkan di UI. | Mobile | Belum | AC1: "Selain itu tampil alasannya" |
| **TC3-35** | SCRUM-26 · AC2 | Member aktif. Layar jadwal terbuka. | 1. Catat `participants_count` awal yang ditampilkan UI. 2. Lakukan booking. 3. Amati counter di UI setelah booking. 4. Tunggu interval polling berikutnya (tanpa aksi apapun) dan amati counter. | Counter peserta ter-update segera setelah booking berhasil. Counter juga ter-update secara otomatis via polling saat layar aktif (tanpa perlu reload manual). | Mobile | Belum | AC2: counter setelah booking + polling otomatis |
| **TC3-35b** | SCRUM-26 · AC2 | Prasyarat: TC3-33 telah Lulus dan menghasilkan booking milik member pada sesi yang diuji. Layar jadwal terbuka. | 1. Catat `participants_count` sebelum batal. 2. Batalkan booking dari layar "Booking saya". 3. Kembali ke layar jadwal dan amati counter. | Counter **berkurang** setelah batal booking berhasil. | Mobile | Belum | AC2: counter ter-update setelah batal booking |
| **TC3-36** | SCRUM-26 · AC3 · B8 | Prasyarat: TC3-33 telah Lulus dan menghasilkan booking milik member pada sesi yang belum dimulai. | 1. Buka layar "Booking saya" atau detail sesi. 2. Ketuk "Batal Booking". 3. Konfirmasi. | Booking dibatalkan berhasil. Counter berkurang. Tombol kembali ke status "Booking". | Mobile | Belum | B8: "sampai sesi dimulai" |
| **TC3-37** | SCRUM-26 · AC4 · B9 | Prasyarat: layar jadwal member aktif dan sesi/booking tersedia; pembatalan sesi dilakukan oleh admin sebagai bagian langkah pengujian. | 1. Pastikan layar jadwal member tetap aktif (foreground). 2. Admin membatalkan sesi tersebut dari API atau Admin Web. 3. Tunggu interval polling berikutnya berlalu (jangan refresh manual). 4. Amati layar jadwal member. | Tanpa perlu refresh manual, status sesi berubah menjadi "Dibatalkan" dan alasan pembatalan tampil di layar member setelah polling berikutnya selesai. Tombol Booking dan Batal Booking tidak muncul. | Mobile | Belum | B9: "Member mengetahui lewat status di aplikasi (polling)" — uji polling aktif, bukan refresh manual |
| **TC3-37b** | SCRUM-26 · AC5 | HP Android nyata 360dp dan 412dp. | 1. Buka layar jadwal dan detail sesi di HP 360dp. 2. Buka di HP 412dp. | Layout, tombol, dan counter tampil benar di kedua ukuran layar tanpa overflow. | Mobile | Belum | AC5: responsif 360dp & 412dp |

---

### SCRUM-27 — Admin Web FE Verifikasi Transaksi & Cancel Kelas

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-38** | SCRUM-27 · AC1 · B4 | Prasyarat: tersedia transaksi pending dari TC3-01 atau seed. Admin login di Admin Web. | 1. Buka dashboard verifikasi transaksi. 2. Verifikasi: dashboard menampilkan daftar transaksi pending beserta data member, paket, metode bayar, dan tombol Approve serta Reject tersedia. 3. Klik Approve pada salah satu transaksi pending. | Langkah 2: transaksi pending tampil lengkap dengan tombol Approve dan Reject. Langkah 3: transaksi berubah status `verified`. Membership berubah `active`. Baris hilang dari daftar pending (atau ditandai verified). | Admin Web | Belum | AC1: verifikasi dashboard dulu sebelum approve; B4: approve via Admin Web |
| **TC3-38b** | SCRUM-27 · AC1 · B5 | Prasyarat: tersedia transaksi pending dari TC3-01 atau seed. Admin login di Admin Web. | 1. Buka dashboard verifikasi transaksi. 2. Klik Reject. 3. Isi alasan reject. 4. Konfirmasi. | Transaksi berstatus `rejected`. Membership `rejected`. Jika alasan kosong, tombol konfirmasi disabled atau pesan validasi tampil sebelum dikirim ke server. | Admin Web | Belum | B5: reject wajib alasan via Admin Web |
| **TC3-39** | SCRUM-27 · AC2 | Prasyarat: tersedia transaksi transfer berbukti dari TC3-01 dan transaksi on_the_spot dari TC3-03 atau seed. | 1. Klik transaksi `transfer` yang memiliki bukti. 2. Amati preview/zoom gambar bukti transfer. 3. Amati tampilan transaksi `on_the_spot`. | Bukti transfer tampil sebagai preview gambar yang dapat di-zoom. Transaksi `on_the_spot` ditandai jelas (misalnya "Bayar di tempat / Tanpa Bukti"). Gambar diambil dari endpoint privat dengan token admin. | Admin Web | Belum | AC2: preview bukti transfer di layar lebar |
| **TC3-40** | SCRUM-27 · AC3 · B9 | Admin login di Admin Web. Ada sesi kelas dengan peserta di bawah minimum. | 1. Buka halaman jadwal kelas di Admin Web. 2. Amati indikator sesi dengan peserta < minimum. 3. Klik Batalkan Sesi. 4. Baca dialog konfirmasi. 5. Konfirmasi pembatalan. | Sesi dengan peserta di bawah minimum disorot/diindikasikan. Dialog batal menampilkan jumlah booking yang akan ikut dibatalkan. Setelah konfirmasi, sesi dan seluruh booking terdampak berstatus `cancelled`. | Admin Web | Belum | B9: indikator peserta kurang + dialog booking terdampak |

---

### SCRUM-31 — WA Smart Button CTA (Deep Link) & Optimasi Mobile

| ID | Tiket & AC/Aturan | Prasyarat | Langkah | Hasil yang Diharapkan | Platform | Status | Catatan |
|----|-----------------|------------|---------|-------------------------|----------|--------|---------|
| **TC3-41** | SCRUM-31 · AC1 · AC2 | HP Android dengan WhatsApp terpasang. User buka app (login tidak wajib untuk cek keberadaan tombol). | 1. Buka layar **Beranda** → cari tombol "Chat Admin" → ketuk. 2. Buka layar **jadwal kelas** → cari tombol "Chat Admin" → ketuk. 3. Buka layar **detail sesi** → cari tombol "Chat Admin" → ketuk. 4. Buka layar **pendaftaran** → cari tombol "Chat Admin" → ketuk. | Tombol "Chat Admin" tersedia di keempat layar. Setiap ketukan membuka WhatsApp dengan teks pre-filled yang sesuai konteks layar masing-masing. | Mobile | Belum | AC1: tombol di 4 layar; AC2: Linking.openURL ke wa.me dengan teks pre-filled |
| **TC3-42** | SCRUM-31 · AC2 | HP Android **tanpa** WhatsApp terpasang. | 1. Ketuk tombol "Chat Admin" di salah satu layar. 2. Periksa URL yang dibuka browser dan teks yang terisi. | Browser membuka URL `wa.me/...` dan teks pre-filled sesuai konteks layar yang memulai chat. Tidak ada crash atau error yang tidak tertangani. Detail perilaku aktual harus diverifikasi saat eksekusi karena tidak dipastikan oleh kontrak/repository yang tersedia. | Mobile | Belum | AC2: fallback browser; verifikasi URL `wa.me` dan teks pre-filled aktual saat eksekusi. |
| **TC3-43** | SCRUM-31 · AC3 | HP Android nyata: 2 unit (360dp dan 412dp), minimal 2 versi Android berbeda. | 1. Buka seluruh layar utama (Beranda, jadwal, detail sesi, pendaftaran) di HP 360dp. 2. Ulangi di HP 412dp. 3. Pastikan pengujian dilakukan di minimal 2 versi Android. | Seluruh layar tampil benar di kedua ukuran layar pada minimal 2 versi Android (tidak ada overflow, elemen tidak terpotong, tidak ada UI yang rusak). | Mobile | Belum | AC3: "diuji di minimal 2 versi Android pada HP nyata" |

---

## Temuan / Findings

Aturan tindak lanjut:
- Blocker: buat tiket sendiri.
- FE Mayor/Minor: masukkan ke tabel temuan.
- API Mayor: buat/masukkan ke tiket Sprint 4.
- API Minor: masukkan ke tabel temuan.

| ID | Platform | Severity | Ringkasan | Langkah Reproduksi | Diharapkan | Aktual | Bukti | Tiket |
|----|----------|----------|-----------|-------------------|------------|--------|-------|-------|
| — | — | — | Belum ada temuan. Bagian ini akan diisi saat pengujian berjalan. | — | — | — | — | — |

---

## Mapping AC → Test Case

| Tiket | AC | Test Case |
|-------|----|-----------|
| SCRUM-103 | AC1 | TC3-01, TC3-02 |
| SCRUM-103 | AC2 | TC3-01, TC3-02, TC3-03, TC3-04, TC3-05 |
| SCRUM-103 | AC3 | TC3-06, TC3-07, TC3-08 |
| SCRUM-103 | AC4 | TC3-09 |
| SCRUM-24 | AC1 | TC3-10 |
| SCRUM-24 | AC2 | TC3-13, TC3-14 |
| SCRUM-24 | AC3 | TC3-15, TC3-15b, TC3-16b |
| SCRUM-24 | AC4 | TC3-11, TC3-12 |
| SCRUM-25 | AC1 | TC3-17, TC3-18, TC3-19 |
| SCRUM-25 | AC2 | TC3-20, TC3-20b |
| SCRUM-25 | AC3 | TC3-21, TC3-21b, TC3-21c |
| SCRUM-25 | AC4 | TC3-22, TC3-23, TC3-23b |
| SCRUM-104 | AC1 | TC3-24, TC3-25, TC3-25b, TC3-25c, TC3-25d |
| SCRUM-104 | AC2 | TC3-26 |
| SCRUM-104 | AC3 | TC3-27 |
| SCRUM-105 | AC1 | TC3-28, TC3-29 |
| SCRUM-105 | AC2 | TC3-30 |
| SCRUM-105 | AC3 | TC3-31, TC3-31b |
| SCRUM-105 | AC4 | TC3-28 |
| SCRUM-105 | AC5 | TC3-32 |
| SCRUM-26 | AC1 | TC3-33, TC3-34 |
| SCRUM-26 | AC2 | TC3-35, TC3-35b |
| SCRUM-26 | AC3 | TC3-36 |
| SCRUM-26 | AC4 | TC3-37 |
| SCRUM-26 | AC5 | TC3-37b |
| SCRUM-27 | AC1 | TC3-38, TC3-38b |
| SCRUM-27 | AC2 | TC3-39 |
| SCRUM-27 | AC3 | TC3-40 |
| SCRUM-31 | AC1 | TC3-41 |
| SCRUM-31 | AC2 | TC3-41, TC3-42 |
| SCRUM-31 | AC3 | TC3-43 |

---

## Mapping Business Rules B1–B11 → Test Case

| Rule | Aspek yang Diuji | Sumber | Test Case |
|------|-----------------|--------|-----------|
| **B1** | record_type registration vs extension; satu transaksi DB untuk memberships + transactions | SCRUM-103 | TC3-01, TC3-01b |
| **B2** | Pengajuan ditolak 422 bila member masih punya membership pending | SCRUM-103 | TC3-06 |
| **B3** | start_date minimal hari ini; tidak overlap dengan membership active | SCRUM-103 | TC3-07, TC3-08 |
| **B4** | Approve: verified, verified_by, verified_at, membership active, end_date; start_date lampau digeser; transaksi yang sudah diputuskan tidak diproses ulang | SCRUM-24 | TC3-13, TC3-14, TC3-16, TC3-38 |
| **B5** | Reject: alasan wajib (maks 255 kar), membership/transaksi rejected; pengajuan ulang dengan baris baru; transaksi yang sudah diputuskan tidak diproses ulang | SCRUM-24 | TC3-15, TC3-15b, TC3-15c, TC3-16, TC3-16b, TC3-38b |
| **B6** | Definisi member aktif (start_date ≤ hari ini ≤ end_date WITA); boleh 2 active tidak overlap | SCRUM-25 | TC3-17, TC3-17b, TC3-18, TC3-33, TC3-34 |
| **B7** | Booking hanya member aktif pada tanggal sesi; sesi scheduled belum dimulai; tanpa batas kapasitas; rebook aktifkan baris lama | SCRUM-25 | TC3-17, TC3-19, TC3-19b, TC3-33 |
| **B8** | Batal booking milik sendiri hanya sampai sesi dimulai; tidak bisa batal setelah sesi mulai atau booking milik member lain | SCRUM-25 | TC3-21, TC3-21b, TC3-21c, TC3-36 |
| **B9** | Admin batal sesi sebelum dimulai; alasan wajib; semua booking booked → cancelled; tidak bisa setelah sesi mulai | SCRUM-25 | TC3-22, TC3-23, TC3-23b, TC3-37, TC3-40 |
| **B10** | Transfer wajib bukti; on_the_spot tanpa bukti; amount = harga paket (integer rupiah) | SCRUM-103 | TC3-01, TC3-02, TC3-03, TC3-29 |
| **B11** | List dengan paginasi 15; filter status (active/pending/expired/none); filter paket; pencarian; priority status; rejected-only = none | SCRUM-104 | TC3-24, TC3-25, TC3-25b, TC3-25c, TC3-25d |

---

## Referensi Business Rules (Verbatim dari Jira)

| Rule | Teks | Sumber |
|------|------|--------|
| **B1** | Satu endpoint POST /api/v1/member/memberships (multipart/form-data) membuat baris memberships (status = pending) dan transactions (verification_status = pending) sekaligus dalam satu transaksi DB. record_type ditentukan server: registration bila member belum pernah punya membership active, selain itu extension. | SCRUM-103 |
| **B2** | Pengajuan ditolak (422) bila member masih punya membership berstatus pending. | SCRUM-103 |
| **B3** | start_date minimal hari ini (WITA). Untuk perpanjangan, klien menyarankan tanggal sehari setelah end_date membership aktif. Periode baru tidak boleh tumpang tindih dengan membership active mana pun (422). | SCRUM-103 |
| **B4** | Approve: transaksi verified, verified_by dan verified_at terisi; membership active; end_date = start_date + duration_days paket − 1. Bila start_date sudah lewat saat di-approve, start_date digeser ke tanggal approve (WITA). | SCRUM-24 |
| **B5** | Reject: alasan wajib (maks 255 karakter) di reject_reason; transaksi dan membership rejected; member boleh mengajukan ulang (baris baru lewat SCRUM-103). | SCRUM-24 |
| **B6** | "Member aktif" = membership active dengan start_date ≤ hari ini ≤ end_date (WITA). Boleh ada 2 membership active (yang berjalan dan perpanjangannya) asalkan periodenya tidak tumpang tindih. | SCRUM-25 |
| **B7** | Booking hanya oleh member yang aktif pada tanggal sesi, untuk sesi scheduled yang belum dimulai. Tanpa batas kapasitas (hanya min_participants). Booking ulang setelah batal mengaktifkan kembali baris lama, karena ada constraint UNIQUE (class_schedule_id, user_id). | SCRUM-25 |
| **B8** | Member boleh membatalkan booking miliknya sampai sesi dimulai. | SCRUM-25 |
| **B9** | Admin membatalkan sesi lewat endpoint yang sudah ada (PATCH /api/v1/admin/class-schedules/{classSchedule}/status, alasan wajib, dari SCRUM-55), kapan saja sebelum sesi dimulai. Saat sesi dibatalkan, semua booking booked ikut menjadi cancelled. Member mengetahui lewat status di aplikasi (polling); notifikasi WA menyusul di SCRUM-30 (Sprint 4). | SCRUM-25 |
| **B10** | payment_method = transfer wajib menyertakan bukti. on_the_spot tanpa bukti: dibayar di gym, lalu diverifikasi admin setelah uang diterima. amount = harga paket saat pengajuan (disalin ke transaksi), dikembalikan sebagai integer rupiah. | SCRUM-103 |
| **B11** | Filter status keanggotaan terkini (active, pending, expired, none), filter paket, pencarian nama/email/nomor HP, paginasi 15 per halaman. Status terkini mengikuti definisi "member aktif" B6 (lihat SCRUM-25). Urutan prioritas status: active > pending > expired > none. Member yang hanya punya pengajuan rejected dihitung none. | SCRUM-104 |

---

## Tindak Lanjut

1. **Lengkapi metadata perangkat Android** sebelum eksekusi; Dev SHA dan Staging URL sudah dicantumkan.
2. **Gunakan kontrak SCRUM-24** pada Endpoint Table dan test case untuk list transaksi, approve, dan reject.
3. **Eksekusi TC3-01 s/d TC3-27 beserta seluruh suffix (b/c) pada bagian API**: Lakukan setelah endpoint SCRUM-103, SCRUM-24, SCRUM-25, SCRUM-104 selesai di-implement dan ter-deploy (lokal atau staging).
4. **Eksekusi TC3-28 s/d TC3-37b (Mobile)**: Lakukan setelah UI SCRUM-105 dan SCRUM-26 selesai di HP Android nyata.
5. **Eksekusi TC3-38 s/d TC3-40 (Admin Web)**: Lakukan setelah UI SCRUM-27 selesai dan dapat diakses di browser.
6. **Eksekusi TC3-41 s/d TC3-43 (WA Button)**: Lakukan setelah SCRUM-31 selesai, minimal pada 2 HP Android nyata dan 2 versi Android.
7. **Update Status**: Isi kolom Status dengan **Lulus** atau **Gagal** hanya setelah pengujian benar-benar dilakukan. Jangan mengisi berdasarkan asumsi.
8. **Temuan Baru**: Dokumentasikan di bagian Temuan / Findings dengan format ID = QA-S3-01 dst.

## Checklist PR

- [ ] CI hijau (lulus pemeriksaan ci-gate)
- [ ] Tidak ada file .env ter-commit
- [ ] Sudah diuji di HP nyata (N/A: dokumen saja)
- [ ] Dokumentasi API diperbarui (N/A)
