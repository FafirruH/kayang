/* ==========================================================================
   admin/js/index.js - Dashboard admin dinamis
   Mengambil data dari GET /api/admin/dashboard lalu mengisi:
     - Kartu statistik (pendapatan, pesanan pending, stok kritis, pelanggan)
     - Tabel transaksi terbaru
     - Daftar produk terlaris
     - Ringkasan laba per bulan
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Helpers ---------- */
  function money(n) {
    var v = Math.round(Number(n) || 0);
    return "Rp " + v.toLocaleString("id-ID");
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function setText(sel, val) {
    var el = document.querySelector(sel);
    if (el) el.textContent = val;
  }

  /* ---------- Stat cards ---------- */
  function fillStats(s) {
    setText('[data-stat="revenue"]',      money(s.pendapatan_bulan_ini));
    setText('[data-stat="orders"]',       String(s.pesanan_menahan_stok));
    setText('[data-stat="stock-alert"]',  String(s.barang_perlu_perhatian));
    setText('[data-stat="customers"]',    String(s.pelanggan_terdaftar));
  }

  /* ---------- Badge status transaksi ---------- */
  function badgeClass(status) {
    var map = {
      PENDING:   "badge--pending",
      COMPLETED: "badge--done",
      CANCELLED: "badge--off",
      EXPIRED:   "badge--off"
    };
    return "badge " + (map[status] || "badge--pending");
  }

  function statusLabel(status) {
    var map = {
      PENDING:   "Pending",
      COMPLETED: "Selesai",
      CANCELLED: "Dibatalkan",
      EXPIRED:   "Kedaluwarsa"
    };
    return map[status] || status;
  }

  function tipeLabel(tipe) {
    var map = { OUT: "Penjualan", IN: "Pembelian", ADJ_IN: "Koreksi +", ADJ_OUT: "Koreksi -" };
    return map[tipe] || tipe;
  }

  /* ---------- Tabel transaksi terbaru ---------- */
  function fillRecent(rows) {
    var tbody = document.querySelector("#recent-table tbody");
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="data-table__empty-cell">Belum ada transaksi.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var tgl = r.tanggal ? String(r.tanggal).slice(0, 10) : "-";
      return (
        "<tr>" +
          '<td data-label="Invoice" class="data-table__id">' + escHtml(r.no_faktur) + "</td>" +
          '<td data-label="Tipe">' + escHtml(tipeLabel(r.tipe_transaksi)) + "</td>" +
          '<td data-label="Pihak">' + escHtml(r.pihak || "-") + "</td>" +
          '<td data-label="Tanggal">' + escHtml(tgl) + "</td>" +
          '<td data-label="Total" class="data-table__soft">' + money(r.total_bayar) + "</td>" +
          '<td data-label="Status"><span class="' + badgeClass(r.status) + '">' + statusLabel(r.status) + "</span></td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ---------- Top produk ---------- */
  function fillTopProducts(rows) {
    var ul = document.getElementById("top-products-list");
    if (!ul) return;

    if (!rows || rows.length === 0) {
      ul.innerHTML = '<li class="top-item top-item--empty">Belum ada data penjualan.</li>';
      return;
    }

    ul.innerHTML = rows.map(function (p, idx) {
      return (
        '<li class="top-item">' +
          '<span class="top-item__rank">' + (idx + 1) + "</span>" +
          '<span class="top-item__name">' + escHtml(p.nama_barang) + "</span>" +
          '<span class="top-item__meta">' +
            escHtml(String(p.terjual)) + " unit &bull; " + money(p.omzet) +
          "</span>" +
        "</li>"
      );
    }).join("");
  }

  /* ---------- Ringkasan laba bulan ---------- */
  function fillProfit(rows) {
    var tbody = document.querySelector("#profit-table tbody");
    if (!tbody) return;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="data-table__empty-cell">Belum ada data.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      var laba = Number(r.laba_kotor) || 0;
      var cls  = laba >= 0 ? "" : " profit-neg";
      return (
        "<tr>" +
          "<td>" + escHtml(r.bulan) + "</td>" +
          '<td class="data-table__soft">' + money(r.penjualan_kotor) + "</td>" +
          '<td class="data-table__soft">' + money(r.total_diskon) + "</td>" +
          '<td class="' + cls + '">' + money(laba) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  /* ---------- By category (bar mini) ---------- */
  function fillByCategory(rows) {
    var ul = document.getElementById("category-list");
    if (!ul || !rows || rows.length === 0) return;

    var maxOmzet = rows.reduce(function (m, r) { return Math.max(m, Number(r.omzet) || 0); }, 1);

    ul.innerHTML = rows.map(function (r) {
      var pct = Math.round((Number(r.omzet) / maxOmzet) * 100);
      return (
        '<li class="cat-item">' +
          '<span class="cat-item__label">' + escHtml(r.jenis_barang) + "</span>" +
          '<div class="cat-item__bar-wrap">' +
            '<div class="cat-item__bar" style="width:' + pct + '%"></div>' +
          "</div>" +
          '<span class="cat-item__value">' + money(r.omzet) + "</span>" +
        "</li>"
      );
    }).join("");
  }

  /* ---------- Error / loading helpers ---------- */
  function setLoading(isLoading) {
    var el = document.getElementById("dashboard-status");
    if (el) {
      el.textContent = isLoading ? "Memuat data..." : "";
      el.hidden = !isLoading;
    }
  }

  function setError(msg) {
    var el = document.getElementById("dashboard-status");
    if (el) { el.textContent = msg; el.hidden = false; el.className = "dashboard-error"; }
  }

  /* ---------- Nama admin ---------- */
  function fillGreeting() {
    var el = document.querySelector(".admin-hero__greeting");
    if (!el) return;
    if (window.SLAuth) {
      var user = SLAuth.getCurrentUser();
      if (user) el.textContent = "Selamat datang, " + (user.name || user.username);
    }
  }

  /* ---------- Load dashboard ---------- */
  function loadDashboard() {
    if (!window.SLApi) {
      setError("SLApi belum dimuat. Pastikan js/config.js dan js/api.js diikutsertakan.");
      return;
    }

    setLoading(true);

    SLApi.get("/api/admin/dashboard")
      .then(function (res) {
        setLoading(false);
        var d = res.data || res;
        if (d.stats)        fillStats(d.stats);
        if (d.recent)       fillRecent(d.recent);
        if (d.top_products) fillTopProducts(d.top_products);
        if (d.profit)       fillProfit(d.profit);
        if (d.by_category)  fillByCategory(d.by_category);
      })
      .catch(function (err) {
        setLoading(false);
        var msg = err && err.status === 401
          ? "Sesi habis — silakan login ulang."
          : "Gagal memuat data dashboard: " + (err && err.message ? err.message : "server tidak merespons.");
        setError(msg);
        console.error("[index.js]", err);
      });
  }

  /* ---------- Boot ---------- */
  fillGreeting();
  loadDashboard();

  // Auto-refresh tiap 30 detik saat tab terlihat
  if (window.SLApi && SLApi.autoRefresh) {
    SLApi.autoRefresh(loadDashboard, (window.SL_CONFIG && SL_CONFIG.REFRESH_MS) || 30000);
  }
})();
