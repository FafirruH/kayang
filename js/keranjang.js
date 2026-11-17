/* ==========================================================================
   keranjang.js - Halaman keranjang belanja v2 (dinamis dari SLCart)
   Checkout: POST /api/orders ke backend PHP (butuh login backend), lalu
   pindah ke pesanan.html (halaman konfirmasi "Pesanan Dibuat!").
   ========================================================================== */

(function () {
  "use strict";

  var WA_NUMBER = (window.SL_CONFIG && window.SL_CONFIG.WA_NUMBER) || "6281234567890";
  var ORDER_KEY = "sl_last_order_v1";   // ringkasan pesanan terakhir untuk pesanan.html

  var itemsContainer = document.getElementById("cart-items");
  var subtotalEl     = document.getElementById("cart-subtotal");
  var discountEl     = document.getElementById("cart-discount");
  var totalEl        = document.getElementById("cart-total");
  var countLabel     = document.getElementById("cart-count-label");
  var checkoutBtn    = document.getElementById("btn-checkout");
  var checkoutError  = document.getElementById("checkout-error");
  var emptyState     = document.getElementById("cart-empty");
  var cartWrap       = document.getElementById("cart-wrap");
  var voucherInput   = document.getElementById("voucher-code");
  var voucherBtn     = document.getElementById("voucher-apply");
  var voucherMsg     = document.getElementById("voucher-msg");

  if (!itemsContainer) return;
  if (!window.SLCart) { console.error("[keranjang.js] cart.js belum dimuat"); return; }

  var discount = 0;
  var stockInfo = {};   // product_id -> { status, tersedia } (dari /api/products)

  /* ---------- Format ---------- */
  function money(n) {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  var STOCK_LABEL = {
    "Tersedia": ["stock--ready", "Stok Tersedia"],
    "Menipis":  ["stock--low",   "Stok Menipis"],
    "Habis":    ["stock--empty", "Stok Habis"]
  };

  function stockBadge(id) {
    var info = stockInfo[id];
    if (!info) return "";
    var pair = STOCK_LABEL[info.status] || STOCK_LABEL.Tersedia;
    return '<span class="stock ' + pair[0] + ' cart2-item__stock">' + pair[1] + "</span>";
  }

  /* ---------- Render keranjang ---------- */
  function render() {
    var items = SLCart.getItems();
    var sub   = SLCart.total();
    var disc  = Math.min(discount, sub);
    var tot   = Math.max(sub - disc, 0);

    if (countLabel) countLabel.textContent = SLCart.count() + " barang";

    if (items.length === 0) {
      if (emptyState) emptyState.hidden = false;
      if (cartWrap)   cartWrap.hidden   = true;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (cartWrap)   cartWrap.hidden   = false;

    itemsContainer.innerHTML = items.map(function (item) {
      var info = stockInfo[item.product_id];
      var atMax = info && item.qty >= info.tersedia;
      return (
        '<article class="cart2-item" data-id="' + item.product_id + '">' +
          '<a class="cart2-item__thumb" href="produk.html?id=' + item.product_id + '" aria-label="Lihat ' + escHtml(item.nama_barang) + '">' +
            '<span class="cart2-item__tag">' + escHtml(item.jenis_barang) + '</span>' +
            '<img src="assets/icons/package-gray.svg" alt="" width="36" height="36" />' +
          '</a>' +
          '<div class="cart2-item__info">' +
            '<h3 class="cart2-item__name">' + escHtml(item.nama_barang) + '</h3>' +
            '<p class="cart2-item__price">' + money(item.harga_jual) + '</p>' +
            stockBadge(item.product_id) +
          '</div>' +
          '<div class="cart2-qty" role="group" aria-label="Jumlah ' + escHtml(item.nama_barang) + '">' +
            '<button type="button" class="cart2-qty__btn" data-action="dec" aria-label="Kurangi">&minus;</button>' +
            '<output class="cart2-qty__value">' + item.qty + '</output>' +
            '<button type="button" class="cart2-qty__btn" data-action="inc" aria-label="Tambah"' + (atMax ? " disabled" : "") + '>+</button>' +
          '</div>' +
          '<p class="cart2-item__total">' + money(item.qty * item.harga_jual) + '</p>' +
          '<button type="button" class="cart2-item__remove" data-action="remove" aria-label="Hapus ' + escHtml(item.nama_barang) + '">' +
            '<img src="assets/icons/trash-gray.svg" alt="" width="20" height="20" />' +
          '</button>' +
        '</article>'
      );
    }).join("");

    if (subtotalEl) subtotalEl.textContent = money(sub);
    if (discountEl) discountEl.innerHTML   = disc > 0 ? "&minus; " + money(disc) : "&ndash;";
    if (totalEl)    totalEl.textContent    = money(tot);
  }

  // Stok terkini dari katalog: menampilkan label stok dan membatasi tombol "+"
  function loadStock() {
    if (!window.SLApi) return;
    SLApi.get("/api/products", { per_page: 100 }).then(function (json) {
      var rows = Array.isArray(json.data) ? json.data : [];
      rows.forEach(function (p) {
        stockInfo[p.product_id] = { status: p.status_stok, tersedia: Number(p.tersedia) || 0 };
      });
      render();
    }).catch(function () { /* label stok tidak tampil, keranjang tetap berfungsi */ });
  }

  /* ---------- Kontrol qty ---------- */
  itemsContainer.addEventListener("click", function (e) {
    var btn  = e.target.closest("[data-action]");
    if (!btn || btn.disabled) return;
    var card = btn.closest("[data-id]");
    if (!card) return;
    var id   = Number(card.dataset.id);
    var qOut = card.querySelector(".cart2-qty__value");
    var qty  = qOut ? parseInt(qOut.textContent, 10) : 1;

    switch (btn.dataset.action) {
      case "inc":    SLCart.updateQty(id, qty + 1); break;
      case "dec":    SLCart.updateQty(id, qty - 1); break;
      case "remove": SLCart.remove(id);             break;
    }
  });

  /* ---------- Voucher (placeholder; kirim ke backend jika ada) ---------- */
  function setVoucherMsg(text, type) {
    if (!voucherMsg) return;
    voucherMsg.textContent = text;
    voucherMsg.className = "cart2-voucher__hint" + (type ? " cart2-voucher__hint--" + type : "");
  }

  if (voucherBtn && voucherInput) {
    voucherBtn.addEventListener("click", function () {
      var code = voucherInput.value.trim().toUpperCase();
      if (!code) return;
      // Contoh: kode DISKON5000 = potongan Rp 5.000 (ganti dengan logika backend)
      if (code === "DISKON5000") {
        discount = 5000;
        setVoucherMsg("Voucher dipakai: potongan Rp 5.000", "ok");
      } else {
        discount = 0;
        setVoucherMsg("Kode voucher tidak dikenal.", "err");
      }
      render();
    });
  }

  /* ---------- Checkout: simpan ke backend, lalu buka halaman konfirmasi ---------- */
  function showCheckoutError(text) {
    if (!checkoutError) return;
    checkoutError.textContent = text;
    checkoutError.hidden = !text;
  }

  function doCheckout() {
    var items = SLCart.getItems();
    if (items.length === 0) return;

    var sub  = SLCart.total();
    var disc = Math.min(discount, sub);
    var tot  = Math.max(sub - disc, 0);
    var btnSpan = checkoutBtn.querySelector("span");

    showCheckoutError("");
    checkoutBtn.disabled = true;
    if (btnSpan) btnSpan.textContent = "Memproses...";

    function resetBtn() {
      checkoutBtn.disabled = false;
      if (btnSpan) btnSpan.textContent = "Checkout";
    }

    // Susun pesan WhatsApp, simpan ringkasan pesanan, lalu pindah ke pesanan.html
    function selesai(waNum, format, invoice) {
      var itemLines = items.map(function (i) {
        return "- " + i.nama_barang + " x" + i.qty + " = " + money(i.qty * i.harga_jual);
      }).join("\n");

      var msg;
      if (format) {
        msg = format
          .replace("{items}",   itemLines)
          .replace("{total}",   money(tot))
          .replace("{invoice}", invoice);
      } else {
        msg = "Halo Admin, saya ingin memesan:\n" + itemLines +
              "\n\nTotal: " + money(tot) +
              "\nNo. Invoice: " + invoice;
      }

      var snapshot = {
        invoice:  invoice,
        items:    items.map(function (i) { return { nama: i.nama_barang, qty: i.qty, harga: i.harga_jual }; }),
        subtotal: sub,
        discount: disc,
        total:    tot,
        wa_url:   "https://wa.me/" + waNum + "?text=" + encodeURIComponent(msg)
      };
      try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(snapshot)); } catch (e) { /* abaikan */ }

      SLCart.clear();
      window.location.href = "pesanan.html";
    }

    var orderBody = {
      items: items.map(function (i) {
        return { product_id: i.product_id, jumlah: i.qty };
      }),
      diskon: disc
    };

    SLApi.post("/api/orders", orderBody)
      .then(function (res) {
        var order   = res.data || res;
        var invoice = order.no_faktur || ("INV-" + Date.now());

        // Nomor WA & format pesan dari pengaturan admin
        SLApi.getAppConfig()
          .then(function (data) {
            selesai(data.wa_number || WA_NUMBER, data.format_pesanan || null, invoice);
          })
          .catch(function () {
            selesai(WA_NUMBER, null, invoice);
          });
      })
      .catch(function (err) {
        // Jika backend gagal, keranjang tidak dihapus
        resetBtn();
        var msg = err && err.message ? err.message : "Terjadi kesalahan.";
        showCheckoutError("Gagal membuat pesanan: " + msg + " Keranjang tidak dihapus, silakan coba lagi.");
      });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      doCheckout();
    });
  }

  /* ---------- Reaktif dari tab lain ---------- */
  SLCart.onChanged(render);

  /* ---------- Inisialisasi ---------- */
  render();
  loadStock();
})();
