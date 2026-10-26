/* ==========================================================================
   js/katalog.js — Katalog produk dinamis dari API
   ========================================================================== */

(function () {
  "use strict";

  var API = "/kayang/api/products.php";
  var WA_NUMBER = "62895326202002"; // nomor WA bengkel

  var grid    = document.querySelector(".product-grid");
  var search  = document.querySelector(".search__input");
  var chips   = document.querySelectorAll(".chip[data-filter]");

  if (!grid) return;

  var state = { q: "", jenis: "semua", loading: false };

  // ── Render ─────────────────────────────────────────────────────────────────
  function waLink(nama) {
    var text = encodeURIComponent(
      "Halo Admin, saya ingin tanya/beli " + nama
    );
    return "https://wa.me/" + WA_NUMBER + "?text=" + text;
  }

  function stockBadge(statusStok) {
    var map = {
      "Tersedia": ["stock--ready",   "Stok Tersedia"],
      "Menipis":  ["stock--low",     "Stok Menipis"],
      "Habis":    ["stock--empty",   "Stok Habis"],
    };
    var pair = map[statusStok] || map["Tersedia"];
    return '<span class="stock ' + pair[0] + '">' + pair[1] + "</span>";
  }

  function formatRupiah(n) {
    return "Rp " + parseInt(n, 10).toLocaleString("id-ID");
  }

  function cardHTML(p) {
    var habis = p.status_stok === "Habis";
    var btnHTML = habis
      ? '<button class="btn-wa btn-wa--disabled" disabled>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>Stok Habis</span>" +
        "</button>"
      : '<a href="' + waLink(p.nama_barang) + '" class="btn-wa"' +
          ' target="_blank" rel="noopener" data-requires-login>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>Tanya / Beli via WA</span>" +
        "</a>";

    return (
      '<article class="product-card" data-category="' +
        p.jenis_barang.toLowerCase() + '">' +
        '<div class="product-card__media">' +
          '<span class="product-card__tag">' + p.jenis_barang + "</span>" +
          '<img src="assets/icons/package-gray.svg" alt="" width="48" height="48" />' +
        "</div>" +
        '<div class="product-card__body">' +
          '<h3 class="product-card__name">' + escHtml(p.nama_barang) + "</h3>" +
          '<p class="product-card__price">' + formatRupiah(p.harga_jual) + "</p>" +
          stockBadge(p.status_stok) +
          btnHTML +
        "</div>" +
      "</article>"
    );
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ── Fetch & tampilkan ─────────────────────────────────────────────────────
  function load() {
    if (state.loading) return;
    state.loading = true;

    grid.innerHTML =
      '<p class="catalog-loading" role="status" aria-live="polite">' +
      "Memuat produk...</p>";

    var params = new URLSearchParams({ limit: 100 });
    if (state.q)               params.set("q",     state.q);
    if (state.jenis !== "semua") params.set("jenis", state.jenis);

    fetch(API + "?" + params.toString())
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        state.loading = false;
        if (!json.ok) throw new Error(json.message || "Error API");

        var items = json.data.items;
        if (!items || items.length === 0) {
          grid.innerHTML =
            '<p class="catalog-empty">Produk tidak ditemukan.</p>';
          return;
        }

        grid.innerHTML = items.map(cardHTML).join("");

        // Terapkan ulang proteksi login dari auth.js bila sudah ada
        if (typeof window.authGuardLinks === "function") {
          window.authGuardLinks(grid);
        }
      })
      .catch(function (err) {
        state.loading = false;
        grid.innerHTML =
          '<p class="catalog-error">Gagal memuat produk. Pastikan server berjalan.</p>';
        console.error("[katalog.js]", err);
      });
  }

  // ── Filter chip ───────────────────────────────────────────────────────────
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      chips.forEach(function (c) { c.classList.remove("is-active"); });
      chip.classList.add("is-active");
      state.jenis = chip.dataset.filter;
      load();
    });
  });

  // ── Pencarian (debounce 300ms) ────────────────────────────────────────────
  if (search) {
    var timer;
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        state.q = search.value.trim();
        load();
      }, 300);
    });
  }

  // ── Muat pertama kali ─────────────────────────────────────────────────────
  load();
})();
