/* ==========================================================================
   admin/js/transaksi.js - Halaman manajemen transaksi & kartu stok
   Fitur:
     - Daftar transaksi (filter tipe, status, tanggal, pencarian)
     - Selesaikan / batalkan transaksi PENDING
     - Buat penjualan baru (dari stok)
     - Kartu stok per barang (riwayat keluar-masuk)
   ========================================================================== */

(function () {
  "use strict";

  if (!window.SLApi)       { console.error("[transaksi.js] SLApi belum dimuat"); return; }
  if (!window.SLDataTable) { console.error("[transaksi.js] datatable.js belum dimuat"); return; }

  /* ═══ Helpers ══════════════════════════════════════════════════════════ */
  function money(n) { return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID"); }
  function esc(s) { return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function fmt(ts) { return ts ? new Date(ts).toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "-"; }
  function badgeClass(s) { return "badge "+({PENDING:"badge--pending",COMPLETED:"badge--done",CANCELLED:"badge--off",EXPIRED:"badge--off"}[s]||"badge--pending"); }
  function tipeBadge(t) { return "badge "+({OUT:"badge--process",IN:"badge--shipped",ADJ_IN:"badge--done",ADJ_OUT:"badge--off"}[t]||"badge--pending"); }
  function tipeLabel(t) { return {OUT:"Penjualan",IN:"Pembelian",ADJ_IN:"Koreksi +",ADJ_OUT:"Koreksi -"}[t]||t; }
  function statusLabel(s) { return {PENDING:"Pending",COMPLETED:"Selesai",CANCELLED:"Dibatalkan",EXPIRED:"Kedaluwarsa"}[s]||s; }

  /* ═══ Filter state ══════════════════════════════════════════════════════ */
  var filter = { tipe: "", status: "", from: "", to: "" };

  var filterTipe = document.getElementById("filter-tipe");
  var filterSts  = document.getElementById("filter-status");
  var filterFrom = document.getElementById("filter-from");
  var filterTo   = document.getElementById("filter-to");
  var btnReset   = document.getElementById("filter-reset");

  /* ═══ DataTable ═════════════════════════════════════════════════════════ */
  var dt = new SLDataTable({
    tableId:     "transaksi-table",
    searchId:    "filter-q",
    paginId:     "transaksi-pagination",
    countId:     "transaksi-count",
    colspan:     7,
    per:         15,
    defaultSort: "tgl_transaksi",
    defaultOrder:"desc",
    emptyText:   "Tidak ada transaksi ditemukan.",
    params:      function () { return { tipe: filter.tipe, status: filter.status, from: filter.from, to: filter.to }; },
    fetch:       function (p) { return SLApi.get("/api/admin/transactions", p); },
    renderRow:   function (r) {
      var pihak   = r.nama_pelanggan || r.nama_supplier || "-";
      var actions = r.status === "PENDING"
        ? '<button class="btn btn--sm btn--primary btn-complete" data-id="'+r.transaction_id+'" data-tipe="'+esc(r.tipe_transaksi)+'" title="Selesaikan">&#10003; Selesai</button> ' +
          '<button class="btn btn--sm btn--danger btn-cancel" data-id="'+r.transaction_id+'" title="Batalkan">&times; Batal</button>'
        : '<button class="btn btn--sm btn--ghost btn-detail" data-id="'+r.transaction_id+'" title="Detail">Detail</button>';
      return (
        "<tr>" +
          '<td data-label="Invoice" class="data-table__id"><a class="btn-link btn-detail" data-id="'+r.transaction_id+'">'+esc(r.no_faktur)+"</a></td>"+
          '<td data-label="Tipe"><span class="'+tipeBadge(r.tipe_transaksi)+'">'+tipeLabel(r.tipe_transaksi)+"</span></td>"+
          '<td data-label="Pihak">'+esc(pihak)+"</td>"+
          '<td data-label="Tanggal">'+fmt(r.tgl_transaksi)+"</td>"+
          '<td data-label="Total" class="data-table__soft">'+money(r.total_bayar)+"</td>"+
          '<td data-label="Status"><span class="'+badgeClass(r.status)+'">'+statusLabel(r.status)+"</span></td>"+
          '<td data-label="Aksi" class="data-table__actions">'+actions+"</td>"+
        "</tr>"
      );
    }
  });

  /* ═══ Filter events ═════════════════════════════════════════════════════ */
  function attachFilters() {
    if (filterTipe) filterTipe.addEventListener("change", function () { filter.tipe   = this.value; dt.state.page=1; dt.load(); });
    if (filterSts)  filterSts.addEventListener("change",  function () { filter.status = this.value; dt.state.page=1; dt.load(); });
    if (filterFrom) filterFrom.addEventListener("change", function () { filter.from   = this.value; dt.state.page=1; dt.load(); });
    if (filterTo)   filterTo.addEventListener("change",   function () { filter.to     = this.value; dt.state.page=1; dt.load(); });
    if (btnReset) {
      btnReset.addEventListener("click", function () {
        filter = { tipe:"", status:"", from:"", to:"" };
        if (filterTipe) filterTipe.value = "";
        if (filterSts)  filterSts.value  = "";
        if (filterFrom) filterFrom.value = "";
        if (filterTo)   filterTo.value   = "";
        var q = document.getElementById("filter-q");
        if (q) q.value = "";
        dt.state.q = ""; dt.state.page = 1; dt.load();
      });
    }
  }

  /* ═══ Table click delegation ════════════════════════════════════════════ */
  var tbody = document.querySelector("#transaksi-table tbody");
  if (tbody) {
    tbody.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-id]");
      if (!btn) return;
      var id = btn.dataset.id;
      if (btn.classList.contains("btn-detail") || btn.classList.contains("btn-link")) { openModal(id); return; }
      if (btn.classList.contains("btn-complete")) { doComplete(id, btn.dataset.tipe, btn); return; }
      if (btn.classList.contains("btn-cancel"))   { doCancel(id, btn); }
    });
  }

  /* ═══ Modal detail ══════════════════════════════════════════════════════ */
  var modal      = document.getElementById("detail-modal");
  var modalClose = document.getElementById("modal-close");
  var modalBody  = document.getElementById("modal-body");
  var modalTitle = document.getElementById("modal-title");

  function openModal(id) {
    if (!modal || !modalBody) return;
    modalBody.innerHTML = '<p class="modal-loading">Memuat…</p>';
    if (modalTitle) modalTitle.textContent = "Detail Transaksi";
    modal.hidden = false; modal.setAttribute("aria-hidden","false");
    SLApi.get("/api/admin/transactions/"+id)
      .then(function (res) {
        var t = res.data || res;
        var pihak = t.nama_pelanggan || t.nama_supplier || "-";
        var items = t.items || t.details || [];
        var itemsHtml = items.length
          ? '<table class="modal-table"><thead><tr><th>Barang</th><th>Jml</th><th>Harga</th><th>Subtotal</th></tr></thead><tbody>' +
              items.map(function(i){ return "<tr><td>"+esc(i.nama_barang)+"</td><td>"+esc(String(i.jumlah))+"</td><td>"+money(i.harga_satuan_real)+"</td><td>"+money(i.subtotal)+"</td></tr>"; }).join("") +
            "</tbody></table>"
          : "<p>Tidak ada detail barang.</p>";
        modalTitle.textContent = t.no_faktur || "Detail";
        modalBody.innerHTML =
          '<div class="modal-grid">'+
            '<div class="modal-row"><span>Tipe</span><span>'+tipeLabel(t.tipe_transaksi)+"</span></div>"+
            '<div class="modal-row"><span>Status</span><span><span class="'+badgeClass(t.status)+'">'+statusLabel(t.status)+"</span></span></div>"+
            '<div class="modal-row"><span>Pihak</span><span>'+esc(pihak)+"</span></div>"+
            '<div class="modal-row"><span>Tanggal</span><span>'+fmt(t.tgl_transaksi)+"</span></div>"+
            (t.metode_bayar?'<div class="modal-row"><span>Metode Bayar</span><span>'+esc(t.metode_bayar)+"</span></div>":"")+
            (t.expired_at?'<div class="modal-row"><span>Batas Tahan</span><span>'+fmt(t.expired_at)+"</span></div>":"")+
          "</div>"+itemsHtml+
          '<div class="modal-total"><strong>Total: '+money(t.total_bayar)+"</strong></div>"+
          (t.catatan?'<p class="modal-note"><em>'+esc(t.catatan)+"</em></p>":"");
      })
      .catch(function () { modalBody.innerHTML = '<p class="modal-error">Gagal memuat detail.</p>'; });
  }

  function closeModal() { if (modal) { modal.hidden=true; modal.setAttribute("aria-hidden","true"); } }
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function(e){ if(e.target===modal) closeModal(); });
    document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeModal(); });
  }

  /* ═══ Selesaikan / batalkan ═════════════════════════════════════════════ */
  function doComplete(id, tipe, btn) {
    var metode = null;
    if (tipe === "OUT" || tipe === "IN") {
      metode = window.prompt("Metode pembayaran (TUNAI / TRANSFER / QRIS):", "TUNAI");
      if (!metode) return;
      metode = metode.toUpperCase();
      if (["TUNAI","TRANSFER","QRIS"].indexOf(metode) === -1) { alert("Metode tidak valid."); return; }
    }
    btn.disabled = true;
    var body = { status: "COMPLETED" };
    if (metode) body.metode_bayar = metode;
    SLApi.patch("/api/admin/transactions/"+id+"/status", body)
      .then(function () { if (SLApi.notifyStockChanged) SLApi.notifyStockChanged(); dt.load(); })
      .catch(function (err) { btn.disabled=false; alert("Gagal: "+(err&&err.message?err.message:"error")); });
  }

  function doCancel(id, btn) {
    if (!confirm("Batalkan transaksi ini? Stok yang ditahan akan dilepas.")) return;
    btn.disabled = true;
    SLApi.patch("/api/admin/transactions/"+id+"/status", { status:"CANCELLED" })
      .then(function () { dt.load(); })
      .catch(function (err) { btn.disabled=false; alert("Gagal: "+(err&&err.message?err.message:"error")); });
  }

  /* ═══ Penjualan baru ════════════════════════════════════════════════════ */
  var saleModal  = document.getElementById("sale-modal");
  var saleForm   = document.getElementById("sale-form");
  var saleClose  = document.getElementById("sale-modal-close");
  var btnNewSale = document.getElementById("btn-new-sale");
  var saleItems  = document.getElementById("sale-items");
  var btnAddItem = document.getElementById("sale-add-item");
  var saleStatus = document.getElementById("sale-status");
  var productCache = [];

  function openSaleModal() {
    if (!saleModal) return;
    if (saleForm) saleForm.reset();
    if (saleStatus) { saleStatus.textContent=""; saleStatus.hidden=true; }
    if (saleItems)  { saleItems.innerHTML=""; addSaleItemRow(); }
    saleModal.hidden = false;
  }
  function closeSaleModal() { if (saleModal) saleModal.hidden=true; }

  if (btnNewSale) btnNewSale.addEventListener("click", openSaleModal);
  if (saleClose)  saleClose.addEventListener("click",  closeSaleModal);
  if (saleModal)  saleModal.addEventListener("click",  function(e){ if(e.target===saleModal) closeSaleModal(); });

  SLApi.get("/api/admin/products", { per: 200 })
    .then(function (res) { productCache = res.data || []; })
    .catch(function () {});

  function addSaleItemRow() {
    if (!saleItems) return;
    var idx  = saleItems.querySelectorAll(".sale-item-row").length;
    var opts = '<option value="">-- Pilih Barang --</option>' +
      productCache.filter(function(p){ return p.aktif!==false; }).map(function(p){
        return '<option value="'+p.product_id+'" data-harga="'+(p.harga_jual_default||p.harga_jual||0)+'">'+
          esc(p.nama_barang)+' (stok: '+(p.stok||0)+')</option>';
      }).join("");
    var row = document.createElement("div");
    row.className = "sale-item-row";
    row.innerHTML =
      '<select class="form-input sale-item-product" name="items['+idx+'][product_id]" required>'+opts+"</select>"+
      '<input class="form-input sale-item-qty" type="number" name="items['+idx+'][qty]" min="1" value="1" placeholder="Jml" required />'+
      '<input class="form-input sale-item-harga" type="number" name="items['+idx+'][harga]" min="0" placeholder="Harga (opsional)" />'+
      '<button type="button" class="btn btn--sm btn--danger sale-item-remove" title="Hapus baris">&times;</button>';
    saleItems.appendChild(row);
    row.querySelector(".sale-item-product").addEventListener("change", function(){
      var opt = this.options[this.selectedIndex];
      row.querySelector(".sale-item-harga").value = opt ? (opt.dataset.harga||"") : "";
    });
    row.querySelector(".sale-item-remove").addEventListener("click", function(){
      if (saleItems.querySelectorAll(".sale-item-row").length > 1) row.remove();
    });
  }

  if (btnAddItem) btnAddItem.addEventListener("click", addSaleItemRow);

  if (saleForm) {
    saleForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var custId   = saleForm.querySelector("#sale-customer-id");
      var custNama = saleForm.querySelector("#sale-customer-nama");
      var diskon   = saleForm.querySelector("#sale-diskon");
      var items = Array.prototype.map.call(saleItems.querySelectorAll(".sale-item-row"), function(row){
        var pid   = parseInt(row.querySelector(".sale-item-product").value,10);
        var qty   = parseInt(row.querySelector(".sale-item-qty").value,10);
        var harga = row.querySelector(".sale-item-harga").value;
        var obj   = { product_id:pid, jumlah:qty };
        if (harga) obj.harga = parseInt(harga,10);
        return obj;
      }).filter(function(i){ return i.product_id>0 && i.jumlah>0; });

      if (!items.length) {
        if (saleStatus) { saleStatus.textContent="Tambahkan minimal satu barang."; saleStatus.hidden=false; }
        return;
      }
      var body = { items:items, diskon: diskon?parseInt(diskon.value,10)||0:0 };
      if (custId   && custId.value)   body.customer_id    = parseInt(custId.value,10);
      if (custNama && custNama.value) body.nama_pelanggan = custNama.value.trim();
      if (!body.customer_id && !body.nama_pelanggan) {
        if (saleStatus) { saleStatus.textContent="Isi ID pelanggan atau nama pembeli umum."; saleStatus.hidden=false; }
        return;
      }
      var submitBtn = saleForm.querySelector("[type=submit]");
      if (submitBtn) submitBtn.disabled=true;
      SLApi.post("/api/admin/transactions/sales", body)
        .then(function(){ closeSaleModal(); if(SLApi.notifyStockChanged)SLApi.notifyStockChanged(); dt.load(); })
        .catch(function(err){
          if(submitBtn) submitBtn.disabled=false;
          if(saleStatus){ saleStatus.textContent="Gagal: "+(err&&err.message?err.message:"error"); saleStatus.hidden=false; }
        });
    });
  }

  /* ═══ Kartu stok ════════════════════════════════════════════════════════ */
  var kartuForm   = document.getElementById("kartu-stok-form");
  var kartuSelect = document.getElementById("kartu-product-id");
  var kartuTable  = document.querySelector("#kartu-table tbody");

  SLApi.get("/api/admin/products", { per: 300 })
    .then(function (res) {
      var products = res.data || [];
      if (!kartuSelect) return;
      kartuSelect.innerHTML = '<option value="">-- Pilih Barang --</option>' +
        products.map(function(p){
          return '<option value="'+p.product_id+'">'+esc(p.kode_barang)+" - "+esc(p.nama_barang)+"</option>";
        }).join("");
    }).catch(function(){});

  function loadKartuStok(productId) {
    if (!kartuTable || !productId) return;
    kartuTable.innerHTML = '<tr><td colspan="7" class="data-table__empty-cell">Memuat…</td></tr>';
    SLApi.get("/api/admin/reports/kartu-stok", { product_id:productId, limit:50 })
      .then(function(res){
        var rows = res.data || [];
        if (!rows.length) { kartuTable.innerHTML='<tr><td colspan="7" class="data-table__empty-cell">Belum ada riwayat.</td></tr>'; return; }
        kartuTable.innerHTML = rows.map(function(r){
          var p = Number(r.perubahan);
          return "<tr>"+
            "<td>"+fmt(r.waktu)+"</td><td>"+esc(r.no_faktur)+"</td><td>"+esc(tipeLabel(r.tipe_transaksi))+"</td>"+
            "<td>"+esc(String(r.stok_awal))+"</td>"+
            '<td class="'+(p>0?"stok-plus":"stok-minus")+'">'+(p>0?"+":"")+p+"</td>"+
            "<td><strong>"+esc(String(r.stok_akhir))+"</strong></td>"+
            "<td>"+esc(r.catatan||"-")+"</td>"+
          "</tr>";
        }).join("");
      })
      .catch(function(){ kartuTable.innerHTML='<tr><td colspan="7" class="data-table__error">Gagal memuat kartu stok.</td></tr>'; });
  }

  if (kartuForm) kartuForm.addEventListener("submit", function(e){ e.preventDefault(); if(kartuSelect) loadKartuStok(kartuSelect.value); });

  /* ═══ Boot ══════════════════════════════════════════════════════════════ */
  attachFilters();
  dt.load();
  if (SLApi.autoRefresh) SLApi.autoRefresh(function(){ dt.load(); }, (window.SL_CONFIG&&SL_CONFIG.REFRESH_MS)||30000);

  document.addEventListener("DOMContentLoaded", function(){
    var btn = document.getElementById("sale-modal-close-footer");
    if (btn) btn.addEventListener("click", closeSaleModal);
  });
})();
