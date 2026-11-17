/* ==========================================================================
   js/katalog.js — Katalog produk dinamis dari API
   ========================================================================== */

(function () {
  "use strict";

  var WA_NUMBER = "";
  var waConfigError = false;

  var grid    = document.querySelector(".product-grid");
  var search  = document.querySelector(".search__input");
  var filters = document.querySelector(".filters");

  if (!grid) return;

  var state = { q: "", jenis: "semua", loading: false };
  var products = null;

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
      : WA_NUMBER
      ? '<a href="' + waLink(p.nama_barang) + '" class="btn-wa"' +
          ' target="_blank" rel="noopener" data-requires-login>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>Tanya / Beli via WA</span>" +
        "</a>"
      : '<button class="btn-wa btn-wa--disabled" type="button" disabled>' +
          '<img src="assets/icons/chat-sm.svg" alt="" width="16" height="16" />' +
          "<span>" + (waConfigError ? "WhatsApp tidak tersedia" : "Memuat WhatsApp...") + "</span>" +
        "</button>";

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
        escHtml(p.jenis_barang.toLowerCase()) + '">' +
        '<a class="product-card__media" href="produk.html?id=' + p.product_id + '"' +
          ' aria-label="Lihat detail ' + escHtml(p.nama_barang) + '">' +
          '<span class="product-card__tag">' + escHtml(p.jenis_barang) + "</span>" +
          '<img src="assets/icons/package-gray.svg" alt="" width="48" height="48" />' +
        "</a>" +
        '<div class="product-card__body">' +
          '<h3 class="product-card__name"><a href="produk.html?id=' + p.product_id + '">' + escHtml(p.nama_barang) + "</a></h3>" +
          '<p class="product-card__price">' + formatRupiah(p.harga_jual) + "</p>" +
          stockBadge(p.status_stok) +
          '<div class="product-card__actions">' + waBtn + cartBtn + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  function renderProducts() {
    if (!products) return;
    if (!products.length) {
      grid.innerHTML = '<p class="catalog-empty">Produk tidak ditemukan.</p>';
      return;
    }

    grid.innerHTML = products.map(cardHTML).join("");
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
  }

  function loadWhatsAppConfig() {
    SLApi.getAppConfig()
      .then(function (config) {
        var number = config && String(config.wa_number || "").replace(/[\s\-().+]/g, "");
        if (!number || !/^(08|62)\d{8,13}$/.test(number)) {
          throw new Error("Nomor WhatsApp tidak tersedia pada konfigurasi.");
        }
        WA_NUMBER = number;
        renderProducts();
      })
      .catch(function (error) {
        waConfigError = true;
        renderProducts();
        console.error("[katalog.js] Gagal memuat konfigurasi WhatsApp.", error);
      });
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadCategories() {
    if (!filters || !window.SLApi) return;

    SLApi.get("/api/categories")
      .then(function (json) {
        var categories = Array.isArray(json.data) ? json.data : [];
        categories.forEach(function (item) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "chip";
          chip.dataset.filter = "kategori";
          chip.dataset.jenis = item.jenis;
          chip.textContent = item.jenis;
          filters.appendChild(chip);
        });
      })
      .catch(function (err) {
        console.error("[katalog.js] Gagal memuat kategori", err);
      });
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
        products = Array.isArray(json.data) ? json.data : (json.data && json.data.items) || [];
        renderProducts();
      })
      .catch(function (err) {
        state.loading = false;
        grid.innerHTML =
          '<p class="catalog-error">Gagal memuat produk. Pastikan server berjalan.</p>';
        console.error("[katalog.js]", err);
      });
  }

  // ── Filter chip ───────────────────────────────────────────────────────────
  if (filters) {
    filters.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip[data-filter]");
      if (!chip) return;

      filters.querySelectorAll(".chip[data-filter]").forEach(function (item) {
        item.classList.remove("is-active");
      });
      chip.classList.add("is-active");
      state.jenis = chip.dataset.filter === "semua" ? "semua" : chip.dataset.jenis;
      load();
    });
  }

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

    var auth = window.SLAuth;
    if (!auth) {
      console.error("[katalog.js] Modul autentikasi belum dimuat.");
      return;
    }
    var user = auth.getCurrentUser();
    if (!user) {
      window.location.href = auth.loginUrl(auth.currentPath());
      return;
    }
    if (user.role !== "client") {
      auth.showNotice("Akun admin tidak dapat memakai fitur belanja. Masuk dengan akun client.");
      return;
    }

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
  loadCategories();
  loadWhatsAppConfig();
  load();
})();
