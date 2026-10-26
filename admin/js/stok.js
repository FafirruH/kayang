/* ==========================================================================
   admin/js/stok.js — halaman Stok Sparepart (data dari API)
   ========================================================================== */

(function () {
  "use strict";

  var API = "/kayang/api/products.php?all=1&limit=200";

  var search   = document.getElementById("stok-search");
  var table    = document.getElementById("stok-table");
  if (!search || !table) return;

  var body     = table.tBodies[0];
  var emptyRow = body.querySelector(".data-table__empty");

  // ── Render helpers ────────────────────────────────────────────────────────
  function formatRupiah(n) {
    return "Rp " + parseInt(n, 10).toLocaleString("id-ID");
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function buildRow(p) {
    var tr = document.createElement("tr");
    tr.dataset.id = p.product_id;

    var aktifClass = p.aktif ? "" : " data-table__muted";
    var nonaktifBadge = p.aktif ? "" : ' <span class="badge badge--off">Nonaktif</span>';

    tr.innerHTML =
      '<td data-label="Nama Barang">' +
        '<span class="item-name">' +
          '<span class="item-name__thumb" aria-hidden="true">' +
            '<img src="assets/icons/package-gray.svg" alt="" /></span>' +
          '<span class="item-name__text">' + escHtml(p.nama_barang) + nonaktifBadge + "</span>" +
        "</span>" +
      "</td>" +
      '<td data-label="Kategori" class="data-table__muted">' + escHtml(p.jenis_barang) + "</td>" +
      '<td data-label="Harga">' + formatRupiah(p.harga_jual) + "</td>" +
      '<td data-label="Stok">' + p.stok + "</td>" +
      '<td data-label="Aksi">' +
        '<span class="row-actions">' +
          '<a class="icon-btn" href="stok-form.html?id=' + p.product_id + '"' +
            ' aria-label="Edit ' + escHtml(p.nama_barang) + '">' +
            '<img src="assets/icons/pencil.svg" alt="" /></a>' +
          (p.aktif
            ? '<button class="icon-btn icon-btn--danger" type="button" data-delete' +
                ' aria-label="Hapus ' + escHtml(p.nama_barang) + '">' +
                '<img src="assets/icons/trash.svg" alt="" /></button>'
            : "") +
        "</span>" +
      "</td>";

    return tr;
  }

  // ── Filter lokal (tanpa re-fetch) ─────────────────────────────────────────
  function dataRows() {
    return Array.prototype.filter.call(body.rows, function (r) {
      return !r.classList.contains("data-table__empty");
    });
  }

  function applyFilter() {
    var keyword = search.value.trim().toLowerCase();
    var visible = 0;

    dataRows().forEach(function (row) {
      var name     = row.querySelector(".item-name__text").textContent.toLowerCase();
      var category = row.cells[1].textContent.toLowerCase();
      var match    = !keyword || name.indexOf(keyword) !== -1 || category.indexOf(keyword) !== -1;
      row.hidden = !match;
      if (match) visible++;
    });

    emptyRow.hidden = visible > 0;
    emptyRow.cells[0].textContent = dataRows().length === 0
      ? 'Belum ada barang. Klik "Tambah Barang" untuk memulai.'
      : "Barang tidak ditemukan. Coba kata kunci lain.";
  }

  // ── Fetch dari API ─────────────────────────────────────────────────────────
  function loadStok() {
    emptyRow.hidden = false;
    emptyRow.cells[0].textContent = "Memuat data...";

    fetch(API)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json.ok) throw new Error(json.message);

        // Hapus baris lama (kecuali emptyRow)
        dataRows().forEach(function (r) { r.remove(); });

        var items = json.data.items;
        if (!items || items.length === 0) {
          emptyRow.hidden = false;
          emptyRow.cells[0].textContent = 'Belum ada barang. Klik "Tambah Barang" untuk memulai.';
          return;
        }

        items.forEach(function (p) {
          body.insertBefore(buildRow(p), emptyRow);
        });

        applyFilter();
      })
      .catch(function (err) {
        emptyRow.hidden = false;
        emptyRow.cells[0].textContent = "Gagal memuat data. Pastikan server & database berjalan.";
        console.error("[stok.js]", err);
      });
  }

  // ── Hapus barang (soft-delete via API) ────────────────────────────────────
  body.addEventListener("click", function (event) {
    var button = event.target.closest("[data-delete]");
    if (!button) return;

    var row  = button.closest("tr");
    var id   = row.dataset.id;
    var name = row.querySelector(".item-name__text").textContent.trim();

    if (!window.confirm('Hapus "' + name + '" dari daftar stok?')) return;

    button.disabled = true;

    fetch("/kayang/api/products.php?id=" + id, { method: "DELETE" })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.ok) throw new Error(json.message);
        row.remove();
        applyFilter();
      })
      .catch(function (err) {
        button.disabled = false;
        alert("Gagal menghapus barang: " + err.message);
      });
  });

  search.addEventListener("input", applyFilter);

  loadStok();
})();
