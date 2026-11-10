/* ==========================================================================
   admin/js/transaksi.js - Halaman manajemen transaksi & kartu stok
   Fitur:
     - Daftar transaksi (filter tipe, status, tanggal, pencarian)
     - Selesaikan / batalkan transaksi PENDING
     - Buat penjualan baru (dari stok)
     - Catat barang masuk dari supplier untuk barang yang sudah terdaftar
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

  function fetchAllProducts(page, products) {
    return SLApi.get("/api/admin/products", { page: page, per_page: 50, aktif: "all" })
      .then(function (res) {
        var rows = res.data || [];
        products = products.concat(rows);
        var totalPages = Number(res.meta && res.meta.total_pages) || 1;
        if (page < totalPages) return fetchAllProducts(page + 1, products);
        return products;
      });
  }

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
    countId:     "transaksi-count",
    colspan:     7,
    per:         50,
    allRows:     true,
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

  /* ═══ Dialog konfirmasi dan pembayaran ══════════════════════════════════ */
  var actionDialog = document.getElementById("action-dialog");
  var actionTitle = document.getElementById("action-dialog-title");
  var actionMessage = document.getElementById("action-dialog-message");
  var actionPaymentWrap = document.getElementById("action-payment-wrap");
  var actionPayment = document.getElementById("action-payment-method");
  var actionCancel = document.getElementById("action-dialog-cancel");
  var actionConfirm = document.getElementById("action-dialog-confirm");
  var actionClose = document.getElementById("action-dialog-close");
  var actionResolver = null;
  var actionMode = "confirm";

  function closeActionDialog(value) {
    if (!actionDialog || actionDialog.hidden) return;
    actionDialog.hidden = true;
    var resolve = actionResolver;
    actionResolver = null;
    if (resolve) resolve(value);
  }

  function openActionDialog(options) {
    actionMode = options.mode || "confirm";
    actionTitle.textContent = options.title;
    actionMessage.textContent = options.message;
    actionPaymentWrap.hidden = !options.payment;
    actionCancel.hidden = actionMode === "notice";
    actionConfirm.textContent = options.confirmLabel || (actionMode === "notice" ? "Tutup" : "Lanjutkan");
    actionConfirm.className = "btn " + (options.danger ? "btn--danger" : "btn--primary");
    if (options.payment) actionPayment.value = "TUNAI";
    actionDialog.hidden = false;
    if (options.payment) actionPayment.focus();
    else actionConfirm.focus();
    return new Promise(function (resolve) {
      actionResolver = resolve;
    });
  }

  function showActionError(message) {
    return openActionDialog({
      mode: "notice",
      title: "Transaksi Gagal",
      message: message || "Terjadi kesalahan saat memproses transaksi."
    });
  }

  actionConfirm.addEventListener("click", function () {
    closeActionDialog(actionMode === "notice" ? true :
      (actionPaymentWrap.hidden ? true : actionPayment.value));
  });
  actionCancel.addEventListener("click", function () { closeActionDialog(null); });
  actionClose.addEventListener("click", function () { closeActionDialog(null); });
  actionDialog.addEventListener("click", function (event) {
    if (event.target === actionDialog) closeActionDialog(null);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && actionDialog && !actionDialog.hidden) closeActionDialog(null);
  });

  /* ═══ Selesaikan / batalkan ═════════════════════════════════════════════ */
  function doComplete(id, tipe, btn) {
    var needsPayment = tipe === "OUT" || tipe === "IN";
    var choice = needsPayment
      ? openActionDialog({
          title: "Selesaikan Transaksi",
          message: "Pilih metode pembayaran untuk menyelesaikan transaksi ini.",
          payment: true,
          confirmLabel: "Selesaikan"
        })
      : Promise.resolve(true);

    choice.then(function (metode) {
      if (metode === null) return;
      btn.disabled = true;
      var body = { status: "COMPLETED" };
      if (needsPayment) body.metode_bayar = metode;
      SLApi.patch("/api/admin/transactions/" + id + "/status", body)
        .then(function () {
          if (SLApi.notifyStockChanged) SLApi.notifyStockChanged();
          dt.load();
        })
        .catch(function (err) {
          btn.disabled = false;
          showActionError("Gagal menyelesaikan transaksi: " + (err && err.message ? err.message : "Terjadi kesalahan."));
        });
    });
  }

  function doCancel(id, btn) {
    openActionDialog({
      title: "Batalkan Transaksi?",
      message: "Transaksi ini akan dibatalkan dan stok yang ditahan akan dilepas.",
      confirmLabel: "Ya, Batalkan",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) return;
      btn.disabled = true;
      SLApi.patch("/api/admin/transactions/" + id + "/status", { status: "CANCELLED" })
        .then(function () { dt.load(); })
        .catch(function (err) {
          btn.disabled = false;
          showActionError("Gagal membatalkan transaksi: " + (err && err.message ? err.message : "Terjadi kesalahan."));
        });
    });
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
  var productLoading = true;
  var productLoadError = "";

  function refreshSaleProductOptions() {
    if (!saleItems) return;
    Array.prototype.forEach.call(saleItems.querySelectorAll(".sale-item-product"), function (select) {
      var search = select.closest(".sale-item-product-field").querySelector(".sale-item-product-search");
      renderSaleProductOptions(select, search ? search.value : "");
    });
  }

  function openSaleModal() {
    if (!saleModal) return;
    if (saleForm) saleForm.reset();
    if (saleStatus) {
      saleStatus.textContent = productLoadError || (productLoading ? "Memuat daftar barang..." : "");
      saleStatus.hidden = !productLoadError && !productLoading;
    }
    if (saleItems)  { saleItems.innerHTML=""; addSaleItemRow(); }
    saleModal.hidden = false;
  }
  function closeSaleModal() { if (saleModal) saleModal.hidden=true; }

  if (btnNewSale) btnNewSale.addEventListener("click", openSaleModal);
  if (saleClose)  saleClose.addEventListener("click",  closeSaleModal);
  if (saleModal)  saleModal.addEventListener("click",  function(e){ if(e.target===saleModal) closeSaleModal(); });

  fetchAllProducts(1, [])
    .then(function (products) {
      productCache = products;
      productLoading = false;
      refreshSaleProductOptions();
      refreshPurchaseProductOptions();
      refreshPurchaseLoadStatus();
      if (saleStatus && (saleStatus.textContent === "Memuat daftar barang..." || productLoadError)) {
        saleStatus.textContent = "";
        saleStatus.hidden = true;
      }
    })
    .catch(function (err) {
      productLoading = false;
      productLoadError = "Gagal memuat daftar barang: " + (err && err.message ? err.message : "server error");
      refreshSaleProductOptions();
      refreshPurchaseProductOptions();
      refreshPurchaseLoadStatus();
      if (saleStatus && saleModal && !saleModal.hidden) {
        saleStatus.textContent = productLoadError;
        saleStatus.hidden = false;
      }
      console.error("[transaksi.js] Gagal memuat daftar barang:", err);
    });

  function renderSaleProductOptions(select, query) {
    var search = String(query || "").trim().toLocaleLowerCase("id-ID");
    var products = productCache.filter(function (p) {
      if (p.aktif === false) return false;
      var searchable = [p.nama_barang, p.kode_barang, p.merk]
        .join(" ").toLocaleLowerCase("id-ID");
      return !search || searchable.indexOf(search) !== -1;
    });

    var placeholder = productLoading ? "Memuat daftar barang..." :
      (productLoadError ? "Daftar barang gagal dimuat" : (products.length ? "Pilih Barang" : "Barang tidak ditemukan"));
    select.innerHTML = '<option value="">'+placeholder+'</option>' +
      products.map(function (p) {
        return '<option value="'+p.product_id+'" data-harga="'+(p.harga_jual_default||p.harga_jual||0)+'">'+
          esc(p.nama_barang)+(p.kode_barang ? " ("+esc(p.kode_barang)+")" : "")+
          ' — stok: '+(p.stok||0)+'</option>';
      }).join("");
  }

  function addSaleItemRow() {
    if (!saleItems) return;
    var idx  = saleItems.querySelectorAll(".sale-item-row").length;
    var row = document.createElement("div");
    row.className = "sale-item-row";
    row.innerHTML =
      '<div class="form-field sale-item-product-field">'+
        '<label class="form-field__label" for="sale-product-search-'+idx+'">Cari Barang</label>'+
        '<input class="form-input sale-item-product-search" id="sale-product-search-'+idx+'" type="search" placeholder="Nama, kode, atau merek" autocomplete="off" />'+
        '<label class="form-field__label sale-product-select-label" for="sale-product-'+idx+'">Pilih Barang</label>'+
        '<select class="form-input sale-item-product" id="sale-product-'+idx+'" name="items['+idx+'][product_id]" required></select>'+
      "</div>"+
      '<div class="form-field">'+
        '<label class="form-field__label" for="sale-qty-'+idx+'">Jumlah</label>'+
        '<input class="form-input sale-item-qty" id="sale-qty-'+idx+'" type="number" name="items['+idx+'][qty]" min="1" value="1" required />'+
      "</div>"+
      '<div class="form-field sale-item-harga-field">'+
        '<label class="form-field__label" for="sale-price-'+idx+'">Harga (Rp)</label>'+
        '<input class="form-input sale-item-harga" id="sale-price-'+idx+'" type="number" name="items['+idx+'][harga]" min="0" placeholder="Opsional" />'+
      "</div>"+
      '<button type="button" class="btn btn--sm btn--danger sale-item-remove" title="Hapus baris" aria-label="Hapus barang">&times;</button>';
    saleItems.appendChild(row);
    var productSelect = row.querySelector(".sale-item-product");
    var productSearch = row.querySelector(".sale-item-product-search");
    renderSaleProductOptions(productSelect, "");
    productSearch.addEventListener("input", function () {
      renderSaleProductOptions(productSelect, this.value);
    });
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

  /* ═══ Barang masuk ═══════════════════════════════════════════════════════ */
  var purchaseModal = document.getElementById("purchase-modal");
  var purchaseForm = document.getElementById("purchase-form");
  var purchaseItems = document.getElementById("purchase-items");
  var purchaseStatus = document.getElementById("purchase-status");
  var purchaseSupplier = document.getElementById("purchase-supplier");
  var purchaseSubmit = document.getElementById("purchase-submit");
  var purchaseSuppliers = [];
  var suppliersLoading = true;
  var suppliersLoadError = "";
  var purchaseRowIndex = 0;

  function setPurchaseStatus(kind, message) {
    if (!purchaseStatus) return;
    purchaseStatus.className = "form-status form-status--" + (kind === "success" ? "ok" : "warn");
    purchaseStatus.textContent = message;
    purchaseStatus.hidden = false;
  }

  function refreshPurchaseLoadStatus() {
    if (!purchaseModal || purchaseModal.hidden || !purchaseStatus) return;
    if (productLoadError) setPurchaseStatus("error", productLoadError);
    else if (productLoading) setPurchaseStatus("error", "Memuat daftar barang...");
    else if (suppliersLoadError) setPurchaseStatus("error", "Gagal memuat supplier: " + suppliersLoadError);
    else if (suppliersLoading) setPurchaseStatus("error", "Memuat daftar supplier...");
    else if (!purchaseSuppliers.length) {
      setPurchaseStatus("error", "Belum ada supplier aktif. Tambahkan supplier melalui menu Supplier terlebih dahulu.");
    } else {
      purchaseStatus.hidden = true;
    }
  }

  function loadPurchaseSuppliers(page, rows) {
    return SLApi.get("/api/admin/suppliers", { page: page, per_page: 50, aktif: "true" })
      .then(function (res) {
        rows = rows.concat(res.data || []);
        var pages = Number(res.meta && res.meta.total_pages) || 1;
        if (page < pages) return loadPurchaseSuppliers(page + 1, rows);
        purchaseSuppliers = rows;
        suppliersLoading = false;
        if (purchaseSupplier) {
          purchaseSupplier.innerHTML = '<option value="">Pilih supplier</option>' +
            rows.map(function (supplier) {
              return '<option value="' + supplier.id + '">' + esc(supplier.nama_supplier) + "</option>";
            }).join("");
        }
        refreshPurchaseLoadStatus();
        return rows;
      })
      .catch(function (error) {
        suppliersLoading = false;
        suppliersLoadError = error && error.message ? error.message : "server error";
        if (purchaseSupplier) purchaseSupplier.innerHTML = '<option value="">Gagal memuat supplier</option>';
        refreshPurchaseLoadStatus();
        console.error("[transaksi.js] Gagal memuat supplier:", error);
        throw error;
      });
  }

  function renderPurchaseProductOptions(select, query) {
    var search = String(query || "").trim().toLocaleLowerCase("id-ID");
    var products = productCache.filter(function (product) {
      if (product.aktif === false) return false;
      var searchable = [product.nama_barang, product.kode_barang, product.merk]
        .join(" ").toLocaleLowerCase("id-ID");
      return !search || searchable.indexOf(search) !== -1;
    });
    var placeholder = productLoading ? "Memuat daftar barang..." :
      (productLoadError ? "Daftar barang gagal dimuat" : (products.length ? "Pilih Barang" : "Barang tidak ditemukan"));
    select.innerHTML = '<option value="">' + placeholder + "</option>" +
      products.map(function (product) {
        var cost = product.harga_beli_default || product.harga_beli || 0;
        return '<option value="' + product.product_id + '" data-harga="' + cost + '">' +
          esc(product.nama_barang) + (product.kode_barang ? " (" + esc(product.kode_barang) + ")" : "") +
          "</option>";
      }).join("");
  }

  function refreshPurchaseProductOptions() {
    if (!purchaseItems) return;
    Array.prototype.forEach.call(purchaseItems.querySelectorAll(".purchase-item-product"), function (select) {
      var search = select.closest(".sale-item-product-field").querySelector(".purchase-item-product-search");
      renderPurchaseProductOptions(select, search ? search.value : "");
    });
  }

  function addPurchaseItemRow() {
    if (!purchaseItems) return;
    var idx = purchaseRowIndex++;
    var row = document.createElement("div");
    row.className = "sale-item-row purchase-item-row";
    row.innerHTML =
      '<div class="form-field sale-item-product-field">' +
        '<label class="form-field__label" for="purchase-product-search-' + idx + '">Cari Barang</label>' +
        '<input class="form-input purchase-item-product-search" id="purchase-product-search-' + idx +
          '" type="search" placeholder="Nama, kode, atau merek" autocomplete="off" />' +
        '<label class="form-field__label sale-product-select-label" for="purchase-product-' + idx + '">Pilih Barang</label>' +
        '<select class="form-input purchase-item-product" id="purchase-product-' + idx + '" required></select>' +
      "</div>" +
      '<div class="form-field">' +
        '<label class="form-field__label" for="purchase-qty-' + idx + '">Jumlah</label>' +
        '<input class="form-input purchase-item-qty" id="purchase-qty-' + idx +
          '" type="number" min="1" max="10000" value="1" required />' +
      "</div>" +
      '<div class="form-field sale-item-harga-field">' +
        '<label class="form-field__label" for="purchase-price-' + idx + '">Harga Beli (Rp)</label>' +
        '<input class="form-input purchase-item-harga" id="purchase-price-' + idx +
          '" type="number" min="0" max="2000000000" placeholder="Harga per barang" required />' +
      "</div>" +
      '<button type="button" class="btn btn--sm btn--danger purchase-item-remove" title="Hapus baris" aria-label="Hapus barang">&times;</button>';
    purchaseItems.appendChild(row);

    var select = row.querySelector(".purchase-item-product");
    var searchInput = row.querySelector(".purchase-item-product-search");
    renderPurchaseProductOptions(select, "");
    searchInput.addEventListener("input", function () {
      renderPurchaseProductOptions(select, this.value);
    });
    select.addEventListener("change", function () {
      var option = this.options[this.selectedIndex];
      row.querySelector(".purchase-item-harga").value = option ? (option.dataset.harga || "") : "";
    });
    row.querySelector(".purchase-item-remove").addEventListener("click", function () {
      if (purchaseItems.querySelectorAll(".purchase-item-row").length > 1) row.remove();
    });
  }

  function openPurchaseModal() {
    if (!purchaseModal || !purchaseForm) return;
    purchaseForm.reset();
    purchaseRowIndex = 0;
    purchaseItems.innerHTML = "";
    addPurchaseItemRow();
    purchaseModal.hidden = false;
    refreshPurchaseLoadStatus();
  }

  function closePurchaseModal() {
    if (purchaseModal) purchaseModal.hidden = true;
  }

  var btnNewPurchase = document.getElementById("btn-new-purchase");
  var purchaseClose = document.getElementById("purchase-modal-close");
  var purchaseCloseFooter = document.getElementById("purchase-modal-close-footer");
  var purchaseAddItem = document.getElementById("purchase-add-item");
  if (btnNewPurchase) btnNewPurchase.addEventListener("click", openPurchaseModal);
  if (purchaseClose) purchaseClose.addEventListener("click", closePurchaseModal);
  if (purchaseCloseFooter) purchaseCloseFooter.addEventListener("click", closePurchaseModal);
  if (purchaseAddItem) purchaseAddItem.addEventListener("click", addPurchaseItemRow);
  if (purchaseModal) {
    purchaseModal.addEventListener("click", function (event) {
      if (event.target === purchaseModal) closePurchaseModal();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !purchaseModal.hidden) closePurchaseModal();
    });
  }

  loadPurchaseSuppliers(1, []).catch(function () {});

  if (purchaseForm) {
    purchaseForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (suppliersLoading) {
        setPurchaseStatus("error", "Tunggu sampai daftar supplier selesai dimuat.");
        return;
      }
      if (suppliersLoadError) {
        setPurchaseStatus("error", "Daftar supplier gagal dimuat. Muat ulang halaman lalu coba lagi.");
        return;
      }
      var supplierId = parseInt(purchaseSupplier.value, 10);
      if (!supplierId) {
        setPurchaseStatus("error", purchaseSuppliers.length
          ? "Pilih supplier untuk transaksi Barang Masuk."
          : "Belum ada supplier aktif. Tambahkan supplier melalui menu Supplier terlebih dahulu.");
        purchaseSupplier.focus();
        return;
      }

      var rows = Array.prototype.slice.call(purchaseItems.querySelectorAll(".purchase-item-row"));
      var items = [];
      var seenProducts = {};
      for (var i = 0; i < rows.length; i++) {
        var productId = parseInt(rows[i].querySelector(".purchase-item-product").value, 10);
        var quantityValue = rows[i].querySelector(".purchase-item-qty").value;
        var priceValue = rows[i].querySelector(".purchase-item-harga").value;
        var quantity = parseInt(quantityValue, 10);
        var price = parseInt(priceValue, 10);
        if (!productId || !/^\d+$/.test(quantityValue) || quantity < 1 || quantity > 10000 ||
            !/^\d+$/.test(priceValue) || price < 0 || price > 2000000000) {
          setPurchaseStatus("error", "Pilih barang dan isi jumlah serta harga beli yang valid pada setiap baris.");
          return;
        }
        if (seenProducts[productId]) {
          setPurchaseStatus("error", "Barang yang sama hanya boleh satu baris. Ubah jumlah pada baris barang tersebut.");
          return;
        }
        seenProducts[productId] = true;
        items.push({ product_id: productId, jumlah: quantity, harga: price });
      }

      var payload = {
        supplier_id: supplierId,
        items: items,
        no_referensi: document.getElementById("purchase-reference").value.trim(),
        catatan: document.getElementById("purchase-note").value.trim()
      };
      purchaseSubmit.disabled = true;
      SLApi.post("/api/admin/transactions/purchases", payload)
        .then(function () {
          purchaseSubmit.disabled = false;
          purchaseForm.reset();
          purchaseRowIndex = 0;
          purchaseItems.innerHTML = "";
          addPurchaseItemRow();
          setPurchaseStatus("success", "Transaksi Barang Masuk tersimpan sebagai Pending. Stok bertambah setelah transaksi diselesaikan.");
          dt.load();
        })
        .catch(function (error) {
          purchaseSubmit.disabled = false;
          var message = error && error.status === 422 && error.details
            ? Object.values(error.details).map(function (detail) {
                return typeof detail === "string" ? detail : Object.values(detail).join(" ");
              }).join(" ")
            : (error && error.message ? error.message : "Terjadi kesalahan.");
          setPurchaseStatus("error", "Gagal membuat transaksi: " + message);
        });
    });
  }

  /* ═══ Kartu stok ════════════════════════════════════════════════════════ */
  var kartuForm   = document.getElementById("kartu-stok-form");
  var kartuSelect = document.getElementById("kartu-product-id");
  var kartuTable  = document.querySelector("#kartu-table tbody");

  fetchAllProducts(1, [])
    .then(function (products) {
      if (!kartuSelect) return;
      kartuSelect.innerHTML = '<option value="">Pilih Barang</option>' +
        products.map(function(p){
          return '<option value="'+p.product_id+'">'+esc(p.kode_barang)+" - "+esc(p.nama_barang)+"</option>";
        }).join("");
    }).catch(function(err){
      if (kartuSelect) kartuSelect.innerHTML = '<option value="">Gagal memuat daftar barang</option>';
      console.error("[transaksi.js] Gagal memuat barang untuk kartu stok:", err);
    });

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
