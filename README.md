# Hadirin — Website Absensi QR Kantor

MVP website absensi: **React + Vite** (frontend), **Node.js + Express** (backend), **SQLite** (database melalui `better-sqlite3`).

## Fitur

- Login admin dan pegawai menggunakan NIP serta PIN (PIN di-hash dengan bcrypt).
- Admin dapat menambah pegawai. QR unik 256-bit dibuat oleh server, bukan berdasarkan NIP langsung.
- Pegawai login untuk melihat QR pribadinya dan riwayat absensi.
- Admin membuka halaman **Scan QR Kantor** dan menyalakan kamera komputer/kiosk.
- Scan pertama hari itu = **masuk**; scan kedua (setelah 60 detik) = **pulang**; scan ketiga ditolak.
- Riwayat dan filter tanggal, ekspor CSV untuk admin.
- Jam kantor dihitung dalam zona **Asia/Jakarta (WIB)**.

## Persyaratan

- Node.js **22** atau versi LTS yang mendukung `better-sqlite3`.
- Browser dengan akses kamera. HTTPS wajib untuk akses melalui domain/LAN; `localhost` biasanya diperbolehkan tanpa HTTPS.

## Instalasi (Windows PowerShell)

Buka folder proyek, kemudian:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item client/.env.example client/.env
```

**Penting:** buka `server/.env` dan ganti `JWT_SECRET` dengan string acak panjang serta `ADMIN_PIN` sebelum menjalankan aplikasi.

```powershell
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000/api/health
- Akun admin awal: NIP sesuai `ADMIN_NIP` (default `admin`), PIN sesuai `ADMIN_PIN` dari `.env`.

## Cara menggunakan

1. Login sebagai admin.
2. Masuk ke **Data Pegawai** → tambahkan NIP, nama, bagian, dan PIN pegawai.
3. Pegawai membuka website di HP, lalu login memakai NIP dan PIN yang dibuat admin.
4. Pegawai membuka halaman **Kode QR Saya**.
5. Di komputer kantor, admin login lalu membuka **Scan QR Kantor** dan memilih **Aktifkan Kamera**.
6. Pegawai menunjukkan QR-nya ke kamera. Waktu masuk/pulang tersimpan di SQLite dan dapat dilihat pada **Riwayat Absensi**.

## Lokasi database

`server/data/absensi.sqlite` dibuat otomatis saat API pertama berjalan. Backup file database secara berkala, idealnya dengan mekanisme backup SQLite yang konsisten. Jangan memasukkan database, file `.env`, atau kunci JWT ke GitHub.

## Catatan keamanan & batas MVP

- QR ini **statis dan rahasia**. Foto/screenshot QR dapat dipakai orang lain untuk menitip absen. Untuk implementasi kantor nyata, pertimbangkan QR dinamis berumur pendek, perangkat kiosk tepercaya, identifikasi petugas, serta audit log.
- Admin menggunakan token login; backend memvalidasi role admin untuk scan dan laporan.
- Tidak ada fitur reset PIN, nonaktifkan pegawai, ubah QR, pengaturan shift, izin, cuti, keterlambatan, maupun anti-spoofing yang kuat dalam MVP ini.
- Waktu keluar dicatat dari pemindaian kedua. Aturan shift lintas tanggal belum didukung.
- Server lokal SQLite cocok untuk satu kantor/server. Jika dijalankan pada hosting stateless (mis. serverless), gunakan database persistent yang sesuai; jangan taruh SQLite di penyimpanan sementara.
- Saat mengakses dari HP, `localhost` dalam file `client/.env` mengarah ke HP itu sendiri, bukan PC. Ganti `VITE_API_URL` dengan alamat API yang bisa diakses HP (lebih baik domain HTTPS). `CLIENT_ORIGIN` di server harus berisi alamat frontend yang sebenarnya. Untuk mengakses kamera pada perangkat di jaringan lokal, umumnya tetap diperlukan HTTPS.

## Build frontend

```powershell
npm run build
```

Hasil frontend ada di `client/dist`. Untuk produksi, frontend dan API perlu di-host dengan konfigurasi domain/HTTPS, CORS, dan penyimpanan SQLite yang persisten.
