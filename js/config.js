/* ==========================================================================
   config.js - pengaturan frontend (dimuat SEBELUM js/api.js)
   ========================================================================== */
window.SL_CONFIG = {
  // Alamat backend PHP. Default: host yang sama dengan halaman ini, port 8000.
  // Pakai host yang sama dengan frontend (localhost dengan localhost, atau
  // 127.0.0.1 dengan 127.0.0.1) agar cookie sesi login ikut terkirim.
  // Bila API dan website ada di satu domain (reverse proxy), isi dengan "".
  API_BASE: window.location.protocol + "//" + window.location.hostname + ":8000",

  WA_NUMBER: "6281234567890",   // nomor WhatsApp admin (format internasional, tanpa +)
  CATALOG_PAGE_SIZE: 12,        // jumlah kartu per "Muat lebih banyak" (ringan untuk HP)
  ADMIN_PAGE_SIZE: 15,          // baris tabel stok per halaman
  REFRESH_MS: 30000             // segarkan otomatis tiap 30 detik saat tab terlihat
};
