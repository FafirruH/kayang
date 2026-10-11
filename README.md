# Sumber Lancar - Sistem Bengkel Online

Satu website statis (client + admin) dengan **satu halaman login, satu sesi, dan akses berdasarkan role**.
Hanya HTML, CSS, dan JavaScript biasa. Tanpa framework, tanpa build, tanpa backend.

> **PERINGATAN KEAMANAN (prototipe)**
> Login, penyimpanan password, sesi, dan hak akses di versi ini hanya **simulasi frontend**.
> Akun dan password disimpan apa adanya di `localStorage`, dan pengguna bisa melihat atau mengubahnya
> lewat browser. Pengalihan berdasarkan role hanya mengatur tampilan, bukan perlindungan sungguhan.
> **Jangan dipakai untuk akun atau data produksi.** Keamanan nyata membutuhkan backend
> (sesi/token, hash password, dan pemeriksaan role di server).

## Menjalankan

`fetch()` untuk header/footer tidak jalan lewat `file://`. Jalankan server statis dari folder ini:

- VS Code: ekstensi **Live Server**, atau
- Terminal: `python -m http.server 5500`, lalu buka `http://localhost:5500`

## Akun untuk pengujian

| Peran | Cara |
|---|---|
| **Admin demo** | username `admin` (atau email `admin@sumberlancar.id`), password `admin123` |
| **Client** | buka `register.html`, buat akun (username min. 3 karakter, password min. 6), lalu masuk lewat `login.html` |

- Kredensial admin demo ada di satu tempat: konstanta `DEMO_ADMIN` di `js/auth.js`. Ubah di sana.
- Akun contoh Budi, Siti, dan Rudi hanya data tampilan di Daftar Akun (tanpa password, tidak bisa dipakai login).
- Untuk mengembalikan data awal: hapus key `sl_accounts_v1` dan `sl_auth_session_v1` di localStorage browser.

## Cara kerja login dan role

1. `login.html` menerima username/email dan password. Tidak ada pilihan role.
2. `js/auth.js` mencocokkan dengan daftar akun (`sl_accounts_v1`) lalu menyimpan satu sesi
   `{ username, role }` di `sl_auth_session_v1`.
3. Role `admin` diarahkan ke `admin/index.html`, role `client` ke `index.html`
   (atau ke halaman tujuan awal bila valid, mis. `keranjang.html`).
4. Registrasi selalu membuat role `client`. Hanya admin yang bisa mengubah role di `admin/akun.html`.
5. Role dibaca ulang dari data akun setiap kali halaman dibuka, jadi perubahan role atau penghapusan akun
   langsung berlaku. Logout menghapus sesi bersama.
6. Parameter `next` hanya menerima halaman internal website. URL luar ditolak.
7. Key lama `sl_logged_in` dan `sl_admin_logged_in` tidak lagi dipakai (dihapus otomatis).

Aturan akses per halaman diatur lewat atribut `<body data-auth="...">` dan diperiksa `js/include.js`
setiap halaman dibuka:

| Halaman | `data-auth` | Siapa yang boleh |
|---|---|---|
| `index`, `katalog`, `panggilan` | (tidak ada) | semua orang |
| `keranjang` | `client` | client yang sudah login |
| `admin/*` (kecuali redirect `admin/login.html`) | `admin` | admin yang sudah login |

Pengguna dengan role yang salah diarahkan ke beranda sesuai rolenya dengan pemberitahuan "Akses ditolak".
Pengguna yang belum login diarahkan ke `login.html`.

## Struktur

```
kayang/
├── index.html katalog.html keranjang.html panggilan.html   halaman client
├── login.html register.html                                login & registrasi bersama
├── _template.html                                          kerangka halaman client baru
├── assets/icons/                                           ikon client
├── css/style.css                                           CSS client + halaman login
├── js/
│   ├── auth.js          modul autentikasi bersama (akun, sesi, role, redirect aman)
│   ├── auth-pages.js    form login & register
│   └── include.js       header/footer, menu aktif, kontrol akses, logout, hamburger admin
├── partials/            header.html, footer.html (client)
└── admin/
    ├── index.html akun.html pesanan.html stok.html stok-form.html wa.html
    ├── login.html       hanya pengalihan ke ../login.html
    ├── _template.html   kerangka halaman admin baru
    ├── css/admin.css
    ├── js/              akun.js index.js pesanan.js stok.js stok-form.js wa.js
    ├── assets/          favicon.svg, icons/
    └── partials/        header.html, footer.html (admin)
```

CSS client dan admin sengaja dipisah, dan skrip halaman admin tidak dimuat di halaman client.

## Halaman admin

| File | Halaman | Skrip |
|---|---|---|
| `admin/index.html` | Beranda: statistik, pesanan terbaru (jumlah user mengikuti data akun) | `js/index.js` |
| `admin/stok.html` | Stok sparepart: cari, hapus | `js/stok.js` |
| `admin/stok-form.html` | Tambah barang; `?id=N` untuk edit | `js/stok-form.js` |
| `admin/pesanan.html` | Track pesanan: ubah status | `js/pesanan.js` |
| `admin/akun.html` | Daftar akun: filter, ubah role, hapus (data dari `js/auth.js`) | `js/akun.js` |
| `admin/wa.html` | Config WhatsApp + pratinjau | `js/wa.js` |

Yang masih simulasi (hanya mengubah tampilan, belum tersambung backend): stok, pesanan, Config WA,
keranjang, form panggilan montir, dan data statistik selain jumlah user.

## Konvensi

- Class mengikuti BEM (`.blok__elemen--varian`), warna/font/ukuran lewat CSS variables di `:root`.
- `data-page` menentukan menu aktif. `class="page-dark"` untuk halaman admin berlatar gelap.
- Titik patah responsif admin: 1024px (hamburger), 900px (Config WA satu kolom), 768px (tabel jadi kartu),
  480px, 360px.

## Catatan aksesibilitas (admin)

Teks putih kecil di atas oranye merek `#fc5d00` (tombol utama dan status aktif) kontrasnya sekitar 3:1,
di bawah 4.5:1. Itu keputusan warna merek; pertimbangkan teks lebih besar atau oranye lebih gelap.

## Sebelum produksi

1. Ganti `js/auth.js` dengan autentikasi ke backend (hash password, sesi/token, role di server).
2. Ganti data contoh (stok, pesanan, statistik, katalog) dengan data dari backend.
3. Ganti ikon pengganti dengan ikon asli dari Figma (nama file sama).
4. Hapus `_template.html` dan `admin/_template.html`.
