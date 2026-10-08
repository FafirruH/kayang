/* ==========================================================================
   stok.js - halaman Stok Sparepart
   - Pencarian barang (nama atau kategori) langsung saat mengetik
   - Hapus barang dengan konfirmasi (sementara hanya menghapus baris di layar;
     nanti diganti pemanggilan ke backend)
   ========================================================================== */

(function () {
  "use strict";

  var search = document.getElementById("stok-search");
  var table = document.getElementById("stok-table");
  if (!search || !table) return;

  var body = table.tBodies[0];
  var emptyRow = body.querySelector(".data-table__empty");

  function dataRows() {
    return Array.prototype.filter.call(body.rows, function (row) {
      return !row.classList.contains("data-table__empty");
    });
  }

  function applyFilter() {
    var keyword = search.value.trim().toLowerCase();
    var visible = 0;

    dataRows().forEach(function (row) {
      var name = row.querySelector(".item-name__text").textContent.toLowerCase();
      var category = row.cells[1].textContent.toLowerCase();
      var match = !keyword || name.indexOf(keyword) !== -1 || category.indexOf(keyword) !== -1;
      row.hidden = !match;
      if (match) visible++;
    });

    // Tampilkan pesan kosong bila tidak ada hasil (atau semua barang sudah dihapus)
    emptyRow.hidden = visible > 0;
    emptyRow.cells[0].textContent = dataRows().length === 0
      ? "Belum ada barang. Klik \"Tambah Barang\" untuk memulai."
      : "Barang tidak ditemukan. Coba kata kunci lain.";
  }

  search.addEventListener("input", applyFilter);

  body.addEventListener("click", function (event) {
    var button = event.target.closest("[data-delete]");
    if (!button) return;

    var row = button.closest("tr");
    var name = row.querySelector(".item-name__text").textContent;
    if (!window.confirm("Hapus \"" + name + "\" dari daftar stok?")) return;

    row.remove();
    applyFilter();
  });
})();
