/* ==========================================================================
   admin/js/datatable.js — DataTable utility (vanilla JS, server-side)
   Fitur: search + debounce, sort kolom, pagination cerdas, row count.

   Pemakaian:
     var dt = new SLDataTable({
       tableId:  "stok-table",       // id <table>
       searchId: "stok-search",      // id <input> pencarian (opsional)
       paginId:  "stok-pagination",  // id kontainer pagination (opsional)
       countId:  "stok-count",       // id elemen row count (opsional)
       colspan:  5,                  // jumlah kolom untuk empty/loading row
       per:      15,                 // baris per halaman
       defaultSort:  "nama_barang",  // kolom sort awal (opsional)
       defaultOrder: "asc",          // arah sort awal (opsional)
       emptyText: "Tidak ada data.", // teks kosong custom (opsional)
       params: function() { return { role: state.role }; }, // param tambahan
       fetch:     function(params) { return SLApi.get("/api/...", params); },
       renderRow: function(item)   { return "<tr>...</tr>"; }
     });
     dt.load();  // panggil pertama kali secara manual
   ========================================================================== */

(function (global) {
  "use strict";

  function SLDataTable(cfg) {
    this.cfg   = cfg;
    this.state = {
      q:     "",
      sort:  cfg.defaultSort  || "",
      order: cfg.defaultOrder || "asc",
      page:  1,
      per:   cfg.per || 15
    };
    this.total = 0;
    this._init();
  }

  /* ── Init: pasang event listener ───────────────────────────────────────── */
  SLDataTable.prototype._init = function () {
    var self = this;
    var cfg  = this.cfg;

    this.tbody   = document.querySelector("#" + cfg.tableId + " tbody");
    this.paginEl = cfg.paginId  ? document.getElementById(cfg.paginId)  : null;
    this.searchEl= cfg.searchId ? document.getElementById(cfg.searchId) : null;
    this.countEl = cfg.countId  ? document.getElementById(cfg.countId)  : null;

    /* Sort header */
    var ths = document.querySelectorAll("#" + cfg.tableId + " thead th[data-sort]");
    ths.forEach(function (th) {
      th.classList.add("sortable-col");
      th.setAttribute("tabindex", "0");
      th.setAttribute("role", "button");
      // buat span indikator
      var ind = document.createElement("span");
      ind.className = "sort-ind";
      ind.setAttribute("aria-hidden", "true");
      ind.textContent = " ↕";
      th.appendChild(ind);

      th.addEventListener("click", function () { self._toggleSort(th.dataset.sort); });
      th.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); self._toggleSort(th.dataset.sort); }
      });
    });

    /* Search */
    if (this.searchEl) {
      var timer;
      this.searchEl.addEventListener("input", function () {
        clearTimeout(timer);
        var val = this.value;
        timer = setTimeout(function () { self.state.q = val; self.state.page = 1; self.load(); }, 350);
      });
    }

    /* Pagination */
    if (this.paginEl) {
      this.paginEl.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-page]");
        if (!btn || btn.disabled) return;
        self.state.page = parseInt(btn.dataset.page, 10);
        self.load();
      });
    }
  };

  /* ── Sort ──────────────────────────────────────────────────────────────── */
  SLDataTable.prototype._toggleSort = function (key) {
    if (this.state.sort === key) {
      this.state.order = this.state.order === "asc" ? "desc" : "asc";
    } else {
      this.state.sort  = key;
      this.state.order = "asc";
    }
    this.state.page = 1;
    this.load();
  };

  SLDataTable.prototype._updateSortUI = function () {
    var state = this.state;
    var ths   = document.querySelectorAll("#" + this.cfg.tableId + " thead th[data-sort]");
    ths.forEach(function (th) {
      var ind = th.querySelector(".sort-ind");
      if (th.dataset.sort === state.sort) {
        th.setAttribute("aria-sort", state.order === "asc" ? "ascending" : "descending");
        th.classList.add("is-sorted");
        if (ind) ind.textContent = state.order === "asc" ? " ↑" : " ↓";
      } else {
        th.removeAttribute("aria-sort");
        th.classList.remove("is-sorted");
        if (ind) ind.textContent = " ↕";
      }
    });
  };

  /* ── Pagination ─────────────────────────────────────────────────────────── */
  SLDataTable.prototype._renderPagination = function (meta) {
    if (!this.paginEl) return;
    var total   = Number(meta.total) || 0;
    var current = Number(meta.page)  || 1;
    var pages   = Math.ceil(total / this.state.per);

    if (this.countEl) {
      this.countEl.textContent = total.toLocaleString("id-ID") + " data";
    }

    if (pages <= 1) { this.paginEl.innerHTML = ""; return; }

    var html = "";

    /* Tombol ← */
    html += '<button class="page-btn" data-page="' + (current - 1) + '"' +
      (current <= 1 ? " disabled" : "") + ' aria-label="Halaman sebelumnya">&#8592;</button>';

    /* Nomor halaman (maks 5 di sekitar current) */
    var start = Math.max(1, current - 2);
    var end   = Math.min(pages, current + 2);

    if (start > 1) {
      html += '<button class="page-btn" data-page="1">1</button>';
      if (start > 2) html += '<span class="page-ellipsis">…</span>';
    }
    for (var p = start; p <= end; p++) {
      html += '<button class="page-btn' + (p === current ? " page-btn--active" : "") +
        '" data-page="' + p + '" aria-current="' + (p === current ? "page" : "false") + '">' + p + "</button>";
    }
    if (end < pages) {
      if (end < pages - 1) html += '<span class="page-ellipsis">…</span>';
      html += '<button class="page-btn" data-page="' + pages + '">' + pages + "</button>";
    }

    /* Tombol → */
    html += '<button class="page-btn" data-page="' + (current + 1) + '"' +
      (current >= pages ? " disabled" : "") + ' aria-label="Halaman berikutnya">&#8594;</button>';

    this.paginEl.innerHTML = html;
  };

  /* ── Load ──────────────────────────────────────────────────────────────── */
  SLDataTable.prototype.load = function () {
    var self    = this;
    var cfg     = this.cfg;
    var colspan = cfg.colspan || 6;

    if (!this.tbody) return;

    this.tbody.innerHTML = '<tr><td colspan="' + colspan +
      '" class="data-table__empty-cell"><span class="loading-dots">Memuat data</span></td></tr>';

    this._updateSortUI();

    /* Bangun params */
    var params = {
      q:     this.state.q     || undefined,
      sort:  this.state.sort  || undefined,
      order: this.state.order || undefined,
      page:  this.state.page,
      per:   this.state.per
    };
    /* Merge params tambahan dari cfg.params() */
    if (cfg.params) {
      var extra = typeof cfg.params === "function" ? cfg.params() : cfg.params;
      Object.keys(extra).forEach(function (k) {
        if (extra[k] !== undefined && extra[k] !== "") params[k] = extra[k];
      });
    }

    cfg.fetch(params)
      .then(function (res) {
        var rows = res.data || [];
        var meta = res.meta || {};
        self.total = Number(meta.total) || rows.length;

        if (!rows.length) {
          self.tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="data-table__empty-cell">' +
            (cfg.emptyText || "Tidak ada data ditemukan.") + "</td></tr>";
          if (self.paginEl) self.paginEl.innerHTML = "";
          if (self.countEl) self.countEl.textContent = "0 data";
          return;
        }

        /* Client-side sort sebagai fallback (jika backend tidak mendukung) */
        if (self.state.sort) {
          var key = self.state.sort;
          var asc = self.state.order === "asc";
          rows = rows.slice().sort(function (a, b) {
            var va = a[key]; var vb = b[key];
            if (va === undefined || va === null) va = "";
            if (vb === undefined || vb === null) vb = "";
            if (typeof va === "number" && typeof vb === "number") return asc ? va - vb : vb - va;
            return asc
              ? String(va).localeCompare(String(vb), "id")
              : String(vb).localeCompare(String(va), "id");
          });
        }

        self.tbody.innerHTML = rows.map(cfg.renderRow).join("");
        self._renderPagination(meta);
      })
      .catch(function (err) {
        self.tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="data-table__empty-cell data-table__error">' +
          "Gagal memuat: " + (err && err.message ? err.message : "server error") + "</td></tr>";
      });
  };

  global.SLDataTable = SLDataTable;
})(window);
