/* ==========================================================================
   login.js - halaman Login Admin

   PENTING (sebelum deploy): login di bawah ini hanya TIRUAN untuk keperluan
   tampilan. Ia menerima isian apa pun yang tidak kosong dan hanya menyimpan
   penanda di localStorage, sehingga TIDAK MEMBERIKAN KEAMANAN APA PUN.
   Ganti bagian "verifikasi" dengan pemanggilan ke backend (sesi/token),
   dan lindungi data admin di sisi server.
   ========================================================================== */

(function () {
  "use strict";

  var DEFAULT_PAGE = "index.html";
  var form = document.getElementById("login-form");
  if (!form || !window.SLAdmin) return;

  var userField = form.elements.user;
  var passField = form.elements.pass;
  var notice = document.getElementById("login-notice");
  var toggle = document.getElementById("login-toggle");
  var params = new URLSearchParams(window.location.search);

  // Tujuan setelah login. Hanya halaman admin lokal yang diizinkan
  // (mencegah pengalihan ke situs lain lewat ?next=...)
  function safeNext() {
    var next = params.get("next") || "";
    var ok = /^[a-z0-9_-]+\.html(\?[a-z0-9_=&.-]*)?$/i.test(next) && next.indexOf("login.html") !== 0;
    return ok ? next : DEFAULT_PAGE;
  }

  // Sudah login: tidak perlu melihat halaman ini
  if (window.SLAdmin.isLoggedIn()) {
    window.location.replace(DEFAULT_PAGE);
    return;
  }

  if (params.get("required") === "1") notice.hidden = false;

  function setError(field, message) {
    var error = document.getElementById("login-" + field.name + "-error");
    if (message) {
      field.setAttribute("aria-invalid", "true");
      field.setAttribute("aria-describedby", error.id);
      error.textContent = message;
      error.hidden = false;
    } else {
      field.removeAttribute("aria-invalid");
      field.removeAttribute("aria-describedby");
      error.hidden = true;
    }
  }

  [userField, passField].forEach(function (field) {
    field.addEventListener("input", function () {
      setError(field, "");
    });
  });

  toggle.addEventListener("click", function () {
    var show = passField.type === "password";
    passField.type = show ? "text" : "password";
    toggle.textContent = show ? "Sembunyikan" : "Tampilkan";
    toggle.setAttribute("aria-pressed", show ? "true" : "false");
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var userOk = userField.value.trim() !== "";
    var passOk = passField.value !== "";
    setError(userField, userOk ? "" : "Username atau email wajib diisi.");
    setError(passField, passOk ? "" : "Password wajib diisi.");

    if (!userOk) { userField.focus(); return; }
    if (!passOk) { passField.focus(); return; }

    // --- TIRUAN: ganti dengan verifikasi ke backend ---
    window.SLAdmin.login();
    window.location.href = safeNext();
  });
})();
