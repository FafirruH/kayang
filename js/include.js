/* ==========================================================================
   include.js - dipakai halaman client DAN admin (muat setelah js/auth.js)
   - Memuat partials/header.html dan partials/footer.html
   - Menandai menu aktif berdasarkan <body data-page="...">
   - Kontrol akses halaman lewat <body data-auth="admin|client">
     (logika ada di js/auth.js; ini simulasi frontend, bukan keamanan server)
   - Link [data-requires-login] (fitur client): belum login -> login.html,
     admin -> pemberitahuan
   - Tombol [data-logout] menghapus sesi bersama
   - Status akun di header client ([data-auth-*]) dan [data-client-only]
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
    var links = document.querySelectorAll('.nav-link[data-nav="' + page + '"]');
    links.forEach(function (link) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    });
  }

  function setHidden(selector, hidden) {
    document.querySelectorAll(selector).forEach(function (el) { el.hidden = hidden; });
  }

  // Header client: Login / (nama akun + Dashboard Admin + Logout)
  function applyAuthState() {
    var user = Auth.getCurrentUser();
    setHidden("[data-auth-login]", !!user);
    setHidden("[data-auth-user]", !user);
    setHidden("[data-auth-logout]", !user);
    setHidden("[data-auth-admin]", !user || user.role !== "admin");
    setHidden("[data-client-only]", !!user && user.role === "admin");

    var label = document.querySelector("[data-auth-user]");
    if (label && user) label.textContent = user.name;
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
      guardLoginLinks();
      bindNavToggle();
      Auth.showDeniedFromQuery();
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    });
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
