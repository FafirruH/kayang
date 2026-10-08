/* ==========================================================================
   stok-form.js - form tambah / edit barang
   - stok-form.html        -> mode Tambah
   - stok-form.html?id=3   -> mode Edit (data contoh di bawah, nanti dari backend)
   - Validasi di sisi browser, lalu kembali ke daftar stok.
     Penyimpanan ke server belum tersambung (menyusul).
   ========================================================================== */

(function () {
  "use strict";

  // Data contoh, sama dengan baris di stok.html. Ganti dengan pemanggilan API nanti.
  var SAMPLE_ITEMS = {
    "1": { nama: "Oli Mesin Yamalube 1L", kategori: "Oli", harga: 55000, stok: 42 },
    "2": { nama: "Oli Mesin Federal Matic 0.8L", kategori: "Oli", harga: 45000, stok: 30 },
    "3": { nama: "Kampas Rem Depan Honda Beat", kategori: "Rem", harga: 38000, stok: 25 },
    "4": { nama: "Busi NGK CPR9EA", kategori: "Busi", harga: 25000, stok: 22 },
    "5": { nama: "Ban Luar IRC 80/90-14", kategori: "Ban", harga: 185000, stok: 12 }
  };

  var LIST_PAGE = "stok.html";

  var form = document.getElementById("stok-form");
  if (!form) return;

  var title = document.getElementById("form-title");
  var submit = document.getElementById("form-submit");
  var status = document.getElementById("form-status");
  var fields = ["nama", "kategori", "harga", "stok"];

  function showStatus(kind, text) {
    status.className = "form-status form-status--" + kind;
    status.textContent = text;
    status.hidden = false;
  }

  function setMode() {
    var id = new URLSearchParams(window.location.search).get("id");
    if (id === null) return;

    var item = SAMPLE_ITEMS[id];
    if (!item) {
      showStatus("warn", "Barang dengan nomor " + id + " tidak ditemukan. Formulir ini akan menambah barang baru.");
      return;
    }

    title.textContent = "Edit Barang";
    submit.textContent = "Simpan Perubahan";
    document.title = "Edit Barang - Admin Sumber Lancar";
    fields.forEach(function (name) {
      form.elements[name].value = item[name];
    });
  }

  function setError(name, message) {
    var input = form.elements[name];
    var error = document.getElementById(name + "-error");
    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
      error.textContent = message;
      error.hidden = false;
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
      error.hidden = true;
    }
  }

  function validate() {
    var firstInvalid = null;

    function check(name, message) {
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = form.elements[name];
    }

    var nama = form.elements.nama.value.trim();
    var kategori = form.elements.kategori.value.trim();
    var harga = form.elements.harga.value.trim();
    var stok = form.elements.stok.value.trim();

    check("nama", nama ? "" : "Nama barang wajib diisi.");
    check("kategori", kategori ? "" : "Kategori wajib diisi.");
    check("harga", /^\d+$/.test(harga) ? "" : "Masukkan harga berupa angka bulat, minimal 0.");
    check("stok", /^\d+$/.test(stok) ? "" : "Masukkan stok berupa angka bulat, minimal 0.");

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // Hapus pesan kesalahan begitu pengguna mulai memperbaiki isian
  fields.forEach(function (name) {
    form.elements[name].addEventListener("input", function () {
      setError(name, "");
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validate()) return;

    submit.disabled = true;
    showStatus("ok", "Barang tersimpan. Mengembalikan ke daftar stok...");
    window.setTimeout(function () {
      window.location.href = LIST_PAGE;
    }, 1000);
  });

  setMode();
})();
