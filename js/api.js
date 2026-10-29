/* ==========================================================================
   api.js - klien API ke backend PHP (muat setelah js/config.js)

   - Semua permintaan memakai cookie sesi (credentials: "include").
   - Balasan sukses : { data, meta? }   Balasan galat: ApiError(message, status, details)
   - Perubahan stok di satu tab memberi tahu tab lain (katalog / tabel stok) lewat
     event "storage", ditambah penyegaran otomatis berkala, sehingga tampilan
     selalu mengikuti isi database.

   API: window.SLApi
   ========================================================================== */

(function (global) {
  "use strict";

  var CFG = global.SL_CONFIG || {};
  var BASE = String(CFG.API_BASE || "").replace(/\/+$/, "");
  var STOCK_KEY = "sl_stock_changed";
  var unauthorizedHandlers = [];

  function ApiError(message, status, details) {
    this.name = "ApiError";
    this.message = message;
    this.status = status;
    this.details = details || {};
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function queryString(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null || value === "") return;
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(value));
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function request(method, path, query, body, options) {
    var init = { method: method, credentials: "include", headers: { Accept: "application/json" } };
    if (options && options.signal) init.signal = options.signal;
    // GET tanpa Content-Type = "simple request" (tanpa preflight CORS, lebih cepat)
    if (method !== "GET") {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body || {});
    }

    return fetch(BASE + path + queryString(query), init).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        if (text) {
          try { json = JSON.parse(text); } catch (e) { json = null; }
        }
        if (!res.ok) {
          var err = json && json.error ? json.error : {};
          var apiError = new ApiError(
            err.message || "Terjadi kesalahan pada server (" + res.status + ").",
            res.status,
            err.details
          );
          if (res.status === 401) {
            unauthorizedHandlers.forEach(function (fn) { try { fn(apiError); } catch (e) { /* abaikan */ } });
          }
          throw apiError;
        }
        return json || { data: null };
      });
    }, function (error) {
      if (error && error.name === "AbortError") throw error;
      throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.", 0);
    });
  }

  /* ---------- Utilitas ---------- */
  function money(value) {
    var n = Math.round(Number(value) || 0);
    return "Rp " + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function debounce(fn, ms) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  /* ---------- Sinkron stok antar tab / perangkat ---------- */
  // Dipanggil setelah admin mengubah stok; tab lain (mis. katalog) langsung menyegarkan diri.
  function notifyStockChanged() {
    try { localStorage.setItem(STOCK_KEY, String(Date.now())); } catch (e) { /* abaikan */ }
  }

  function onStockChanged(callback) {
    global.addEventListener("storage", function (event) {
      if (event.key === STOCK_KEY) callback();
    });
  }

  // Jalankan fn berkala selama tab terlihat, dan seketika saat tab kembali dibuka.
  function autoRefresh(fn, ms) {
    setInterval(function () { if (!document.hidden) fn(); }, ms || 30000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) fn(); });
  }

  global.SLApi = {
    ApiError: ApiError,
    base: BASE,
    get: function (path, query, options) { return request("GET", path, query, null, options); },
    post: function (path, body, options) { return request("POST", path, null, body, options); },
    put: function (path, body, options) { return request("PUT", path, null, body, options); },
    patch: function (path, body, options) { return request("PATCH", path, null, body, options); },
    del: function (path, options) { return request("DELETE", path, null, {}, options); },
    onUnauthorized: function (fn) { unauthorizedHandlers.push(fn); },
    money: money,
    debounce: debounce,
    notifyStockChanged: notifyStockChanged,
    onStockChanged: onStockChanged,
    autoRefresh: autoRefresh
  };
})(window);
