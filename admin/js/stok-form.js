/* ==========================================================================
   admin/js/stok-form.js — form tambah / edit barang (SLApi)
   - stok-form.html        → mode Tambah
   - stok-form.html?id=3   → mode Edit
   Catatan: stok TIDAK bisa diubah langsung via edit — gunakan penyesuaian
   stok (stock-adjustments) atau transaksi barang masuk.
   ========================================================================== */

(function () {
  "use strict";

  if (!window.SLApi) { console.error("[stok-form.js] SLApi belum dimuat"); return; }

  var LIST_PAGE = "stok.html";

  var form    = document.getElementById("stok-form");
  if (!form) return;

  var titleEl  = document.getElementById("form-title");
  var submitEl = document.getElementById("form-submit");
  var statusEl = document.getElementById("form-status");
  var stokWrap = document.getElementById("stok-awal-wrap");

  var id = new URLSearchParams(window.location.search).get("id");

  /* ── Input kategori bebas ──────────────────────────────────────────────── */
  var katSelect = document.getElementById("kategori-select");

  /* ── Status helpers ────────────────────────────────────────────────────── */
  function showStatus(kind, text) {
    statusEl.className   = "form-status form-status--" + kind;
    statusEl.textContent = text;
    statusEl.hidden      = false;
  }

  function setError(name, msg) {
    var input = name === "jenis_barang" ? katSelect : form.elements[name];
    var errEl = document.getElementById(name + "-error");
    if (!errEl) return;
    if (msg) {
      if (input) input.setAttribute("aria-invalid", "true");
      errEl.textContent = msg;
      errEl.hidden = false;
    } else {
      if (input) input.removeAttribute("aria-invalid");
      errEl.hidden = true;
    }
  }

  function clearErrors() {
    ["kode_barang", "nama_barang", "jenis_barang", "harga_jual_default", "stok_awal"].forEach(function (n) {
      setError(n, "");
    });
  }

  /* ── Validasi ───────────────────────────────────────────────────────────── */
  function validate(isEdit) {
    var ok = true;

    function check(name, cond, msg) {
      if (!cond) { setError(name, msg); ok = false; }
      else        { setError(name, ""); }
    }

    if (!isEdit) {
      var kode = (form.elements.kode_barang.value || "").trim();
      check("kode_barang", /^[A-Za-z0-9_-]{2,30}$/.test(kode),
        "Kode barang wajib diisi (2–30 karakter, huruf/angka/-/_).");
    }

    var nama = (form.elements.nama_barang.value || "").trim();
    check("nama_barang", nama.length >= 2, "Nama barang minimal 2 karakter.");

    var jenis = katSelect ? katSelect.value : "";
    check("jenis_barang", jenis.trim().length >= 2 && jenis.trim().length <= 30,
      "Kategori wajib diisi (2–30 karakter).");

    var harga = form.elements.harga_jual_default.value.trim();
    check("harga_jual_default", /^\d+$/.test(harga), "Masukkan harga berupa angka bulat.");

    if (!isEdit) {
      var stok = form.elements.stok_awal ? form.elements.stok_awal.value.trim() : "0";
      check("stok_awal", /^\d+$/.test(stok), "Masukkan stok awal berupa angka bulat.");
    }

    if (!ok) {
      var first = form.querySelector("[aria-invalid]");
      if (first) first.focus();
    }
    return ok;
  }

  /* ── Clear error on input ──────────────────────────────────────────────── */
  ["kode_barang", "nama_barang", "harga_jual_default", "stok_awal"].forEach(function (name) {
    var el = form.elements[name];
    if (el) el.addEventListener("input", function () { setError(name, ""); });
  });
  if (katSelect) katSelect.addEventListener("input", function () { setError("jenis_barang", ""); });

  /* ── Mode Edit ─────────────────────────────────────────────────────────── */
  function setModeEdit() {
    if (!id) return;

    submitEl.disabled = true;
    showStatus("ok", "Memuat data barang...");

    SLApi.get("/api/admin/products/" + id)
      .then(function (res) {
        var p = res.data || res;

        titleEl.textContent  = "Edit Barang";
        submitEl.textContent = "Simpan Perubahan";
        document.title       = "Edit Barang - Admin Sumber Lancar";

        // Sembunyikan field kode & stok awal di mode edit
        var kodeWrap = document.getElementById("kode-wrap");
        if (kodeWrap) kodeWrap.hidden = true;
        if (stokWrap) stokWrap.hidden = true;

        // Tampilkan stok saat ini sebagai info (readonly)
        var stokInfo = document.getElementById("stok-info");
        if (stokInfo) {
          stokInfo.textContent = "Stok tersedia: " + (p.tersedia !== undefined ? p.tersedia : p.stok) +
            " — ubah stok lewat menu Transaksi.";
          stokInfo.hidden = false;
        }

        form.elements.nama_barang.value       = p.nama_barang           || "";
        form.elements.harga_jual_default.value = p.harga_jual            || p.harga_jual_default || 0;
        form.elements.harga_beli_default.value = p.harga_beli            || p.harga_beli_default || 0;
        form.elements.stok_minimal.value       = p.stok_minimal          || 0;
        form.elements.merk.value               = p.merk                  || "";
        if (katSelect) katSelect.value         = p.jenis_barang          || "";

        statusEl.hidden   = true;
        submitEl.disabled = false;
      })
      .catch(function () {
        showStatus("warn", "Barang tidak ditemukan. Formulir ini akan menambah barang baru.");
        submitEl.disabled = false;
        id = null;
      });
  }

  /* ── Submit ─────────────────────────────────────────────────────────────── */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearErrors();
    if (!validate(!!id)) return;

    submitEl.disabled = true;
    showStatus("ok", "Menyimpan...");

    var payload = {
      nama_barang:        (form.elements.nama_barang.value || "").trim(),
      jenis_barang:       katSelect ? katSelect.value : "",
      harga_jual_default: parseInt(form.elements.harga_jual_default.value, 10),
      harga_beli_default: parseInt(form.elements.harga_beli_default.value || "0", 10),
      stok_minimal:       parseInt(form.elements.stok_minimal.value       || "0", 10),
      merk:               (form.elements.merk.value || "").trim() || undefined
    };

    var req;
    if (id) {
      req = SLApi.put("/api/admin/products/" + id, payload);
    } else {
      payload.kode_barang = (form.elements.kode_barang.value || "").trim().toUpperCase();
      payload.stok_awal   = parseInt(form.elements.stok_awal.value || "0", 10);
      req = SLApi.post("/api/admin/products", payload);
    }

    req
      .then(function () {
        showStatus("ok", "Barang tersimpan. Kembali ke daftar stok...");
        setTimeout(function () { window.location.href = LIST_PAGE; }, 1000);
      })
      .catch(function (err) {
        submitEl.disabled = false;
        var msg = err && err.status === 422 && err.details
          ? Object.values(err.details).join(" ")
          : (err && err.message ? err.message : "Gagal menyimpan.");
        showStatus("error", msg);
      });
  });

  setModeEdit();
})();
