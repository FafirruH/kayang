/* ==========================================================================
   auth.js - autentikasi SIMULASI bersama (client + admin)

   PENTING: ini hanya simulasi frontend untuk prototipe. Akun, password, dan
   sesi disimpan di localStorage (bisa dilihat dan diubah siapa saja lewat
   browser), jadi TIDAK AMAN untuk akun atau data produksi.

   Satu-satunya sumber kebenaran:
     - sl_accounts_v1      daftar akun (dipakai register, login, dan admin/akun.html)
     - sl_auth_session_v1  sesi aktif: { username, role }

   Role ditentukan sistem dari data akun, bukan dipilih pengguna:
     - akun hasil registrasi selalu "client"
     - role hanya bisa diubah admin lewat halaman Daftar Akun

   API: window.SLAuth
   ========================================================================== */

(function (global) {
  "use strict";

  /* ---------- Konfigurasi terpusat ---------- */
  var ACCOUNTS_KEY = "sl_accounts_v1";
  var SESSION_KEY = "sl_auth_session_v1";
  var LEGACY_KEYS = ["sl_logged_in", "sl_admin_logged_in"]; // penanda lama, dihapus

  // Akun administrator DEMO (bukan untuk produksi). Dokumentasi di README.md
  var DEMO_ADMIN = {
    id: 1,
    username: "admin",
    name: "Admin Utama",
    no_whatsapp: "62895326202002",
    alamat: "Jl. Brantas No.26, Ngaglik, Kec. Batu, Kota Batu, Jawa Timur 65311",
    password: "admin123",
    role: "admin",
    joined: "2024-01-01",
    protected: true
  };

  // Akun contoh agar tabel Daftar Akun tidak kosong. Tanpa password,
  // jadi tidak bisa dipakai login (hanya data tampilan).
  var SAMPLE_ACCOUNTS = [
    { id: 2, username: "budi", name: "Budi Santoso", no_whatsapp: "6281111111111", role: "client", joined: "2026-08-12" },
    { id: 3, username: "siti", name: "Siti Aminah", no_whatsapp: "6282222222222", role: "client", joined: "2026-09-03" },
    { id: 4, username: "rudi", name: "Rudi Hartono", no_whatsapp: "6283333333333", role: "admin", joined: "2026-07-21" }
  ];

  var HOME = { admin: "admin/index.html", client: "index.html" };
  var ROLES = ["admin", "client"];

  /* ---------- Lokasi root website ---------- */
  var _path     = window.location.pathname;
  var _adminIdx = _path.indexOf("/admin/");
  var _rootPath = _adminIdx !== -1
    ? _path.slice(0, _adminIdx + 1)
    : _path.slice(0, _path.lastIndexOf("/") + 1);
  var ROOT_URL  = new URL(_rootPath, window.location.href);

  function rootUrl(path) {
    return new URL(path, ROOT_URL).href;
  }

  // Alamat halaman sekarang relatif terhadap root, mis. "admin/akun.html"
  function currentPath() {
    var rel = window.location.pathname.slice(ROOT_URL.pathname.length) || "index.html";
    if (rel.charAt(rel.length - 1) === "/") rel += "index.html";
    return rel + window.location.search;
  }

  /* ---------- Penyimpanan ---------- */
  function readJSON(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* abaikan */ }
  }

  // Migrasi terkontrol: dua penanda lama tidak lagi dipercaya, cukup dihapus
  LEGACY_KEYS.forEach(removeKey);

  /* ---------- Akun ---------- */
  function seedAccounts() {
    return [clone(DEMO_ADMIN)].concat(SAMPLE_ACCOUNTS.map(clone));
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getAccounts() {
    var list = readJSON(ACCOUNTS_KEY);
    if (!Array.isArray(list)) {
      list = seedAccounts();
      writeJSON(ACCOUNTS_KEY, list);
      return list;
    }
    // Akun admin demo selalu ada (tidak bisa hilang karena data rusak)
    var hasDemo = list.some(function (a) { return a && a.id === DEMO_ADMIN.id && a.protected; });
    if (!hasDemo) {
      list.unshift(clone(DEMO_ADMIN));
      writeJSON(ACCOUNTS_KEY, list);
    } else {
      list.forEach(function (account) {
        if (account && account.id === DEMO_ADMIN.id && account.protected) {
          account.name = DEMO_ADMIN.name;
          account.no_whatsapp = DEMO_ADMIN.no_whatsapp;
          account.alamat = DEMO_ADMIN.alamat;
        }
      });
      writeJSON(ACCOUNTS_KEY, list);
    }
    return list;
  }

  function saveAccounts(list) {
    return writeJSON(ACCOUNTS_KEY, list);
  }

  function norm(text) {
    return String(text || "").trim().toLowerCase();
  }

  function findByIdentity(identity) {
    var key = norm(identity);
    if (!key) return null;
    var list = getAccounts();
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].username) === key || (list[i].email && norm(list[i].email) === key)) return list[i];
    }
    return null;
  }

  function findByUsername(username) {
    var key = norm(username);
    var list = getAccounts();
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].username) === key) return list[i];
    }
    return null;
  }

  function publicAccount(acc) {
    return { id: acc.id, username: acc.username, name: acc.name || acc.username, no_whatsapp: acc.no_whatsapp || "", role: acc.role, joined: acc.joined, protected: !!acc.protected };
  }

  /* ---------- Sesi ---------- */
  function clearSession() {
    removeKey(SESSION_KEY);
  }

  // Pengguna aktif. Role SELALU dibaca ulang dari data akun, jadi perubahan
  // role (atau penghapusan akun) langsung berlaku tanpa login ulang.
  function getCurrentUser() {
    var session = readJSON(SESSION_KEY);
    if (!session || !session.username) return null;
    if (session.source === "backend") {
      if (ROLES.indexOf(session.role) === -1) {
        clearSession();
        return null;
      }
      return {
        id: session.id || null,
        username: session.username,
        name: session.name || session.username,
        role: session.role,
        source: "backend"
      };
    }
    var acc = findByUsername(session.username);
    if (!acc || ROLES.indexOf(acc.role) === -1) {
      clearSession();
      return null;
    }
    if (session.role !== acc.role) {
      writeJSON(SESSION_KEY, { username: acc.username, role: acc.role });
    }
    return { id: acc.id, username: acc.username, name: acc.name || acc.username, role: acc.role, source: "local" };
  }

  function isLoggedIn() {
    return getCurrentUser() !== null;
  }

  function hasRole(role) {
    var user = getCurrentUser();
    return !!user && user.role === role;
  }

  function homeFor(role) {
    return rootUrl(HOME[role] || HOME.client);
  }

  /* ---------- Login / logout / registrasi ---------- */
  function login(identity, password) {
    var acc = findByIdentity(identity);
    // Pesan sengaja sama untuk akun tidak ada / password salah / akun contoh
    if (!acc || !acc.password || acc.password !== password) {
      return { ok: false, error: "Username/email atau password salah." };
    }
    if (!writeJSON(SESSION_KEY, { username: acc.username, role: acc.role })) {
      return { ok: false, error: "Penyimpanan browser tidak tersedia, login tidak dapat dilakukan." };
    }
    return { ok: true, user: { username: acc.username, name: acc.name || acc.username, role: acc.role } };
  }

  function logout() {
    clearSession();
  }

  // Registrasi hanya untuk client: role tidak pernah diambil dari input
  function registerClient(input) {
    var username    = String((input && input.username)    || "").trim();
    var nama_lengkap = String((input && input.nama_lengkap) || "").trim();
    var password    = String((input && input.password)    || "");
    var password2   = String((input && input.password2)   || "");
    var no_whatsapp = String((input && input.no_whatsapp) || "").trim();
    var alamat      = String((input && input.alamat)      || "").trim();

    if (username.length < 3) return { ok: false, field: "username", error: "Username minimal 3 karakter." };
    if (!/^[A-Za-z0-9_.]+$/.test(username)) {
      return { ok: false, field: "username", error: "Username hanya boleh huruf, angka, titik, atau garis bawah." };
    }
    if (username.length > 50) return { ok: false, field: "username", error: "Username maksimal 50 karakter." };
    if (findByUsername(username)) return { ok: false, field: "username", error: "Username sudah dipakai." };
    if (nama_lengkap.length < 2 || nama_lengkap.length > 100) {
      return { ok: false, field: "nama_lengkap", error: "Nama lengkap wajib diisi (2-100 karakter)." };
    }
    if (password.length < 6) return { ok: false, field: "password", error: "Password minimal 6 karakter." };
    if (password !== password2) return { ok: false, field: "password2", error: "Konfirmasi password tidak cocok." };
    if (!/^(08|62)\d{8,13}$/.test(no_whatsapp.replace(/[\s\-().+]/g, ""))) {
      return { ok: false, field: "no_whatsapp", error: "Masukkan nomor WhatsApp yang valid, contoh: 081234567890." };
    }
    if (alamat.length > 500) return { ok: false, field: "alamat", error: "Alamat maksimal 500 karakter." };

    var list = getAccounts();
    var nextId = list.reduce(function (max, a) { return Math.max(max, a.id || 0); }, 0) + 1;
    list.push({
      id: nextId,
      username: username,
      name: nama_lengkap,
      no_whatsapp: no_whatsapp,
      alamat: alamat,
      password: password,
      role: "client",
      joined: new Date().toISOString().slice(0, 10),
      protected: false
    });
    if (!saveAccounts(list)) return { ok: false, error: "Penyimpanan browser tidak tersedia, akun tidak dapat dibuat." };
    return { ok: true };
  }

  /* ---------- Pengelolaan akun (dipakai admin/akun.html) ---------- */
  function listAccounts() {
    return getAccounts().map(publicAccount);
  }

  function isLockedAccount(acc) {
    var me = getCurrentUser();
    return !!acc.protected || (!!me && norm(me.username) === norm(acc.username));
  }

  function updateRole(id, role) {
    if (!hasRole("admin")) return { ok: false, error: "Hanya admin yang dapat mengubah role." };
    if (ROLES.indexOf(role) === -1) return { ok: false, error: "Role tidak valid." };
    var list = getAccounts();
    var acc = list.filter(function (a) { return a.id === id; })[0];
    if (!acc) return { ok: false, error: "Akun tidak ditemukan." };
    if (isLockedAccount(acc)) return { ok: false, error: "Akun ini tidak dapat diubah." };
    acc.role = role;
    saveAccounts(list);
    return { ok: true };
  }

  function deleteAccount(id) {
    if (!hasRole("admin")) return { ok: false, error: "Hanya admin yang dapat menghapus akun." };
    var list = getAccounts();
    var acc = list.filter(function (a) { return a.id === id; })[0];
    if (!acc) return { ok: false, error: "Akun tidak ditemukan." };
    if (isLockedAccount(acc)) return { ok: false, error: "Akun ini tidak dapat dihapus." };
    saveAccounts(list.filter(function (a) { return a.id !== id; }));
    return { ok: true };
  }

  /* ---------- Profil sendiri (panel profil & halaman Pengaturan Akun) ---------- */
  // Data profil dari akun localStorage (cadangan bila backend tidak tersedia)
  function getProfile() {
    var user = getCurrentUser();
    if (!user) return null;
    var acc = findByUsername(user.username);
    return {
      username: user.username,
      nama_lengkap: (acc && acc.name) || user.name,
      no_telepon: (acc && acc.no_whatsapp) || "",
      alamat: (acc && acc.alamat) || "",
      role: user.role
    };
  }

  // Ubah akun sendiri; password saat ini WAJIB cocok. Hanya untuk akun client.
  function updateProfile(currentPassword, changes) {
    var user = getCurrentUser();
    if (!user) return { ok: false, error: "Sesi berakhir. Silakan login ulang." };
    if (user.role !== "client") return { ok: false, error: "Akun admin tidak memiliki pengaturan akun." };
    var list = getAccounts();
    var acc = list.filter(function (a) { return norm(a.username) === norm(user.username); })[0];
    if (!acc) return { ok: false, error: "Akun tidak ditemukan di penyimpanan lokal." };
    if (!acc.password || acc.password !== currentPassword) {
      return { ok: false, field: "current_password", error: "Password salah." };
    }
    var username = String(changes.username || acc.username).trim();
    if (norm(username) !== norm(acc.username)) {
      if (findByUsername(username)) return { ok: false, field: "username", error: "Username sudah dipakai." };
      acc.username = username;
    }
    if (changes.nama_lengkap) acc.name = String(changes.nama_lengkap).trim();
    if (changes.no_telepon) acc.no_whatsapp = String(changes.no_telepon).trim();
    if (Object.prototype.hasOwnProperty.call(changes, "alamat")) acc.alamat = String(changes.alamat).trim();
    if (changes.password) acc.password = String(changes.password);
    if (!saveAccounts(list)) return { ok: false, error: "Penyimpanan browser tidak tersedia." };
    writeJSON(SESSION_KEY, { username: acc.username, role: acc.role });
    return { ok: true };
  }

  /* ---------- Redirect aman ---------- */
  // Hanya alamat internal relatif ke root (mis. "keranjang.html", "admin/akun.html?x=1").
  // URL eksternal, "//host", "javascript:", dan halaman login/register ditolak.
  function safeNext(next, role) {
    var value = String(next || "");
    var ok = /^(admin\/)?[a-z0-9_-]+\.html(\?[a-z0-9_=&.%-]*)?$/i.test(value) &&
      !/^(admin\/)?(login|register)\.html/i.test(value);
    if (!ok) return null;
    var isAdminPage = value.indexOf("admin/") === 0;
    // Admin hanya dikembalikan ke halaman admin, client hanya ke halaman client
    if (role === "admin" && !isAdminPage) return null;
    if (role === "client" && isAdminPage) return null;
    return rootUrl(value);
  }

  function redirectAfterLogin(user, next) {
    window.location.replace(safeNext(next, user.role) || homeFor(user.role));
  }

  function loginUrl(next) {
    return rootUrl("login.html?required=1&next=" + encodeURIComponent(next));
  }

  /* ---------- Kontrol akses (dipanggil include.js untuk <body data-auth="role">) ---------- */
  function requireRole(role) {
    var user = getCurrentUser();
    if (!user) {
      window.location.replace(loginUrl(currentPath()));
      return false;
    }
    if (user.role !== role) {
      window.location.replace(homeFor(user.role) + "?denied=1");
      return false;
    }
    return true;
  }

  /* ---------- Pemberitahuan singkat ---------- */
  function showNotice(message) {
    var host = document.querySelector("main") || document.body;
    var old = document.querySelector(".access-notice");
    if (old) old.remove();
    var box = document.createElement("p");
    box.className = "access-notice";
    box.setAttribute("role", "alert");
    box.textContent = message;
    host.insertBefore(box, host.firstChild);
  }

  function showDeniedFromQuery() {
    var params = new URLSearchParams(window.location.search);
    if (params.get("denied") !== "1") return;
    showNotice("Akses ditolak: akun Anda tidak memiliki izin untuk halaman tersebut.");
    params.delete("denied");
    var query = params.toString();
    try {
      window.history.replaceState(null, "", window.location.pathname + (query ? "?" + query : "") + window.location.hash);
    } catch (e) { /* abaikan */ }
  }

  global.SLAuth = {
    login: login,
    logout: logout,
    registerClient: registerClient,
    getCurrentUser: getCurrentUser,
    isLoggedIn: isLoggedIn,
    hasRole: hasRole,
    requireRole: requireRole,
    homeFor: homeFor,
    rootUrl: rootUrl,
    currentPath: currentPath,
    loginUrl: loginUrl,
    safeNext: safeNext,
    redirectAfterLogin: redirectAfterLogin,
    getProfile: getProfile,
    updateProfile: updateProfile,
    listAccounts: listAccounts,
    isLockedAccount: isLockedAccount,
    updateRole: updateRole,
    deleteAccount: deleteAccount,
    showNotice: showNotice,
    showDeniedFromQuery: showDeniedFromQuery,
    SESSION_KEY: SESSION_KEY
  };
})(window);
