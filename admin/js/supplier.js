/* ==========================================================================
   admin/js/supplier.js — Kelola supplier (SLApi + SLDataTable)
   ========================================================================== */

(function () {
  "use strict";

  if (!window.SLApi) { console.error("[supplier.js] SLApi belum dimuat"); return; }
  if (!window.SLDataTable) { console.error("[supplier.js] datatable.js belum dimuat"); return; }

  function esc(value) {
    return String(value || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function announce(message) {
    var live = document.getElementById("supplier-live");
    if (live) live.textContent = message;
  }

  function isActive(supplier) {
    return supplier.aktif !== false && supplier.aktif !== 0 &&
      supplier.aktif !== "f" && supplier.aktif !== "false";
  }

  var statusFilter = "all";
  var statusSelect = document.getElementById("supplier-status-filter");
  var dt = new SLDataTable({
    tableId: "supplier-table",
    searchId: "supplier-search",
    countId: "supplier-count",
    colspan: 5,
    per: 50,
    allRows: true,
    defaultSort: "nama_supplier",
    emptyText: "Tidak ada supplier ditemukan.",
    params: function () { return { aktif: statusFilter }; },
    fetch: function (params) { return SLApi.get("/api/admin/suppliers", params); },
    renderRow: function (supplier) {
      var active = isActive(supplier);
      return "<tr>" +
        '<td data-label="Nama Supplier"><strong>' + esc(supplier.nama_supplier) + "</strong></td>" +
        '<td data-label="No. Telepon">' + esc(supplier.no_telepon || "-") + "</td>" +
        '<td data-label="Alamat" class="data-table__muted">' + esc(supplier.alamat || "-") + "</td>" +
        '<td data-label="Status"><span class="badge ' + (active ? "badge--done" : "badge--off") + '">' +
          (active ? "Aktif" : "Nonaktif") + "</span></td>" +
        '<td data-label="Aksi" class="data-table__actions">' +
          '<span class="row-actions">' +
            '<button class="btn btn--sm btn--ghost btn-edit" type="button" data-id="' + supplier.id + '"' +
              ' data-name="' + esc(supplier.nama_supplier) + '"' +
              ' data-phone="' + esc(supplier.no_telepon || "") + '"' +
              ' data-address="' + esc(supplier.alamat || "") + '">Edit</button>' +
            '<button class="btn btn--sm ' + (active ? "btn--danger" : "btn--ghost") +
              ' btn-toggle" type="button" data-id="' + supplier.id + '"' +
              ' data-aktif="' + (active ? "true" : "false") + '">' +
              (active ? "Nonaktifkan" : "Aktifkan") + "</button>" +
          "</span>" +
        "</td>" +
      "</tr>";
    }
  });

  if (statusSelect) {
    statusSelect.addEventListener("change", function () {
      statusFilter = this.value;
      dt.state.page = 1;
      dt.load();
    });
  }

  var modal = document.getElementById("supplier-modal");
  var form = document.getElementById("supplier-form");
  var title = document.getElementById("supplier-modal-title");
  var status = document.getElementById("supplier-form-status");
  var submit = document.getElementById("supplier-form-submit");
  var editingId = null;

  function openModal(supplier) {
    form.reset();
    status.hidden = true;
    status.textContent = "";
    editingId = supplier ? supplier.id : null;
    submit.disabled = false;
    title.textContent = editingId ? "Edit Supplier" : "Tambah Supplier";
    submit.textContent = editingId ? "Simpan Perubahan" : "Simpan Supplier";
    if (supplier) {
      form.elements.nama_supplier.value = supplier.nama_supplier || "";
      form.elements.no_telepon.value = supplier.no_telepon || "";
      form.elements.alamat.value = supplier.alamat || "";
    }
    modal.hidden = false;
    form.elements.nama_supplier.focus();
  }

  function closeModal() {
    modal.hidden = true;
    editingId = null;
  }

  document.getElementById("btn-add-supplier").addEventListener("click", function () {
    openModal(null);
  });
  document.getElementById("supplier-modal-close").addEventListener("click", closeModal);
  document.getElementById("supplier-form-cancel").addEventListener("click", closeModal);
  modal.addEventListener("click", function (event) {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  var tbody = document.querySelector("#supplier-table tbody");
  tbody.addEventListener("click", function (event) {
    var editButton = event.target.closest(".btn-edit");
    if (editButton) {
      openModal({
        id: editButton.dataset.id,
        nama_supplier: editButton.dataset.name,
        no_telepon: editButton.dataset.phone,
        alamat: editButton.dataset.address
      });
      return;
    }

    var toggleButton = event.target.closest(".btn-toggle");
    if (!toggleButton) return;
    var isActive = toggleButton.dataset.aktif === "true";
    window.SLDialog.confirm({
      title: (isActive ? "Nonaktifkan" : "Aktifkan") + " Supplier?",
      message: "Yakin ingin " + (isActive ? "menonaktifkan" : "mengaktifkan") + " supplier ini?",
      danger: isActive,
      confirmLabel: isActive ? "Ya, Nonaktifkan" : "Ya, Aktifkan"
    }).then(function (confirmed) {
      if (!confirmed) return;
      toggleButton.disabled = true;
      SLApi.put("/api/admin/suppliers/" + toggleButton.dataset.id, { aktif: !isActive })
        .then(function () {
          announce("Status supplier berhasil diperbarui.");
          dt.load();
        })
        .catch(function (error) {
          toggleButton.disabled = false;
          window.SLDialog.alert({
            title: "Gagal Memperbarui Supplier",
            message: error && error.message ? error.message : "Terjadi kesalahan."
          });
        });
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    status.hidden = true;
    var payload = {
      nama_supplier: form.elements.nama_supplier.value.trim(),
      no_telepon: form.elements.no_telepon.value.trim(),
      alamat: form.elements.alamat.value.trim()
    };
    submit.disabled = true;
    var request = editingId
      ? SLApi.put("/api/admin/suppliers/" + editingId, payload)
      : SLApi.post("/api/admin/suppliers", payload);
    request.then(function () {
      var wasEditing = Boolean(editingId);
      closeModal();
      announce(wasEditing ? "Supplier berhasil diperbarui." : "Supplier berhasil ditambahkan.");
      dt.load();
    }).catch(function (error) {
      submit.disabled = false;
      var message = error && error.status === 422 && error.details
        ? Object.values(error.details).join(" ")
        : (error && error.message ? error.message : "Terjadi kesalahan.");
      status.textContent = "Gagal: " + message;
      status.hidden = false;
    });
  });

  dt.load();
})();
