/* ==========================================================================
   js/katalog.js — Katalog produk dinamis dari API
   ========================================================================== */

(function () {
  "use strict";

  // Pakai SLApi (api.js) agar lewat backend utama, bukan file PHP lama
  var WA_NUMBER = (window.SL_CONFIG && window.SL_CONFIG.WA_NUMBER) || "6281234567890";

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
    var waBtn = habis
      ? '<button class="btn-wa btn-wa--disabled" disabled>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>Stok Habis</span>" +
        "</button>"
      : '<a href="' + waLink(p.nama_barang) + '" class="btn-wa"' +
          ' target="_blank" rel="noopener" data-requires-login>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>Tanya / Beli via WA</span>" +
        "</a>";

    var cartBtn = habis ? "" :
      '<button class="btn-cart" type="button"' +
        ' data-product-id="' + p.product_id + '"' +
        ' data-nama="' + escHtml(p.nama_barang) + '"' +
        ' data-harga="' + (p.harga_jual || 0) + '"' +
        ' data-jenis="' + escHtml(p.jenis_barang) + '"' +
        ' aria-label="Tambah ' + escHtml(p.nama_barang) + ' ke keranjang">' +
        "<span>+ Keranjang</span>" +
      "</button>";

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
          '<div class="product-card__actions">' + waBtn + cartBtn + "</div>" +
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
    if (!window.SLApi) {
      grid.innerHTML = '<p class="catalog-error">Gagal memuat produk. Pastikan server berjalan.</p>';
      return;
    }
    state.loading = true;

    grid.innerHTML =
      '<p class="catalog-loading" role="status" aria-live="polite">' +
      "Memuat produk...</p>";

    var query = { per_page: 100 };
    if (state.q)                 query.q     = state.q;
    if (state.jenis !== "semua") query.jenis  = state.jenis;

    SLApi.get("/api/products", query)
      .then(function (json) {
        state.loading = false;

        // Backend baru: { data: [...], meta: {...} }
        var items = Array.isArray(json.data) ? json.data : (json.data && json.data.items) || [];
        if (items.length === 0) {
          grid.innerHTML = '<p class="catalog-empty">Produk tidak ditemukan.</p>';
          return;
        }

        grid.innerHTML = items.map(cardHTML).join("");

        // Terapkan proteksi login pada link/tombol yang baru dibuat
        grid.querySelectorAll("[data-requires-login]").forEach(function (el) {
          el.addEventListener("click", function (event) {
            var user = window.SLAuth && SLAuth.getCurrentUser();
            if (user && user.role === "client") return;
            event.preventDefault();
            if (user) {
              SLAuth.showNotice("Akun admin tidak dapat memakai fitur belanja.");
              return;
            }
            window.location.href = SLAuth.loginUrl(SLAuth.currentPath());
          });
        });
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

  // ── Tambah ke keranjang ───────────────────────────────────────────────────
  grid.addEventListener("click", function (e) {
    var btn = e.target.closest(".btn-cart");
    if (!btn) return;
    if (!window.SLCart) return;

    SLCart.add({
      product_id:   Number(btn.dataset.productId),
      nama_barang:  btn.dataset.nama,
      harga_jual:   Number(btn.dataset.harga),
      jenis_barang: btn.dataset.jenis,
      qty: 1
    });

    // Umpan balik singkat pada tombol
    var orig = btn.querySelector("span").textContent;
    btn.querySelector("span").textContent = "Ditambahkan!";
    btn.disabled = true;
    setTimeout(function () {
      btn.querySelector("span").textContent = orig;
      btn.disabled = false;
    }, 1200);
  });

  // ── Muat pertama kali ─────────────────────────────────────────────────────
  load();
})();
