/* ==========================================================================
   admin/js/stok.js — Stok Sparepart (SLDataTable)
   ========================================================================== */

(function () {
  "use strict";

  if (!window.SLApi)       { console.error("[stok.js] SLApi belum dimuat"); return; }
  if (!window.SLDataTable) { console.error("[stok.js] datatable.js belum dimuat"); return; }

  function money(n) { return "Rp " + parseInt(n, 10).toLocaleString("id-ID"); }
  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var dt = new SLDataTable({
    tableId:    "stok-table",
    searchId:   "stok-search",
    paginId:    "stok-pagination",
    countId:    "stok-count",
    colspan:    5,
    per:        20,
    defaultSort: "nama_barang",
    emptyText:  'Belum ada barang. Klik "Tambah Barang" untuk memulai.',
    params:     function () { return { aktif: "all" }; },
    fetch:      function (p) { return SLApi.get("/api/admin/products", p); },
    renderRow:  function (p) {
      var nonaktif = p.aktif ? "" : ' <span class="badge badge--off">Nonaktif</span>';
      return (
        "<tr data-id=\"" + p.product_id + "\">" +
          '<td data-label="Nama Barang">' +
            '<span class="item-name">' +
              '<span class="item-name__thumb" aria-hidden="true">' +
                '<img src="assets/icons/package-gray.svg" alt="" /></span>' +
              '<span class="item-name__text">' + esc(p.nama_barang) + nonaktif + "</span>" +
            "</span>" +
          "</td>" +
          '<td data-label="Kategori" class="data-table__muted">' + esc(p.jenis_barang) + "</td>" +
          '<td data-label="Harga">' + money(p.harga_jual) + "</td>" +
          '<td data-label="Stok">' + (p.tersedia !== undefined ? p.tersedia : p.stok) + "</td>" +
          '<td data-label="Aksi">' +
            '<span class="row-actions">' +
              '<a class="icon-btn" href="stok-form.html?id=' + p.product_id + '"' +
                ' aria-label="Edit ' + esc(p.nama_barang) + '">' +
                '<img src="assets/icons/pencil.svg" alt="" /></a>' +
              (p.aktif
                ? '<button class="icon-btn icon-btn--danger" type="button" data-delete' +
                    ' aria-label="Nonaktifkan ' + esc(p.nama_barang) + '">' +
                    '<img src="assets/icons/trash.svg" alt="" /></button>'
                : "") +
            "</span>" +
          "</td>" +
        "</tr>"
      );
    }
  });

  /* Hapus barang (soft-delete) via delegasi */
  var tbody = document.querySelector("#stok-table tbody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-delete]");
      if (!btn) return;
      var row  = btn.closest("tr");
      var name = row.querySelector(".item-name__text").textContent.trim();
      if (!confirm('Nonaktifkan "' + name + '" dari daftar stok?')) return;
      btn.disabled = true;
      SLApi.del("/api/admin/products/" + row.dataset.id)
        .then(function () { dt.load(); })
        .catch(function (err) {
          btn.disabled = false;
          alert("Gagal: " + (err && err.message ? err.message : "error"));
        });
    });
  }

  dt.load();
})();
