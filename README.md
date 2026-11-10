# Sumber Lancar — Sistem Bengkel Online

Aplikasi web untuk toko sparepart dan bengkel motor. Pelanggan bisa cek katalog, pesan via WhatsApp, dan memanggil montir. Admin mengelola stok, transaksi, dan akun dari panel admin.

---

## Daftar Isi

- [Fitur](#fitur)
- [Struktur Proyek](#struktur-proyek)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Menjalankan Aplikasi](#menjalankan-aplikasi)
- [Endpoint API](#endpoint-api)
- [Halaman Frontend](#halaman-frontend)
- [Akun Demo](#akun-demo)
- [Kategori Barang](#kategori-barang)
- [Alur Checkout](#alur-checkout)
- [Arsitektur Frontend](#arsitektur-frontend)

---

## Fitur

**Client (Pelanggan)**
- Katalog sparepart dengan filter kategori dan pencarian
- Tambah ke keranjang (localStorage), atur jumlah, hapus item
- Voucher diskon (kode `DISKON5000`)
- Checkout → pesanan tersimpan ke database → pesan otomatis dikirim ke WhatsApp admin
- Form panggil montir → link WhatsApp dengan detail lokasi dan keluhan

**Admin**
- Dashboard: statistik pendapatan, pesanan pending, stok kritis, pelanggan
- Manajemen stok: tambah, edit, nonaktifkan barang
- Manajemen transaksi: filter, sort, selesaikan/batalkan, buat penjualan baru
- Kartu stok: riwayat keluar-masuk per barang
- Manajemen akun: tambah, edit WA/nama, aktifkan/nonaktifkan; hanya Admin Utama yang dapat menentukan atau mengubah role
- Konfigurasi WhatsApp: nomor dan format pesan pesanan & panggilan montir
- DataTable: search, sort kolom, pagination di semua tabel

---

## Struktur Proyek

```
kayang/
├── admin/                  # Panel admin
│   ├── assets/icons/
│   ├── css/
│   │   ├── admin.css
│   │   ├── responsive.css
│   │   └── stok.css
│   ├── js/
│   │   ├── datatable.js
│   │   ├── dialog.js
│   │   ├── index.js
│   │   ├── stok.js
│   │   ├── stok-form.js
│   │   ├── transaksi.js
│   │   ├── supplier.js
│   │   ├── akun.js
│   │   └── wa.js
│   ├── partials/
│   │   ├── header.html
│   │   └── footer.html
│   ├── index.html
│   ├── stok.html
│   ├── stok-form.html
│   ├── transaksi.html
│   ├── supplier.html
│   ├── akun.html
│   └── wa.html
│
├── api/
│   └── config.php
│
├── assets/icons/           # Aset bersama frontend
│
├── css/
│   ├── style.css
│   └── responsive.css
│
├── js/
│   ├── config.js
│   ├── api.js
│   ├── auth.js
│   ├── auth-pages.js
│   ├── include.js
│   ├── cart.js
│   ├── katalog.js
│   ├── keranjang.js
│   └── panggilan.js
│
├── partials/
│   ├── header.html
│   └── footer.html
│
├── public/
│   └── index.php           # API entry point
│
├── src/                    # Kode backend PHP
│   ├── Controllers/
│   │   ├── Admin/
│   │   │   └── ...         # Controller admin
│   │   ├── AuthController.php
│   │   ├── CatalogController.php
│   │   └── OrderController.php
│   └── ...                 # Auth, database, HTTP, routing, transaksi
│
├── sql/
│   └── bengkel.sql         # SQL tunggal: skema, data demo, query, dan demo
├── tests/                  # Smoke test
│
├── index.html              # Beranda
├── katalog.html
├── keranjang.html
├── login.html
├── register.html
├── panggilan.html
├── config.php              # Konfigurasi backend
├── config.local.example.php
├── README.md
└── .gitignore
```

`config.local.php`, `api/config.json`, `.venv/`, dan direktori konfigurasi agen
tidak masuk Git. Dump SQL lokal juga diabaikan; `sql/bengkel.sql` adalah satu-
satunya SQL setup yang dipelihara di repository. File tersebut berisi perintah
`DROP`, jadi jalankan hanya pada database baru/kosong, jangan pada database yang
sudah berisi data.
Hindari memindahkan halaman atau aset web tanpa memperbarui tautan relatifnya—
struktur saat ini menjaga URL yang digunakan di Laragon.

---

## Prasyarat

| Kebutuhan | Versi |
|-----------|-------|
| PHP | 8.1+ |
| PostgreSQL | 14+ |
| Web server | Apache (Laragon) atau Nginx |
| Browser | Chrome/Firefox/Edge terbaru |

---

## Instalasi

**1. Clone / salin proyek ke folder Laragon**

```
C:\laragon\www\kayang\
```

**2. Buat database PostgreSQL**

```sql
CREATE DATABASE bengkel2;
```

Untuk database baru/kosong, bootstrap skema dari file lokal `sql/bengkel.sql`.
File tersebut berisi skema lengkap, data demo, query laporan, demo transaksi,
dan perintah `DROP`. Gunakan file itu saja untuk instalasi baru; jangan jalankan
pada database yang sudah berisi data. SQL upgrade untuk database yang sudah ada
tidak disediakan.

**3. Salin file konfigurasi**

```bash
cp config.local.example.php config.local.php
```

Edit `config.local.php` sesuai kredensial lokal:

```php
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => '5432',
        'name' => 'bengkel2',
        'user' => 'postgres',
        'pass' => 'password_anda',
    ],
    'app' => [
        'debug'     => true,
        'wa_number' => '6281234567890',
    ],
];
```

**4. Konfigurasi virtual host Apache (Laragon)**

Arahkan `/kayang/public` sebagai document root untuk path `/api/*`, atau gunakan konfigurasi rewrite agar semua request ke `/kayang/public/index.php`.

Contoh `.htaccess` di folder `public/`:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.php [QSA,L]
```

---

## Konfigurasi

### Frontend (`js/config.js`)

```js
window.SL_CONFIG = {
  API_BASE:        "http://localhost/kayang/public",  // URL backend
  WA_NUMBER:       "6281234567890",                   // Nomor WA admin (fallback)
  CATALOG_PAGE_SIZE: 12,
  ADMIN_PAGE_SIZE:   15,
  REFRESH_MS:      30000  // Auto-refresh dashboard (ms)
};
```

### Backend (`config.php` + `config.local.php`)

| Key | Default | Keterangan |
|-----|---------|-----------|
| `DB_HOST` | `127.0.0.1` | Host PostgreSQL |
| `DB_PORT` | `5432` | Port PostgreSQL |
| `DB_NAME` | `bengkel2` | Nama database |
| `DB_USER` | `postgres` | User database |
| `DB_PASS` | _(kosong)_ | Password database |
| `APP_DEBUG` | `0` | Mode debug (1 = aktif) |
| `WA_NUMBER` | `6281234567890` | Nomor WA admin |
| `ALLOWED_ORIGINS` | `http://localhost:5500,...` | Origin CORS yang diizinkan |

Nilai bisa diset via environment variable atau `config.local.php`.

---

## Menjalankan Aplikasi

**Dengan Laragon:**

1. Start Laragon → Apache + PostgreSQL aktif
2. Buka browser: `http://localhost/kayang/`

**Frontend saja (Live Server VS Code):**

Buka `index.html` via Live Server (port 5500). Backend tetap jalan di Apache. Pastikan `ALLOWED_ORIGINS` di config mencakup `http://localhost:5500`.

---

## Endpoint API

### Publik

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/health` | Health check |
| GET | `/api/products` | Katalog produk aktif |
| GET | `/api/categories` | Daftar kategori |

### Autentikasi

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| POST | `/api/auth/register` | Daftar akun (role CUSTOMER) |
| POST | `/api/auth/login` | Login → set cookie sesi |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Data user yang sedang login |

### Pelanggan (butuh login CUSTOMER)

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| POST | `/api/orders` | Buat pesanan baru |
| GET | `/api/orders` | Daftar pesanan saya |
| GET | `/api/orders/{id}` | Detail pesanan |
| POST | `/api/orders/{id}/cancel` | Batalkan pesanan |

### Admin — Barang (butuh login ADMIN/MECHANIC)

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/admin/products` | Daftar barang |
| GET | `/api/admin/products/{id}` | Detail barang |
| POST | `/api/admin/products` | Tambah barang baru |
| PUT | `/api/admin/products/{id}` | Edit barang |
| DELETE | `/api/admin/products/{id}` | Nonaktifkan barang |
| POST | `/api/admin/stock-adjustments` | Koreksi stok |

### Admin — Transaksi

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/admin/transactions` | Daftar transaksi |
| GET | `/api/admin/transactions/{id}` | Detail transaksi |
| POST | `/api/admin/transactions/sales` | Buat penjualan baru |
| POST | `/api/admin/transactions/purchases` | Buat pembelian baru |
| PATCH | `/api/admin/transactions/{id}/status` | Update status transaksi |

### Admin — Akun

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/admin/users` | Daftar akun |
| POST | `/api/admin/users` | Tambah akun |
| PATCH | `/api/admin/users/{id}` | Edit akun |

### Admin — Laporan

| Method | Endpoint | Keterangan |
|--------|----------|-----------|
| GET | `/api/admin/dashboard` | Data dashboard |
| GET | `/api/admin/reports/kartu-stok` | Kartu stok per barang |
| GET | `/api/admin/reports/restock` | Barang perlu restock |
| GET | `/api/admin/reports/profit` | Laporan laba rugi |
| GET | `/api/admin/reports/top-products` | Produk terlaris |

---

## Halaman Frontend

### Client

| Halaman | URL | Keterangan |
|---------|-----|-----------|
| Beranda | `/index.html` | Hero, menu, tentang, lokasi |
| Katalog | `/katalog.html` | Daftar produk, filter, cari, keranjang |
| Keranjang | `/keranjang.html` | Review order, voucher, checkout |
| Panggil Montir | `/panggilan.html` | Form kirim ke WA |
| Login | `/login.html` | Form login |
| Register | `/register.html` | Form daftar akun |

### Admin

| Halaman | URL | Keterangan |
|---------|-----|-----------|
| Dashboard | `/admin/index.html` | Statistik, transaksi terbaru, produk terlaris |
| Stok | `/admin/stok.html` | Tabel stok + search/sort/pagination |
| Tambah/Edit Barang | `/admin/stok.html` | Modal tambah/edit barang |
| Transaksi | `/admin/transaksi.html` | Penjualan, Barang Masuk, dan kartu stok |
| Supplier | `/admin/supplier.html` | Tambah/edit dan aktifkan/nonaktifkan supplier |
| Akun | `/admin/akun.html` | Tabel akun + tambah/edit |
| Pengaturan WA | `/admin/wa.html` | Nomor & format pesan WhatsApp |

**Tambah Barang** hanya mendaftarkan data master (kode, nama, kategori, harga jual, dan stok minimal). Kode barang boleh dikosongkan agar otomatis dibuat dalam format `BRG-<ID>` (contoh `BRG-00031`); admin juga dapat mengisi kode unik sendiri. Kode barang ditampilkan di daftar Stok dan tidak dapat diubah setelah dibuat. Catat stok awal maupun penambahan stok berikutnya beserta harga beli aktual melalui **Transaksi > Barang Masuk**. Transaksi Barang Masuk berstatus Pending; stok dan lapisan modal FIFO bertambah setelah transaksi diselesaikan.

---

## Akun Demo

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | ADMIN |

> Akun Admin Utama (`admin`) tidak bisa diubah atau dinonaktifkan dari menu Akun. Ubah nomor WhatsApp melalui menu Pengaturan WA.

---

## Kategori Barang

Kategori barang dapat diisi bebas melalui form admin, sepanjang 2–30 karakter. Katalog mengambil pilihan filter dari kategori barang aktif yang tersedia.

| Contoh kategori awal |
|----------|
| Oli |
| Rem |
| Busi |
| Ban |
| Aki |
| Rantai |
| Filter |

`sql/bengkel.sql` sudah memuat kategori bebas (2–30 karakter) dan struktur FIFO.
File ini ditujukan untuk instalasi baru. SQL untuk meng-upgrade database yang
sudah berisi data tidak disediakan; jangan jalankan bootstrap pada database itu.

Setiap transaksi Barang Masuk menyimpan harga beli aktual per barang sebagai satu lapisan stok. Penjualan dan koreksi stok keluar mengurangi lapisan tertua lebih dahulu (FIFO), dan laporan laba menggunakan modal dari lapisan yang terpakai. Harga jual tidak berubah. Harga beli default produk tetap menunjukkan harga pembelian terakhir untuk membantu input transaksi baru.

---

## Alur Checkout

```
1. Pelanggan tambah barang ke keranjang (localStorage)
2. Buka keranjang.html → review item, isi voucher (opsional)
3. Klik "Buat Pesanan"
4. POST /api/orders → backend catat ke DB, stok ditahan 24 jam
5. Backend kembalikan no_faktur
6. Frontend ambil nomor WA & format pesan dari api/config.php
7. Buka WhatsApp dengan pesan berisi detail pesanan + invoice
8. Admin konfirmasi pembayaran di panel transaksi → PATCH status → COMPLETED
```

---

## Arsitektur Frontend

### JS Global

| Variabel | File | Keterangan |
|----------|------|-----------|
| `window.SL_CONFIG` | `js/config.js` | Konfigurasi app |
| `window.SLApi` | `js/api.js` | HTTP client ke backend |
| `window.SLAuth` | `js/auth.js` | Autentikasi & session |
| `window.SLCart` | `js/cart.js` | Keranjang (localStorage) |
| `window.SLDataTable` | `admin/js/datatable.js` | Tabel interaktif |

### Urutan Load Script

```html
<!-- Sync (tanpa defer) — harus tersedia sebelum DOM diparse -->
<script src="js/config.js"></script>
<script src="js/api.js"></script>
<script src="js/cart.js"></script>   <!-- hanya halaman yang butuh cart -->

<!-- Defer — jalan setelah DOM ready -->
<script src="js/auth.js" defer></script>
<script src="js/include.js" defer></script>
<script src="js/[halaman].js" defer></script>
```

### Kontrol Akses

Halaman dilindungi lewat atribut `data-auth` di `<body>`:

```html
<body data-auth="admin">   <!-- redirect ke login jika bukan admin -->
<body data-auth="client">  <!-- redirect ke login jika belum login -->
<!-- tanpa data-auth = halaman publik -->
```

`include.js` membaca atribut ini dan memanggil `SLAuth.requireRole()` saat halaman dibuka.
