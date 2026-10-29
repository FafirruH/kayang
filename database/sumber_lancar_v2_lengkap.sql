-- ##########################################################################
-- SUMBER LANCAR v2 - SQL LENGKAP (skema + data uji + query + demo)
-- PostgreSQL 13+. Jalankan sekali: psql -d NAMA_DB -f sumber_lancar_v2_lengkap.sql
-- ##########################################################################

-- ======================= BAGIAN 1: SKEMA =======================
-- =====================================================================
-- Sumber Lancar - Sistem Bengkel Online
-- Skema v2: manajemen stok untuk transaksi fisik (stok tertahan sampai bayar)
-- DBMS : PostgreSQL 13+
-- Urutan: 01_schema.sql -> 02_seed.sql -> 03_queries.sql
--
-- ENTITAS (5)
--   Master    : users, suppliers, products
--   Transaksi : transactions         (header: barang masuk / penjualan / koreksi stok)
--   Relasi    : transaction_details  (M:N transactions <-> products)
--
-- ALUR STOK
--   * Barang keluar (OUT)  : dibuat PENDING -> stok TERTAHAN sampai expired_at
--                            -> COMPLETED (dibayar, barang diserahkan) -> stok fisik berkurang
--                            -> atau CANCELLED / EXPIRED -> tahanan dilepas otomatis.
--   * Barang masuk (IN)    : PENDING = pesanan ke supplier belum datang;
--                            COMPLETED = barang diterima -> stok fisik bertambah.
--   * Koreksi (ADJ_IN/OUT) : stock opname, barang rusak/hilang (catatan wajib).
--   * Riwayat stok (kartu stok) TIDAK disimpan di tabel sendiri: diturunkan oleh
--     view v_kartu_stok dari detail transaksi COMPLETED, jadi tidak bisa
--     menyimpang dari data transaksi dan skema tetap 5 entitas.
--
-- NORMALISASI (3NF)
--   * Total transaksi, subtotal pesanan, dan stok tertahan tidak disimpan
--     (atribut turunan) - dihitung di view.
--   * products.stok adalah penghitung fisik yang HANYA diubah trigger, agar
--     halaman stok tidak menjumlah seluruh riwayat setiap dibuka (hemat untuk
--     perangkat low end). Kesesuaiannya dengan riwayat dicek di 03_queries.sql (Q11).
--   * harga_satuan_real & harga_modal di detail = harga SAAT transaksi (fakta
--     historis tiap baris), bukan salinan products.harga_*_default.
--   * jenis_barang dibatasi CHECK (domain tetap) karena kategori tidak punya
--     atribut lain; tabel kategori terpisah hanya akan berisi satu kolom nama.
-- =====================================================================

SET TIME ZONE 'Asia/Jakarta';                 -- laporan bulanan mengikuti WIB
CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- hash bcrypt untuk seed password

-- ---------------------------------------------------------------------
-- Reset (aman dijalankan ulang)
-- ---------------------------------------------------------------------
DROP VIEW     IF EXISTS v_laporan_laba_rugi, v_kartu_stok, v_transaksi_header, v_stok_barang;
DROP TABLE    IF EXISTS transaction_details, transactions, products, suppliers, users CASCADE;
DROP SEQUENCE IF EXISTS seq_faktur_out, seq_faktur_in, seq_faktur_adj;
DROP FUNCTION IF EXISTS buat_penjualan(integer, jsonb, integer, text, integer, integer);
DROP FUNCTION IF EXISTS expire_pending();
DROP FUNCTION IF EXISTS fn_transaksi_awal();
DROP FUNCTION IF EXISTS fn_transaksi_ubah_status();
DROP FUNCTION IF EXISTS fn_detail_sebelum_insert();
DROP FUNCTION IF EXISTS fn_detail_terkunci();

CREATE SEQUENCE seq_faktur_out START 1;   -- FJ-YYMM-0001 (faktur jual)
CREATE SEQUENCE seq_faktur_in  START 1;   -- PB-YYMM-0001 (pembelian ke supplier)
CREATE SEQUENCE seq_faktur_adj START 1;   -- KS-YYMM-0001 (koreksi stok)

-- ---------------------------------------------------------------------
-- MASTER 1: users  (admin, montir, pelanggan)
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL       PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE
                  CHECK (char_length(username) >= 3 AND username = lower(username)),
  password_hash TEXT         NOT NULL,            -- hash bcrypt, bukan password asli
  nama_lengkap  VARCHAR(100) NOT NULL,
  no_telepon    VARCHAR(20)  NOT NULL,
  alamat        TEXT,
  role          VARCHAR(20)  NOT NULL DEFAULT 'CUSTOMER'
                  CHECK (role IN ('ADMIN', 'MECHANIC', 'CUSTOMER')),
  aktif         BOOLEAN      NOT NULL DEFAULT TRUE,   -- hapus lunak (riwayat transaksi tetap utuh)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- MASTER 2: suppliers
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  id            SERIAL       PRIMARY KEY,
  nama_supplier VARCHAR(100) NOT NULL UNIQUE,
  no_telepon    VARCHAR(20)  NOT NULL,
  alamat        TEXT,
  aktif         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- MASTER 3: products
-- ---------------------------------------------------------------------
CREATE TABLE products (
  id                 SERIAL       PRIMARY KEY,
  kode_barang        VARCHAR(30)  NOT NULL UNIQUE,
  nama_barang        VARCHAR(100) NOT NULL,
  jenis_barang       VARCHAR(30)  NOT NULL
                       CHECK (jenis_barang IN ('Oli','Rem','Busi','Ban','Aki','Rantai','Filter')),
  merk               VARCHAR(50),
  harga_beli_default INTEGER      NOT NULL DEFAULT 0 CHECK (harga_beli_default >= 0),  -- rupiah
  harga_jual_default INTEGER      NOT NULL DEFAULT 0 CHECK (harga_jual_default >= 0),
  stok               INTEGER      NOT NULL DEFAULT 0 CHECK (stok >= 0),                -- stok FISIK
  stok_minimal       INTEGER      NOT NULL DEFAULT 5 CHECK (stok_minimal >= 0),
  aktif              BOOLEAN      NOT NULL DEFAULT TRUE,   -- barang yang pernah terjual tidak dihapus, cukup dinonaktifkan
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_jenis ON products (jenis_barang);

-- ---------------------------------------------------------------------
-- TRANSAKSI: transactions
--   tipe_transaksi : IN (beli dari supplier), OUT (jual), ADJ_IN / ADJ_OUT (koreksi)
--   customer_id    : pelanggan terdaftar; nama_pelanggan : pembeli umum (walk-in)
--   dicatat_oleh   : staf yang mencatat
--   expired_at     : batas penahanan stok (wajib untuk OUT, default 24 jam)
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
  id             SERIAL       PRIMARY KEY,
  no_faktur      VARCHAR(30)  NOT NULL UNIQUE,             -- diisi trigger bila kosong
  tipe_transaksi VARCHAR(10)  NOT NULL
                   CHECK (tipe_transaksi IN ('IN', 'OUT', 'ADJ_IN', 'ADJ_OUT')),
  status         VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  customer_id    INTEGER      REFERENCES users (id) ON DELETE RESTRICT,
  nama_pelanggan VARCHAR(100),
  supplier_id    INTEGER      REFERENCES suppliers (id) ON DELETE RESTRICT,
  dicatat_oleh   INTEGER      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  diskon         INTEGER      NOT NULL DEFAULT 0 CHECK (diskon >= 0),   -- potongan/voucher (rupiah)
  metode_bayar   VARCHAR(10)  CHECK (metode_bayar IN ('TUNAI', 'TRANSFER', 'QRIS')),
  no_referensi   VARCHAR(50),                              -- nomor surat jalan/nota supplier
  catatan        TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expired_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,

  -- IN wajib punya supplier; tipe lain tidak boleh
  CONSTRAINT ck_supplier       CHECK ((tipe_transaksi = 'IN') = (supplier_id IS NOT NULL)),
  -- pelanggan hanya untuk OUT; OUT wajib punya pelanggan terdaftar ATAU nama umum, tidak keduanya
  CONSTRAINT ck_pelanggan_out  CHECK (tipe_transaksi <> 'OUT' OR customer_id IS NOT NULL OR nama_pelanggan IS NOT NULL),
  CONSTRAINT ck_pelanggan_satu CHECK (customer_id IS NULL OR nama_pelanggan IS NULL),
  CONSTRAINT ck_pelanggan_tipe CHECK (tipe_transaksi = 'OUT' OR (customer_id IS NULL AND nama_pelanggan IS NULL)),
  -- batas penahanan stok
  CONSTRAINT ck_expired        CHECK (expired_at IS NULL OR expired_at > created_at),
  CONSTRAINT ck_expired_out    CHECK (tipe_transaksi <> 'OUT' OR expired_at IS NOT NULL),
  -- koreksi stok wajib beralasan
  CONSTRAINT ck_catatan_adj    CHECK (tipe_transaksi NOT IN ('ADJ_IN', 'ADJ_OUT') OR catatan IS NOT NULL),
  -- transaksi jual/beli yang selesai wajib punya metode bayar
  CONSTRAINT ck_bayar          CHECK (status <> 'COMPLETED' OR tipe_transaksi IN ('ADJ_IN', 'ADJ_OUT') OR metode_bayar IS NOT NULL),
  -- completed_at terisi jika dan hanya jika COMPLETED
  CONSTRAINT ck_selesai        CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_transactions_created   ON transactions (created_at);
CREATE INDEX idx_transactions_completed ON transactions (completed_at) WHERE status = 'COMPLETED';
CREATE INDEX idx_transactions_pending   ON transactions (expired_at)   WHERE status = 'PENDING';
CREATE INDEX idx_transactions_customer  ON transactions (customer_id)  WHERE customer_id IS NOT NULL;
CREATE INDEX idx_transactions_supplier  ON transactions (supplier_id)  WHERE supplier_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- RELASI: transaction_details
-- PK gabungan: satu barang satu baris per transaksi (lebih ringan dari id surrogate).
-- harga_modal hanya terisi untuk OUT (modal saat dijual) untuk laporan laba rugi.
-- ---------------------------------------------------------------------
CREATE TABLE transaction_details (
  transaction_id    INTEGER NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
  product_id        INTEGER NOT NULL REFERENCES products (id)     ON DELETE RESTRICT,
  jumlah            INTEGER NOT NULL CHECK (jumlah > 0),
  harga_satuan_real INTEGER NOT NULL CHECK (harga_satuan_real >= 0),  -- harga hasil kesepakatan
  harga_modal       INTEGER CHECK (harga_modal >= 0),
  subtotal          INTEGER GENERATED ALWAYS AS (jumlah * harga_satuan_real) STORED,
  PRIMARY KEY (transaction_id, product_id)
);
CREATE INDEX idx_details_product ON transaction_details (product_id);

-- =====================================================================
-- TRIGGER 1 (BEFORE INSERT transactions): faktur otomatis + aturan awal
-- Transaksi baru WAJIB PENDING supaya semua perubahan stok lewat satu jalur
-- (trigger status). no_faktur dibuat dari urutan per tipe; OUT otomatis
-- mendapat batas penahanan 24 jam.
-- =====================================================================
CREATE FUNCTION fn_transaksi_awal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaksi baru harus berstatus PENDING; stok baru berubah saat COMPLETED'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.no_faktur IS NULL THEN
    NEW.no_faktur :=
      (CASE NEW.tipe_transaksi WHEN 'OUT' THEN 'FJ' WHEN 'IN' THEN 'PB' ELSE 'KS' END)
      || '-' || to_char(NEW.created_at, 'YYMM') || '-'
      || lpad((CASE NEW.tipe_transaksi
                 WHEN 'OUT' THEN nextval('seq_faktur_out')
                 WHEN 'IN'  THEN nextval('seq_faktur_in')
                 ELSE            nextval('seq_faktur_adj')
               END)::text, 4, '0');
  END IF;

  IF NEW.tipe_transaksi = 'OUT' AND NEW.expired_at IS NULL THEN
    NEW.expired_at := NEW.created_at + interval '24 hours';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_awal
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_awal();

-- =====================================================================
-- TRIGGER 2 (BEFORE INSERT transaction_details): stok tersedia + snapshot harga
-- Alasan: pemeriksaan "stok tersedia cukup?" harus atomik di database.
-- Stok tersedia = stok fisik - barang yang ditahan transaksi OUT PENDING lain
-- yang belum kedaluwarsa. Baris produk dikunci (FOR UPDATE) agar dua pesanan
-- bersamaan tidak sama-sama menahan barang terakhir. Harga default dan
-- harga_modal diambil dari tabel produk, tidak dari browser.
-- =====================================================================
CREATE FUNCTION fn_detail_sebelum_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tipe     transactions.tipe_transaksi%TYPE;
  v_status   transactions.status%TYPE;
  v_p        products%ROWTYPE;
  v_tertahan BIGINT;
BEGIN
  SELECT tipe_transaksi, status INTO v_tipe, v_status
    FROM transactions WHERE id = NEW.transaction_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi % tidak ditemukan', NEW.transaction_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Barang hanya bisa ditambahkan ke transaksi PENDING (status sekarang: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_p FROM products WHERE id = NEW.product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan id % tidak ditemukan', NEW.product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_p.aktif THEN
    RAISE EXCEPTION 'Barang "%" sudah tidak dijual', v_p.nama_barang
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.harga_satuan_real IS NULL THEN       -- tanpa kesepakatan khusus -> harga default
    NEW.harga_satuan_real := CASE WHEN v_tipe = 'OUT'
                                  THEN v_p.harga_jual_default
                                  ELSE v_p.harga_beli_default END;
  END IF;

  IF v_tipe = 'OUT' THEN
    NEW.harga_modal := v_p.harga_beli_default;

    SELECT COALESCE(SUM(d.jumlah), 0) INTO v_tertahan
      FROM transaction_details d
      JOIN transactions t ON t.id = d.transaction_id
     WHERE d.product_id = NEW.product_id
       AND t.tipe_transaksi = 'OUT'
       AND t.status = 'PENDING'
       AND t.expired_at > now();

    IF NEW.jumlah > v_p.stok - v_tertahan THEN
      RAISE EXCEPTION 'Stok tersedia "%" tidak cukup (stok %, tertahan %, diminta %)',
        v_p.nama_barang, v_p.stok, v_tertahan, NEW.jumlah
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_detail_sebelum_insert
  BEFORE INSERT ON transaction_details
  FOR EACH ROW EXECUTE FUNCTION fn_detail_sebelum_insert();

-- Baris detail tidak boleh diubah diam-diam (stok dan riwayat akan menyimpang):
-- UPDATE ditolak, DELETE hanya saat transaksi masih PENDING.
CREATE FUNCTION fn_detail_terkunci() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Baris detail tidak bisa diubah; hapus lalu tambahkan ulang selagi transaksi PENDING'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT status FROM transactions WHERE id = OLD.transaction_id) <> 'PENDING' THEN
    RAISE EXCEPTION 'Detail transaksi yang sudah selesai/batal tidak boleh dihapus'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_detail_terkunci
  BEFORE UPDATE OR DELETE ON transaction_details
  FOR EACH ROW EXECUTE FUNCTION fn_detail_terkunci();

-- =====================================================================
-- TRIGGER 3 (BEFORE UPDATE OF status): satu-satunya jalur perubahan stok fisik
-- PENDING -> COMPLETED : validasi (belum kedaluwarsa, ada barang, diskon wajar),
--                        kunci tiap produk, cek stok fisik, ubah products.stok.
--                        IN juga memperbarui harga_beli_default (harga beli terakhir).
-- PENDING -> CANCELLED/EXPIRED : tidak ada yang dikembalikan karena stok fisik
--                        belum berubah; tahanan lepas otomatis (status bukan PENDING lagi).
-- Status akhir (COMPLETED/CANCELLED/EXPIRED) tidak bisa diubah lagi.
-- =====================================================================
CREATE FUNCTION fn_transaksi_ubah_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r          RECORD;
  v_stok     products.stok%TYPE;
  v_nama     products.nama_barang%TYPE;
  v_delta    INTEGER;
  v_subtotal BIGINT;
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaksi % sudah % dan tidak bisa diubah lagi', OLD.no_faktur, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

    IF NEW.expired_at IS NOT NULL AND NEW.completed_at > NEW.expired_at THEN
      RAISE EXCEPTION 'Transaksi % melewati batas penahanan stok (%)', NEW.no_faktur, NEW.expired_at
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT SUM(subtotal) INTO v_subtotal
      FROM transaction_details WHERE transaction_id = NEW.id;
    IF v_subtotal IS NULL THEN
      RAISE EXCEPTION 'Transaksi % belum memiliki barang', NEW.no_faktur
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.diskon > v_subtotal THEN
      RAISE EXCEPTION 'Diskon (%) melebihi subtotal (%)', NEW.diskon, v_subtotal
        USING ERRCODE = 'check_violation';
    END IF;

    FOR r IN
      SELECT product_id, jumlah, harga_satuan_real
        FROM transaction_details
       WHERE transaction_id = NEW.id
       ORDER BY product_id                -- urutan kunci konsisten (cegah deadlock)
    LOOP
      SELECT stok, nama_barang INTO v_stok, v_nama
        FROM products WHERE id = r.product_id FOR UPDATE;

      v_delta := CASE WHEN NEW.tipe_transaksi IN ('IN', 'ADJ_IN') THEN r.jumlah ELSE -r.jumlah END;

      IF v_stok + v_delta < 0 THEN
        RAISE EXCEPTION 'Stok fisik "%" tidak cukup (stok %, dibutuhkan %)', v_nama, v_stok, r.jumlah
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE products
         SET stok       = stok + v_delta,
             updated_at = now(),
             harga_beli_default = CASE WHEN NEW.tipe_transaksi = 'IN'
                                       THEN r.harga_satuan_real
                                       ELSE harga_beli_default END
       WHERE id = r.product_id;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_ubah_status
  BEFORE UPDATE OF status ON transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transaksi_ubah_status();

-- =====================================================================
-- VIEW 1: v_stok_barang
-- Alasan: halaman Stok (admin) dan Katalog (client) sama-sama butuh stok fisik,
-- stok TERTAHAN, stok TERSEDIA, dan label status. Aturan ini cukup ditulis satu kali.
-- Barang di transaksi OUT PENDING yang belum kedaluwarsa dianggap tertahan.
-- =====================================================================
CREATE VIEW v_stok_barang AS
SELECT x.*,
       CASE
         WHEN x.tersedia <= 0              THEN 'Habis'
         WHEN x.tersedia <= x.stok_minimal THEN 'Menipis'
         ELSE 'Tersedia'
       END AS status_stok
FROM (
  SELECT p.id                          AS product_id,
         p.kode_barang,
         p.nama_barang,
         p.jenis_barang,
         p.merk,
         p.harga_jual_default          AS harga_jual,
         p.harga_beli_default          AS harga_beli,
         p.stok,
         p.stok_minimal,
         p.aktif,
         COALESCE(h.tertahan, 0)       AS tertahan,
         p.stok - COALESCE(h.tertahan, 0) AS tersedia
  FROM products p
  LEFT JOIN (
    SELECT d.product_id, SUM(d.jumlah) AS tertahan
    FROM transaction_details d
    JOIN transactions t ON t.id = d.transaction_id
    WHERE t.tipe_transaksi = 'OUT'
      AND t.status = 'PENDING'
      AND t.expired_at > now()
    GROUP BY d.product_id
  ) h ON h.product_id = p.id
) x;

-- =====================================================================
-- VIEW 2: v_transaksi_header
-- Alasan: total tidak disimpan (3NF). Dashboard, daftar transaksi, dan
-- laporan memakai rumus total_bayar = subtotal - diskon yang sama.
-- =====================================================================
CREATE VIEW v_transaksi_header AS
SELECT t.id                                           AS transaction_id,
       t.no_faktur,
       t.tipe_transaksi,
       t.status,
       t.created_at                                   AS tgl_transaksi,
       t.expired_at,
       t.completed_at,
       t.customer_id,
       COALESCE(c.nama_lengkap, t.nama_pelanggan)     AS nama_pelanggan,
       s.nama_supplier,
       a.nama_lengkap                                 AS dicatat_oleh,
       COUNT(td.product_id)                           AS jumlah_jenis,
       COALESCE(SUM(td.jumlah), 0)                    AS jumlah_item,
       COALESCE(SUM(td.subtotal), 0)                  AS subtotal,
       t.diskon,
       COALESCE(SUM(td.subtotal), 0) - t.diskon       AS total_bayar
FROM transactions t
JOIN users a                    ON a.id = t.dicatat_oleh
LEFT JOIN users c               ON c.id = t.customer_id
LEFT JOIN suppliers s           ON s.id = t.supplier_id
LEFT JOIN transaction_details td ON td.transaction_id = t.id
GROUP BY t.id, a.id, c.id, s.id;

-- =====================================================================
-- VIEW 3: v_kartu_stok  (pengganti tabel stock_movements)
-- Riwayat keluar-masuk per barang beserta stok sebelum/sesudah, dihitung
-- dengan window function dari transaksi COMPLETED.
-- =====================================================================
CREATE VIEW v_kartu_stok AS
SELECT k.*, k.stok_akhir - k.perubahan AS stok_awal
FROM (
  SELECT d.product_id,
         p.kode_barang,
         p.nama_barang,
         t.completed_at AS waktu,
         t.no_faktur,
         t.tipe_transaksi,
         t.catatan,
         CASE WHEN t.tipe_transaksi IN ('IN', 'ADJ_IN') THEN d.jumlah ELSE -d.jumlah END AS perubahan,
         SUM(CASE WHEN t.tipe_transaksi IN ('IN', 'ADJ_IN') THEN d.jumlah ELSE -d.jumlah END)
           OVER (PARTITION BY d.product_id
                 ORDER BY t.completed_at, t.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS stok_akhir
  FROM transaction_details d
  JOIN transactions t ON t.id = d.transaction_id
  JOIN products p     ON p.id = d.product_id
  WHERE t.status = 'COMPLETED'
) k;

-- =====================================================================
-- VIEW 4: v_laporan_laba_rugi  (bulanan, hanya penjualan COMPLETED)
-- Memakai harga_modal yang dicatat saat transaksi (bukan harga beli sekarang)
-- dan memperhitungkan diskon per transaksi. Disebut laba KOTOR karena
-- biaya operasional tidak dicatat.
-- =====================================================================
CREATE VIEW v_laporan_laba_rugi AS
WITH per_transaksi AS (
  SELECT t.id,
         date_trunc('month', t.completed_at) AS bulan,
         t.diskon,
         SUM(td.subtotal)                    AS penjualan,
         SUM(td.jumlah * td.harga_modal)     AS modal
  FROM transactions t
  JOIN transaction_details td ON td.transaction_id = t.id
  WHERE t.status = 'COMPLETED' AND t.tipe_transaksi = 'OUT'
  GROUP BY t.id
)
SELECT bulan,
       COUNT(*)                                       AS total_transaksi,
       SUM(penjualan)                                 AS penjualan_kotor,
       SUM(diskon)                                    AS total_diskon,
       SUM(penjualan) - SUM(diskon)                   AS pendapatan_bersih,
       SUM(modal)                                     AS total_modal,
       SUM(penjualan) - SUM(diskon) - SUM(modal)      AS laba_kotor
FROM per_transaksi
GROUP BY bulan;

-- =====================================================================
-- FUNGSI 1: expire_pending()
-- Melepas tahanan stok: transaksi OUT PENDING yang lewat expired_at -> EXPIRED.
-- Dipanggil saat admin membuka halaman Transaksi/Stok (atau dijadwalkan).
-- Stok tersedia sebenarnya sudah benar tanpa ini (view mengabaikan tahanan
-- kedaluwarsa); fungsi ini merapikan status agar daftar transaksi akurat.
-- =====================================================================
CREATE FUNCTION expire_pending() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE transactions
     SET status = 'EXPIRED'
   WHERE status = 'PENDING'
     AND tipe_transaksi = 'OUT'
     AND expired_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- =====================================================================
-- FUNGSI 2: buat_penjualan(...)  - keranjang/kasir membuat pesanan yang menahan stok
-- Header + semua baris dibuat dalam satu pemanggilan (satu transaksi): jika satu
-- barang kurang stok, trigger melempar error dan seluruh pesanan batal.
--
-- p_items contoh: [{"product_id":1,"jumlah":2},{"product_id":12,"jumlah":1,"harga":24000}]
--   "harga" opsional = harga hasil kesepakatan; tanpa itu dipakai harga jual default.
-- Pelanggan: p_customer_id (terdaftar) ATAU p_nama_pelanggan (pembeli umum).
-- =====================================================================
CREATE FUNCTION buat_penjualan(
  p_dicatat_oleh   INTEGER,
  p_items          JSONB,
  p_customer_id    INTEGER DEFAULT NULL,
  p_nama_pelanggan TEXT    DEFAULT NULL,
  p_diskon         INTEGER DEFAULT 0,
  p_jam_tahan      INTEGER DEFAULT 24
) RETURNS TABLE (o_id INTEGER, o_no_faktur TEXT, o_expired_at TIMESTAMPTZ, o_total BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
  v_id       INTEGER;
  v_no       TEXT;
  v_exp      TIMESTAMPTZ;
  v_subtotal BIGINT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Keranjang kosong' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO transactions (tipe_transaksi, customer_id, nama_pelanggan, dicatat_oleh, diskon, expired_at)
  VALUES ('OUT', p_customer_id, p_nama_pelanggan, p_dicatat_oleh, p_diskon,
          now() + make_interval(hours => p_jam_tahan))
  RETURNING id, no_faktur, expired_at INTO v_id, v_no, v_exp;

  -- Barang kembar digabung; urut product_id agar kunci baris selalu berurutan sama.
  INSERT INTO transaction_details (transaction_id, product_id, jumlah, harga_satuan_real)
  SELECT v_id,
         (e ->> 'product_id')::integer,
         SUM((e ->> 'jumlah')::integer),
         MAX((e ->> 'harga')::integer)
    FROM jsonb_array_elements(p_items) AS e
   GROUP BY (e ->> 'product_id')::integer
   ORDER BY (e ->> 'product_id')::integer;

  SELECT SUM(subtotal) INTO v_subtotal
    FROM transaction_details WHERE transaction_id = v_id;

  IF p_diskon > v_subtotal THEN
    RAISE EXCEPTION 'Diskon (%) melebihi subtotal (%)', p_diskon, v_subtotal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT v_id, v_no, v_exp, v_subtotal - p_diskon;
END $$;


-- ======================= BAGIAN 2: DATA UJI =======================
-- =====================================================================
-- Data uji v2 (dihasilkan skrip; jalankan SETELAH 01_schema.sql)
--   5 supplier, 15 akun, 30 barang, 46 transaksi (136 baris detail)
-- Semua perubahan stok lewat jalur resmi: transaksi dibuat PENDING lalu
-- di-UPDATE menjadi COMPLETED, sehingga trigger yang dites benar-benar bekerja.
-- Tanggal relatif terhadap CURRENT_DATE/now() (data selalu "segar" saat dijalankan).
-- Password: admin -> admin123, montir -> montir123, pelanggan -> client123
-- =====================================================================

-- ---------- users ----------
INSERT INTO users (id, username, password_hash, nama_lengkap, no_telepon, alamat, role, created_at)
SELECT t.id, t.uname, crypt(t.pw, gen_salt('bf', 8)), t.nama, t.telp, t.alamat, t.role, now() - make_interval(days => t.umur)
FROM (VALUES
  (1, 'admin', 'admin123', 'Admin Utama', '081234567890', 'Jl. Raya Contoh No. 1', 'ADMIN', 200),
  (2, 'slamet', 'montir123', 'Slamet Riyadi', '081230010002', 'Jl. Bengkel No. 3', 'MECHANIC', 180),
  (3, 'wahyu', 'montir123', 'Wahyu Hidayat', '081230010003', 'Jl. Bengkel No. 5', 'MECHANIC', 150),
  (4, 'budi', 'client123', 'Budi Santoso', '081330010004', 'Jl. Melati No. 5', 'CUSTOMER', 120),
  (5, 'siti', 'client123', 'Siti Rahayu', '081330010005', 'Jl. Mawar No. 12', 'CUSTOMER', 110),
  (6, 'rudi', 'client123', 'Rudi Hartono', '081330010006', 'Jl. Kenanga No. 7', 'CUSTOMER', 105),
  (7, 'dewi', 'client123', 'Dewi Lestari', '085230010007', 'Jl. Anggrek No. 20', 'CUSTOMER', 98),
  (8, 'agus', 'client123', 'Agus Prasetyo', '085230010008', NULL, 'CUSTOMER', 90),
  (9, 'rina', 'client123', 'Rina Wulandari', '085230010009', 'Jl. Cempaka No. 9', 'CUSTOMER', 84),
  (10, 'hendra', 'client123', 'Hendra Gunawan', '087830010010', 'Jl. Dahlia No. 14', 'CUSTOMER', 77),
  (11, 'maya', 'client123', 'Maya Kusuma', '087830010011', NULL, 'CUSTOMER', 70),
  (12, 'eko', 'client123', 'Eko Saputra', '087830010012', 'Jl. Flamboyan No. 2', 'CUSTOMER', 61),
  (13, 'nuraini', 'client123', 'Nur Aini', '081930010013', 'Jl. Teratai No. 18', 'CUSTOMER', 50),
  (14, 'joko', 'client123', 'Joko Purnomo', '081930010014', 'Jl. Seruni No. 6', 'CUSTOMER', 12),
  (15, 'fitri', 'client123', 'Fitri Handayani', '081930010015', 'Jl. Kamboja No. 4', 'CUSTOMER', 6)
) AS t(id, uname, pw, nama, telp, alamat, role, umur);

-- ---------- suppliers ----------
INSERT INTO suppliers (id, nama_supplier, no_telepon, alamat) VALUES
  (1, 'CV Mitra Oli Nusantara', '081211110001', 'Jl. Industri No. 12'),
  (2, 'UD Rem Prima Motor', '081211110002', 'Jl. Pasar Besar No. 45'),
  (3, 'PT Sentra Ban dan Aki', '081211110003', 'Jl. Raya Kawasan Blok C-7'),
  (4, 'Toko Grosir Busi Makmur', '081211110004', 'Jl. Veteran No. 8'),
  (5, 'CV Filter Jaya Abadi', '081211110005', 'Jl. Gudang No. 21');

-- ---------- products (stok awal 0; stok terisi lewat transaksi IN) ----------
INSERT INTO products (id, kode_barang, nama_barang, jenis_barang, merk, harga_beli_default, harga_jual_default, stok_minimal, aktif) VALUES
  (1, 'OLI-001', 'Oli Mesin Yamalube 1L', 'Oli', 'Yamalube', 46000, 55000, 10, TRUE),
  (2, 'OLI-002', 'Oli Mesin Federal Matic 0.8L', 'Oli', 'Federal', 37500, 45000, 10, TRUE),
  (3, 'OLI-003', 'Oli Mesin Shell Advance AX7 0.8L', 'Oli', 'Shell', 43000, 52000, 10, TRUE),
  (4, 'OLI-004', 'Oli Gardan Yamalube 120ml', 'Oli', 'Yamalube', 11500, 15000, 10, TRUE),
  (5, 'OLI-005', 'Oli Mesin Honda MPX2 0.8L', 'Oli', 'Honda', 39000, 47000, 10, TRUE),
  (6, 'OLI-006', 'Oli Mesin AHM MPX1 1L', 'Oli', 'Honda', 47000, 56000, 10, TRUE),
  (7, 'REM-001', 'Kampas Rem Depan Honda Beat', 'Rem', 'Honda', 30000, 38000, 5, TRUE),
  (8, 'REM-002', 'Kampas Rem Belakang Honda Beat', 'Rem', 'Honda', 27500, 35000, 5, TRUE),
  (9, 'REM-003', 'Kampas Rem Depan Yamaha Mio', 'Rem', 'Yamaha', 28000, 36000, 5, TRUE),
  (10, 'REM-004', 'Minyak Rem DOT 3 100ml', 'Rem', 'Nissin', 10500, 14000, 5, TRUE),
  (11, 'REM-005', 'Cakram Rem Honda Vario 125', 'Rem', 'Honda', 98000, 120000, 5, TRUE),
  (12, 'BUS-001', 'Busi NGK CPR9EA', 'Busi', 'NGK', 19500, 25000, 10, TRUE),
  (13, 'BUS-002', 'Busi NGK Iridium CR7HIX', 'Busi', 'NGK', 70000, 85000, 5, TRUE),
  (14, 'BUS-003', 'Busi Denso U20EPR9', 'Busi', 'Denso', 17500, 22000, 5, TRUE),
  (15, 'BUS-004', 'Busi NGK C7HSA', 'Busi', 'NGK', 14000, 18000, 5, TRUE),
  (16, 'BAN-001', 'Ban Luar IRC 80/90-14', 'Ban', 'IRC', 152000, 185000, 4, TRUE),
  (17, 'BAN-002', 'Ban Luar FDR Sport XR 90/80-14', 'Ban', 'FDR', 142000, 175000, 4, TRUE),
  (18, 'BAN-003', 'Ban Dalam IRC 80/90-14', 'Ban', 'IRC', 35000, 45000, 5, TRUE),
  (19, 'BAN-004', 'Ban Luar Michelin City Grip 100/80-14', 'Ban', 'Michelin', 245000, 290000, 3, TRUE),
  (20, 'AKI-001', 'Aki Yuasa YTZ5S', 'Aki', 'Yuasa', 195000, 235000, 3, TRUE),
  (21, 'AKI-002', 'Aki GS Astra GTZ5S', 'Aki', 'GS Astra', 205000, 245000, 3, TRUE),
  (22, 'AKI-003', 'Aki Kering Motobatt MBTZ6V', 'Aki', 'Motobatt', 172000, 210000, 3, TRUE),
  (23, 'RAN-001', 'Gear Set Honda Beat (Rantai + Gir)', 'Rantai', 'Honda', 135000, 165000, 3, TRUE),
  (24, 'RAN-002', 'Rantai Keteng 428H-118L', 'Rantai', 'DID', 76000, 95000, 3, TRUE),
  (25, 'RAN-003', 'Gear Set Yamaha Mio', 'Rantai', 'Yamaha', 122000, 150000, 3, TRUE),
  (26, 'FIL-001', 'Filter Udara Honda Vario 125', 'Filter', 'Honda', 32000, 42000, 5, TRUE),
  (27, 'FIL-002', 'Filter Udara Yamaha Mio', 'Filter', 'Yamaha', 29000, 38000, 5, TRUE),
  (28, 'FIL-003', 'Filter Oli Honda', 'Filter', 'Honda', 15000, 20000, 5, TRUE),
  (29, 'FIL-004', 'Filter Bensin Universal', 'Filter', 'Universal', 19000, 25000, 5, TRUE),
  (30, 'REM-006', 'Kampas Rem Depan Honda Supra X (discontinue)', 'Rem', 'Honda', 28000, 36000, 5, FALSE);

-- ---------- barang MASUK dari supplier (stok awal + restock) ----------
INSERT INTO transactions (id, tipe_transaksi, supplier_id, dicatat_oleh, created_at, no_referensi) VALUES
  (1, 'IN', 1, 1, (CURRENT_DATE - 95 + TIME '10:00')::timestamptz, 'SJ/1/001'),
  (2, 'IN', 2, 1, (CURRENT_DATE - 95 + TIME '10:00')::timestamptz, 'SJ/2/002'),
  (3, 'IN', 4, 1, (CURRENT_DATE - 95 + TIME '10:00')::timestamptz, 'SJ/4/003'),
  (4, 'IN', 3, 1, (CURRENT_DATE - 95 + TIME '10:00')::timestamptz, 'SJ/3/004'),
  (5, 'IN', 5, 1, (CURRENT_DATE - 95 + TIME '10:00')::timestamptz, 'SJ/5/005'),
  (14, 'IN', 1, 1, (CURRENT_DATE - 50 + TIME '10:00')::timestamptz, 'SJ/1/014'),
  (15, 'IN', 2, 1, (CURRENT_DATE - 50 + TIME '10:00')::timestamptz, 'SJ/2/015'),
  (16, 'IN', 4, 1, (CURRENT_DATE - 50 + TIME '10:00')::timestamptz, 'SJ/4/016'),
  (31, 'IN', 1, 1, (CURRENT_DATE - 14 + TIME '10:00')::timestamptz, 'SJ/1/031'),
  (32, 'IN', 3, 1, (CURRENT_DATE - 14 + TIME '10:00')::timestamptz, 'SJ/3/032'),
  (33, 'IN', 5, 1, (CURRENT_DATE - 14 + TIME '10:00')::timestamptz, 'SJ/5/033');

INSERT INTO transaction_details (transaction_id, product_id, jumlah)
SELECT t.trx, p.id, t.qty FROM (VALUES
  (1, 'OLI-001', 32),
  (1, 'OLI-002', 22),
  (1, 'OLI-003', 7),
  (1, 'OLI-004', 22),
  (1, 'OLI-005', 16),
  (1, 'OLI-006', 3),
  (2, 'REM-001', 15),
  (2, 'REM-002', 11),
  (2, 'REM-003', 5),
  (2, 'REM-004', 23),
  (2, 'REM-005', 3),
  (2, 'RAN-001', 6),
  (2, 'RAN-002', 9),
  (2, 'RAN-003', 2),
  (3, 'BUS-001', 17),
  (3, 'BUS-002', 7),
  (3, 'BUS-003', 4),
  (3, 'BUS-004', 19),
  (4, 'BAN-001', 8),
  (4, 'BAN-002', 5),
  (4, 'BAN-003', 14),
  (4, 'BAN-004', 2),
  (4, 'AKI-001', 4),
  (4, 'AKI-002', 1),
  (4, 'AKI-003', 5),
  (5, 'FIL-001', 11),
  (5, 'FIL-002', 6),
  (5, 'FIL-003', 13),
  (5, 'FIL-004', 3),
  (14, 'OLI-001', 10),
  (14, 'OLI-002', 7),
  (14, 'OLI-003', 2),
  (14, 'OLI-004', 9),
  (14, 'OLI-005', 7),
  (15, 'REM-001', 12),
  (15, 'REM-002', 9),
  (15, 'REM-003', 2),
  (15, 'REM-004', 20),
  (15, 'REM-005', 3),
  (15, 'RAN-001', 5),
  (15, 'RAN-002', 7),
  (15, 'RAN-003', 2),
  (16, 'BUS-001', 11),
  (16, 'BUS-002', 4),
  (16, 'BUS-003', 1),
  (16, 'BUS-004', 15),
  (31, 'OLI-001', 11),
  (31, 'OLI-002', 8),
  (31, 'OLI-003', 2),
  (31, 'OLI-004', 9),
  (31, 'OLI-005', 7),
  (32, 'BAN-001', 6),
  (32, 'BAN-002', 3),
  (32, 'BAN-003', 10),
  (32, 'BAN-004', 1),
  (32, 'AKI-001', 2),
  (32, 'AKI-003', 4),
  (33, 'FIL-001', 7),
  (33, 'FIL-002', 5),
  (33, 'FIL-003', 12),
  (33, 'FIL-004', 1)
) AS t(trx, kode, qty) JOIN products p ON p.kode_barang = t.kode;

UPDATE transactions SET status = 'COMPLETED', completed_at = created_at + interval '90 minutes', metode_bayar = 'TRANSFER'
 WHERE id IN (1,2,3,4,5,14,15,16,31,32,33);

-- ---------- pesanan ke supplier yang BELUM diterima (stok belum bertambah) ----------
INSERT INTO transactions (id, tipe_transaksi, supplier_id, dicatat_oleh, created_at, no_referensi, catatan) VALUES
  (42, 'IN', 1, 1, (now() - interval '48 hours'), NULL, 'Menunggu pengiriman supplier'),
  (43, 'IN', 3, 1, (now() - interval '24 hours'), NULL, 'Menunggu pengiriman supplier');

INSERT INTO transaction_details (transaction_id, product_id, jumlah)
SELECT t.trx, p.id, t.qty FROM (VALUES
  (42, 'OLI-001', 20),
  (42, 'OLI-003', 12),
  (43, 'AKI-002', 6),
  (43, 'AKI-001', 4)
) AS t(trx, kode, qty) JOIN products p ON p.kode_barang = t.kode;

-- ---------- koreksi stok (rusak / selisih opname) ----------
INSERT INTO transactions (id, tipe_transaksi, dicatat_oleh, created_at, catatan) VALUES
  (23, 'ADJ_OUT', 1, (CURRENT_DATE - 30 + TIME '13:00')::timestamptz, 'Ban dalam bocor saat pengecekan, dikeluarkan dari stok'),
  (28, 'ADJ_IN', 1, (CURRENT_DATE - 20 + TIME '13:00')::timestamptz, 'Selisih stock opname: stok fisik lebih 2 dari catatan'),
  (37, 'ADJ_OUT', 1, (CURRENT_DATE - 8 + TIME '13:00')::timestamptz, 'Kemasan oli gardan bocor, tidak layak jual');

INSERT INTO transaction_details (transaction_id, product_id, jumlah)
SELECT t.trx, p.id, t.qty FROM (VALUES
  (23, 'BAN-003', 1),
  (28, 'OLI-002', 2),
  (37, 'OLI-004', 1)
) AS t(trx, kode, qty) JOIN products p ON p.kode_barang = t.kode;

UPDATE transactions SET status = 'COMPLETED', completed_at = created_at + interval '60 minutes'
 WHERE id IN (23,28,37);

-- ---------- penjualan (OUT): pelanggan terdaftar dan pembeli umum ----------
INSERT INTO transactions (id, tipe_transaksi, customer_id, nama_pelanggan, dicatat_oleh, diskon, created_at) VALUES
  (6, 'OUT', 4, NULL, 1, 0, (CURRENT_DATE - 70 + TIME '09:47')::timestamptz),
  (7, 'OUT', 5, NULL, 2, 0, (CURRENT_DATE - 68 + TIME '10:54')::timestamptz),
  (8, 'OUT', 6, NULL, 1, 5000, (CURRENT_DATE - 65 + TIME '11:01')::timestamptz),
  (9, 'OUT', NULL, 'Pak Haryanto (umum)', 1, 0, (CURRENT_DATE - 62 + TIME '12:08')::timestamptz),
  (10, 'OUT', 4, NULL, 2, 0, (CURRENT_DATE - 59 + TIME '13:15')::timestamptz),
  (11, 'OUT', 8, NULL, 1, 0, (CURRENT_DATE - 56 + TIME '14:22')::timestamptz),
  (12, 'OUT', 9, NULL, 1, 0, (CURRENT_DATE - 53 + TIME '15:29')::timestamptz),
  (13, 'OUT', 5, NULL, 2, 10000, (CURRENT_DATE - 50 + TIME '08:36')::timestamptz),
  (17, 'OUT', NULL, 'Bu Lastri (umum)', 1, 0, (CURRENT_DATE - 47 + TIME '09:43')::timestamptz),
  (18, 'OUT', 6, NULL, 1, 0, (CURRENT_DATE - 44 + TIME '10:50')::timestamptz),
  (19, 'OUT', 11, NULL, 2, 0, (CURRENT_DATE - 41 + TIME '11:57')::timestamptz),
  (20, 'OUT', NULL, 'Mas Danu (umum)', 1, 0, (CURRENT_DATE - 38 + TIME '12:04')::timestamptz),
  (21, 'OUT', 7, NULL, 1, 5000, (CURRENT_DATE - 35 + TIME '13:11')::timestamptz),
  (22, 'OUT', 12, NULL, 2, 0, (CURRENT_DATE - 32 + TIME '14:18')::timestamptz),
  (24, 'OUT', 8, NULL, 1, 0, (CURRENT_DATE - 29 + TIME '15:25')::timestamptz),
  (25, 'OUT', NULL, 'Pak Tono (umum)', 1, 0, (CURRENT_DATE - 26 + TIME '08:32')::timestamptz),
  (26, 'OUT', 9, NULL, 2, 0, (CURRENT_DATE - 24 + TIME '09:39')::timestamptz),
  (27, 'OUT', 13, NULL, 1, 0, (CURRENT_DATE - 21 + TIME '10:46')::timestamptz),
  (29, 'OUT', 6, NULL, 1, 0, (CURRENT_DATE - 19 + TIME '11:53')::timestamptz),
  (30, 'OUT', 4, NULL, 2, 10000, (CURRENT_DATE - 16 + TIME '12:00')::timestamptz),
  (34, 'OUT', 10, NULL, 1, 0, (CURRENT_DATE - 13 + TIME '13:07')::timestamptz),
  (35, 'OUT', NULL, 'Bu Endang (umum)', 1, 0, (CURRENT_DATE - 11 + TIME '14:14')::timestamptz),
  (36, 'OUT', 11, NULL, 2, 0, (CURRENT_DATE - 9 + TIME '15:21')::timestamptz),
  (38, 'OUT', 5, NULL, 1, 0, (CURRENT_DATE - 7 + TIME '08:28')::timestamptz),
  (39, 'OUT', NULL, 'Mas Rizal (umum)', 1, 0, (CURRENT_DATE - 5 + TIME '09:35')::timestamptz),
  (40, 'OUT', 4, NULL, 2, 5000, (CURRENT_DATE - 4 + TIME '10:42')::timestamptz),
  (41, 'OUT', 12, NULL, 1, 0, (CURRENT_DATE - 3 + TIME '11:49')::timestamptz),
  (44, 'OUT', 6, NULL, 1, 0, (now() - interval '5 hours')),
  (45, 'OUT', 9, NULL, 2, 0, (now() - interval '2 hours')),
  (46, 'OUT', 14, NULL, 1, 0, (now() - interval '1 hours'));

-- harga_satuan_real NULL = harga jual default; angka = harga hasil kesepakatan/harga lama
INSERT INTO transaction_details (transaction_id, product_id, jumlah, harga_satuan_real)
SELECT t.trx, p.id, t.qty, t.harga FROM (VALUES
  (6, 'OLI-001', 2, 52000),
  (6, 'BUS-001', 1, 23000),
  (7, 'RAN-001', 1, 160000),
  (7, 'OLI-002', 1, NULL),
  (8, 'BAN-001', 1, 180000),
  (8, 'BAN-003', 1, NULL),
  (8, 'OLI-005', 1, NULL),
  (9, 'REM-001', 1, NULL),
  (9, 'REM-002', 1, NULL),
  (10, 'OLI-002', 2, 43000),
  (10, 'FIL-001', 1, NULL),
  (10, 'BUS-001', 1, 23000),
  (11, 'AKI-001', 1, NULL),
  (12, 'BAN-004', 1, NULL),
  (12, 'BAN-003', 1, NULL),
  (13, 'OLI-001', 3, 52000),
  (13, 'FIL-003', 1, NULL),
  (13, 'REM-004', 1, NULL),
  (17, 'BUS-002', 1, NULL),
  (17, 'OLI-003', 1, NULL),
  (18, 'REM-003', 2, NULL),
  (18, 'REM-004', 1, NULL),
  (19, 'BAN-002', 1, NULL),
  (19, 'BAN-003', 1, NULL),
  (20, 'OLI-002', 2, NULL),
  (20, 'OLI-004', 1, NULL),
  (21, 'AKI-003', 1, NULL),
  (21, 'BUS-004', 2, NULL),
  (22, 'RAN-002', 1, NULL),
  (22, 'OLI-004', 2, NULL),
  (24, 'OLI-001', 2, NULL),
  (24, 'BUS-001', 2, NULL),
  (24, 'FIL-001', 1, NULL),
  (25, 'REM-001', 1, NULL),
  (25, 'REM-002', 1, NULL),
  (25, 'REM-004', 1, NULL),
  (26, 'OLI-005', 2, NULL),
  (26, 'FIL-003', 1, NULL),
  (27, 'AKI-002', 1, NULL),
  (29, 'BAN-001', 1, NULL),
  (29, 'BAN-003', 1, NULL),
  (29, 'OLI-001', 1, NULL),
  (30, 'OLI-002', 3, NULL),
  (30, 'BUS-001', 1, NULL),
  (30, 'FIL-001', 1, NULL),
  (34, 'REM-005', 1, NULL),
  (34, 'REM-004', 1, NULL),
  (35, 'OLI-006', 3, NULL),
  (35, 'OLI-001', 1, NULL),
  (36, 'BUS-003', 2, NULL),
  (36, 'BUS-004', 1, NULL),
  (38, 'OLI-001', 2, NULL),
  (38, 'BUS-001', 1, NULL),
  (39, 'OLI-003', 2, NULL),
  (39, 'FIL-004', 2, NULL),
  (39, 'REM-003', 1, NULL),
  (40, 'RAN-002', 1, NULL),
  (40, 'OLI-005', 1, NULL),
  (40, 'BUS-002', 1, NULL),
  (41, 'BAN-004', 1, NULL),
  (41, 'OLI-002', 1, NULL),
  (44, 'OLI-001', 2, NULL),
  (44, 'OLI-002', 2, NULL),
  (45, 'AKI-001', 1, NULL),
  (45, 'REM-005', 1, NULL),
  (46, 'BUS-001', 2, NULL),
  (46, 'OLI-004', 1, NULL),
  (46, 'FIL-001', 1, NULL)
) AS t(trx, kode, qty, harga) JOIN products p ON p.kode_barang = t.kode;

-- dibayar & diserahkan -> stok fisik berkurang (trigger)
UPDATE transactions
   SET status = 'COMPLETED',
       completed_at = created_at + make_interval(mins => 15 + (id % 4) * 20),
       metode_bayar = (ARRAY['TUNAI','TRANSFER','QRIS','TUNAI'])[1 + (id % 4)]
 WHERE id IN (6,7,8,9,10,11,13,17,18,19,20,21,22,24,25,27,29,30,35,36,38,39,40,41);

-- dibatalkan pelanggan (stok fisik tidak berubah, tahanan lepas)
UPDATE transactions SET status = 'CANCELLED', catatan = 'Pelanggan batal, tidak jadi mengambil barang'
 WHERE id IN (12,26);

-- penjualan PENDING yang lewat batas penahanan tanpa pembayaran -> EXPIRED
SELECT expire_pending();

-- ---------- sinkronkan sequence SERIAL & nomor faktur ----------
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('suppliers', 'id'), (SELECT MAX(id) FROM suppliers));
SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT MAX(id) FROM products));
SELECT setval(pg_get_serial_sequence('transactions', 'id'), (SELECT MAX(id) FROM transactions));
ANALYZE;


-- ======================= BAGIAN 3: QUERY & DEMO =======================
-- =====================================================================
-- Query yang dipakai fitur aplikasi Sumber Lancar (skema v2)
-- Jalankan setelah 01_schema.sql dan 02_seed.sql.
-- Tiap query: halaman pemakai, teknik SQL, parameter contoh.
-- [ADA]  = fitur sudah ada di UI sekarang
-- [BARU] = panel/fitur yang perlu dibuatkan UI-nya
-- =====================================================================


-- ---------------------------------------------------------------------
-- Q1 [ADA] admin/stok.html - daftar stok + kotak "Cari barang..."
-- Teknik : VIEW (stok fisik, tertahan, tersedia, status), pencarian, paginasi
-- Param  : kata kunci 'oli'; 12 baris per halaman (ringan untuk perangkat low end)
-- ---------------------------------------------------------------------
SELECT product_id, kode_barang, nama_barang, jenis_barang, harga_jual,
       stok, tertahan, tersedia, status_stok
FROM   v_stok_barang
WHERE  aktif
  AND (nama_barang  ILIKE '%' || 'oli' || '%'
    OR jenis_barang ILIKE '%' || 'oli' || '%')
ORDER  BY nama_barang
LIMIT  12 OFFSET 0;


-- ---------------------------------------------------------------------
-- Q2 [ADA] katalog.html - kartu produk + chip filter kategori
-- Teknik : VIEW; label stok memakai stok TERSEDIA (bukan fisik)
-- Param  : jenis = 'Oli' (chip "Semua" = tanpa filter jenis)
-- ---------------------------------------------------------------------
SELECT nama_barang, jenis_barang, harga_jual, status_stok
FROM   v_stok_barang
WHERE  aktif
  AND  jenis_barang = 'Oli'
ORDER  BY (status_stok = 'Habis'), nama_barang
LIMIT  12;


-- ---------------------------------------------------------------------
-- Q3 [ADA] admin/index.html - kartu statistik
-- Teknik : SUBQUERY skalar (lima angka dalam satu pemanggilan)
-- ---------------------------------------------------------------------
SELECT
  (SELECT COALESCE(SUM(total_bayar), 0)
     FROM v_transaksi_header
    WHERE tipe_transaksi = 'OUT' AND status = 'COMPLETED'
      AND date_trunc('month', completed_at) = date_trunc('month', now()))   AS pendapatan_bulan_ini,
  (SELECT COUNT(*) FROM transactions
    WHERE tipe_transaksi = 'OUT' AND status = 'PENDING' AND expired_at > now()) AS pesanan_menahan_stok,
  (SELECT COALESCE(SUM(stok::bigint * harga_beli_default), 0)
     FROM products WHERE aktif)                                              AS nilai_persediaan,
  (SELECT COUNT(*) FROM v_stok_barang
    WHERE aktif AND status_stok <> 'Tersedia')                               AS barang_perlu_perhatian,
  (SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER')                       AS pelanggan_terdaftar;


-- ---------------------------------------------------------------------
-- Q4 [ADA] admin/index.html - tabel "Transaksi Terbaru"
-- Teknik : VIEW (join users + suppliers + detail, agregasi total)
-- ---------------------------------------------------------------------
SELECT no_faktur, tipe_transaksi, COALESCE(nama_pelanggan, nama_supplier) AS pihak,
       tgl_transaksi::date AS tanggal, total_bayar, status
FROM   v_transaksi_header
ORDER  BY tgl_transaksi DESC
LIMIT  5;


-- ---------------------------------------------------------------------
-- Q5 [ADA] admin/pesanan.html - pesanan yang sedang MENAHAN stok (belum bayar)
-- Teknik : JOIN 3 tabel + string_agg; sisa waktu penahanan
-- Admin memakai daftar ini untuk menghubungi pelanggan / membatalkan.
-- ---------------------------------------------------------------------
SELECT h.no_faktur,
       h.nama_pelanggan,
       h.total_bayar,
       h.expired_at,
       h.expired_at - now() AS sisa_waktu,
       string_agg(p.nama_barang || ' x' || d.jumlah, ', ' ORDER BY p.nama_barang) AS isi_pesanan
FROM   v_transaksi_header h
JOIN   transaction_details d ON d.transaction_id = h.transaction_id
JOIN   products p            ON p.id = d.product_id
WHERE  h.tipe_transaksi = 'OUT'
  AND  h.status = 'PENDING'
  AND  h.expired_at > now()
GROUP  BY h.transaction_id, h.no_faktur, h.nama_pelanggan, h.total_bayar, h.expired_at
ORDER  BY h.expired_at;


-- ---------------------------------------------------------------------
-- Q6 [ADA] admin/wa.html + keranjang - isi placeholder {items} {total} {invoice}
-- Teknik : JOIN + string_agg menghasilkan teks pesan WhatsApp
-- Param  : faktur terbaru berstatus PENDING (ganti dengan no_faktur yang dipilih)
-- ---------------------------------------------------------------------
SELECT h.no_faktur                                    AS invoice,
       'Rp ' || to_char(h.total_bayar, 'FM999G999G999') AS total,
       string_agg('- ' || p.nama_barang || ' x' || d.jumlah, E'\n' ORDER BY p.nama_barang) AS items
FROM   v_transaksi_header h
JOIN   transaction_details d ON d.transaction_id = h.transaction_id
JOIN   products p            ON p.id = d.product_id
WHERE  h.transaction_id = (SELECT MAX(id) FROM transactions
                            WHERE tipe_transaksi = 'OUT' AND status = 'PENDING')
GROUP  BY h.transaction_id, h.no_faktur, h.total_bayar;


-- ---------------------------------------------------------------------
-- Q7 [BARU] admin/index.html - panel "Barang Terlaris 30 Hari"
-- Teknik : JOIN 3 tabel + GROUP BY + HAVING
-- HAVING : hanya barang yang terjual minimal 3 unit
-- ---------------------------------------------------------------------
SELECT p.kode_barang, p.nama_barang, p.jenis_barang,
       SUM(d.jumlah)                  AS terjual,
       SUM(d.subtotal)                AS omzet,
       SUM(d.jumlah * (d.harga_satuan_real - d.harga_modal)) AS laba_kotor
FROM   transaction_details d
JOIN   transactions t ON t.id = d.transaction_id
JOIN   products     p ON p.id = d.product_id
WHERE  t.tipe_transaksi = 'OUT'
  AND  t.status = 'COMPLETED'
  AND  t.completed_at >= now() - interval '30 days'
GROUP  BY p.id
HAVING SUM(d.jumlah) >= 3
ORDER  BY terjual DESC, omzet DESC
LIMIT  5;


-- ---------------------------------------------------------------------
-- Q8 [BARU] admin/index.html - grafik "Penjualan per Jenis Barang"
-- Teknik : JOIN 3 tabel + GROUP BY + HAVING (omzet minimal Rp 100.000)
-- ---------------------------------------------------------------------
SELECT p.jenis_barang,
       COUNT(DISTINCT t.id)  AS jumlah_transaksi,
       SUM(d.jumlah)         AS unit_terjual,
       SUM(d.subtotal)       AS omzet
FROM   products p
JOIN   transaction_details d ON d.product_id = p.id
JOIN   transactions t        ON t.id = d.transaction_id
WHERE  t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED'
GROUP  BY p.jenis_barang
HAVING SUM(d.subtotal) >= 100000
ORDER  BY omzet DESC;


-- ---------------------------------------------------------------------
-- Q9 [BARU] admin/stok.html - panel "Perlu Restock"
-- Teknik : CTE bertingkat (penjualan 30 hari + pesanan ke supplier yang
--          belum datang -> analisis -> saran jumlah beli)
-- Logika : barang Habis/Menipis (berdasar stok TERSEDIA) atau diperkirakan
--          habis < 14 hari. Barang yang sudah dipesan ke supplier (IN PENDING)
--          dikurangkan dari saran agar tidak dobel pesan.
-- ---------------------------------------------------------------------
WITH penjualan_30 AS (
  SELECT d.product_id, SUM(d.jumlah) AS terjual
  FROM   transaction_details d
  JOIN   transactions t ON t.id = d.transaction_id
  WHERE  t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED'
    AND  t.completed_at >= now() - interval '30 days'
  GROUP  BY d.product_id
),
po_masuk AS (
  SELECT d.product_id, SUM(d.jumlah) AS dipesan
  FROM   transaction_details d
  JOIN   transactions t ON t.id = d.transaction_id
  WHERE  t.tipe_transaksi = 'IN' AND t.status = 'PENDING'
  GROUP  BY d.product_id
),
analisis AS (
  SELECT v.kode_barang, v.nama_barang, v.jenis_barang,
         v.stok, v.tertahan, v.tersedia, v.stok_minimal, v.status_stok,
         COALESCE(s.terjual, 0)          AS terjual_30_hari,
         COALESCE(s.terjual, 0) / 30.0   AS rata_per_hari,
         COALESCE(po.dipesan, 0)         AS sudah_dipesan,
         CASE WHEN COALESCE(s.terjual, 0) = 0 THEN NULL
              ELSE ROUND(v.tersedia / (s.terjual / 30.0), 1)
         END                             AS hari_tersisa
  FROM   v_stok_barang v
  LEFT   JOIN penjualan_30 s ON s.product_id  = v.product_id
  LEFT   JOIN po_masuk    po ON po.product_id = v.product_id
  WHERE  v.aktif
)
SELECT kode_barang, nama_barang, jenis_barang,
       stok, tertahan, tersedia, status_stok,
       terjual_30_hari, hari_tersisa, sudah_dipesan,
       GREATEST(CEIL(rata_per_hari * 30)::integer + stok_minimal - tersedia - sudah_dipesan, 0) AS saran_beli
FROM   analisis
WHERE  status_stok <> 'Tersedia'
   OR  hari_tersisa < 14
ORDER  BY (status_stok = 'Habis') DESC, hari_tersisa NULLS LAST, nama_barang;


-- ---------------------------------------------------------------------
-- Q10 [BARU] admin/stok.html - panel "Stok Mengendap" (belum pernah laku)
-- Teknik : SUBQUERY NOT EXISTS (korelasi)
-- ---------------------------------------------------------------------
SELECT v.kode_barang, v.nama_barang, v.stok,
       v.stok * v.harga_beli AS nilai_modal_mengendap
FROM   v_stok_barang v
WHERE  v.aktif
  AND  v.stok > 0
  AND  NOT EXISTS (
         SELECT 1
         FROM   transaction_details d
         JOIN   transactions t ON t.id = d.transaction_id
         WHERE  d.product_id = v.product_id
           AND  t.tipe_transaksi = 'OUT'
           AND  t.status = 'COMPLETED')
ORDER  BY nilai_modal_mengendap DESC;


-- ---------------------------------------------------------------------
-- Q11 [BARU] admin/stok.html - detail barang: "Kartu Stok" + audit konsistensi
-- (a) Riwayat keluar-masuk satu barang (VIEW dengan window function)
-- Param : kode barang 'OLI-001'
-- ---------------------------------------------------------------------
SELECT waktu::date AS tanggal, no_faktur, tipe_transaksi,
       stok_awal, perubahan, stok_akhir, catatan
FROM   v_kartu_stok
WHERE  kode_barang = 'OLI-001'
ORDER  BY waktu DESC
LIMIT  10;

-- (b) Audit: stok di tabel produk HARUS sama dengan hasil penjumlahan riwayat.
--     Join + GROUP BY + HAVING; hasil yang benar = 0 baris.
SELECT p.kode_barang, p.stok AS stok_tercatat,
       COALESCE(SUM(k.perubahan), 0)          AS stok_dari_riwayat,
       p.stok - COALESCE(SUM(k.perubahan), 0) AS selisih
FROM   products p
LEFT   JOIN v_kartu_stok k ON k.product_id = p.id
GROUP  BY p.id
HAVING p.stok <> COALESCE(SUM(k.perubahan), 0);


-- ---------------------------------------------------------------------
-- Q12 [BARU] admin/index.html - "Laporan Laba Rugi Bulanan"
-- Teknik : VIEW (CTE + agregasi); modal memakai harga saat transaksi
-- ---------------------------------------------------------------------
SELECT to_char(bulan, 'YYYY-MM') AS bulan, total_transaksi,
       penjualan_kotor, total_diskon, pendapatan_bersih, total_modal, laba_kotor
FROM   v_laporan_laba_rugi
ORDER  BY bulan DESC;


-- ---------------------------------------------------------------------
-- Q13 [BARU] admin/akun.html - label "Pelanggan Teratas"
-- Teknik : CTE + SUBQUERY pembanding (belanja di atas rata-rata)
-- Hanya pelanggan terdaftar yang pernah membeli; pembeli umum tidak dihitung.
-- ---------------------------------------------------------------------
WITH belanja AS (
  SELECT customer_id, nama_pelanggan,
         COUNT(*)          AS jumlah_transaksi,
         SUM(total_bayar)  AS total_belanja
  FROM   v_transaksi_header
  WHERE  tipe_transaksi = 'OUT' AND status = 'COMPLETED' AND customer_id IS NOT NULL
  GROUP  BY customer_id, nama_pelanggan
)
SELECT nama_pelanggan, jumlah_transaksi, total_belanja
FROM   belanja
WHERE  total_belanja > (SELECT AVG(total_belanja) FROM belanja)
ORDER  BY total_belanja DESC;


-- ---------------------------------------------------------------------
-- Q14 [BARU] admin/supplier - rekap pembelian per supplier
-- Teknik : JOIN 3 tabel + GROUP BY + HAVING (total pembelian minimal Rp 1.000.000)
-- ---------------------------------------------------------------------
SELECT s.nama_supplier,
       COUNT(DISTINCT t.id) AS jumlah_pembelian,
       SUM(d.jumlah)        AS unit_dibeli,
       SUM(d.subtotal)      AS total_pembelian
FROM   suppliers s
JOIN   transactions t        ON t.supplier_id = s.id
                            AND t.tipe_transaksi = 'IN' AND t.status = 'COMPLETED'
JOIN   transaction_details d ON d.transaction_id = t.id
GROUP  BY s.id
HAVING SUM(d.subtotal) >= 1000000
ORDER  BY total_pembelian DESC;


-- =====================================================================
-- DEMO ALUR STOK TERTAHAN (fungsi + trigger)
-- Semua di dalam transaksi lalu ROLLBACK, jadi data seed tidak berubah.
-- Kode produk: OLI-001 = id 1, BUS-001 = id 12.
-- =====================================================================
BEGIN;

-- D0. Kondisi awal
SELECT kode_barang, stok, tertahan, tersedia FROM v_stok_barang WHERE kode_barang IN ('OLI-001', 'BUS-001');

-- D1. Pelanggan umum memesan, belum bayar. Stok FISIK tetap, stok TERTAHAN naik.
--     BUS-001 ditawar Rp 24.000 (harga kesepakatan).
SELECT * FROM buat_penjualan(
  1,
  '[{"product_id":1,"jumlah":2},{"product_id":12,"jumlah":1,"harga":24000}]'::jsonb,
  NULL, 'Pak Darmo (umum)', 0, 24);
SELECT kode_barang, stok, tertahan, tersedia FROM v_stok_barang WHERE kode_barang IN ('OLI-001', 'BUS-001');

-- D2. Pembeli datang dan membayar tunai -> COMPLETED: stok fisik berkurang, kartu stok bertambah.
UPDATE transactions
   SET status = 'COMPLETED', metode_bayar = 'TUNAI'
 WHERE id = (SELECT MAX(id) FROM transactions);
SELECT kode_barang, stok, tertahan, tersedia FROM v_stok_barang WHERE kode_barang IN ('OLI-001', 'BUS-001');
SELECT waktu::date AS tanggal, no_faktur, tipe_transaksi, stok_awal, perubahan, stok_akhir
  FROM v_kartu_stok WHERE kode_barang = 'OLI-001' ORDER BY waktu DESC LIMIT 3;

-- D3. Pesanan lain dibatalkan: tahanan lepas, stok fisik tidak berubah.
UPDATE transactions SET status = 'CANCELLED'
 WHERE id = (SELECT MIN(id) FROM transactions
              WHERE tipe_transaksi = 'OUT' AND status = 'PENDING' AND expired_at > now());
SELECT COUNT(*) AS pesanan_menahan_stok FROM transactions
 WHERE tipe_transaksi = 'OUT' AND status = 'PENDING' AND expired_at > now();

-- D4. Batas waktu penahanan lewat -> tahanan lepas, status dirapikan oleh expire_pending().
UPDATE transactions SET expired_at = now() - interval '1 minute'
 WHERE id = (SELECT MIN(id) FROM transactions
              WHERE tipe_transaksi = 'OUT' AND status = 'PENDING' AND expired_at > now());
SELECT expire_pending() AS jumlah_kedaluwarsa;   -- 1

ROLLBACK;

-- ---------------------------------------------------------------------
-- Uji penolakan (masing-masing HARUS gagal; jalankan satu per satu):
--
-- a) Stok tersedia tidak cukup (OLI-006 stok 0):
--    SELECT * FROM buat_penjualan(1, '[{"product_id":6,"jumlah":1}]'::jsonb, NULL, 'Uji');
--    -> ERROR: Stok tersedia "Oli Mesin AHM MPX1 1L" tidak cukup (stok 0, tertahan 0, diminta 1)
--
-- b) Dua pesanan berebut barang terakhir: AKI-001 stok 5, tertahan 1 -> minta 5 ditolak
--    SELECT * FROM buat_penjualan(1, '[{"product_id":20,"jumlah":5}]'::jsonb, NULL, 'Uji');
--
-- c) Mengubah transaksi yang sudah selesai:
--    UPDATE transactions SET status = 'CANCELLED' WHERE id = 6;
--    -> ERROR: Transaksi FJ-... sudah COMPLETED dan tidak bisa diubah lagi
--
-- d) Menyelesaikan pesanan yang melewati batas penahanan:
--    (transaksi OUT yang expired_at-nya sudah lewat dan masih PENDING) -> ERROR melewati batas penahanan
--
-- e) Koreksi stok tanpa alasan / IN tanpa supplier / OUT tanpa pelanggan:
--    INSERT INTO transactions (tipe_transaksi, dicatat_oleh) VALUES ('ADJ_OUT', 1);  -- ck_catatan_adj
--    INSERT INTO transactions (tipe_transaksi, dicatat_oleh) VALUES ('IN', 1);       -- ck_supplier
--    INSERT INTO transactions (tipe_transaksi, dicatat_oleh) VALUES ('OUT', 1);      -- ck_pelanggan_out
--
-- f) Constraint lain:
--    UPDATE products SET stok = -1 WHERE id = 1;                                        -- CHECK stok >= 0
--    INSERT INTO products (kode_barang, nama_barang, jenis_barang) VALUES ('X','X','Knalpot'); -- CHECK jenis
--    INSERT INTO users (username, password_hash, nama_lengkap, no_telepon, role)
--      VALUES ('zzz','x','Z','0','OWNER');                                              -- CHECK role
--
-- g) Hapus barang/transaksi yang punya riwayat:
--    DELETE FROM products WHERE id = 1;  -- ERROR: foreign key (gunakan aktif = FALSE)
-- ---------------------------------------------------------------------
