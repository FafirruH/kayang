/* ==========================================================================
   wa.js - halaman Config WA
   - Pratinjau pesan WhatsApp langsung saat mengetik
     ({items}, {total}, {invoice} diganti data contoh)
   - Validasi nomor, nama, dan format invoice sebelum menyimpan
   Penyimpanan ke backend belum tersambung (menyusul).
   ========================================================================== */

(function () {
  "use strict";

  // Data contoh untuk pratinjau (sama dengan INV-1024 di halaman pesanan)
  var SAMPLE = {
    items: "- Oli Mesin Yamalube 1L x2\n- Busi NGK CPR9EA x1",
    total: "Rp 135.000",
    invoice: "INV-1024"
  };
  var KNOWN_PLACEHOLDERS = ["items", "total", "invoice"];

  var form = document.getElementById("wa-form");
  if (!form) return;

  var phone = form.elements.nomor;
  var name = form.elements.nama;
  var template = form.elements.format;
  var previewTo = document.getElementById("wa-preview-to");
  var previewBody = document.getElementById("wa-preview-body");
  var status = document.getElementById("wa-status");

  function fillTemplate(text) {
    return text.replace(/\{(\w+)\}/g, function (match, key) {
      return Object.prototype.hasOwnProperty.call(SAMPLE, key) ? SAMPLE[key] : match;
    });
  }

  // Hapus spasi, tanda hubung, tanda kurung, dan awalan +
  function cleanPhone(value) {
    return value.replace(/[\s\-().+]/g, "");
  }

  function updatePreview() {
    var number = phone.value.trim();
    var recipient = name.value.trim();
    var head = [number || "Nomor belum diisi", recipient || "Nama belum diisi"];
    previewTo.textContent = head.join(" · ");
    previewBody.textContent = template.value.trim()
      ? fillTemplate(template.value)
      : "Format invoice masih kosong.";
  }

  function setError(field, message) {
    var error = document.getElementById("wa-" + field.name + "-error");
    if (message) {
      field.setAttribute("aria-invalid", "true");
      error.textContent = message;
      error.hidden = false;
    } else {
      field.removeAttribute("aria-invalid");
      error.hidden = true;
    }
  }

  function unknownPlaceholders(text) {
    var found = [];
    text.replace(/\{(\w+)\}/g, function (match, key) {
      if (KNOWN_PLACEHOLDERS.indexOf(key) === -1 && found.indexOf(match) === -1) found.push(match);
      return match;
    });
    return found;
  }

  function validate() {
    var firstInvalid = null;
    function check(field, message) {
      setError(field, message);
      if (message && !firstInvalid) firstInvalid = field;
    }

    var number = cleanPhone(phone.value);
    check(phone, /^(08|62)\d{8,12}$/.test(number)
      ? ""
      : "Masukkan nomor WhatsApp yang valid, misalnya 081234567890 atau 6281234567890.");

    check(name, name.value.trim() ? "" : "Nama penerima wajib diisi.");

    var text = template.value.trim();
    var unknown = unknownPlaceholders(text);
    if (!text) {
      check(template, "Format invoice wajib diisi.");
    } else if (unknown.length) {
      check(template, "Placeholder tidak dikenal: " + unknown.join(", ") + ". Gunakan {items}, {total}, atau {invoice}.");
    } else {
      check(template, "");
    }

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  [phone, name, template].forEach(function (field) {
    field.addEventListener("input", function () {
      setError(field, "");
      status.hidden = true;
      updatePreview();
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validate()) {
      status.hidden = true;
      return;
    }
    phone.value = cleanPhone(phone.value); // simpan dalam bentuk angka saja
    updatePreview();
    status.className = "form-status form-status--ok";
    status.textContent = "Konfigurasi tersimpan. (Contoh: belum tersambung ke server.)";
    status.hidden = false;
  });

  updatePreview();
})();
