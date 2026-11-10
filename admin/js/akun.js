/* ==========================================================================
   admin/js/akun.js — Daftar Akun (SLDataTable)
   ========================================================================== */

(function () {
  "use strict";

  if (!window.SLApi)       { console.error("[akun.js] SLApi belum dimuat"); return; }
  if (!window.SLDataTable) { console.error("[akun.js] datatable.js belum dimuat"); return; }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }
  function roleLabel(r) { return { ADMIN: "Admin", MECHANIC: "Montir", CUSTOMER: "Pelanggan" }[r] || r; }
  function roleBadge(r) {
    var cls = { ADMIN: "badge--done", MECHANIC: "badge--process", CUSTOMER: "badge--pending" }[r] || "badge--pending";
    return '<span class="badge ' + cls + '">' + roleLabel(r) + "</span>";
  }
  function isMainAdmin(u) { return Number(u.admin_utama) === 1; }
  function announce(t) { var e = document.getElementById("akun-live"); if (e) e.textContent = t; }

  /* ── State filter role ─────────────────────────────────────────────────── */
  var filterRole = "";

  var dt = new SLDataTable({
    tableId:     "akun-table",
    searchId:    "akun-search",
    countId:     "akun-count",
    colspan:     7,
    per:         50,
    allRows:     true,
    defaultSort: "nama_lengkap",
    emptyText:   "Tidak ada akun ditemukan.",
    params:      function () { return { role: filterRole }; },
    fetch:       function (p) { return SLApi.get("/api/admin/users", p); },
    renderRow:   function (u) {
      var mainAdmin = isMainAdmin(u);
      var aktifBadge   = u.aktif
        ? '<span class="badge badge--done">Aktif</span>'
        : '<span class="badge badge--off">Nonaktif</span>';
      var toggleLabel  = u.aktif ? "Nonaktifkan" : "Aktifkan";
      var toggleClass  = u.aktif ? "btn--danger"  : "btn--ghost";
      return (
        "<tr>" +
          '<td data-label="Nama">' +
            '<span style="font-weight:500">' + esc(u.nama_lengkap || u.username) + "</span>" +
            '<br><span style="font-size:.75rem;color:var(--text-muted,#94a3b8)">@' + esc(u.username) + "</span>" +
            (mainAdmin ? '<br><span class="badge badge--done">Admin Utama</span>' : "") +
          "</td>" +
          '<td data-label="No. WhatsApp" class="data-table__muted">' + esc(u.no_telepon || "-") + "</td>" +
          '<td data-label="Role">' + roleBadge(u.role) + "</td>" +
          '<td data-label="Status">' + aktifBadge + "</td>" +
          '<td data-label="Transaksi" class="data-table__muted">' + (u.jumlah_transaksi || 0) + "</td>" +
          '<td data-label="Bergabung" class="data-table__muted">' + fmt(u.created_at) + "</td>" +
          '<td data-label="Aksi" class="data-table__actions">' +
            (mainAdmin
              ? '<span class="data-table__muted">Tidak Bisa Diubah</span>'
              : '<span class="row-actions">' +
              '<button class="btn btn--sm btn--ghost btn-edit" type="button"' +
                ' data-id="' + u.id + '"' +
                ' data-username="' + esc(u.username) + '"' +
                ' data-nama="' + esc(u.nama_lengkap || "") + '"' +
                ' data-telp="' + esc(u.no_telepon || "") + '"' +
                ' data-role="' + esc(u.role) + '"' +
                ' aria-label="Edit ' + esc(u.username) + '">Edit</button>' +
              '<button class="btn btn--sm ' + toggleClass + ' btn-toggle" type="button"' +
                ' data-id="' + u.id + '" data-aktif="' + (u.aktif ? "true" : "false") + '"' +
                ' aria-label="' + toggleLabel + " " + esc(u.username) + '">' + toggleLabel + "</button>" +
            "</span>") +
          "</td>" +
        "</tr>"
      );
    }
  });

  /* ── Filter role ───────────────────────────────────────────────────────── */
  document.querySelectorAll("[data-filter]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll("[data-filter]").forEach(function (b) {
        b.classList.remove("is-active"); b.setAttribute("aria-pressed", "false");
      });
      btn.classList.add("is-active"); btn.setAttribute("aria-pressed", "true");
      filterRole = btn.dataset.filter;
      dt.state.page = 1;
      dt.load();
    });
  });

  /* ── Table click delegation ────────────────────────────────────────────── */
  var tbody = document.querySelector("#akun-table tbody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var editBtn = e.target.closest(".btn-edit");
      if (editBtn) { openModal({ id: editBtn.dataset.id, username: editBtn.dataset.username, nama_lengkap: editBtn.dataset.nama, no_telepon: editBtn.dataset.telp, role: editBtn.dataset.role }); return; }

      var toggleBtn = e.target.closest(".btn-toggle");
      if (toggleBtn) {
        var aktif = toggleBtn.dataset.aktif === "true";
        window.SLDialog.confirm({
          title: (aktif ? "Nonaktifkan" : "Aktifkan") + " Akun?",
          message: "Yakin ingin " + (aktif ? "menonaktifkan" : "mengaktifkan") + " akun ini?",
          danger: aktif,
          confirmLabel: aktif ? "Ya, Nonaktifkan" : "Ya, Aktifkan"
        }).then(function (confirmed) {
          if (!confirmed) return;
          toggleBtn.disabled = true;
          SLApi.patch("/api/admin/users/" + toggleBtn.dataset.id, { aktif: !aktif })
            .then(function () { announce("Akun berhasil diperbarui."); dt.load(); })
            .catch(function (err) {
              toggleBtn.disabled = false;
              window.SLDialog.alert({
                title: "Gagal Memperbarui Akun",
                message: err && err.message ? err.message : "Terjadi kesalahan."
              });
            });
        });
      }
    });
  }

  /* ── Modal tambah / edit ───────────────────────────────────────────────── */
  var modal      = document.getElementById("akun-modal");
  var modalTitle = document.getElementById("akun-modal-title");
  var form       = document.getElementById("akun-form");
  var formStatus = document.getElementById("akun-form-status");
  var formSubmit = document.getElementById("akun-form-submit");
  var passHint   = document.getElementById("akun-password-hint");
  var editingId  = null;

  function openModal(data) {
    if (!modal || !form) return;
    form.reset();
    if (formStatus) { formStatus.hidden = true; formStatus.textContent = ""; }
    if (data) {
      editingId = data.id;
      if (modalTitle) modalTitle.textContent = "Edit Akun";
      form.elements.username.value     = data.username     || "";
      form.elements.nama_lengkap.value = data.nama_lengkap || "";
      form.elements.no_telepon.value   = data.no_telepon   || "";
      form.elements.role.value         = data.role         || "CUSTOMER";
      form.elements.username.disabled  = true;
      form.elements.password.required  = false;
      if (passHint) passHint.textContent = "Kosongkan jika tidak ingin mengubah password.";
    } else {
      editingId = null;
      if (modalTitle) modalTitle.textContent = "Tambah Akun";
      form.elements.username.disabled = false;
      form.elements.password.required = true;
      if (passHint) passHint.textContent = "";
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    var first = form.querySelector("input:not([disabled])");
    if (first) first.focus();
  }

  function closeModal() {
    if (modal) { modal.hidden = true; modal.setAttribute("aria-hidden", "true"); }
    editingId = null;
  }

  var btnTambah = document.getElementById("btn-tambah-akun");
  if (btnTambah) btnTambah.addEventListener("click", function () { openModal(null); });
  document.getElementById("akun-modal-close") && document.getElementById("akun-modal-close").addEventListener("click", closeModal);
  document.getElementById("akun-form-cancel") && document.getElementById("akun-form-cancel").addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (formStatus) { formStatus.hidden = true; }
      var body = { nama_lengkap: form.elements.nama_lengkap.value.trim(), no_telepon: form.elements.no_telepon.value.trim(), role: form.elements.role.value };
      var pw = form.elements.password.value;
      if (pw) body.password = pw;
      if (formSubmit) formSubmit.disabled = true;
      var req = editingId
        ? SLApi.patch("/api/admin/users/" + editingId, body)
        : (body.username = form.elements.username.value.trim(), SLApi.post("/api/admin/users", body));
      req
        .then(function () { closeModal(); announce(editingId ? "Akun diperbarui." : "Akun ditambahkan."); dt.load(); })
        .catch(function (err) {
          if (formSubmit) formSubmit.disabled = false;
          var msg = err && err.status === 422 && err.details ? Object.values(err.details).join(" ") : (err && err.message ? err.message : "Terjadi kesalahan.");
          if (formStatus) { formStatus.textContent = "Gagal: " + msg; formStatus.hidden = false; }
        });
    });
  }

  dt.load();
})();
