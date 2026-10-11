/* ==========================================================================
   index.js - Beranda admin
   Jumlah "User Terdaftar" mengikuti data akun bersama (js/auth.js).
   Statistik lain masih contoh (belum ada backend).
   ========================================================================== */

(function () {
  "use strict";

  var el = document.querySelector('[data-stat="users"]');
  if (el && window.SLAuth && window.SLAuth.hasRole("admin")) el.textContent = String(window.SLAuth.listAccounts().length);
})();
