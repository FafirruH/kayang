/* ==========================================================================
   config.js - pengaturan frontend (dimuat SEBELUM js/api.js)
   ========================================================================== */
window.SL_CONFIG = {
  // Frontend bisa dibuka lewat Live Server (port 5500), sedangkan API PHP
  // tetap dilayani Apache Laragon pada host yang sama di /kayang/public.
  API_BASE: window.location.protocol + "//" + window.location.hostname + "/kayang/public",

  WA_NUMBER: "6281234567890",   // nomor WhatsApp admin (format internasional, tanpa +)
  CATALOG_PAGE_SIZE: 12,        // jumlah kartu per "Muat lebih banyak" (ringan untuk HP)
  ADMIN_PAGE_SIZE: 15,          // baris tabel stok per halaman
  REFRESH_MS: 30000             // segarkan otomatis tiap 30 detik saat tab terlihat
};
