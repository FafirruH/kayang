/* ==========================================================================
   include.js - dipakai halaman client DAN admin (muat setelah js/auth.js)
   - Memuat partials/header.html dan partials/footer.html
   - Menandai menu aktif berdasarkan <body data-page="...">
   - Kontrol akses halaman lewat <body data-auth="admin|client">
     (logika ada di js/auth.js; ini simulasi frontend, bukan keamanan server)
   - Link [data-requires-login] (fitur client): belum login -> login.html,
     admin -> pemberitahuan
   - Tombol [data-logout] menghapus sesi bersama
   - Header: ikon keranjang + badge jumlah ([data-cart-count]) dan panel profil
     ([data-profile]) berisi info akun, Pengaturan Akun / Beralih Dashboard, Log Out
   - Status akun di header client ([data-auth-login], [data-profile]) dan [data-client-only]
   - Menu hamburger admin (.nav-toggle + #site-nav)

   CATATAN: fetch() tidak jalan bila halaman dibuka lewat file://
   Jalankan lewat server lokal, misalnya "Live Server" atau:
   python -m http.server
   ========================================================================== */

(function () {
  "use strict";

  var Auth = window.SLAuth;

  var PARTIALS = {
    header: "partials/header.html",
    footer: "partials/footer.html"
  };

  /* ---------- Akses halaman ---------- */
  function checkAccess() {
    var required = document.body.getAttribute("data-auth");
    if (!required) return true;
    if (Auth.requireRole(required)) {
      document.body.classList.add("is-authed");
      return true;
    }
    document.body.classList.remove("is-authed");
    return false;
  }

  /* ---------- Header ---------- */
  function markActiveNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    var links = document.querySelectorAll('[data-nav="' + page + '"]');
    links.forEach(function (link) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    });
  }

  function setHidden(selector, hidden) {
    document.querySelectorAll(selector).forEach(function (el) { el.hidden = hidden; });
  }

  // Header: tombol Login (belum login) atau ikon profil (sudah login)
  function applyAuthState() {
    var user = Auth.getCurrentUser();
    setHidden("[data-auth-login]", !!user);
    setHidden("[data-profile]", !user);
    setHidden("[data-client-only]", !!user && user.role === "admin");

    // Admin: tidak ada Pengaturan Akun, diganti Beralih Dashboard. Client: sebaliknya.
    var isAdmin = !!user && user.role === "admin";
    setHidden("[data-profile-config]", isAdmin);
    setHidden("[data-profile-switch]", !isAdmin);

    // Lencana ADMIN di ikon profil: hanya tampil pada sesi akun admin
    setHidden("[data-admin-tag]", !isAdmin);
    document.querySelectorAll("[data-profile-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-label", isAdmin ? "Profil akun (admin)" : "Profil akun");
    });

    var roleEl = document.querySelector("[data-profile-role]");
    if (roleEl && user) roleEl.textContent = isAdmin ? "Akun Admin" : "Akun User";

    if (user) fillProfile(user);
    updateCartBadge();
  }

  /* ---------- Panel profil ---------- */
  var profileCache = null;

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach(function (el) { el.textContent = value || "-"; });
  }

  function showProfile(data) {
    setText("[data-profile-name]", data.nama_lengkap);
    setText("[data-profile-username]", data.username);
    setText("[data-profile-phone]", data.no_telepon);
  }

  // Isi cepat dari sesi, lalu lengkapi (nama lengkap & no. HP) dari backend /api/auth/me
  function fillProfile(user) {
    var local = Auth.getProfile && Auth.getProfile();
    showProfile(profileCache || local || { nama_lengkap: user.name, username: user.username, no_telepon: "" });
    if (profileCache || !window.SLApi) return;

    SLApi.get("/api/auth/me").then(function (res) {
      var data = res && res.data;
      if (!data || !data.username) return;
      profileCache = { nama_lengkap: data.nama_lengkap, username: data.username, no_telepon: data.no_telepon };
      showProfile(profileCache);
    }).catch(function () { /* tetap pakai data lokal */ });
  }

  function bindProfilePanel() {
    var wrap = document.querySelector("[data-profile]");
    if (!wrap) return;
    var toggle = wrap.querySelector("[data-profile-toggle]");
    var panel = wrap.querySelector(".profile-panel");
    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function (event) {
      event.stopPropagation();
      setOpen(panel.hidden);
    });
    document.addEventListener("click", function (event) {
      if (!panel.hidden && !event.target.closest("[data-profile]")) setOpen(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) { setOpen(false); toggle.focus(); }
    });
  }

  /* ---------- Badge keranjang (jumlah seluruh unit barang) ---------- */
  function cartCount() {
    return window.SLCart ? SLCart.count() : 0;
  }

  function updateCartBadge() {
    var n = cartCount();
    document.querySelectorAll("[data-cart-count]").forEach(function (badge) {
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n < 1;
    });
    document.querySelectorAll(".cart-btn").forEach(function (link) {
      link.setAttribute("aria-label", n > 0 ? "Keranjang, " + n + " barang" : "Keranjang");
    });
  }

  function bindLogout() {
    document.querySelectorAll("[data-logout]").forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        var user = Auth.getCurrentUser();
        Auth.logout();
        // Admin kembali ke login, client kembali ke beranda
        window.location.replace(Auth.rootUrl(user && user.role === "admin" ? "login.html" : "index.html"));
      });
    });
  }

  // Fitur khusus client (keranjang, beli via WA)
  function guardLoginLinks() {
    document.querySelectorAll("[data-requires-login]").forEach(function (link) {
      link.addEventListener("click", function (event) {
        var user = Auth.getCurrentUser();
        if (user && user.role === "client") return;
        event.preventDefault();

        if (user) {
          Auth.showNotice("Akun admin tidak dapat memakai fitur belanja. Masuk dengan akun client.");
          return;
        }
        // Tujuan login hanya halaman internal; link luar (mis. WhatsApp) kembali ke halaman ini
        var href = link.getAttribute("href") || "";
        var target = /^[a-z0-9_-]+\.html(\?[a-z0-9_=&.%-]*)?$/i.test(href) ? href : Auth.currentPath();
        window.location.href = Auth.loginUrl(target);
      });
    });
  }

  // Menu hamburger (layar <= 1024px): buka/tutup panel navigasi
  function bindNavToggle() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;

    function setOpen(open) {
      nav.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".site-header")) setOpen(false);
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1024) setOpen(false);
    });
  }

  function loadPartial(slot) {
    var name = slot.getAttribute("data-include");
    var url = PARTIALS[name];
    if (!url) return Promise.resolve();

    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Gagal memuat " + url);
        return res.text();
      })
      .then(function (html) {
        slot.outerHTML = html;
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // Pemeriksaan dilakukan setiap halaman dibuka (bukan hanya saat menu diklik)
    if (!checkAccess()) return;

    var slots = document.querySelectorAll("[data-include]");
    Promise.all(Array.prototype.map.call(slots, loadPartial)).then(function () {
      markActiveNav();
      applyAuthState();
      bindLogout();
      bindProfilePanel();
      guardLoginLinks();
      bindNavToggle();
      Auth.showDeniedFromQuery();
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    });
  });

  // Badge keranjang ikut berubah (tab yang sama maupun tab lain)
  document.addEventListener("slCartChanged", updateCartBadge);
  window.addEventListener("storage", function (event) {
    if (event.key === "sl_cart_changed") updateCartBadge();
  });

  // Tombol Back setelah logout: halaman dari cache back/forward diperiksa ulang
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) checkAccess();
  });

  // Logout/login di tab lain: halaman terlindungi ikut diperiksa ulang
  window.addEventListener("storage", function (event) {
    if (event.key === Auth.SESSION_KEY || event.key === null) {
      if (checkAccess()) applyAuthState();
    }
  });
})();
