# Admin - Sumber Lancar (Sistem Bengkel Online)

Proyek admin yang berdiri sendiri (folder dan deploy terpisah dari `client`).
Hanya HTML, CSS, dan sedikit JavaScript. Tanpa framework dan tanpa proses build.

## Menjalankan

`fetch()` untuk header/footer tidak jalan lewat `file://`, jadi buka lewat server lokal:

- VS Code: ekstensi **Live Server**, atau
- Terminal di folder ini: `python -m http.server 5500`, lalu buka `http://localhost:5500`

Saat dibuka pertama kali kamu akan diarahkan ke `login.html`
(login masih tiruan, lihat bagian "Login & keamanan").

## Halaman

| File | Halaman | Skrip |
|---|---|---|
| `login.html` | Login admin (rancangan sendiri, tidak ada di Figma) | `js/login.js` |
| `index.html` | Beranda: hero, statistik, pesanan terbaru | - |
| `stok.html` | Stok sparepart: cari, hapus | `js/stok.js` |
| `stok-form.html` | Tambah barang; `?id=N` untuk edit barang | `js/stok-form.js` |
| `pesanan.html` | Track pesanan: ubah status | `js/pesanan.js` |
| `akun.html` | Daftar akun: filter, ubah role, hapus | `js/akun.js` |
| `wa.html` | Config WhatsApp + pratinjau pesan | `js/wa.js` |

## Struktur

```
admin/
├── *.html              halaman (tabel di atas)
├── _template.html      kerangka halaman baru (hapus sebelum deploy)
├── css/admin.css       satu file: token, reset, komponen, per halaman
├── js/include.js       dipakai semua halaman: header/footer, menu aktif,
│                       guard login, logout, menu hamburger
├── js/<halaman>.js     logika tiap halaman
├── partials/           header.html, footer.html
└── assets/             favicon.svg, icons/*.svg
```

## Konvensi (disamakan dengan client)

- Penamaan class mengikuti BEM: `.blok__elemen--varian`, status dengan `.is-active`.
- Warna, font, dan ukuran selalu lewat CSS variables di `:root` (bagian atas `admin.css`).
- `<body data-page="...">` menentukan menu aktif: `beranda | stok | akun | wa | pesanan`.
- `<body data-auth="required">` melindungi halaman (dialihkan ke login bila belum login).
- `<body class="page-dark">` untuk halaman berlatar gelap (semua kecuali Beranda dan form barang).
- Tabel: `.table-card` (terang) atau `.table-card.table-card--dark`; tambahkan
  `.data-table--stack` + `data-label` di tiap `<td>` agar jadi kartu di layar kecil.
- CSS disusun per tahap dengan komentar pemisah.

## Titik patah responsif

| Lebar layar | Perubahan |
|---|---|
| `max-width: 1024px` | menu navbar jadi hamburger; kartu statistik 2 kolom |
| `max-width: 900px`  | Config WA jadi satu kolom |
| `max-width: 768px`  | tabel jadi kartu per baris; kartu pesanan satu kolom |
| `max-width: 480px`  | tombol penuh lebar, padding lebih kecil |
| `max-width: 360px`  | kartu statistik satu kolom |

## Login & keamanan

- `login.html` + `js/login.js` adalah login **tiruan**: menerima isian apa pun yang
  tidak kosong dan hanya menyimpan penanda di `localStorage`. Ini **tidak aman**.
- `data-auth="required"` hanya mengatur tampilan (mengalihkan ke login).
  Keamanan sebenarnya harus ada di backend (sesi/token + pemeriksaan role di server).

## Sebelum deploy

1. Ganti verifikasi di `js/login.js` dengan pemanggilan ke backend.
2. Ganti data contoh (tabel, kartu pesanan, akun, statistik) dengan data dari backend.
   Aksi ubah status, hapus, ubah role, dan simpan saat ini hanya mengubah tampilan.
3. Ganti ikon pengganti di `assets/icons/` dengan ikon asli dari Figma
   (nama file yang sama, bisa langsung ditimpa).
4. Hapus `_template.html`.

## Catatan aksesibilitas

- Halaman gelap mengikuti Figma persis. Di permukaan terang, teks redup, badge status,
  dan pesan form digelapkan sedikit agar kontrasnya minimal 4.5:1.
- Diketahui belum memenuhi 4.5:1: teks putih ukuran kecil di atas oranye merek `#fc5d00`
  (tombol utama dan tombol status aktif, sekitar 3:1). Ini keputusan warna merek;
  pertimbangkan teks lebih besar atau oranye sedikit lebih gelap bila diperlukan.
