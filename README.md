# Hadirin — Sistem Absensi QR Kantor

Aplikasi absensi pegawai dengan frontend React/Vite, API Express, dan SQLite. Admin mengelola akun, QR, laporan, aturan jam kerja, dan perangkat scanner. Halaman scanner berdiri sendiri dan hanya dapat mencatat absensi setelah perangkat terdaftar melakukan autentikasi.

## Jalankan aplikasi

Persyaratan: Node.js 22 atau versi LTS yang kompatibel dengan `better-sqlite3`.

```powershell
Copy-Item server/.env.example server/.env
```

Atur `JWT_SECRET` ke nilai acak minimal 32 karakter dan ganti `ADMIN_PIN` sebelum penggunaan. Kemudian:

```powershell
npm install
npm run dev
```

Frontend tersedia di `http://localhost:5173`, API di `http://localhost:4000`.

Setelah menjalankan aplikasi dengan `npm run dev`, akses portal pegawai melalui **http://localhost:5173/pegawai/login**. Login menggunakan NIP/ID pegawai dan password awal yang dibuat admin.

## Halaman

Admin login memakai NIP dan PIN dari konfigurasi awal:

- `/admin/dashboard` — statistik hari ini dan aktivitas terbaru.
- `/admin/pegawai` — tambah, cari, filter status, edit, nonaktifkan, atur PIN, preview, unduh, cetak, regenerasi, dan cabut QR.
- `/admin/absensi` — filter catatan berdasarkan tanggal dan NIP.
- `/admin/laporan` — filter rentang tanggal, unduh file Excel-kompatibel, atau cetak/simpan sebagai PDF melalui dialog browser.
- `/admin/pengaturan` — jam masuk/pulang, toleransi terlambat, serta perangkat scanner.

Portal pegawai memakai login NIP/ID dan password awal yang disetel admin saat membuat akun. Pegawai dapat mengganti password di Pengaturan; password tersimpan dengan bcrypt.

- `/pegawai/login` — login terpisah dari admin.
- `/pegawai/dashboard` — identitas, status dan jam absensi hari ini, serta rekap bulanan.
- `/pegawai/profil` — profil akun yang sedang login.
- `/pegawai/qr-code` — tampilkan, unduh, regenerasi, atau cabut QR sendiri.
- `/pegawai/riwayat` — riwayat dan ringkasan kehadiran pribadi per bulan.
- `/pegawai/pengaturan` — ganti password dan logout.

API profil dan riwayat memakai identitas dari sesi: `GET /api/pegawai/me` dan `GET /api/pegawai/me/attendance`. Pegawai tidak dapat memilih `employee_id` lain melalui request. Sesi portal disimpan terpisah dari sesi admin.

## Scanner perangkat

1. Login admin dan buka **Pengaturan**.
2. Buat perangkat dengan nama lokasi scanner. Salin kode perangkat yang muncul; kode rahasia itu hanya ditampilkan sekali.
3. Buka `/scanner` pada komputer/kiosk dan masukkan kode perangkat.
4. Izinkan penggunaan kamera. Scanner mencatat check-in dan check-out memakai waktu server zona Asia/Jakarta.
5. Cabut akses perangkat dari halaman Pengaturan bila perangkat tidak lagi digunakan.

Halaman scanner tidak membuka dashboard admin. Endpoint scan hanya menerima sesi scanner yang aktif. Perangkat yang dicabut langsung kehilangan akses. Akses kamera browser membutuhkan izin pengguna dan HTTPS, kecuali pada `localhost`.

## Database dan migrasi

Database lokal berada di `server/data/absensi.sqlite` (atau path `DATABASE_PATH`). Saat API mulai, migrasi bernomor berjalan dalam transaksi dan mempertahankan ID pegawai serta riwayat absensi. Migrasi menghapus kolom QR plaintext lama dan membuat `employee_qr_credentials`, `scanner_devices`, `attendance_settings`, serta indeks dan constraint. Sebelum memperbarui instalasi lama, buat backup konsisten SQLite.

Token QR acak tanpa NIP/data pribadi di-hash untuk validasi dan dienkripsi di database agar gambar yang sama bisa ditampilkan kembali. Enkripsi menggunakan kunci turunan dari `JWT_SECRET`; mengganti `JWT_SECRET` membuat QR lama tidak dapat didekripsi, jadi regenerasikan QR setelah rotasi kunci. Admin atau pegawai bisa mengatur masa berlaku saat regenerasi QR (1–1440 menit); kosong berarti QR berlaku sampai dicabut atau diganti. Scanner memvalidasi token, pencabutan, masa berlaku, dan status pegawai di backend.

Menghapus pegawai dilakukan sebagai penonaktifan agar histori dan audit data tetap tersimpan. Menonaktifkan akun mencegah login dan pemindaian QR. Regenerasi QR membatalkan QR sebelumnya; pencabutan QR menolak token yang dicabut.

## Batasan keamanan QR

QR tanpa masa berlaku bersifat statis. Foto atau tangkapan layar dapat dipakai orang lain untuk menitip absen. Untuk penggunaan lebih aman, tetapkan masa berlaku pendek saat regenerasi QR, cabut QR yang bocor, dan gunakan scanner kiosk terdaftar di lokasi kantor. Sistem ini tidak membuktikan bahwa pemilik akun hadir secara fisik.

## Build dan tes

```powershell
npm run build
npm test
```

Tes API menggunakan database sementara dan mencakup migrasi skema lama, pemisahan role admin/pegawai, akses data sendiri, ganti password, CRUD, QR tidak valid/expired/dicabut, sesi perangkat, scan bersamaan, check-in/out, serta pengaturan absensi.
