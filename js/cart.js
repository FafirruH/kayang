/* ==========================================================================
   cart.js - Keranjang belanja per akun (localStorage)
   Dipakai katalog.html (tombol "Tambah ke Keranjang") dan keranjang.html.
   Item disimpan lokal; sesi backend lama dilengkapi dengan ID melalui API.

   API: window.SLCart
   ========================================================================== */

(function (global) {
  "use strict";

  var KEY_PREFIX = "sl_cart_v2_";
  var CHANGE_KEY = "sl_cart_changed";
  var identityRequests = Object.create(null);

  /* ---------- Penyimpanan ---------- */
  function cartKey(user) {
    var identity = user.id
      ? "id_" + encodeURIComponent(String(user.id))
      : "username_" + encodeURIComponent(String(user.username || "").toLowerCase());
    return KEY_PREFIX + (user.source || "local") + "_" + identity;
  }

  function currentUser() {
    var auth = global.SLAuth;
    var user = auth && auth.getCurrentUser ? auth.getCurrentUser() : null;
    return user && user.role === "client" ? user : null;
  }

  function hydrateBackendIdentity(user) {
    var username = String(user.username || "").toLowerCase();
    if (user.source !== "backend" || user.id || !global.SLApi || identityRequests[username]) return;
    identityRequests[username] = true;

    global.SLApi.get("/api/auth/me").then(function (res) {
      var account = res.data || res;
      var id = Number(account && account.id);
      var activeUser = currentUser();
      if (!id || !activeUser || activeUser.source !== "backend" ||
          String(activeUser.username).toLowerCase() !== username || activeUser.id) {
        delete identityRequests[username];
        return;
      }

      var session;
      try {
        session = JSON.parse(localStorage.getItem(global.SLAuth.SESSION_KEY) || "null");
        if (!session || session.source !== "backend" ||
            String(session.username).toLowerCase() !== username) {
          delete identityRequests[username];
          return;
        }

        var oldKey = cartKey(user);
        var newUser = { id: id, username: account.username || user.username, source: "backend" };
        var newKey = cartKey(newUser);
        var oldItems = localStorage.getItem(oldKey);
        if (oldItems !== null && localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, oldItems);
          localStorage.removeItem(oldKey);
        }

        session.id = id;
        localStorage.setItem(global.SLAuth.SESSION_KEY, JSON.stringify(session));
      } catch (error) {
        delete identityRequests[username];
        console.error("[cart.js] Gagal memindahkan keranjang ke ID akun.", error);
        return;
      }

      broadcast();
    }).catch(function (error) {
      delete identityRequests[username];
      console.error("[cart.js] Gagal memuat identitas akun untuk keranjang.", error);
    });
  }

  function currentCartKey() {
    var user = currentUser();
    if (!user) return null;
    hydrateBackendIdentity(user);
    return cartKey(user);
  }

  function read(key) {
    if (!key) return [];
    try {
      var raw = localStorage.getItem(key);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function write(key, items) {
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(items)); } catch (e) {}
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
    var key = currentCartKey();
    if (!key) throw new Error("Masuk dengan akun pelanggan untuk memakai keranjang.");
    var items = read(key);
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
    write(key, items);
    broadcast();
  }

  /** Hapus satu baris dari keranjang. */
  function remove(product_id) {
    var key = currentCartKey();
    if (!key) return;
    write(key, read(key).filter(function (i) { return i.product_id !== product_id; }));
    broadcast();
  }

  /** Ubah jumlah; qty <= 0 menghapus baris. */
  function updateQty(product_id, qty) {
    var key = currentCartKey();
    if (!key) return;
    var items = read(key);
    for (var i = 0; i < items.length; i++) {
      if (items[i].product_id === product_id) {
        if (qty <= 0) { items.splice(i, 1); }
        else          { items[i].qty = qty; }
        break;
      }
    }
    write(key, items);
    broadcast();
  }

  /** Kembalikan semua item (salinan). */
  function getItems() { return read(currentCartKey()); }

  /** Total unit di keranjang. */
  function count() {
    return getItems().reduce(function (s, i) { return s + i.qty; }, 0);
  }

  function total() {
    return getItems().reduce(function (s, i) { return s + i.qty * i.harga_jual; }, 0);
  }

  /** Kosongkan keranjang. */
  function clear() {
    var key = currentCartKey();
    if (!key) return;
    write(key, []);
    broadcast();
  }

  /**
   * Pasang listener perubahan (antar tab maupun di tab yang sama).
   * @param {function} fn
   */
  function onChanged(fn) {
    if (global.document) {
      global.document.addEventListener("slCartChanged", fn);
    }
    global.addEventListener("storage", function (e) {
      if (e.key === CHANGE_KEY || (global.SLAuth && e.key === global.SLAuth.SESSION_KEY)) fn();
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
