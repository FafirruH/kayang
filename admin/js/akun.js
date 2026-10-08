/* ==========================================================================
   akun.js - halaman Daftar Akun
   - Filter Semua / Admin / Client
   - Ubah role lewat dropdown (dengan konfirmasi)
   - Tombol pensil: menuju dropdown role akun tersebut
   - Hapus akun dengan konfirmasi
   Akun bertanda data-protected (Admin Utama / server) tidak dapat diubah.
   Semua perubahan baru terjadi di layar; penyimpanan ke backend menyusul.
   ========================================================================== */

(function () {
  "use strict";

  var table = document.getElementById("akun-table");
  var live = document.getElementById("akun-live");
  if (!table) return;

  var body = table.tBodies[0];
  var emptyRow = body.querySelector(".data-table__empty");
  var filterButtons = document.querySelectorAll("[data-filter]");
  var currentFilter = "all";

  var ROLE_LABEL = { admin: "Admin", client: "Client" };

  function dataRows() {
    return Array.prototype.filter.call(body.rows, function (row) {
      return !row.classList.contains("data-table__empty");
    });
  }

  function announce(text) {
    if (live) live.textContent = text;
  }

  function rowName(row) {
    return row.querySelector(".user-name__text").textContent;
  }

  function applyFilter() {
    var visible = 0;
    dataRows().forEach(function (row) {
      var show = currentFilter === "all" || row.getAttribute("data-role") === currentFilter;
      row.hidden = !show;
      if (show) visible++;
    });

    emptyRow.hidden = visible > 0;
    emptyRow.cells[0].textContent = dataRows().length === 0
      ? "Belum ada akun terdaftar."
      : "Tidak ada akun dengan role ini.";
  }

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      currentFilter = button.getAttribute("data-filter");
      filterButtons.forEach(function (btn) {
        var active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      applyFilter();
    });
  });

  // Ubah role
  body.addEventListener("change", function (event) {
    var select = event.target.closest("[data-role-select]");
    if (!select) return;

    var row = select.closest("tr");
    var previous = row.getAttribute("data-role");
    var next = select.value;
    if (next === previous) return;

    var ok = window.confirm("Ubah role \"" + rowName(row) + "\" menjadi " + ROLE_LABEL[next] + "?");
    if (!ok) {
      select.value = previous; // batal: kembalikan pilihan
      return;
    }

    row.setAttribute("data-role", next);
    select.classList.toggle("is-admin", next === "admin");
    applyFilter();
    announce("Role " + rowName(row) + " diubah menjadi " + ROLE_LABEL[next] + ".");
  });

  body.addEventListener("click", function (event) {
    var row = event.target.closest("tr");
    if (!row || row.hasAttribute("data-protected")) return;

    // Pensil: arahkan ke dropdown role
    if (event.target.closest("[data-edit]")) {
      var select = row.querySelector("[data-role-select]");
      if (select) select.focus();
      return;
    }

    // Hapus akun
    if (event.target.closest("[data-delete]")) {
      var name = rowName(row);
      if (!window.confirm("Hapus akun \"" + name + "\"? Tindakan ini tidak dapat dibatalkan.")) return;
      row.remove();
      applyFilter();
      announce("Akun " + name + " dihapus.");
    }
  });
})();
