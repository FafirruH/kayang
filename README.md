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
- Manajemen akun: tambah, edit role/WA/nama, aktifkan/nonaktifkan
- Konfigurasi WhatsApp: nomor dan format pesan pesanan & panggilan montir
- DataTable: search, sort kolom, pagination di semua tabel

---

## Struktur Proyek

```
kayang/
├── admin/                  # Halaman admin
│   ├── css/
│   │   ├── admin.css       # Style admin
│   │   └── responsive.css  # Responsive admin
│   ├── js/
│   │   ├── datatable.js    # Utility DataTable (search, sort, pagination)
│   │   ├── index.js        # Dashboard
│   │   ├── stok.js         # Halaman stok
│   │   ├── stok-form.js    # Form tambah/edit barang
│   │   ├── transaksi.js    # Halaman transaksi & kartu stok
│   │   ├── akun.js         # Halaman daftar akun
│   │   └── wa.js           # Konfigurasi WhatsApp
│   ├── partials/
│   │   ├── header.html     # Header admin
│   │   └── footer.html     # Footer admin
│   ├── index.html          # Dashboard
│   ├── stok.html           # Daftar stok
│   ├── stok-form.html      # Form tambah/edit barang
│   ├── transaksi.html      # Manajemen transaksi
│   ├── akun.html           # Daftar akun
│   └── wa.html             # Konfigurasi WA
│
├── api/
│   └── config.php          # API konfigurasi WA (GET/POST)
│
├── assets/
│   └── icons/              # Ikon SVG
│
├── css/
│   ├── style.css           # Style client
│   └── responsive.css      # Responsive client
│
├── js/
│   ├── config.js           # Konfigurasi frontend (API_BASE, WA_NUMBER, dll)
│   ├── api.js              # HTTP client (SLApi) → semua request ke backend
│   ├── auth.js             # Autentikasi frontend (SLAuth)
│   ├── auth-pages.js       # Logic form login & register
│   ├── include.js          # Load partials, kontrol akses, nav toggle
│   ├── cart.js             # Keranjang belanja (SLCart, localStorage)
│   ├── katalog.js          # Halaman katalog
│   ├── keranjang.js        # Halaman keranjang & checkout
│   └── panggilan.js        # Form panggil montir
│
├── partials/
│   ├── header.html         # Header client
│   └── footer.html         # Footer client
│
├── src/                    # Backend PHP
│   ├── Controllers/
│   │   ├── Admin/
│   │   │   ├── ProductController.php
│   │   │   ├── TransactionController.php
│   │   │   ├── UserController.php
│   │   │   ├── ReportController.php
│   │   │   └── SupplierController.php
│   │   ├── AuthController.php
│   │   ├── CatalogController.php
│   │   └── OrderController.php
│   ├── Auth.php
│   ├── Config.php
│   ├── Db.php
│   ├── Http.php
│   ├── HttpException.php
│   ├── Input.php
│   ├── Jenis.php
│   ├── Kernel.php
│   ├── ProductFilter.php
│   ├── RateLimiter.php
│   ├── Router.php
│   ├── Transactions.php
│   ├── Wa.php
│   ├── bootstrap.php
│   └── routes.php
│
├── public/
│   └── index.php           # Entry point backend (semua /api/* masuk sini)
│
├── index.html              # Beranda client
├── katalog.html            # Katalog sparepart
├── keranjang.html          # Keranjang belanja
├── login.html              # Halaman login
├── register.html           # Halaman register
├── panggilan.html          # Form panggil montir
├── config.php              # Konfigurasi backend (baca env / config.local.php)
├── config.local.php        # Override lokal (kredensial DB — jangan di-commit)
└── .gitignore
```

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

Jalankan file SQL migrasi (tabel `users`, `products`, `transactions`, `transaction_details`, view `v_stok_barang`, dll).

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
| Tambah/Edit Barang | `/admin/stok-form.html` | Form barang |
| Transaksi | `/admin/transaksi.html` | Tabel transaksi + kartu stok |
| Akun | `/admin/akun.html` | Tabel akun + tambah/edit |
| Config WA | `/admin/wa.html` | Nomor & format pesan WA |

---

## Akun Demo

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | ADMIN |

> Akun admin demo tidak bisa dihapus atau dinonaktifkan.

---

## Kategori Barang

Kategori barang adalah **enum tetap** yang disimpan di database dan backend (`Jenis::ALL`). Tidak bisa ditambah dari UI — harus diubah di `src/Jenis.php` dan migrasi database.

| Kategori |
|----------|
| Oli |
| Rem |
| Busi |
| Ban |
| Aki |
| Rantai |
| Filter |

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
