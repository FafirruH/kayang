/* ==========================================================================
   actions.js - tombol aksi berbentuk ikon + tooltip penjelas (halaman admin)
   Dipakai tabel Stok, Transaksi, Supplier, dan Akun.

   Contoh:
     SLActions.button("complete", { cls: "btn-complete", attrs: { "data-id": 5 } })
     SLActions.button("edit", { tag: "a", href: "stok-form.html?id=5", tip: "Edit barang ini" })

   Tooltip tampil saat kursor di atas ikon atau saat ikon difokus lewat keyboard,
   memakai atribut data-tooltip (satu tooltip bersama, tidak terpotong tabel).
   ========================================================================== */

(function () {
  "use strict";

  var NS = 'xmlns="http://www.w3.org/2000/svg"';
  var SVG = function (body) {
    return "<svg " + NS + ' viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"' +
      ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      body + "</svg>";
  };

  var ICONS = {
    check:  SVG('<path d="M20 6 9 17l-5-5"/>'),
    x:      SVG('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    eye:    SVG('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    pencil: SVG('<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>'),
    power:  SVG('<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>')
  };

  // type -> ikon, warna, penjelasan default (tooltip) & label aksesibilitas
  var TYPES = {
    complete:   { icon: "check",  tone: "ok",     tip: "Selesaikan transaksi ini" },
    cancel:     { icon: "x",      tone: "danger", tip: "Batalkan transaksi ini" },
    detail:     { icon: "eye",    tone: "info",   tip: "Lihat rincian transaksi" },
    edit:       { icon: "pencil", tone: "edit",   tip: "Edit data ini" },
    deactivate: { icon: "power",  tone: "danger", tip: "Nonaktifkan" },
    activate:   { icon: "power",  tone: "ok",     tip: "Aktifkan kembali" }
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * @param {string} type  complete | cancel | detail | edit | deactivate | activate
   * @param {object} opts  tag ("button"|"a"), href, cls, tip, label, attrs {nama: nilai}
   */
  function button(type, opts) {
    var def = TYPES[type] || TYPES.detail;
    opts = opts || {};
    var tip = opts.tip || def.tip;
    var label = opts.label || tip;
    var tag = opts.tag === "a" ? "a" : "button";

    var attrs = "";
    var extra = opts.attrs || {};
    Object.keys(extra).forEach(function (name) {
      attrs += " " + name + '="' + esc(extra[name]) + '"';
    });

    return "<" + tag +
      ' class="act-btn act-btn--' + def.tone + (opts.cls ? " " + esc(opts.cls) : "") + '"' +
      (tag === "a" ? ' href="' + esc(opts.href || "#") + '"' : ' type="button"') +
      ' data-tooltip="' + esc(tip) + '" aria-label="' + esc(label) + '"' + attrs + ">" +
      ICONS[def.icon] + "</" + tag + ">";
  }

  /* ---------- Tooltip bersama ---------- */
  var tipEl = null;
  var current = null;

  function ensureTip() {
    if (tipEl) return tipEl;
    tipEl = document.createElement("div");
    tipEl.className = "sl-tooltip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function show(target) {
    var text = target.getAttribute("data-tooltip");
    if (!text || target.disabled) return;
    var el = ensureTip();
    current = target;
    el.textContent = text;
    el.hidden = false;
    el.classList.remove("sl-tooltip--below");

    var rect = target.getBoundingClientRect();
    var tw = el.offsetWidth;
    var th = el.offsetHeight;
    var left = rect.left + rect.width / 2 - tw / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
    var top = rect.top - th - 10;
    if (top < 8) {                       // tidak muat di atas: tampil di bawah ikon
      top = rect.bottom + 10;
      el.classList.add("sl-tooltip--below");
    }
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
    el.style.setProperty("--tip-arrow", Math.round(rect.left + rect.width / 2 - left) + "px");
  }

  function hide() {
    current = null;
    if (tipEl) tipEl.hidden = true;
  }

  function targetOf(event) {
    return event.target && event.target.closest ? event.target.closest("[data-tooltip]") : null;
  }

  document.addEventListener("mouseover", function (event) {
    var t = targetOf(event);
    if (t && t !== current) show(t);
  });
  document.addEventListener("mouseout", function (event) {
    var t = targetOf(event);
    if (t && (!event.relatedTarget || !t.contains(event.relatedTarget))) hide();
  });
  document.addEventListener("focusin", function (event) {
    var t = targetOf(event);
    if (t) show(t);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("click", hide);
  document.addEventListener("keydown", function (event) { if (event.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  window.SLActions = { button: button };
})();
