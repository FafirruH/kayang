/* ==========================================================================
   include.js (Admin)
   - Memuat partials/header.html dan partials/footer.html ke setiap halaman
   - Menandai menu aktif berdasarkan <body data-page="...">
   - Melindungi halaman bertanda <body data-auth="required">: bila admin belum
     login, dialihkan ke login.html (sementara memakai localStorage sebagai tiruan,
     nanti diganti sesi/token dari backend)
   - Tombol [data-logout] menghapus status login lalu kembali ke login.html
   - Menu hamburger di layar kecil (tombol .nav-toggle, panel #site-nav)

   CATATAN: fetch() tidak jalan bila halaman dibuka lewat file://
   Jalankan lewat server lokal, misalnya ekstensi "Live Server" di VS Code
   atau perintah:  python -m http.server
   ========================================================================== */

(function () {
  "use strict";

  var PARTIALS = {
    header: "partials/header.html",
    footer: "partials/footer.html"
  };

  var LOGIN_PAGE = "login.html";
  var AUTH_KEY = "sl_admin_logged_in";

  function isLoggedIn() {
    try {
      return localStorage.getItem(AUTH_KEY) === "true";
    } catch (e) {
      return false;
    }
  }

  function setLoggedIn(value) {
    try {
      if (value) {
        localStorage.setItem(AUTH_KEY, "true");
      } else {
        localStorage.removeItem(AUTH_KEY);
      }
    } catch (e) {
      /* penyimpanan tidak tersedia, abaikan */
    }
  }

  // Dipakai halaman login (tahap berikutnya): window.SLAdmin.login() / logout()
  window.SLAdmin = {
    isLoggedIn: isLoggedIn,
    login: function () { setLoggedIn(true); },
    logout: function () { setLoggedIn(false); }
  };

  function markActiveNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    var links = document.querySelectorAll('.nav-link[data-nav="' + page + '"]');
    links.forEach(function (link) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    });
  }

  function bindLogout() {
    var buttons = document.querySelectorAll("[data-logout]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function (event) {
        event.preventDefault();
        setLoggedIn(false);
        window.location.href = LOGIN_PAGE;
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

    // Tutup bila menekan Escape, mengklik di luar header, atau memilih menu
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".site-header")) setOpen(false);
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setOpen(false);
    });

    // Layar kembali lebar: pastikan keadaan bersih
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
    // Halaman bertanda <body data-auth="required"> hanya untuk admin yang sudah login
    if (document.body.getAttribute("data-auth") === "required" && !isLoggedIn()) {
      var current = (window.location.pathname.split("/").pop() || "index.html") + window.location.search;
      window.location.replace(LOGIN_PAGE + "?required=1&next=" + encodeURIComponent(current));
      return;
    }
    // Lolos pemeriksaan: tampilkan halaman (sebelumnya disembunyikan lewat CSS agar tidak berkedip)
    document.body.classList.add("is-authed");

    var slots = document.querySelectorAll("[data-include]");
    Promise.all(Array.prototype.map.call(slots, loadPartial)).then(function () {
      markActiveNav();
      bindLogout();
      bindNavToggle();
      document.dispatchEvent(new CustomEvent("partials:loaded"));
    });
  });
})();
