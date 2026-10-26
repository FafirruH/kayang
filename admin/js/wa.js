/* ==========================================================================
   admin/js/wa.js — Config WA (tersambung ke api/config.php)
   - Load config saat halaman dibuka
   - Pratinjau pesan pesanan & panggilan montir langsung saat mengetik
   - Simpan ke API saat submit
   ========================================================================== */

(function () {
  "use strict";

  var API = "/kayang/api/config.php";

  // Data contoh untuk pratinjau
  var SAMPLE_PESANAN = {
    items:   "- Oli Mesin Yamalube 1L x2\n- Busi NGK CPR9EA x1",
    total:   "Rp 135.000",
    invoice: "INV-1024",
  };
  var SAMPLE_PANGGILAN = {
    nama:    "Budi Santoso",
    alamat:  "Jl. Melati No. 5, Malang",
    motor:   "Honda Beat 2022",
    keluhan: "Motor tidak bisa distarter, bunyi klik saja",
  };

  var PLACEHOLDERS_PESANAN   = ["items", "total", "invoice"];
  var PLACEHOLDERS_PANGGILAN = ["nama", "alamat", "motor", "keluhan"];

  var form = document.getElementById("wa-form");
  if (!form) return;

  var elNomor     = form.elements.nomor;
  var elNama      = form.elements.nama;
  var elFormat    = form.elements.format;
  var elFormatPanggil = form.elements.format_panggilan;
  var elStatus    = document.getElementById("wa-status");
  var elPreviewTo = document.getElementById("wa-preview-to");
  var elPreviewBody        = document.getElementById("wa-preview-body");
  var elPreviewPanggilBody = document.getElementById("wa-preview-panggil-body");

  // ── Template fill ─────────────────────────────────────────────────────────
  function fillTemplate(text, sample) {
    return text.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(sample, key) ? sample[key] : match;
    });
  }

  // ── Pratinjau ─────────────────────────────────────────────────────────────
  function updatePreview() {
    var number    = elNomor.value.trim();
    var recipient = elNama.value.trim();
    if (elPreviewTo) {
      elPreviewTo.textContent = [number || "Nomor belum diisi", recipient || "Nama belum diisi"].join(" · ");
    }
    if (elPreviewBody) {
      elPreviewBody.textContent = elFormat.value.trim()
        ? fillTemplate(elFormat.value, SAMPLE_PESANAN)
        : "Format pesanan masih kosong.";
    }
    if (elPreviewPanggilBody && elFormatPanggil) {
      elPreviewPanggilBody.textContent = elFormatPanggil.value.trim()
        ? fillTemplate(elFormatPanggil.value, SAMPLE_PANGGILAN)
        : "Format panggilan masih kosong.";
    }
  }

  // ── Error helpers ─────────────────────────────────────────────────────────
  function setError(field, message) {
    var errId = "wa-" + field.name + "-error";
    var errEl = document.getElementById(errId);
    if (!errEl) return;
    if (message) {
      field.setAttribute("aria-invalid", "true");
      errEl.textContent = message;
      errEl.hidden = false;
    } else {
      field.removeAttribute("aria-invalid");
      errEl.hidden = true;
    }
  }

  function cleanPhone(value) {
    return value.replace(/[\s\-().+]/g, "");
  }

  function unknownPlaceholders(text, known) {
    var found = [];
    text.replace(/\{(\w+)\}/g, function (match, key) {
      if (known.indexOf(key) === -1 && found.indexOf(match) === -1) found.push(match);
      return match;
    });
    return found;
  }

  // ── Validasi ──────────────────────────────────────────────────────────────
  function validate() {
    var firstInvalid = null;

    function check(field, message) {
      setError(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    }

    var number = cleanPhone(elNomor.value);
    check(elNomor, /^(08|62)\d{8,13}$/.test(number)
      ? "" : "Masukkan nomor WhatsApp yang valid, misalnya 081234567890 atau 6281234567890.");

    check(elNama, elNama.value.trim() ? "" : "Nama penerima wajib diisi.");

    var textPesanan = elFormat.value.trim();
    var unknownP    = unknownPlaceholders(textPesanan, PLACEHOLDERS_PESANAN);
    if (!textPesanan) {
      check(elFormat, "Format pesanan wajib diisi.");
    } else if (unknownP.length) {
      check(elFormat, "Placeholder tidak dikenal: " + unknownP.join(", ") + ". Gunakan {items}, {total}, atau {invoice}.");
    } else {
      check(elFormat, "");
    }

    if (elFormatPanggil) {
      var textPanggil  = elFormatPanggil.value.trim();
      var unknownPangg = unknownPlaceholders(textPanggil, PLACEHOLDERS_PANGGILAN);
      if (!textPanggil) {
        check(elFormatPanggil, "Format panggilan wajib diisi.");
      } else if (unknownPangg.length) {
        check(elFormatPanggil, "Placeholder tidak dikenal: " + unknownPangg.join(", ") +
          ". Gunakan {nama}, {alamat}, {motor}, atau {keluhan}.");
      } else {
        check(elFormatPanggil, "");
      }
    }

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // ── Load config dari API ──────────────────────────────────────────────────
  function loadConfig() {
    fetch(API)
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.ok) return;
        var c = json.data;
        elNomor.value  = c.wa_number  || "";
        elNama.value   = c.wa_nama    || "";
        elFormat.value = c.format_pesanan || "";
        if (elFormatPanggil) elFormatPanggil.value = c.format_panggilan || "";
        updatePreview();
      })
      .catch(function () {
        // Biarkan nilai default di HTML tetap
        updatePreview();
      });
  }

  // ── Live update pratinjau ─────────────────────────────────────────────────
  var liveFields = [elNomor, elNama, elFormat];
  if (elFormatPanggil) liveFields.push(elFormatPanggil);

  liveFields.forEach(function (field) {
    field.addEventListener("input", function () {
      setError(field, "");
      elStatus.hidden = true;
      updatePreview();
    });
  });

  // ── Submit → simpan ke API ────────────────────────────────────────────────
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    elStatus.hidden = true;
    if (!validate()) return;

    var payload = {
      wa_number:        cleanPhone(elNomor.value),
      wa_nama:          elNama.value.trim(),
      format_pesanan:   elFormat.value,
      format_panggilan: elFormatPanggil ? elFormatPanggil.value : undefined,
    };

    var submitBtn = form.querySelector("[type=submit]");
    if (submitBtn) submitBtn.disabled = true;

    fetch(API, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (submitBtn) submitBtn.disabled = false;
        if (!json.ok) throw new Error(json.message || "Gagal menyimpan.");
        elNomor.value = json.data.wa_number; // simpan bentuk bersih
        updatePreview();
        elStatus.className   = "form-status form-status--ok";
        elStatus.textContent = "Konfigurasi tersimpan.";
        elStatus.hidden      = false;
      })
      .catch(function (err) {
        if (submitBtn) submitBtn.disabled = false;
        elStatus.className   = "form-status form-status--error";
        elStatus.textContent = "Gagal menyimpan: " + err.message;
        elStatus.hidden      = false;
      });
  });

  loadConfig();
})();
