/* ==========================================================================
   pengaturan-akun.js - halaman Pengaturan Akun (khusus client)
   Alur: isi form -> Konfirmasi -> popup verifikasi password -> PATCH /api/auth/me
   Cadangan: bila backend tidak tersedia, memakai akun simulasi di js/auth.js.
   ========================================================================== */

(function () {
  "use strict";

  var Auth = window.SLAuth;
  var form = document.getElementById("config-form");
  if (!form) return;

  var message = document.getElementById("auth-msg");
  var FIELDS = ["username", "nama_lengkap", "no_telepon", "password"];
  var original = { username: "", nama_lengkap: "", no_telepon: "" };

  var modal = document.getElementById("verify-modal");
  var verifyForm = document.getElementById("verify-form");
  var verifyInput = document.getElementById("verify-password");
  var verifyError = document.getElementById("verify-error");
  var verifySubmit = document.getElementById("verify-submit");
  var verifyCancel = document.getElementById("verify-cancel");
  var pending = null;        // perubahan yang menunggu verifikasi
  var lastFocus = null;

  /* ---------- Util tampilan ---------- */
  function showMessage(text, type) {
    message.textContent = text;
    message.className = "auth-msg auth-msg--" + type;
    message.hidden = !text;
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

  FIELDS.forEach(function (name) {
    form.elements[name].addEventListener("input", function () { setFieldError(name, ""); });
  });

  /* ---------- Isi form dengan data akun ---------- */
  function fill(data) {
    original = {
      username: data.username || "",
      nama_lengkap: data.nama_lengkap || "",
      no_telepon: data.no_telepon || ""
    };
    form.elements.username.value = original.username;
    form.elements.nama_lengkap.value = original.nama_lengkap;
    form.elements.no_telepon.value = original.no_telepon;
    form.elements.password.value = "";
  }

  function loadProfile() {
    var local = Auth.getProfile && Auth.getProfile();
    if (local) fill(local);
    if (!window.SLApi) return;
    SLApi.get("/api/auth/me").then(function (res) {
      if (res && res.data && res.data.username) fill(res.data);
    }).catch(function () { /* tetap pakai data lokal */ });
  }

  /* ---------- Validasi & perubahan ---------- */
  function collectChanges() {
    var values = {
      username: form.elements.username.value.trim(),
      nama_lengkap: form.elements.nama_lengkap.value.trim(),
      no_telepon: form.elements.no_telepon.value.trim(),
      password: form.elements.password.value
    };
    var ok = true;
    function fail(name, text) { setFieldError(name, text); if (ok) form.elements[name].focus(); ok = false; }

    if (values.username.length < 3 || values.username.length > 50) fail("username", "Username 3-50 karakter.");
    else if (!/^[A-Za-z0-9_.]+$/.test(values.username)) fail("username", "Username hanya boleh huruf, angka, titik, atau garis bawah.");
    if (values.nama_lengkap.length < 2 || values.nama_lengkap.length > 100) fail("nama_lengkap", "Nama lengkap 2-100 karakter.");
    if (!/^(08|62)\d{8,13}$/.test(values.no_telepon.replace(/[\s\-().+]/g, ""))) fail("no_telepon", "Masukkan nomor WhatsApp yang valid, contoh: 081234567890.");
    if (values.password !== "" && (values.password.length < 6 || values.password.length > 72)) fail("password", "Password baru 6-72 karakter.");
    if (!ok) return null;

    var changes = {};
    if (values.username.toLowerCase() !== original.username.toLowerCase()) changes.username = values.username;
    if (values.nama_lengkap !== original.nama_lengkap) changes.nama_lengkap = values.nama_lengkap;
    if (values.no_telepon !== original.no_telepon) changes.no_telepon = values.no_telepon;
    if (values.password !== "") changes.password = values.password;
    return changes;
  }

  /* ---------- Popup verifikasi ---------- */
  function openModal() {
    lastFocus = document.activeElement;
    verifyInput.value = "";
    verifyError.hidden = true;
    verifyInput.removeAttribute("aria-invalid");
    modal.hidden = false;
    verifyInput.focus();
  }

  function closeModal() {
    modal.hidden = true;
    pending = null;
    verifyInput.value = "";
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  function modalError(text) {
    verifyError.textContent = text;
    verifyError.hidden = !text;
    if (text) verifyInput.setAttribute("aria-invalid", "true");
    else verifyInput.removeAttribute("aria-invalid");
  }

  verifyCancel.addEventListener("click", closeModal);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (event) {
    if (modal.hidden) return;
    if (event.key === "Escape") { closeModal(); return; }
    if (event.key === "Tab") {     // fokus tetap di dalam popup
      var items = modal.querySelectorAll("input, button");
      var first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Simpan ---------- */
  function afterSaved(data) {
    // Samakan sesi di browser agar navbar langsung memakai username/nama baru
    try {
      var raw = localStorage.getItem(Auth.SESSION_KEY);
      var session = raw ? JSON.parse(raw) : null;
      if (session && session.source === "backend") {
        session.username = data.username || session.username;
        session.name = data.nama_lengkap || session.name;
        localStorage.setItem(Auth.SESSION_KEY, JSON.stringify(session));
      }
    } catch (e) { /* abaikan */ }

    closeModal();
    fill({
      username: data.username || original.username,
      nama_lengkap: data.nama_lengkap || original.nama_lengkap,
      no_telepon: data.no_telepon || original.no_telepon
    });
    showMessage("Perubahan akun berhasil disimpan.", "ok");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleFieldErrors(details) {
    var shown = false;
    Object.keys(details || {}).forEach(function (key) {
      if (key === "current_password") { modalError(String(details[key])); shown = true; }
    });
    return shown;
  }

  verifyForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!pending) return;
    var current = verifyInput.value;
    if (current === "") { modalError("Password wajib diisi."); verifyInput.focus(); return; }

    modalError("");
    verifySubmit.disabled = true;
    verifySubmit.textContent = "Memverifikasi...";

    function done() {
      verifySubmit.disabled = false;
      verifySubmit.textContent = "Verifikasi";
    }

    // Backend (PostgreSQL) dulu
    if (window.SLApi) {
      var body = { current_password: current };
      Object.keys(pending).forEach(function (k) { body[k] = pending[k]; });

      SLApi.patch("/api/auth/me", body)
        .then(function (res) {
          done();
          afterSaved(res.data || {});
        })
        .catch(function (err) {
          done();
          if (err && err.status === 422 && err.details) {
            if (handleFieldErrors(err.details)) { verifyInput.focus(); return; }
            // Galat field lain (mis. username sudah dipakai): tutup popup, tampilkan di form
            var details = err.details;
            closeModal();
            Object.keys(details).forEach(function (key) {
              if (FIELDS.indexOf(key) !== -1) setFieldError(key, String(details[key]));
            });
            showMessage(err.message || "Data tidak valid.", "error");
            return;
          }
          if (err && err.status === 0 && Auth.updateProfile) {
            // Backend tidak terjangkau: coba akun simulasi lokal
            var local = Auth.updateProfile(current, pending);
            if (local.ok) { afterSaved(pending); return; }
            modalError(local.error);
            return;
          }
          if (err && err.status === 401) { window.location.replace(Auth.loginUrl(Auth.currentPath())); return; }
          modalError(err && err.message ? err.message : "Gagal menyimpan. Coba lagi.");
        });
      return;
    }

    var local = Auth.updateProfile(current, pending);
    done();
    if (local.ok) afterSaved(pending);
    else modalError(local.error);
  });

  /* ---------- Tombol Konfirmasi ---------- */
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    showMessage("", "info");
    FIELDS.forEach(function (name) { setFieldError(name, ""); });

    var changes = collectChanges();
    if (changes === null) return;
    if (Object.keys(changes).length === 0) {
      showMessage("Belum ada data yang diubah.", "info");
      return;
    }
    pending = changes;
    openModal();
  });

  loadProfile();
})();
