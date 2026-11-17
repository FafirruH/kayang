/* ==========================================================================
   admin/js/stok-form.js — modal tambah / edit barang (SLApi)
   - stok.html             → mode Tambah
   - stok.html?id=3        → mode Edit
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
  var modal    = document.getElementById("product-form-modal");
  var addBtn   = document.getElementById("btn-add-product");
  var closeBtn = document.getElementById("product-form-close");
  var cancelBtn = document.getElementById("product-form-cancel");
  var kodeWrap = document.getElementById("kode-wrap");
  var imageInput = form.elements.gambar;
  var cameraInput = document.getElementById("gambar-kamera");
  var cameraButton = document.getElementById("gambar-camera-button");
  var imagePreview = document.getElementById("gambar-preview");
  var imagePreviewImg = document.getElementById("gambar-preview-image");
  var imageRemoveButton = document.getElementById("gambar-remove-button");
  var imageRemoveStatus = document.getElementById("gambar-remove-status");
  var cropper = document.getElementById("gambar-cropper");
  var cropCanvas = document.getElementById("gambar-crop-canvas");
  var cropZoomInput = document.getElementById("gambar-crop-zoom");
  var cropCancelButton = document.getElementById("gambar-crop-cancel");
  var cropConfirmButton = document.getElementById("gambar-crop-confirm");
  var cropContext = cropCanvas ? cropCanvas.getContext("2d") : null;
  var previewObjectUrl = null;
  var savedImage = null;
  var selectedImageFile = null;
  var removeSavedImage = false;
  var cropImage = null;
  var cropImageUrl = null;
  var cropBaseScale = 1;
  var cropZoom = 1;
  var cropOffsetX = 0;
  var cropOffsetY = 0;
  var cropDrag = null;
  var cropRequestId = 0;
  var cropPending = false;
  var imageInputError = null;
  var MAX_IMAGE_SIZE = 2 * 1024 * 1024;
  var MAX_IMAGE_PIXELS = 24000000;
  var CROP_PREVIEW_SIZE = 320;
  var CROP_OUTPUT_SIZE = 1024;

  var params = new URLSearchParams(window.location.search);
  var id = params.get("id");

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
    ["kode_barang", "nama_barang", "jenis_barang", "harga_jual_default", "gambar"].forEach(function (n) {
      setError(n, "");
    });
  }

  function clearImagePreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    if (imagePreview) imagePreview.hidden = true;
    if (imagePreviewImg) imagePreviewImg.removeAttribute("src");
  }

  function setImagePreview(src, isObjectUrl) {
    if (!imagePreview || !imagePreviewImg) return;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = isObjectUrl ? src : null;
    imagePreviewImg.src = src;
    imagePreview.hidden = false;
  }

  function closeCropEditor(clearInputs) {
    cropRequestId += 1;
    cropPending = false;
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      cropImageUrl = null;
    }
    cropImage = null;
    cropDrag = null;
    if (cropper) cropper.hidden = true;
    if (cropCancelButton) cropCancelButton.disabled = false;
    if (imageInput) {
      imageInput.disabled = false;
      if (clearInputs) imageInput.value = "";
    }
    if (cameraInput) {
      cameraInput.disabled = false;
      if (clearInputs) cameraInput.value = "";
    }
    if (cameraButton) cameraButton.disabled = false;
    if (imageRemoveButton) imageRemoveButton.disabled = false;
    if (cropConfirmButton) cropConfirmButton.disabled = false;
  }

  function clampCropOffset() {
    if (!cropImage) return;
    var scale = cropBaseScale * cropZoom;
    var maxX = (cropImage.naturalWidth * scale - CROP_PREVIEW_SIZE) / 2;
    var maxY = (cropImage.naturalHeight * scale - CROP_PREVIEW_SIZE) / 2;
    cropOffsetX = Math.max(-maxX, Math.min(maxX, cropOffsetX));
    cropOffsetY = Math.max(-maxY, Math.min(maxY, cropOffsetY));
  }

  function drawCropPreview() {
    if (!cropImage || !cropContext) return;
    var scale = cropBaseScale * cropZoom;
    var width = cropImage.naturalWidth * scale;
    var height = cropImage.naturalHeight * scale;
    cropContext.fillStyle = "#fff";
    cropContext.fillRect(0, 0, CROP_PREVIEW_SIZE, CROP_PREVIEW_SIZE);
    cropContext.drawImage(
      cropImage,
      (CROP_PREVIEW_SIZE - width) / 2 + cropOffsetX,
      (CROP_PREVIEW_SIZE - height) / 2 + cropOffsetY,
      width,
      height
    );
  }

  function openCropEditor(file) {
    if (!cropper || !cropCanvas || !cropContext) {
      imageInputError = "Editor crop tidak tersedia di browser ini.";
      setError("gambar", imageInputError);
      return;
    }

    var requestId = ++cropRequestId;
    cropPending = true;
    cropImageUrl = URL.createObjectURL(file);
    cropImage = new Image();
    cropImage.onload = function () {
      if (requestId !== cropRequestId) return;
      if (cropImage.naturalWidth < 1 || cropImage.naturalHeight < 1
        || cropImage.naturalWidth * cropImage.naturalHeight > MAX_IMAGE_PIXELS) {
        imageInputError = "Resolusi gambar tidak valid atau melebihi 24 megapiksel.";
        closeCropEditor(true);
        setError("gambar", imageInputError);
        return;
      }

      cropPending = false;
      cropBaseScale = CROP_PREVIEW_SIZE / Math.min(cropImage.naturalWidth, cropImage.naturalHeight);
      cropZoom = 1;
      cropOffsetX = 0;
      cropOffsetY = 0;
      if (cropZoomInput) cropZoomInput.value = "1";
      if (cropConfirmButton) cropConfirmButton.disabled = false;
      drawCropPreview();
    };
    cropImage.onerror = function () {
      if (requestId !== cropRequestId) return;
      imageInputError = "Gambar tidak dapat dibuka. Pilih file gambar lain.";
      closeCropEditor(true);
      setError("gambar", imageInputError);
    };
    if (imageInput) imageInput.disabled = true;
    if (cameraInput) cameraInput.disabled = true;
    if (cameraButton) cameraButton.disabled = true;
    if (imageRemoveButton) imageRemoveButton.disabled = true;
    if (cropConfirmButton) cropConfirmButton.disabled = true;
    if (cropper) cropper.hidden = false;
    cropImage.src = cropImageUrl;
  }

  function encodeCrop(canvas, qualities, index) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error("Gagal memproses crop gambar."));
          return;
        }
        if (blob.size <= MAX_IMAGE_SIZE) {
          resolve(blob);
          return;
        }
        if (index + 1 >= qualities.length) {
          reject(new Error("Hasil crop masih lebih dari 2 MB. Perbesar objek dengan zoom atau pilih gambar lain."));
          return;
        }
        encodeCrop(canvas, qualities, index + 1).then(resolve, reject);
      }, "image/jpeg", qualities[index]);
    });
  }

  function confirmImageCrop() {
    if (!cropImage || cropPending || !cropConfirmButton) return;
    cropConfirmButton.disabled = true;
    cropPending = true;
    var requestId = ++cropRequestId;

    var scale = cropBaseScale * cropZoom;
    var sourceSide = CROP_PREVIEW_SIZE / scale;
    var sourceX = (cropImage.naturalWidth - sourceSide) / 2 - cropOffsetX / scale;
    var sourceY = (cropImage.naturalHeight - sourceSide) / 2 - cropOffsetY / scale;
    sourceX = Math.max(0, Math.min(cropImage.naturalWidth - sourceSide, sourceX));
    sourceY = Math.max(0, Math.min(cropImage.naturalHeight - sourceSide, sourceY));

    var outputSide = Math.max(1, Math.min(CROP_OUTPUT_SIZE, Math.floor(sourceSide)));
    var output = document.createElement("canvas");
    output.width = outputSide;
    output.height = outputSide;
    var outputContext = output.getContext("2d");
    if (!outputContext || typeof output.toBlob !== "function") {
      cropPending = false;
      cropConfirmButton.disabled = false;
      setError("gambar", "Browser ini tidak mendukung pemrosesan crop gambar.");
      return;
    }
    outputContext.fillStyle = "#fff";
    outputContext.fillRect(0, 0, outputSide, outputSide);
    outputContext.drawImage(
      cropImage,
      sourceX,
      sourceY,
      sourceSide,
      sourceSide,
      0,
      0,
      outputSide,
      outputSide
    );

    encodeCrop(output, [0.88, 0.76, 0.64, 0.52], 0)
      .then(function (blob) {
        if (requestId !== cropRequestId) return;
        selectedImageFile = blob;
        removeSavedImage = false;
        imageInputError = null;
        closeCropEditor(true);
        setError("gambar", "");
        updateImageRemoveButton();
        setImagePreview(URL.createObjectURL(blob), true);
      })
      .catch(function (error) {
        if (requestId !== cropRequestId) return;
        cropPending = false;
        cropConfirmButton.disabled = false;
        setError("gambar", error.message);
      });
  }

  function cancelImageCrop() {
    closeCropEditor(true);
    imageInputError = null;
    setError("gambar", "");
  }

  function updateImageRemoveButton() {
    if (imageRemoveButton) {
      imageRemoveButton.hidden = !selectedImageFile && (!savedImage || removeSavedImage);
    }
    if (imageRemoveStatus) imageRemoveStatus.hidden = !removeSavedImage;
  }

  function showSavedImage(filename) {
    savedImage = filename || null;
    removeSavedImage = false;
    var src = SLApi.productImageUrl(savedImage);
    if (src) setImagePreview(src, false);
    else clearImagePreview();
    updateImageRemoveButton();
  }

  function openAddModal() {
    id = null;
    closeCropEditor(true);
    form.reset();
    selectedImageFile = null;
    imageInputError = null;
    clearErrors();
    showSavedImage(null);
    titleEl.textContent = "Tambah Barang";
    submitEl.textContent = "Simpan Barang";
    submitEl.disabled = false;
    document.title = "Tambah Barang - Admin Sumber Lancar";
    if (kodeWrap) kodeWrap.hidden = false;
    var stokInfo = document.getElementById("stok-info");
    if (stokInfo) stokInfo.hidden = true;
    statusEl.hidden = true;
    if (modal) modal.hidden = false;
  }

  function closeModal() {
    closeCropEditor(true);
    if (modal) modal.hidden = true;
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }

  if (addBtn) addBtn.addEventListener("click", openAddModal);
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (cancelBtn) cancelBtn.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  /* ── Validasi ───────────────────────────────────────────────────────────── */
  function validate(isEdit) {
    var ok = true;

    function check(name, cond, msg) {
      if (!cond) { setError(name, msg); ok = false; }
      else        { setError(name, ""); }
    }

    if (!isEdit) {
      var kode = (form.elements.kode_barang.value || "").trim();
      check("kode_barang", kode === "" || /^[A-Za-z0-9_-]{2,30}$/.test(kode),
        "Kode barang harus 2–30 karakter (huruf/angka/-/_), atau kosongkan untuk kode otomatis.");
    }

    var nama = (form.elements.nama_barang.value || "").trim();
    check("nama_barang", nama.length >= 2, "Nama barang minimal 2 karakter.");

    var jenis = katSelect ? katSelect.value : "";
    check("jenis_barang", jenis.trim().length >= 2 && jenis.trim().length <= 30,
      "Kategori wajib diisi (2–30 karakter).");

    var harga = form.elements.harga_jual_default.value.trim();
    check("harga_jual_default", /^\d+$/.test(harga), "Masukkan harga berupa angka bulat.");

    var imageFile = selectedImageFile;
    if (imageInputError) {
      check("gambar", false, imageInputError);
    } else if (imageFile) {
      check("gambar",
        imageFile.type === "image/jpeg" && imageFile.size <= MAX_IMAGE_SIZE,
        "Hasil crop harus berupa JPG maksimal 2 MB.");
    }

    if (!ok) {
      var first = form.querySelector("[aria-invalid]");
      if (first) first.focus();
    }
    return ok;
  }

  /* ── Clear error on input ──────────────────────────────────────────────── */
  ["kode_barang", "nama_barang", "harga_jual_default"].forEach(function (name) {
    var el = form.elements[name];
    if (el) el.addEventListener("input", function () { setError(name, ""); });
  });
  if (katSelect) katSelect.addEventListener("input", function () { setError("jenis_barang", ""); });
  function handleImageChange(event) {
    setError("gambar", "");
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      imageInputError = "Format gambar harus JPG, PNG, atau WebP.";
      setError("gambar", imageInputError);
      return;
    }
    imageInputError = null;
    openCropEditor(file);
  }

  if (imageInput) imageInput.addEventListener("change", handleImageChange);
  if (cameraInput) cameraInput.addEventListener("change", handleImageChange);
  if (cameraButton && cameraInput) {
    cameraButton.addEventListener("click", function () { cameraInput.click(); });
  }
  if (cropZoomInput) cropZoomInput.addEventListener("input", function () {
    cropZoom = Number(cropZoomInput.value) || 1;
    clampCropOffset();
    drawCropPreview();
  });
  if (cropCanvas) {
    cropCanvas.addEventListener("pointerdown", function (event) {
      if (!cropImage) return;
      cropDrag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        offsetX: cropOffsetX,
        offsetY: cropOffsetY
      };
      cropCanvas.setPointerCapture(event.pointerId);
    });
    cropCanvas.addEventListener("pointermove", function (event) {
      if (!cropDrag || cropDrag.pointerId !== event.pointerId) return;
      var rect = cropCanvas.getBoundingClientRect();
      cropOffsetX = cropDrag.offsetX + (event.clientX - cropDrag.clientX) * CROP_PREVIEW_SIZE / rect.width;
      cropOffsetY = cropDrag.offsetY + (event.clientY - cropDrag.clientY) * CROP_PREVIEW_SIZE / rect.height;
      clampCropOffset();
      drawCropPreview();
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) {
      cropCanvas.addEventListener(name, function () { cropDrag = null; });
    });
    cropCanvas.addEventListener("keydown", function (event) {
      var step = event.shiftKey ? 24 : 8;
      if (event.key === "ArrowLeft") cropOffsetX += step;
      else if (event.key === "ArrowRight") cropOffsetX -= step;
      else if (event.key === "ArrowUp") cropOffsetY += step;
      else if (event.key === "ArrowDown") cropOffsetY -= step;
      else return;
      event.preventDefault();
      clampCropOffset();
      drawCropPreview();
    });
  }
  if (cropCancelButton) cropCancelButton.addEventListener("click", cancelImageCrop);
  if (cropConfirmButton) cropConfirmButton.addEventListener("click", confirmImageCrop);
  if (imageRemoveButton) {
    imageRemoveButton.addEventListener("click", function () {
      selectedImageFile = null;
      if (imageInput) imageInput.value = "";
      if (cameraInput) cameraInput.value = "";
      removeSavedImage = !!savedImage;
      imageInputError = null;
      clearImagePreview();
      updateImageRemoveButton();
      setError("gambar", "");
    });
  }

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
        if (kodeWrap) kodeWrap.hidden = true;

        // Tampilkan stok saat ini sebagai info (readonly)
        var stokInfo = document.getElementById("stok-info");
        if (stokInfo) {
          stokInfo.textContent = "Stok tersedia: " + (p.tersedia !== undefined ? p.tersedia : p.stok) +
            " — ubah stok lewat menu Transaksi.";
          stokInfo.hidden = false;
        }

        form.elements.nama_barang.value       = p.nama_barang           || "";
        form.elements.harga_jual_default.value = p.harga_jual            || p.harga_jual_default || 0;
        form.elements.stok_minimal.value       = p.stok_minimal          || 0;
        form.elements.merk.value               = p.merk                  || "";
        if (katSelect) katSelect.value         = p.jenis_barang          || "";
        showSavedImage(p.gambar);

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
    if (cropper && !cropper.hidden) {
      showStatus("warn", "Selesaikan atau batalkan crop sebelum menyimpan.");
      return;
    }
    clearErrors();
    if (!validate(!!id)) return;

    submitEl.disabled = true;
    showStatus("ok", "Menyimpan...");

    var payload = {
      nama_barang:        (form.elements.nama_barang.value || "").trim(),
      jenis_barang:       katSelect ? katSelect.value : "",
      harga_jual_default: parseInt(form.elements.harga_jual_default.value, 10),
      stok_minimal:       parseInt(form.elements.stok_minimal.value       || "0", 10),
      merk:               (form.elements.merk.value || "").trim() || undefined
    };

    var isNew = !id;
    var imageFileToUpload = selectedImageFile;
    var removeImageOnSave = removeSavedImage && !!savedImage;
    var imageChanged = !!imageFileToUpload || removeImageOnSave;
    var req;
    if (id) {
      req = SLApi.put("/api/admin/products/" + id, payload);
    } else {
      var kodeBarang = (form.elements.kode_barang.value || "").trim();
      if (kodeBarang) payload.kode_barang = kodeBarang.toUpperCase();
      req = SLApi.post("/api/admin/products", payload);
    }

    var productSaved = false;
    req
      .then(function (res) {
        var saved = res.data || res;
        var productId = id || saved.product_id;
        if (!productId) throw new Error("ID barang tidak diterima dari server.");
        productSaved = true;

        if (isNew) {
          id = productId;
          titleEl.textContent = "Edit Barang";
          submitEl.textContent = "Simpan Perubahan";
          document.title = "Edit Barang - Admin Sumber Lancar";
          if (kodeWrap) kodeWrap.hidden = true;
        }

        if (imageFileToUpload) {
          var formData = new FormData();
          formData.append("gambar", imageFileToUpload, "gambar.jpg");
          return SLApi.upload("/api/admin/products/" + productId + "/image", formData)
            .then(function (imageRes) {
              var imageData = imageRes.data || imageRes;
              showSavedImage(imageData.gambar);
            });
        }
        if (removeImageOnSave) {
          return SLApi.del("/api/admin/products/" + productId + "/image")
            .then(function () { showSavedImage(null); });
        }
        return null;
      })
      .then(function () {
        var imageStatus = imageFileToUpload
          ? " beserta gambarnya"
          : (removeImageOnSave ? " dan gambar dihapus" : "");
        showStatus("ok", "Data barang tersimpan" + imageStatus + "." +
          " Catat stok dan harga beli aktual melalui Transaksi > Barang Masuk.");
        setTimeout(function () {
          window.location.href = LIST_PAGE;
        }, 1200);
      })
      .catch(function (err) {
        submitEl.disabled = false;
        var msg = err && err.status === 422 && err.details
          ? Object.values(err.details).join(" ")
          : (err && err.message ? err.message : "Gagal menyimpan.");
        if (err && err.status === 409) {
          msg = /kode barang sudah dipakai/i.test(msg)
            ? "Kode barang sudah digunakan. Pilih kode lain atau kosongkan untuk membuat kode otomatis."
            : msg;
        }
        if (productSaved && imageChanged) {
          submitEl.textContent = "Coba Lagi";
          msg = "Data barang sudah tersimpan, tetapi " +
            (imageFileToUpload ? "gambar gagal diunggah. " : "gambar gagal dihapus. ") + msg;
        }
        showStatus("error", msg);
      });
  });

  if (id) {
    if (modal) modal.hidden = false;
    setModeEdit();
  } else if (params.get("new") === "1") {
    openAddModal();
  }
})();
