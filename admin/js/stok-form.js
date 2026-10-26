/* ==========================================================================
   admin/js/stok-form.js — form tambah / edit barang (terhubung ke API)
   - stok-form.html        -> mode Tambah
   - stok-form.html?id=3   -> mode Edit (data dari API)
   ========================================================================== */

(function () {
  "use strict";

  var API      = "/kayang/api/products.php";
  var LIST_PAGE = "stok.html";

  var form   = document.getElementById("stok-form");
  if (!form) return;

  var title  = document.getElementById("form-title");
  var submit = document.getElementById("form-submit");
  var status = document.getElementById("form-status");

  var id = new URLSearchParams(window.location.search).get("id");

  // ── Status helpers ────────────────────────────────────────────────────────
  function showStatus(kind, text) {
    status.className = "form-status form-status--" + kind;
    status.textContent = text;
    status.hidden = false;
  }

  function setError(name, message) {
    var input = form.elements[name];
    var error = document.getElementById(name + "-error");
    if (!input || !error) return;
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

  // ── Validasi ──────────────────────────────────────────────────────────────
  function validate() {
    var firstInvalid = null;

    function check(name, message) {
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = form.elements[name];
    }

    var nama     = form.elements.nama.value.trim();
    var kategori = form.elements.kategori.value.trim();
    var harga    = form.elements.harga.value.trim();
    var stok     = form.elements.stok.value.trim();

    check("nama",     nama     ? "" : "Nama barang wajib diisi.");
    check("kategori", kategori ? "" : "Kategori wajib diisi.");
    check("harga",    /^\d+$/.test(harga) ? "" : "Masukkan harga berupa angka bulat, minimal 0.");
    check("stok",     /^\d+$/.test(stok)  ? "" : "Masukkan stok berupa angka bulat, minimal 0.");

    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  ["nama", "kategori", "harga", "stok"].forEach(function (name) {
    if (form.elements[name]) {
      form.elements[name].addEventListener("input", function () {
        setError(name, "");
      });
    }
  });

  // ── Mode Edit: load data dari API ─────────────────────────────────────────
  function setModeEdit() {
    if (!id) return;

    submit.disabled = true;
    showStatus("ok", "Memuat data barang...");

    fetch(API + "?id=" + encodeURIComponent(id))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.ok) throw new Error(json.message || "Produk tidak ditemukan.");

        var p = json.data;

        title.textContent   = "Edit Barang";
        submit.textContent  = "Simpan Perubahan";
        document.title      = "Edit Barang - Admin Sumber Lancar";

        form.elements.nama.value     = p.nama_barang      || "";
        form.elements.kategori.value = p.jenis_barang     || "";
        form.elements.harga.value    = p.harga_jual       || 0;
        form.elements.stok.value     = p.stok             || 0;

        status.hidden   = true;
        submit.disabled = false;
      })
      .catch(function (err) {
        showStatus("warn", "Barang tidak ditemukan (id=" + id + "). Formulir ini akan menambah barang baru.");
        submit.disabled = false;
        id = null; // fallback ke mode tambah
      });
  }

  // ── Submit: POST (tambah) atau PUT (edit) ─────────────────────────────────
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!validate()) return;

    submit.disabled = true;
    showStatus("ok", "Menyimpan...");

    var payload = {
      nama_barang:        form.elements.nama.value.trim(),
      jenis_barang:       form.elements.kategori.value.trim(),
      harga_jual_default: parseInt(form.elements.harga.value, 10),
      stok:               parseInt(form.elements.stok.value,  10),
    };

    var url    = id ? API + "?id=" + encodeURIComponent(id) : API;
    var method = id ? "PUT" : "POST";

    fetch(url, {
      method:  method,
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.ok) throw new Error(json.message || "Gagal menyimpan.");
        showStatus("ok", "Barang tersimpan. Mengembalikan ke daftar stok...");
        window.setTimeout(function () {
          window.location.href = LIST_PAGE;
        }, 1000);
      })
      .catch(function (err) {
        submit.disabled = false;
        showStatus("error", "Gagal menyimpan: " + err.message);
      });
  });

  setModeEdit();
})();
