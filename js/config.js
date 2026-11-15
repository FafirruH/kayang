/* ==========================================================================
   config.js - pengaturan frontend (dimuat SEBELUM js/api.js)
   ========================================================================== */
var configScriptPath = new URL(document.currentScript.src).pathname;
var projectPath = configScriptPath.replace(/\/js\/config\.js$/, "");
var apiBase = window.location.protocol + "//" + window.location.hostname + projectPath + "/public";

window.SL_CONFIG = {
  // Ambil folder proyek dari lokasi config.js; API dilayani Apache pada host yang sama.
  API_BASE: apiBase,

  WA_NUMBER: "6281234567890",   // nomor WhatsApp admin (format internasional, tanpa +)
  CATALOG_PAGE_SIZE: 12,        // jumlah kartu per "Muat lebih banyak" (ringan untuk HP)
  ADMIN_PAGE_SIZE: 15,          // baris tabel stok per halaman
  REFRESH_MS: 30000             // segarkan otomatis tiap 30 detik saat tab terlihat
};