/* ==========================================================================
   include.js
   - Memuat partials/header.html dan partials/footer.html ke setiap halaman
   - Menandai menu aktif berdasarkan <body data-page="...">
   - Mengalihkan link bertanda [data-requires-login] ke halaman login
     bila pengguna belum login (sementara memakai localStorage sebagai tiruan)

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

  function isLoggedIn() {
    try {
      return localStorage.getItem("sl_logged_in") === "true";
    } catch (e) {
      return false;
    }
  }

  function markActiveNav() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    var link = document.querySelector('.nav-link[data-nav="' + page + '"]');
    if (link) link.classList.add("is-active");
  }

  function guardLoginLinks() {
    var links = document.querySelectorAll("[data-requires-login]");
    links.forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (isLoggedIn()) return;
        event.preventDefault();
        var target = link.getAttribute("href") || "";
        window.location.href = "login.html?required=1&next=" + encodeURIComponent(target);
      });
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
    // Halaman bertanda <body data-auth="required"> hanya untuk pengguna yang sudah login
    if (document.body.getAttribute("data-auth") === "required" && !isLoggedIn()) {
      var current = window.location.pathname.split("/").pop() || "index.html";
      window.location.replace("login.html?required=1&next=" + encodeURIComponent(current));
      return;
    }

    var slots = document.querySelectorAll("[data-include]");
    Promise.all(Array.prototype.map.call(slots, loadPartial)).then(function () {
      markActiveNav();
      guardLoginLinks();
    });
  });
})();
