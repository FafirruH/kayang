/* ==========================================================================
   produk.js - Halaman detail produk (dibuka dari foto produk di katalog)
   Data dari GET /api/products/{id}; ?id= pada alamat halaman.
   ========================================================================== */

(function () {
  "use strict";

  var root = document.getElementById("pdp");
  var statusEl = document.getElementById("pdp-status");
  if (!root) return;

  var params = new URLSearchParams(window.location.search);
  var id = parseInt(params.get("id"), 10);

  var product = null;
  var qty = 1;

  var qtyEl = document.getElementById("pdp-qty");
  var decBtn = document.getElementById("pdp-dec");
  var incBtn = document.getElementById("pdp-inc");
  var addBtn = document.getElementById("pdp-add");

  function money(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  function showError(text) {
    statusEl.textContent = text;
    statusEl.hidden = false;
    statusEl.classList.add("pdp__status--error");
    root.hidden = true;
  }

  if (!id || id < 1) {
    showError("Produk tidak ditemukan. Pilih produk dari katalog.");
    return;
  }

  /* ---------- Tampilkan data ---------- */
  var STOCK = {
    "Tersedia": ["stock--ready", "Stok Tersedia"],
    "Menipis":  ["stock--low",   "Stok Menipis"],
    "Habis":    ["stock--empty", "Stok Habis"]
  };

  function chip(text) {
    var li = document.createElement("li");
    li.className = "pdp__chip";
    li.textContent = text;
    return li;
  }

  function specRow(label, value) {
    var wrap = document.createElement("div");
    var dt = document.createElement("dt");
    dt.textContent = label;
    var dd = document.createElement("dd");
    dd.textContent = value;
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    return wrap;
  }

  function maxQty() {
    return Math.max(Number(product.tersedia) || 0, 0);
  }

  function syncQty() {
    qtyEl.textContent = String(qty);
    decBtn.disabled = qty <= 1;
    incBtn.disabled = qty >= maxQty();
  }

  function show(p) {
    product = p;
    document.title = p.nama_barang + " - Sumber Lancar";

    document.getElementById("pdp-tag").textContent = p.jenis_barang;
    document.getElementById("pdp-eyebrow").textContent = p.jenis_barang;
    document.getElementById("pdp-name").textContent = p.nama_barang;
    document.getElementById("pdp-price").textContent = money(p.harga_jual);

    var summary = p.nama_barang + " dari kategori " + p.jenis_barang +
      (p.merk ? ", merek " + p.merk : "") + ".";
    document.getElementById("pdp-summary").textContent = summary;
    document.getElementById("panel-desc").textContent =
      summary + " Hubungi admin lewat WhatsApp untuk menanyakan kecocokan dengan motor Anda.";

    var pair = STOCK[p.status_stok] || STOCK.Tersedia;
    var stockEl = document.getElementById("pdp-stock");
    stockEl.className = "stock " + pair[0];
    stockEl.textContent = pair[1];

    var chips = document.getElementById("pdp-chips");
    chips.appendChild(chip("Kategori: " + p.jenis_barang));
    if (p.merk) chips.appendChild(chip("Merek: " + p.merk));
    chips.appendChild(chip("Tersedia: " + maxQty() + " pcs"));

    var spec = document.getElementById("pdp-spec");
    spec.appendChild(specRow("Kode barang", p.kode_barang));
    spec.appendChild(specRow("Kategori", p.jenis_barang));
    spec.appendChild(specRow("Merek", p.merk || "-"));
    spec.appendChild(specRow("Ketersediaan", pair[1] + " (" + maxQty() + " pcs)"));

    if (maxQty() < 1) {
      addBtn.disabled = true;
      addBtn.querySelector("span").textContent = "Stok Habis";
      incBtn.disabled = true;
      decBtn.disabled = true;
    } else {
      syncQty();
    }

    statusEl.hidden = true;
    root.hidden = false;
  }

  /* ---------- Jumlah + tambah ke keranjang ---------- */
  decBtn.addEventListener("click", function () {
    if (qty > 1) { qty--; syncQty(); }
  });
  incBtn.addEventListener("click", function () {
    if (qty < maxQty()) { qty++; syncQty(); }
  });

  addBtn.addEventListener("click", function () {
    if (!product || !window.SLCart) return;

    // Belanja hanya untuk client yang sudah login (sama seperti tombol di katalog)
    var user = window.SLAuth && SLAuth.getCurrentUser();
    if (!user) {
      window.location.href = SLAuth.loginUrl(SLAuth.currentPath());
      return;
    }
    if (user.role !== "client") {
      SLAuth.showNotice("Akun admin tidak dapat memakai fitur belanja. Masuk dengan akun client.");
      return;
    }

    SLCart.add({
      product_id:   Number(product.product_id),
      nama_barang:  product.nama_barang,
      harga_jual:   Number(product.harga_jual),
      jenis_barang: product.jenis_barang,
      qty: qty
    });

    var label = addBtn.querySelector("span");
    var orig = label.textContent;
    label.textContent = "Ditambahkan!";
    addBtn.disabled = true;
    setTimeout(function () {
      label.textContent = orig;
      addBtn.disabled = false;
    }, 1200);
  });

  /* ---------- Tab Deskripsi / Spesifikasi ---------- */
  var tabs = [document.getElementById("tab-desc"), document.getElementById("tab-spec")];
  var panels = [document.getElementById("panel-desc"), document.getElementById("panel-spec")];

  function selectTab(index) {
    tabs.forEach(function (tab, i) {
      var on = i === index;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
    });
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () { selectTab(i); });
    tab.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        var next = (i + 1) % tabs.length;
        selectTab(next);
        tabs[next].focus();
      }
    });
  });

  /* ---------- Muat produk ---------- */
  if (!window.SLApi) {
    showError("Gagal memuat produk. Pastikan server berjalan.");
    return;
  }
  SLApi.get("/api/products/" + id)
    .then(function (json) {
      if (!json.data) throw new Error("kosong");
      show(json.data);
    })
    .catch(function (err) {
      showError(err && err.status === 404
        ? "Produk tidak ditemukan atau sudah tidak dijual."
        : "Gagal memuat produk. Pastikan server berjalan.");
    });
})();
