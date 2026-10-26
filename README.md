# Sumber Lancar - Sistem Bengkel Online

Website bengkel (client + admin) dengan **satu halaman login, satu sesi, dan akses berdasarkan role**.
Dibangun dengan HTML, CSS, JavaScript, dan **backend native PHP + PostgreSQL**. Tanpa framework, tanpa build tool.

> **PERINGATAN KEAMANAN (prototipe)**
> Login, penyimpanan password, sesi, dan hak akses di versi ini hanya **simulasi frontend**.
> Akun dan password disimpan apa adanya di `localStorage`, dan pengguna bisa melihat atau mengubahnya
> lewat browser. Pengalihan berdasarkan role hanya mengatur tampilan, bukan perlindungan sungguhan.
> **Jangan dipakai untuk akun atau data produksi.** Keamanan nyata membutuhkan backend
> (sesi/token, hash password, dan pemeriksaan role di server).

---

## Prasyarat

| Kebutuhan | Versi minimal |
|---|---|
| [Laragon](https://laragon.org) (atau XAMPP/WAMP) | — |
| PHP | 8.1+ |
| PostgreSQL | 13+ |
| pgAdmin / psql | — |

---

## Setup Database

1. Buat database baru di pgAdmin atau psql:
   ```sql
   CREATE DATABASE bengkel;
   ```

2. Jalankan seluruh isi `sql/bengkel.sql` ke database tersebut.  
   Di psql:
   ```
   psql -U postgres -d bengkel -f sql/bengkel.sql
   ```

3. Sesuaikan kredensial di `api/db.php`:
   ```php
   define('DB_NAME', 'bengkel');   // nama database
   define('DB_USER', 'postgres');  // user PostgreSQL
   define('DB_PASS', 'postgres');  // password PostgreSQL
   ```

---

## Menjalankan

Letakkan folder project di `C:\laragon\www\kayang\`, lalu buka:

```
http://localhost/kayang/
```

> `fetch()` untuk header/footer tidak jalan lewat `file://`. Wajib lewat web server.

---

## Akun untuk pengujian

| Peran | Username | Password |
|---|---|---|
| **Admin** | `admin` | `admin123` |
| **Client** | buat via `register.html` | — |

- Akun admin juga tersimpan di tabel `users` database (username `admin`, role `ADMIN`).
- Akun demo Budi, Siti, dst. hanya data di database, belum tersambung ke login frontend.
- Untuk reset data frontend: hapus key `sl_accounts_v1` dan `sl_auth_session_v1` di localStorage browser.

---

## Cara kerja login dan role

1. `login.html` menerima username/email dan password. Tidak ada pilihan role.
2. `js/auth.js` mencocokkan dengan daftar akun (`sl_accounts_v1`) lalu menyimpan satu sesi
   `{ username, role }` di `sl_auth_session_v1`.
3. Role `admin` diarahkan ke `admin/index.html`, role `client` ke `index.html`.
4. Registrasi selalu membuat role `client`. Hanya admin yang bisa mengubah role di `admin/akun.html`.
5. Role dibaca ulang dari data akun setiap kali halaman dibuka.
6. Parameter `next` hanya menerima halaman internal. URL luar ditolak.

Aturan akses per halaman diatur lewat `<body data-auth="...">` dan diperiksa `js/include.js`:

| Halaman | `data-auth` | Siapa yang boleh |
|---|---|---|
| `index`, `katalog`, `panggilan` | (tidak ada) | semua orang |
| `keranjang` | `client` | client yang sudah login |
| `admin/*` | `admin` | admin yang sudah login |

---

## API Backend (PHP)

Semua endpoint ada di folder `api/`. Mengembalikan JSON `{ ok, data }` atau `{ ok, message }`.

### `api/db.php`
Koneksi PDO ke PostgreSQL. Di-include oleh endpoint lain — tidak dipanggil langsung.

### `api/products.php` — Produk / Stok

| Method | URL | Keterangan |
|---|---|---|
| GET | `/api/products.php` | Daftar produk aktif (untuk katalog client) |
| GET | `/api/products.php?all=1` | Semua produk termasuk nonaktif (admin) |
| GET | `/api/products.php?id=5` | Detail satu produk |
| GET | `/api/products.php?q=oli&jenis=Oli&page=1` | Filter + pencarian + paginasi |
| POST | `/api/products.php` | Tambah produk baru |
| PUT | `/api/products.php?id=5` | Update produk |
| DELETE | `/api/products.php?id=5` | Soft-delete (set `aktif = FALSE`) |

Body POST/PUT (JSON):
```json
{
  "nama_barang": "Oli Mesin Yamalube 1L",
  "jenis_barang": "Oli",
  "harga_jual_default": 55000,
  "stok": 42,
  "merk": "Yamalube",
  "harga_beli_default": 46000,
  "stok_minimal": 10
}
```

### `api/config.php` — Konfigurasi WhatsApp

| Method | URL | Keterangan |
|---|---|---|
| GET | `/api/config.php` | Baca config saat ini |
| POST | `/api/config.php` | Simpan config baru |

Config disimpan di `api/config.json`. Field yang tersedia:

| Key | Default | Keterangan |
|---|---|---|
| `wa_number` | `62895326202002` | Nomor WA penerima (tanpa `+` atau spasi) |
| `wa_nama` | `Admin Sumber Lancar` | Nama penerima di pratinjau |
| `format_pesanan` | (template) | Placeholder: `{items}` `{total}` `{invoice}` |
| `format_panggilan` | (template) | Placeholder: `{nama}` `{alamat}` `{motor}` `{keluhan}` |

> Folder `api/` harus bisa ditulis PHP agar `config.json` tersimpan.

---

## Fitur yang sudah tersambung ke database

| Fitur | File | Keterangan |
|---|---|---|
| Katalog produk | `katalog.html` + `js/katalog.js` | Fetch dari API, filter kategori + search realtime |
| Stok admin | `admin/stok.html` + `admin/js/stok.js` | Fetch + hapus via API |
| Form tambah/edit barang | `admin/stok-form.html` + `admin/js/stok-form.js` | Load + simpan via API |
| Config WA | `admin/wa.html` + `admin/js/wa.js` | Load + simpan via `api/config.php` |
| Form panggil montir | `panggilan.html` + `js/panggilan.js` | Validasi → buka WA dengan pesan dari config |

## Fitur yang masih simulasi frontend

| Fitur | Keterangan |
|---|---|
| Login / registrasi | Masih `localStorage`; belum ke tabel `users` di database |
| Pesanan | Data contoh; belum tersambung ke tabel `transactions` |
| Statistik beranda admin | Data contoh; query tersedia di `sql/bengkel.sql` |
| Keranjang | Tampilan statis |
| Daftar akun admin | Dari `localStorage`, bukan tabel `users` |

---

## Struktur

```
kayang/
├── index.html katalog.html keranjang.html panggilan.html   halaman client
├── login.html register.html                                login & registrasi bersama
├── _template.html                                          kerangka halaman client baru
├── assets/icons/                                           ikon client
├── css/style.css                                           CSS client + login
├── js/
│   ├── auth.js          modul autentikasi (akun, sesi, role, redirect aman)
│   ├── auth-pages.js    form login & register
│   ├── include.js       header/footer, menu aktif, kontrol akses, logout
│   ├── katalog.js       render kartu produk dari API, filter, search
│   └── panggilan.js     validasi form + kirim pesan montir via WhatsApp
├── partials/            header.html, footer.html (client)
├── api/
│   ├── db.php           koneksi PDO PostgreSQL
│   ├── products.php     REST API produk (GET/POST/PUT/DELETE)
│   ├── config.php       API konfigurasi WA (GET/POST)
│   └── config.json      config tersimpan (dibuat otomatis, jangan commit ke git)
├── sql/
│   └── bengkel.sql      skema lengkap + data awal PostgreSQL
└── admin/
    ├── index.html akun.html pesanan.html stok.html stok-form.html wa.html
    ├── _template.html   kerangka halaman admin baru
    ├── css/admin.css
    ├── js/
    │   ├── akun.js      daftar akun (frontend)
    │   ├── index.js     statistik beranda (frontend)
    │   ├── pesanan.js   daftar pesanan (frontend)
    │   ├── stok.js      daftar stok dari API
    │   ├── stok-form.js form tambah/edit barang via API
    │   └── wa.js        config WA via API + pratinjau ganda
    ├── assets/          favicon.svg, icons/
    └── partials/        header.html, footer.html (admin)
```

---

## Database — ringkasan skema

| Tabel | Keterangan |
|---|---|
| `users` | Akun (ADMIN, MECHANIC, CUSTOMER) |
| `suppliers` | Data supplier |
| `products` | Katalog & stok sparepart |
| `transactions` | Header transaksi (IN / OUT / ADJ) |
| `transaction_details` | Baris item per transaksi |

View utama: `v_stok_barang` (stok tersedia real-time dengan penahan), `v_transaksi_header`, `v_kartu_stok`, `v_laporan_laba_rugi`.

---

## Konvensi kode

- Class mengikuti BEM (`.blok__elemen--varian`), warna/font/ukuran lewat CSS variables di `:root`.
- `data-page` menentukan menu aktif. `class="page-dark"` untuk halaman admin berlatar gelap.
- Titik patah responsif admin: 1024px (hamburger), 900px (Config WA satu kolom), 768px (tabel → kartu), 480px, 360px.
- Semua endpoint API mengembalikan `{ ok: true, data: ... }` atau `{ ok: false, message: "..." }`.

---

## Catatan aksesibilitas

Teks putih kecil di atas oranye merek `#fc5d00` (tombol utama dan status aktif) kontrasnya sekitar 3:1,
di bawah 4.5:1. Itu keputusan warna merek; pertimbangkan teks lebih besar atau oranye lebih gelap.

---

## Sebelum produksi

1. Sambungkan login/registrasi ke tabel `users` di database (hash password dengan bcrypt/Argon2, sesi server-side).
2. Tambahkan autentikasi ke endpoint API (session token atau JWT).
3. Sambungkan pesanan, keranjang, dan statistik ke tabel `transactions`.
4. Tambahkan `api/config.json` ke `.gitignore` (berisi nomor WA).
5. Ganti ikon pengganti dengan aset asli dari Figma (nama file sama).
6. Hapus `_template.html` dan `admin/_template.html`.
