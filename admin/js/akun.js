/* ==========================================================================
   akun.js - halaman Daftar Akun
   Data akun dibaca/ditulis lewat window.SLAuth (sumber yang sama dengan
   register dan login), sehingga perubahan role langsung berlaku saat login
   berikutnya.
   - Filter Semua / Admin / Client
   - Ubah role lewat dropdown (dengan konfirmasi)
   - Tombol pensil: menuju dropdown role akun tersebut
   - Hapus akun dengan konfirmasi
   Akun server (Admin Utama) dan akun yang sedang login tidak dapat diubah
   atau dihapus. Ini simulasi frontend, bukan keamanan server.
   ========================================================================== */

(function () {
  "use strict";

  var Auth = window.SLAuth;
  var table = document.getElementById("akun-table");
  var live = document.getElementById("akun-live");
  if (!table || !Auth || !Auth.hasRole("admin")) return;

  var body = table.tBodies[0];
  var emptyRow = body.querySelector(".data-table__empty");
  var filterButtons = document.querySelectorAll("[data-filter]");
  var currentFilter = "all";
  var accounts = [];
  var me = null;

  var ROLE_LABEL = { admin: "Admin", client: "Client" };
  var ICON_BASE = "assets/icons/";

  function announce(text) {
    if (live) live.textContent = text;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function cell(label, className) {
    var td = el("td", className || "");
    td.setAttribute("data-label", label);
    return td;
  }

  function icon(name, size) {
    var img = el("img");
    img.src = ICON_BASE + name + ".svg";
    img.alt = "";
    if (size) { img.width = size; img.height = size; }
    return img;
  }

  function locked(acc) {
    return acc.protected || (me && me.username.toLowerCase() === acc.username.toLowerCase());
  }

  function lockTitle(acc) {
    return acc.protected ? "Akun server tidak dapat diubah" : "Akun yang sedang dipakai tidak dapat diubah";
  }

  function buildRow(acc) {
    var isLocked = locked(acc);
    var tr = el("tr");
    tr.setAttribute("data-id", acc.id);
    tr.setAttribute("data-role", acc.role);
    if (acc.protected) tr.setAttribute("data-protected", "");
    if (isLocked) tr.setAttribute("data-locked", "");

    var tdName = cell("Nama");
    var name = el("span", "user-name");
    name.appendChild(el("span", "user-name__text", acc.name));
    if (acc.protected) {
      var badge = el("span", "badge-server");
      badge.appendChild(icon("shield", 10));
      badge.appendChild(document.createTextNode("Server"));
      name.appendChild(badge);
    }
    tdName.appendChild(name);
    tr.appendChild(tdName);

    tr.appendChild(cell("Email", "data-table__muted")).textContent = acc.email || "-";

    var tdRole = cell("Role");
    var select = el("select", "role-select" + (acc.role === "admin" ? " is-admin" : ""));
    select.setAttribute("aria-label", "Role " + acc.name);
    select.setAttribute("data-role-select", "");
    ["admin", "client"].forEach(function (role) {
      var opt = el("option", "", ROLE_LABEL[role]);
      opt.value = role;
      opt.selected = role === acc.role;
      select.appendChild(opt);
    });
    if (isLocked) { select.disabled = true; select.title = lockTitle(acc); }
    tdRole.appendChild(select);
    tr.appendChild(tdRole);

    tr.appendChild(cell("Bergabung", "data-table__muted")).textContent = acc.joined || "-";

    var tdAct = cell("Aksi");
    var actions = el("span", "row-actions");
    var edit = el("button", "icon-btn");
    edit.type = "button";
    edit.setAttribute("data-edit", "");
    edit.setAttribute("aria-label", "Ubah role " + acc.name);
    edit.appendChild(icon("pencil"));
    var del = el("button", "icon-btn icon-btn--danger");
    del.type = "button";
    del.setAttribute("data-delete", "");
    del.setAttribute("aria-label", "Hapus akun " + acc.name);
    del.appendChild(icon("trash"));
    if (isLocked) {
      [edit, del].forEach(function (btn) { btn.disabled = true; btn.title = lockTitle(acc); });
    }
    actions.appendChild(edit);
    actions.appendChild(del);
    tdAct.appendChild(actions);
    tr.appendChild(tdAct);

    return tr;
  }

  function render() {
    me = Auth.getCurrentUser();
    accounts = Auth.listAccounts();
    Array.prototype.slice.call(body.rows).forEach(function (row) {
      if (row !== emptyRow) row.remove();
    });
    accounts.forEach(function (acc) {
      body.insertBefore(buildRow(acc), emptyRow);
    });
    applyFilter();
  }

  function applyFilter() {
    var visible = 0;
    accounts.forEach(function (acc) {
      var row = body.querySelector('tr[data-id="' + acc.id + '"]');
      if (!row) return;
      var show = currentFilter === "all" || acc.role === currentFilter;
      row.hidden = !show;
      if (show) visible++;
    });

    emptyRow.hidden = visible > 0;
    emptyRow.cells[0].textContent = accounts.length === 0
      ? "Belum ada akun terdaftar."
      : "Tidak ada akun dengan role ini.";
  }

  function findAccount(row) {
    var id = Number(row.getAttribute("data-id"));
    return accounts.filter(function (a) { return a.id === id; })[0];
  }

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      currentFilter = button.getAttribute("data-filter");
      filterButtons.forEach(function (btn) {
        var active = btn === button;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-pressed", active ? "true" : "false");
      });
      applyFilter();
    });
  });

  // Ubah role
  body.addEventListener("change", function (event) {
    var select = event.target.closest("[data-role-select]");
    if (!select) return;

    var row = select.closest("tr");
    var acc = findAccount(row);
    if (!acc) return;
    var next = select.value;
    if (next === acc.role) return;

    var ok = window.confirm("Ubah role \"" + acc.name + "\" menjadi " + ROLE_LABEL[next] + "?");
    if (!ok) {
      select.value = acc.role; // batal: kembalikan pilihan
      return;
    }

    var result = Auth.updateRole(acc.id, next);
    if (!result.ok) {
      select.value = acc.role;
      announce(result.error);
      return;
    }
    render();
    announce("Role " + acc.name + " diubah menjadi " + ROLE_LABEL[next] + ".");
  });

  body.addEventListener("click", function (event) {
    var row = event.target.closest("tr");
    if (!row || row === emptyRow || row.hasAttribute("data-locked")) return;
    var acc = findAccount(row);
    if (!acc) return;

    // Pensil: arahkan ke dropdown role
    if (event.target.closest("[data-edit]")) {
      var select = row.querySelector("[data-role-select]");
      if (select) select.focus();
      return;
    }

    // Hapus akun
    if (event.target.closest("[data-delete]")) {
      if (!window.confirm("Hapus akun \"" + acc.name + "\"? Tindakan ini tidak dapat dibatalkan.")) return;
      var result = Auth.deleteAccount(acc.id);
      if (!result.ok) { announce(result.error); return; }
      render();
      announce("Akun " + acc.name + " dihapus.");
    }
  });

  render();
})();
