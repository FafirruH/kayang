/* ==========================================================================
   cart.js - Keranjang belanja (localStorage)
   Dipakai katalog.html (tombol "Tambah ke Keranjang") dan keranjang.html.
   Tidak ada API call; semua operasi lokal sampai proses checkout.

   API: window.SLCart
   ========================================================================== */

(function (global) {
  "use strict";

  var KEY        = "sl_cart_v1";
  var CHANGE_KEY = "sl_cart_changed";

  /* ---------- Penyimpanan ---------- */
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
  }

  function broadcast() {
    try { localStorage.setItem(CHANGE_KEY, String(Date.now())); } catch (e) {}
    try {
      if (global.document) {
        global.document.dispatchEvent(new CustomEvent("slCartChanged"));
      }
    } catch (e) {}
  }

  /* ---------- Operasi ---------- */

  /**
   * Tambah produk ke keranjang.
   * @param {{ product_id, nama_barang, harga_jual, jenis_barang, qty? }} product
   */
  function add(product) {
    var items = read();
    var found = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].product_id === product.product_id) {
        items[i].qty += (product.qty > 0 ? product.qty : 1);
        found = true;
        break;
      }
    }
    if (!found) {
      items.push({
        product_id:   product.product_id,
        nama_barang:  product.nama_barang,
        harga_jual:   Number(product.harga_jual) || 0,
        jenis_barang: product.jenis_barang || "",
        qty:          product.qty > 0 ? product.qty : 1
      });
    }
    write(items);
    broadcast();
  }

  /** Hapus satu baris dari keranjang. */
  function remove(product_id) {
    write(read().filter(function (i) { return i.product_id !== product_id; }));
    broadcast();
  }

  /** Ubah jumlah; qty <= 0 menghapus baris. */
  function updateQty(product_id, qty) {
    var items = read();
    for (var i = 0; i < items.length; i++) {
      if (items[i].product_id === product_id) {
        if (qty <= 0) { items.splice(i, 1); }
        else          { items[i].qty = qty; }
        break;
      }
    }
    write(items);
    broadcast();
  }

  /** Kembalikan semua item (salinan). */
  function getItems() { return read(); }

  /** Total unit di keranjang. */
  function count() {
    return read().reduce(function (s, i) { return s + i.qty; }, 0);
  }

  /** Total harga sebelum diskon. */
  function total() {
    return read().reduce(function (s, i) { return s + i.qty * i.harga_jual; }, 0);
  }

  /** Kosongkan keranjang. */
  function clear() { write([]); broadcast(); }

  /**
   * Pasang listener perubahan (antar tab maupun di tab yang sama).
   * @param {function} fn
   */
  function onChanged(fn) {
    if (global.document) {
      global.document.addEventListener("slCartChanged", fn);
    }
    global.addEventListener("storage", function (e) {
      if (e.key === CHANGE_KEY) fn();
    });
  }

  global.SLCart = {
    add:       add,
    remove:    remove,
    updateQty: updateQty,
    getItems:  getItems,
    count:     count,
    total:     total,
    clear:     clear,
    onChanged: onChanged
  };
})(window);
