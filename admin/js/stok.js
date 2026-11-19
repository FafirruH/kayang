/* ==========================================================================
   admin/js/stok.js — Daftar stok dan kartu stok (SLDataTable)
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
    countId:    "stok-count",
    colspan:    7,
    per:        50,
    allRows:    true,
    defaultSort: "nama_barang",
    emptyText:  'Belum ada barang. Klik "Tambah Barang" untuk memulai.',
    params:     function () { return { aktif: "all" }; },
    fetch:      function (p) { return SLApi.get("/api/admin/products", p); },
    renderRow:  function (p) {
      var nonaktif = p.aktif ? "" : ' <span class="badge badge--off">Nonaktif</span>';
      var imageUrl = SLApi.productImageUrl(p.gambar);
      var thumbnail = imageUrl
        ? '<img class="item-name__photo" src="' + esc(imageUrl) + '" alt="" loading="lazy" />'
        : '<img src="assets/icons/package-gray.svg" alt="" />';
      return (
        "<tr data-id=\"" + p.product_id + "\">" +
          '<td data-label="ID" class="data-table__muted">' + esc(p.product_id) + "</td>" +
          '<td data-label="Kode Barang" class="data-table__muted">' + esc(p.kode_barang) + "</td>" +
          '<td data-label="Nama Barang">' +
            '<span class="item-name">' +
              '<span class="item-name__thumb" aria-hidden="true">' +
                thumbnail + "</span>" +
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
                : '<button class="btn btn--sm btn--ghost" type="button" data-activate' +
                    ' aria-label="Aktifkan ' + esc(p.nama_barang) + '">Aktifkan</button>') +
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
      var activateBtn = e.target.closest("[data-activate]");
      if (activateBtn) {
        var activateRow = activateBtn.closest("tr");
        var activateName = activateRow.querySelector(".item-name__text").textContent.trim();
        window.SLDialog.confirm({
          title: "Aktifkan Barang?",
          message: 'Barang "' + activateName.replace(/\s+Nonaktif$/, "") + '" akan aktif kembali dan muncul di daftar pelanggan.',
          danger: false,
          confirmLabel: "Ya, Aktifkan"
        }).then(function (confirmed) {
          if (!confirmed) return;
          activateBtn.disabled = true;
          SLApi.put("/api/admin/products/" + activateRow.dataset.id, { aktif: true })
            .then(function () {
              if (SLApi.notifyStockChanged) SLApi.notifyStockChanged();
              dt.load();
            })
            .catch(function (err) {
              activateBtn.disabled = false;
              window.SLDialog.alert({
                title: "Gagal Mengaktifkan Barang",
                message: err && err.message ? err.message : "Terjadi kesalahan."
              });
            });
        });
        return;
      }

      var btn = e.target.closest("[data-delete]");
      if (!btn) return;
      var row  = btn.closest("tr");
      var name = row.querySelector(".item-name__text").textContent.trim();
      window.SLDialog.confirm({
        title: "Nonaktifkan Barang?",
        message: 'Barang "' + name + '" akan dinonaktifkan dari daftar stok.',
        danger: true,
        confirmLabel: "Ya, Nonaktifkan"
      }).then(function (confirmed) {
        if (!confirmed) return;
        btn.disabled = true;
        SLApi.del("/api/admin/products/" + row.dataset.id)
          .then(function () {
            if (SLApi.notifyStockChanged) SLApi.notifyStockChanged();
            dt.load();
          })
          .catch(function (err) {
            btn.disabled = false;
            window.SLDialog.alert({
              title: "Gagal Menonaktifkan Barang",
              message: err && err.message ? err.message : "Terjadi kesalahan."
            });
          });
      });
    });
  }

  var stokTabs = Array.prototype.slice.call(document.querySelectorAll(".stok-tab"));
  stokTabs.forEach(function (tab, index) {
    tab.addEventListener("click", function () { activateStokTab(tab); });
    tab.addEventListener("keydown", function (event) {
      var nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % stokTabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index + stokTabs.length - 1) % stokTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = stokTabs.length - 1;
      else return;
      event.preventDefault();
      stokTabs[nextIndex].focus();
      activateStokTab(stokTabs[nextIndex]);
    });
  });

  function activateStokTab(activeTab) {
    stokTabs.forEach(function (tab) {
      var selected = tab === activeTab;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
    });
  }

  var kartuForm = document.getElementById("kartu-stok-form");
  var kartuSearch = document.getElementById("kartu-product-search");
  var kartuSelect = document.getElementById("kartu-product-id");
  var kartuTable = document.querySelector("#kartu-table tbody");
  var kartuProducts = [];
  var kartuProductsLoadFailed = false;

  function fetchAllProducts(page, products) {
    return SLApi.get("/api/admin/products", { page: page, per_page: 50, aktif: "all" })
      .then(function (res) {
        var rows = res.data || [];
        products = products.concat(rows);
        var totalPages = Number(res.meta && res.meta.total_pages) || 1;
        if (page < totalPages) return fetchAllProducts(page + 1, products);
        return products;
      });
  }

  function renderKartuProductOptions() {
    if (!kartuSelect) return;
    if (kartuProductsLoadFailed) {
      kartuSelect.innerHTML = '<option value="">Gagal memuat daftar barang</option>';
      return;
    }

    var query = kartuSearch ? kartuSearch.value.trim().toLocaleLowerCase() : "";
    var matchingProducts = kartuProducts.filter(function (product) {
      var code = String(product.kode_barang || "").toLocaleLowerCase();
      var name = String(product.nama_barang || "").toLocaleLowerCase();
      return !query || code.indexOf(query) !== -1 || name.indexOf(query) !== -1;
    });
    var placeholder = matchingProducts.length
      ? "Pilih Barang"
      : (query ? "Barang tidak ditemukan" : "Belum ada barang");
    kartuSelect.innerHTML = '<option value="">' + placeholder + "</option>" +
      matchingProducts.map(function (product) {
        return '<option value="' + esc(product.product_id) + '">' +
          esc(product.kode_barang) + " - " + esc(product.nama_barang) + "</option>";
      }).join("");
  }

  fetchAllProducts(1, [])
    .then(function (products) {
      kartuProducts = products;
      renderKartuProductOptions();
    })
    .catch(function (error) {
      kartuProductsLoadFailed = true;
      renderKartuProductOptions();
      console.error("[stok.js] Gagal memuat barang untuk kartu stok:", error);
    });

  if (kartuSearch) {
    kartuSearch.addEventListener("input", function () {
      if (kartuSelect) kartuSelect.value = "";
      renderKartuProductOptions();
      if (kartuTable) {
        kartuTable.innerHTML = '<tr><td colspan="7" class="data-table__empty-cell">Pilih barang untuk melihat riwayat stok.</td></tr>';
      }
    });
  }

  function loadKartuStok(productId) {
    if (!kartuTable || !productId) return;
    kartuTable.innerHTML = '<tr><td colspan="7" class="data-table__empty-cell">Memuat...</td></tr>';
    SLApi.get("/api/admin/reports/kartu-stok", { product_id: productId, limit: 50 })
      .then(function (res) {
        var rows = res.data || [];
        if (!rows.length) {
          kartuTable.innerHTML = '<tr><td colspan="7" class="data-table__empty-cell">Belum ada riwayat.</td></tr>';
          return;
        }
        kartuTable.innerHTML = rows.map(function (row) {
          var change = Number(row.perubahan);
          var typeLabel = {
            OUT: "Penjualan",
            IN: "Pembelian",
            ADJ_IN: "Koreksi +",
            ADJ_OUT: "Koreksi -"
          }[row.tipe_transaksi] || row.tipe_transaksi;
          var date = row.waktu
            ? new Date(row.waktu).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
            : "-";
          return "<tr>" +
            "<td>" + esc(date) + "</td>" +
            "<td>" + esc(row.no_faktur) + "</td>" +
            "<td>" + esc(typeLabel) + "</td>" +
            "<td>" + esc(String(row.stok_awal)) + "</td>" +
            '<td class="' + (change > 0 ? "stok-plus" : "stok-minus") + '">' +
              (change > 0 ? "+" : "") + change + "</td>" +
            "<td><strong>" + esc(String(row.stok_akhir)) + "</strong></td>" +
            "<td>" + esc(row.catatan || "-") + "</td>" +
          "</tr>";
        }).join("");
      })
      .catch(function (error) {
        kartuTable.innerHTML = '<tr><td colspan="7" class="data-table__error">Gagal memuat kartu stok.</td></tr>';
        console.error("[stok.js] Gagal memuat kartu stok:", error);
      });
  }

  if (kartuForm) {
    kartuForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (kartuSelect && kartuSelect.value) loadKartuStok(kartuSelect.value);
    });
  }

  dt.load();
})();
