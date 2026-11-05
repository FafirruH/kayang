/* ==========================================================================
   keranjang.js - Halaman keranjang belanja (dinamis dari SLCart)
   Checkout: POST /api/orders ke backend PHP (butuh login backend).
   Fallback: link WhatsApp langsung kalau backend tidak tersedia.
   ========================================================================== */

(function () {
  "use strict";

  var WA_NUMBER = (window.SL_CONFIG && window.SL_CONFIG.WA_NUMBER) || "6281234567890";

  var itemsContainer  = document.getElementById("cart-items");
  var summaryList     = document.getElementById("summary-list");
  var subtotalEl      = document.getElementById("cart-subtotal");
  var discountEl      = document.getElementById("cart-discount");
  var totalEl         = document.getElementById("cart-total");
  var countLabel      = document.getElementById("cart-count-label");
  var checkoutBtn     = document.getElementById("btn-checkout");
  var emptyState      = document.getElementById("cart-empty");
  var cartWrap        = document.getElementById("cart-wrap");
  var confirmBox      = document.getElementById("order-confirm");
  var confirmInvoice  = document.getElementById("confirm-invoice");
  var confirmWaLink   = document.getElementById("confirm-wa-link");
  var confirmClose    = document.getElementById("confirm-close");
  var voucherInput    = document.getElementById("voucher-code");
  var voucherBtn      = document.getElementById("voucher-apply");
  var voucherMsg      = document.getElementById("voucher-msg");

  if (!itemsContainer) return;
  if (!window.SLCart) { console.error("[keranjang.js] cart.js belum dimuat"); return; }

  var discount = 0;

  /* ---------- Format ---------- */
  function money(n) {
    return "Rp " + Math.round(n).toLocaleString("id-ID");
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- Render keranjang ---------- */
  function render() {
    var items = SLCart.getItems();
    var sub   = SLCart.total();
    var tot   = Math.max(sub - discount, 0);
    var n     = SLCart.count();

    if (countLabel) countLabel.textContent = n + " barang";

    if (items.length === 0) {
      if (emptyState) emptyState.hidden = false;
      if (cartWrap)   cartWrap.hidden   = true;
      return;
    }
    if (emptyState) emptyState.hidden = true;
    if (cartWrap)   cartWrap.hidden   = false;

    // Item list
    itemsContainer.innerHTML = items.map(function (item) {
      return (
        '<article class="cart-item" data-id="' + item.product_id + '">' +
          '<div class="cart-item__media">' +
            '<span class="product-card__tag">' + escHtml(item.jenis_barang) + '</span>' +
            '<img src="assets/icons/package-gray.svg" alt="" width="48" height="48" />' +
          '</div>' +
          '<div class="cart-item__info">' +
            '<h3 class="product-card__name">' + escHtml(item.nama_barang) + '</h3>' +
            '<p class="product-card__price">' + money(item.harga_jual) + ' / pcs</p>' +
            '<p class="cart-item__subtotal">' + money(item.qty * item.harga_jual) + '</p>' +
          '</div>' +
          '<div class="qty" role="group" aria-label="Jumlah ' + escHtml(item.nama_barang) + '">' +
            '<button type="button" class="qty__btn" data-action="inc" aria-label="Tambah">+</button>' +
            '<output class="qty__value">' + item.qty + '</output>' +
            '<button type="button" class="qty__btn qty__btn--minus" data-action="dec" aria-label="Kurangi">&minus;</button>' +
          '</div>' +
          '<button type="button" class="cart-item__remove" data-action="remove" aria-label="Hapus ' + escHtml(item.nama_barang) + '">' +
            '&times;' +
          '</button>' +
        '</article>'
      );
    }).join("");

    // Summary list
    if (summaryList) {
      summaryList.innerHTML = items.map(function (item) {
        return (
          '<li class="summary__item">' +
            '<div>' +
              '<p class="summary__name">' + escHtml(item.nama_barang) + '</p>' +
              '<p class="summary__meta">' + item.qty + ' &times; ' + money(item.harga_jual) + '</p>' +
            '</div>' +
            '<span class="summary__price">' + money(item.qty * item.harga_jual) + '</span>' +
          '</li>'
        );
      }).join("");
    }

    if (subtotalEl) subtotalEl.textContent = money(sub);
    if (discountEl) discountEl.innerHTML   = "&minus; " + money(discount);
    if (totalEl)    totalEl.textContent    = money(tot);

    // WA checkout link (fallback)
    var waText = buildWaText(items, tot);
    if (checkoutBtn && checkoutBtn.tagName === "A") {
      checkoutBtn.href = "https://wa.me/" + WA_NUMBER + "?text=" + encodeURIComponent(waText);
    }
  }

  function buildWaText(items, tot) {
    var lines = items.map(function (i) {
      return "- " + i.nama_barang + " x" + i.qty + " = " + money(i.qty * i.harga_jual);
    });
    return "Halo Admin, saya ingin memesan:\n" + lines.join("\n") + "\n\nTotal: " + money(tot);
  }

  /* ---------- Kontrol qty ---------- */
  itemsContainer.addEventListener("click", function (e) {
    var btn  = e.target.closest("[data-action]");
    if (!btn) return;
    var card = btn.closest("[data-id]");
    if (!card) return;
    var id   = Number(card.dataset.id);
    var qOut = card.querySelector(".qty__value");
    var qty  = qOut ? parseInt(qOut.textContent, 10) : 1;

    switch (btn.dataset.action) {
      case "inc":    SLCart.updateQty(id, qty + 1); break;
      case "dec":    SLCart.updateQty(id, qty - 1); break;
      case "remove": SLCart.remove(id);             break;
    }
  });

  /* ---------- Voucher (placeholder; kirim ke backend jika ada) ---------- */
  if (voucherBtn && voucherInput) {
    voucherBtn.addEventListener("click", function () {
      var code = voucherInput.value.trim().toUpperCase();
      if (!code) return;
      // Contoh: kode DISKON5000 = potongan Rp 5.000 (ganti dengan logika backend)
      if (code === "DISKON5000") {
        discount = 5000;
        if (voucherMsg) { voucherMsg.textContent = "Voucher dipakai: potongan Rp 5.000"; voucherMsg.className = "voucher__hint voucher__hint--ok"; }
      } else {
        discount = 0;
        if (voucherMsg) { voucherMsg.textContent = "Kode voucher tidak dikenal."; voucherMsg.className = "voucher__hint voucher__hint--err"; }
      }
      render();
    });
  }

  /* ---------- Checkout - simpan ke backend lalu buka WhatsApp ---------- */
  function doCheckout() {
    var items = SLCart.getItems();
    if (items.length === 0) return;

    var tot     = Math.max(SLCart.total() - discount, 0);
    var btnSpan = checkoutBtn.querySelector("span");

    checkoutBtn.disabled = true;
    if (btnSpan) btnSpan.textContent = "Memproses...";

    function resetBtn() {
      checkoutBtn.disabled = false;
      if (btnSpan) btnSpan.textContent = "Buat Pesanan";
    }

    function kirimKeWa(waNum, format, invoice) {
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

      var waUrl = "https://wa.me/" + waNum + "?text=" + encodeURIComponent(msg);

      /* Kosongkan keranjang & perbarui tampilan */
      SLCart.clear();
      render();

      /* Tampilkan modal konfirmasi */
      if (confirmBox) {
        if (confirmInvoice) confirmInvoice.textContent = invoice;
        if (confirmWaLink) {
          confirmWaLink.href   = waUrl;
          confirmWaLink.hidden = false;
        }
        confirmBox.hidden = false;
      }

      /* Buka WhatsApp di tab baru */
      window.open(waUrl, "_blank");

      resetBtn();
    }

    /* 1. Dapatkan nama pelanggan dari sesi */
    var currentUser = window.SLAuth && SLAuth.getCurrentUser();
    var namaUser    = currentUser ? (currentUser.name || currentUser.username) : "Pelanggan";

    /* 2. POST pesanan ke backend agar masuk database */
    var orderBody = {
      items: items.map(function (i) {
        return { product_id: i.product_id, jumlah: i.qty };
      }),
      diskon:         discount,
      nama_pelanggan: namaUser
    };

    SLApi.post("/api/orders", orderBody)
      .then(function (res) {
        var order   = res.data || res;
        var invoice = order.no_faktur || ("INV-" + Date.now());

        /* 3. Ambil nomor WA & format pesan, lalu buka WhatsApp */
        fetch("api/config.php")
          .then(function (r) { return r.json(); })
          .then(function (cfg) {
            var data   = cfg.data || {};
            var waNum  = data.wa_number      || WA_NUMBER;
            var format = data.format_pesanan || null;
            kirimKeWa(waNum, format, invoice);
          })
          .catch(function () {
            kirimKeWa(WA_NUMBER, null, invoice);
          });
      })
      .catch(function (err) {
        /* Jika backend gagal, jangan hapus cart — beri tahu user */
        resetBtn();
        var msg = err && err.message ? err.message : "Terjadi kesalahan.";
        alert("Gagal membuat pesanan: " + msg + "\nKeranjang tidak dihapus, silakan coba lagi.");
      });
  }

  if (checkoutBtn) {
    checkoutBtn.addEventListener("click", function (e) {
      if (checkoutBtn.tagName !== "A") {
        e.preventDefault();
        doCheckout();
      }
    });
  }

  if (confirmClose) {
    confirmClose.addEventListener("click", function () {
      if (confirmBox) confirmBox.hidden = true;
    });
  }

  /* ---------- Reaktif dari tab lain ---------- */
  SLCart.onChanged(render);

  /* ---------- Inisialisasi ---------- */
  render();
})();
