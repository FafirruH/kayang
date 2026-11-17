/* ==========================================================================
   pesanan.js - halaman konfirmasi "Pesanan Dibuat!"
   Membaca ringkasan pesanan terakhir yang disimpan keranjang.js (sessionStorage).
   ========================================================================== */

(function () {
  "use strict";

  var ORDER_KEY = "sl_last_order_v1";

  var card   = document.getElementById("order-card");
  var none   = document.getElementById("order-none");
  if (!card) return;

  function money(n) {
    return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
  }

  var order = null;
  try { order = JSON.parse(sessionStorage.getItem(ORDER_KEY) || "null"); } catch (e) { order = null; }

  if (!order || !order.invoice || !Array.isArray(order.items)) {
    if (none) none.hidden = false;
    return;
  }

  document.getElementById("order-invoice").textContent = order.invoice;

  var list = document.getElementById("order-items");
  order.items.forEach(function (item) {
    var li = document.createElement("li");
    li.className = "order-card__row";
    var name = document.createElement("span");
    name.textContent = item.nama + " \u00d7" + item.qty;
    var price = document.createElement("span");
    price.textContent = money(item.qty * item.harga);
    li.appendChild(name);
    li.appendChild(price);
    list.appendChild(li);
  });

  if (order.discount > 0) {
    document.getElementById("order-discount-row").hidden = false;
    document.getElementById("order-discount").textContent = "\u2212 " + money(order.discount);
  }
  document.getElementById("order-total").textContent = money(order.total);

  var wa = document.getElementById("order-wa");
  if (order.wa_url && /^https:\/\/wa\.me\//.test(order.wa_url)) {
    wa.href = order.wa_url;
  } else {
    wa.hidden = true;
  }

  card.hidden = false;
})();
