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
      var username = loginForm.elements.username;
      var password = loginForm.elements.password;

      if (username.value.trim() === "" || password.value === "") {
        showMessage("Username/email dan password wajib diisi.", "error");
        (username.value.trim() === "" ? username : password).focus();
        return;
      }

      var result = Auth.login(username.value, password.value);
      if (!result.ok) {
        // Username tetap terisi; hanya password dikosongkan
        showMessage(result.error, "error");
        password.value = "";
        password.focus();
        return;
      }
      Auth.redirectAfterLogin(result.user, params.get("next"));
    });
  }

  /* ---------- Register (selalu role client) ---------- */
  var registerForm = document.getElementById("register-form");
  if (registerForm) {
    ["username", "password", "password2"].forEach(function (name) {
      registerForm.elements[name].addEventListener("input", function () {
        setFieldError(name, "");
      });
    });

    registerForm.addEventListener("submit", function (event) {
      event.preventDefault();
      message.hidden = true;
      ["username", "password", "password2"].forEach(function (name) { setFieldError(name, ""); });

      var result = Auth.registerClient({
        username: registerForm.elements.username.value,
        password: registerForm.elements.password.value,
        password2: registerForm.elements.password2.value
      });

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
