/* ==========================================================================
   pesanan.js - halaman Track Pesanan
   Mengubah status pesanan lewat tombol di tiap kartu: badge dan tombol aktif
   ikut berubah. (Sementara hanya di layar; nanti dikirim ke backend.)
   ========================================================================== */

(function () {
  "use strict";

  var grid = document.getElementById("order-grid");
  var live = document.getElementById("order-live");
  if (!grid) return;

  var STATUSES = ["pending", "process", "shipped", "done"];

  grid.addEventListener("click", function (event) {
    var button = event.target.closest(".status-btn");
    if (!button) return;

    var card = button.closest(".order-card");
    var status = button.getAttribute("data-status");
    if (!card || STATUSES.indexOf(status) === -1) return;
    if (card.getAttribute("data-status") === status) return;

    // Tombol: hanya satu yang aktif
    card.querySelectorAll(".status-btn").forEach(function (btn) {
      var active = btn === button;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    // Badge di pojok kanan atas kartu
    var badge = card.querySelector("[data-badge]");
    STATUSES.forEach(function (s) {
      badge.classList.remove("badge--" + s);
    });
    badge.classList.add("badge--" + status);
    badge.textContent = button.textContent;

    card.setAttribute("data-status", status);

    if (live) {
      live.textContent = "Status " + card.getAttribute("data-invoice") + " diubah menjadi " + button.textContent + ".";
    }
  });
})();
