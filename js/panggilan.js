/* ==========================================================================
   js/panggilan.js — Form panggil montir → kirim via WhatsApp
   - Ambil nomor & format pesan dari API config
   - Validasi semua field
   - Buka wa.me dengan pesan terisi otomatis
   ========================================================================== */

(function () {
  "use strict";

  var CONFIG_API = "/kayang/api/config.php";

  var form    = document.querySelector(".call-form");
  var btnSend = form ? form.querySelector(".btn-send") : null;
  if (!form || !btnSend) return;

  var config = null; // diisi setelah fetch

  // ── Muat config dari API ──────────────────────────────────────────────────
  fetch(CONFIG_API)
    .then(function (res) { return res.json(); })
    .then(function (json) {
      if (json.ok) config = json.data;
    })
    .catch(function () {
      // Fallback ke nomor default bila API tidak tersedia
      config = { wa_number: "62895326202002", format_panggilan: null };
    });

  // ── Error helpers ─────────────────────────────────────────────────────────
  function setError(input, msg) {
    var id    = input.id + "-error";
    var errEl = document.getElementById(id);
    if (!errEl) return;
    if (msg) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", id);
      errEl.textContent = msg;
      errEl.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      errEl.hidden = true;
    }
  }

  function clearAllErrors() {
    ["nama", "alamat", "motor", "keluhan"].forEach(function (name) {
      var el = form.elements[name];
      if (el) setError(el, "");
    });
  }

  // ── Live clear ────────────────────────────────────────────────────────────
  ["nama", "alamat", "motor", "keluhan"].forEach(function (name) {
    var el = form.elements[name];
    if (el) {
      el.addEventListener("input", function () { setError(el, ""); });
    }
  });

  // ── Validasi ──────────────────────────────────────────────────────────────
  function validate() {
    var first = null;

    function check(name, msg) {
      var el = form.elements[name];
      setError(el, msg);
      if (msg && !first) first = el;
    }

    check("nama",    form.elements.nama.value.trim()    ? "" : "Nama lengkap wajib diisi.");
    check("alamat",  form.elements.alamat.value.trim()  ? "" : "Alamat / lokasi wajib diisi.");
    check("motor",   form.elements.motor.value.trim()   ? "" : "Jenis motor wajib diisi.");
    check("keluhan", form.elements.keluhan.value.trim() ? "" : "Keluhan wajib diisi.");

    if (first) first.focus();
    return !first;
  }

  // ── Build pesan WA ────────────────────────────────────────────────────────
  function buildMessage() {
    var nama    = form.elements.nama.value.trim();
    var alamat  = form.elements.alamat.value.trim();
    var motor   = form.elements.motor.value.trim();
    var keluhan = form.elements.keluhan.value.trim();

    var template = (config && config.format_panggilan)
      ? config.format_panggilan
      : "Halo Admin Sumber Lancar, saya ingin memanggil montir:\n\nNama: {nama}\nLokasi: {alamat}\nJenis Motor: {motor}\nKeluhan: {keluhan}\n\nMohon segera dibantu. Terima kasih.";

    return template
      .replace(/\{nama\}/g,    nama)
      .replace(/\{alamat\}/g,  alamat)
      .replace(/\{motor\}/g,   motor)
      .replace(/\{keluhan\}/g, keluhan);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearAllErrors();
    if (!validate()) return;

    var number  = (config && config.wa_number) ? config.wa_number : "62895326202002";
    var message = buildMessage();
    var url     = "https://wa.me/" + number + "?text=" + encodeURIComponent(message);

    window.open(url, "_blank", "noopener");
  });
})();
