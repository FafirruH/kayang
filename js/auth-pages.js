/* ==========================================================================
   auth-pages.js - form login.html dan register.html (memakai js/auth.js)
   Simulasi frontend: tidak aman untuk produksi (lihat README.md).
   ========================================================================== */

(function () {
  "use strict";

  var Auth = window.SLAuth;
  var params = new URLSearchParams(window.location.search);
  var message = document.getElementById("auth-msg");

  // Sudah login: tidak perlu melihat halaman ini
  var current = Auth.getCurrentUser();
  if (current) {
    Auth.redirectAfterLogin(current, params.get("next"));
    return;
  }

  function showMessage(text, type) {
    message.textContent = text;
    message.className = "auth-msg auth-msg--" + type;
    message.hidden = false;
  }

  function setFieldError(name, text) {
    var input = document.getElementById(name);
    var error = document.getElementById(name + "-error");
    if (!input || !error) return;
    if (text) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
      error.textContent = text;
      error.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      error.hidden = true;
    }
  }

  /* ---------- Login ---------- */
  var loginForm = document.getElementById("login-form");
  if (loginForm) {
    if (params.get("registered") === "1") {
      showMessage("Akun berhasil dibuat. Silakan masuk.", "ok");
    } else if (params.get("required") === "1") {
      showMessage("Silakan masuk untuk melanjutkan.", "info");
    }

    loginForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var usernameEl = loginForm.elements.username;
      var passwordEl = loginForm.elements.password;
      var submitBtn  = loginForm.querySelector("[type=submit]");

      if (usernameEl.value.trim() === "" || passwordEl.value === "") {
        showMessage("Username dan password wajib diisi.", "error");
        (usernameEl.value.trim() === "" ? usernameEl : passwordEl).focus();
        return;
      }

      // Coba login ke backend dulu (cookie session)
      if (window.SLApi) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Masuk...";

        SLApi.post("/api/auth/login", {
          username: usernameEl.value.trim(),
          password: passwordEl.value
        })
        .then(function (res) {
          // Sinkronisasi ke localStorage agar auth.js frontend juga kenal sesi ini
          var u = res.data || res;
          var frontendRole = (u.role === "ADMIN" || u.role === "MECHANIC") ? "admin" : "client";
          try {
            localStorage.setItem(Auth.SESSION_KEY, JSON.stringify({
              username: u.username,
              name: u.nama_lengkap || u.username,
              role: frontendRole,
              source: "backend"
            }));
          } catch (e) { /* abaikan */ }

          var user = { username: u.username, name: u.nama_lengkap || u.username, role: frontendRole };
          Auth.redirectAfterLogin(user, params.get("next"));
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Login";
          passwordEl.value = "";
          passwordEl.focus();
          var msg = err && err.status === 401
            ? "Username atau password salah."
            : err && err.status === 0
              ? "Gagal terhubung ke server. Periksa koneksi lalu coba lagi."
              : err && err.message
                ? err.message
                : "Login gagal. Coba lagi.";
          showMessage(msg, "error");
        });

        return;
      }

      // Fallback: simulasi localStorage (jika backend tidak tersedia)
      var result = Auth.login(usernameEl.value, passwordEl.value);
      if (!result.ok) {
        showMessage(result.error, "error");
        passwordEl.value = "";
        passwordEl.focus();
        return;
      }
      Auth.redirectAfterLogin(result.user, params.get("next"));
    });
  }

  /* ---------- Register (selalu role client) ---------- */
  var registerForm = document.getElementById("register-form");
  if (registerForm) {
    ["username", "password", "password2", "no_whatsapp"].forEach(function (name) {
      registerForm.elements[name].addEventListener("input", function () {
        setFieldError(name, "");
      });
    });

    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      message.hidden = true;
      ["username", "password", "password2", "no_whatsapp"].forEach(function (name) { setFieldError(name, ""); });

      var username    = registerForm.elements.username.value.trim();
      var password    = registerForm.elements.password.value;
      var password2   = registerForm.elements.password2.value;
      var no_whatsapp = registerForm.elements.no_whatsapp.value.trim();

      // Validasi dasar di frontend sebelum kirim
      if (username.length < 3) { setFieldError("username", "Username minimal 3 karakter."); registerForm.elements.username.focus(); return; }
      if (password.length < 6) { setFieldError("password", "Password minimal 6 karakter."); registerForm.elements.password.focus(); return; }
      if (password !== password2) { setFieldError("password2", "Konfirmasi password tidak cocok."); registerForm.elements.password2.focus(); return; }
      if (!/^(08|62)\d{8,13}$/.test(no_whatsapp.replace(/[\s\-().+]/g, ""))) {
        setFieldError("no_whatsapp", "Masukkan nomor WhatsApp yang valid, contoh: 081234567890.");
        registerForm.elements.no_whatsapp.focus();
        return;
      }

      var submitBtn = registerForm.querySelector("[type=submit]");

      // Daftar ke backend (PostgreSQL) bila SLApi tersedia
      if (window.SLApi) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Mendaftar...";

        SLApi.post("/api/auth/register", {
          username:     username,
          password:     password,
          password2:    password2,
          nama_lengkap: username,
          no_telepon:   no_whatsapp
        })
        .then(function () {
          window.location.href = "login.html?registered=1";
        })
        .catch(function (err) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Register";
          var msg = err && err.status === 422 && err.details
            ? Object.values(err.details).join(" ")
            : (err && err.message ? err.message : "Gagal mendaftar. Coba lagi.");
          showMessage(msg, "error");
        });
        return;
      }

      // Fallback: simpan ke localStorage (jika backend tidak tersedia)
      var result = Auth.registerClient({ username: username, password: password, password2: password2, no_whatsapp: no_whatsapp });
      if (!result.ok) {
        if (result.field) {
          setFieldError(result.field, result.error);
          registerForm.elements[result.field].focus();
        } else {
          showMessage(result.error, "error");
        }
        return;
      }
      window.location.href = "login.html?registered=1";
    });
  }
})();
