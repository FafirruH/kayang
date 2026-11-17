-- Fresh install / clean database: skrip ini menghapus objek lama lalu membuat skema lengkap
-- tanpa data dummy, hanya berisi 1 akun ADMIN awal.
SET TIME ZONE 'Asia/Jakarta';
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP VIEW     IF EXISTS v_laporan_laba_rugi, v_laporan_adj_out, v_kartu_stok, v_transaksi_header, v_stok_barang CASCADE;
DROP TABLE    IF EXISTS transaction_detail_costs, inventory_batches, transaction_details, transactions, products, suppliers, users CASCADE;
DROP SEQUENCE IF EXISTS seq_faktur_out, seq_faktur_in, seq_faktur_adj;
DROP FUNCTION IF EXISTS buat_penjualan(integer, jsonb, integer, text, integer, integer);
DROP FUNCTION IF EXISTS expire_pending();
DROP FUNCTION IF EXISTS fn_transaksi_awal();
DROP FUNCTION IF EXISTS fn_transaksi_pencatat_valid();
DROP FUNCTION IF EXISTS fn_transaksi_immutable();
DROP FUNCTION IF EXISTS fn_transaksi_ubah_status();
DROP FUNCTION IF EXISTS fn_detail_sebelum_insert();
DROP FUNCTION IF EXISTS fn_detail_terkunci();

CREATE SEQUENCE seq_faktur_out START 1;
CREATE SEQUENCE seq_faktur_in  START 1;
CREATE SEQUENCE seq_faktur_adj START 1;

-- =============================================================================
-- TABLES & INDEXES
-- =============================================================================

CREATE TABLE users (
  id              SERIAL       PRIMARY KEY,
  nama_pengguna   VARCHAR(50)  NOT NULL UNIQUE
                    CHECK (char_length(nama_pengguna) >= 3 AND nama_pengguna = lower(nama_pengguna)),
  kata_sandi_hash TEXT         NOT NULL,
  nama_lengkap    VARCHAR(100) NOT NULL,
  no_telepon      VARCHAR(20)  NOT NULL,
  alamat          TEXT,
  peran           VARCHAR(20)  NOT NULL DEFAULT 'CUSTOMER'
                    CHECK (peran IN ('ADMIN', 'MECHANIC', 'CUSTOMER')),
  aktif           BOOLEAN      NOT NULL DEFAULT TRUE,
  dibuat_pada     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id            SERIAL       PRIMARY KEY,
  nama_supplier VARCHAR(100) NOT NULL UNIQUE,
  no_telepon    VARCHAR(20)  NOT NULL,
  alamat        TEXT,
  aktif         BOOLEAN      NOT NULL DEFAULT TRUE,
  dibuat_pada   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id                 SERIAL       PRIMARY KEY,
  kode_barang        VARCHAR(30)  NOT NULL UNIQUE,
  nama_barang        VARCHAR(100) NOT NULL,
  jenis_barang       VARCHAR(30)  NOT NULL
                       CHECK (length(trim(jenis_barang)) >= 2 AND length(jenis_barang) <= 30),
  merk               VARCHAR(50),
  harga_beli_default INTEGER      NOT NULL DEFAULT 0 CHECK (harga_beli_default >= 0),
  harga_jual_default INTEGER      NOT NULL DEFAULT 0 CHECK (harga_jual_default >= 0),
  stok               INTEGER      NOT NULL DEFAULT 0 CHECK (stok >= 0),
  stok_minimal       INTEGER      NOT NULL DEFAULT 5 CHECK (stok_minimal >= 0),
  aktif              BOOLEAN      NOT NULL DEFAULT TRUE,
  diperbarui_pada    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_jenis ON products (jenis_barang);

CREATE TABLE transactions (
  id                        SERIAL       PRIMARY KEY,
  no_faktur                 VARCHAR(30)  NOT NULL UNIQUE,
  tipe_transaksi            VARCHAR(10)  NOT NULL
                              CHECK (tipe_transaksi IN ('IN', 'OUT', 'ADJ_IN', 'ADJ_OUT')),
  status                    VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED')),
  id_pelanggan              INTEGER      REFERENCES users (id) ON DELETE RESTRICT,
  nama_pelanggan            VARCHAR(100),
  id_supplier               INTEGER      REFERENCES suppliers (id) ON DELETE RESTRICT,
  dicatat_oleh              INTEGER      NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  diselesaikan_oleh         INTEGER      REFERENCES users (id) ON DELETE RESTRICT,
  diskon                    INTEGER      NOT NULL DEFAULT 0 CHECK (diskon >= 0),
  metode_bayar              VARCHAR(10)  CHECK (metode_bayar IN ('TUNAI', 'TRANSFER', 'QRIS')),
  no_referensi              VARCHAR(50),
  catatan                   TEXT,
  update_harga_beli_default BOOLEAN      NOT NULL DEFAULT FALSE,
  dibuat_pada               TIMESTAMPTZ  NOT NULL DEFAULT now(),
  kedaluwarsa_pada          TIMESTAMPTZ,
  selesai_pada              TIMESTAMPTZ,

  CONSTRAINT ck_supplier               CHECK ((tipe_transaksi = 'IN') = (id_supplier IS NOT NULL)),
  CONSTRAINT ck_pelanggan_out          CHECK (tipe_transaksi <> 'OUT' OR id_pelanggan IS NOT NULL OR nama_pelanggan IS NOT NULL),
  CONSTRAINT ck_pelanggan_satu         CHECK (id_pelanggan IS NULL OR nama_pelanggan IS NULL),
  CONSTRAINT ck_pelanggan_tipe         CHECK (tipe_transaksi = 'OUT' OR (id_pelanggan IS NULL AND nama_pelanggan IS NULL)),
  CONSTRAINT ck_expired                CHECK (kedaluwarsa_pada IS NULL OR kedaluwarsa_pada > dibuat_pada),
  CONSTRAINT ck_expired_out            CHECK (tipe_transaksi <> 'OUT' OR kedaluwarsa_pada IS NOT NULL),
  CONSTRAINT ck_catatan_adj            CHECK (tipe_transaksi NOT IN ('ADJ_IN', 'ADJ_OUT') OR catatan IS NOT NULL),
  CONSTRAINT ck_bayar                  CHECK (status <> 'COMPLETED' OR tipe_transaksi IN ('ADJ_IN', 'ADJ_OUT') OR metode_bayar IS NOT NULL),
  CONSTRAINT ck_selesai                CHECK ((status = 'COMPLETED') = (selesai_pada IS NOT NULL)),
  CONSTRAINT ck_diselesaikan           CHECK (status = 'COMPLETED' OR diselesaikan_oleh IS NULL),
  CONSTRAINT ck_selesai_setelah_dibuat CHECK (selesai_pada IS NULL OR selesai_pada >= dibuat_pada)
);
CREATE INDEX idx_transactions_created   ON transactions (dibuat_pada);
CREATE INDEX idx_transactions_completed ON transactions (selesai_pada) WHERE status = 'COMPLETED';
CREATE INDEX idx_transactions_pending   ON transactions (kedaluwarsa_pada) WHERE status = 'PENDING';
CREATE INDEX idx_transactions_customer  ON transactions (id_pelanggan) WHERE id_pelanggan IS NOT NULL;
CREATE INDEX idx_transactions_supplier  ON transactions (id_supplier)  WHERE id_supplier IS NOT NULL;

CREATE TABLE transaction_details (
  id_transaksi      INTEGER NOT NULL REFERENCES transactions (id) ON DELETE RESTRICT,
  id_barang         INTEGER NOT NULL REFERENCES products (id)     ON DELETE RESTRICT,
  jumlah            INTEGER NOT NULL CHECK (jumlah > 0),
  harga_satuan_real INTEGER NOT NULL CHECK (harga_satuan_real >= 0),
  harga_modal       INTEGER CHECK (harga_modal >= 0),
  subtotal          INTEGER GENERATED ALWAYS AS (jumlah * harga_satuan_real) STORED,
  PRIMARY KEY (id_transaksi, id_barang)
);
CREATE INDEX idx_details_product ON transaction_details (id_barang);

CREATE TABLE inventory_batches (
  id                  BIGSERIAL PRIMARY KEY,
  id_barang           INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  id_transaksi_sumber INTEGER REFERENCES transactions (id) ON DELETE RESTRICT,
  jumlah_diterima     INTEGER NOT NULL CHECK (jumlah_diterima > 0),
  jumlah_sisa         INTEGER NOT NULL CHECK (jumlah_sisa >= 0 AND jumlah_sisa <= jumlah_diterima),
  harga_modal_satuan  INTEGER NOT NULL CHECK (harga_modal_satuan >= 0),
  dibuat_pada         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id_transaksi_sumber, id_barang)
);
CREATE INDEX idx_inventory_batches_fifo
  ON inventory_batches (id_barang, dibuat_pada, id)
  WHERE jumlah_sisa > 0;
CREATE INDEX idx_inventory_batches_chronology
  ON inventory_batches (id_barang, dibuat_pada);

CREATE TABLE transaction_detail_costs (
  id_transaksi       INTEGER NOT NULL,
  id_barang          INTEGER NOT NULL,
  id_batch           BIGINT NOT NULL REFERENCES inventory_batches (id) ON DELETE RESTRICT,
  jumlah             INTEGER NOT NULL CHECK (jumlah > 0),
  harga_modal_satuan INTEGER NOT NULL CHECK (harga_modal_satuan >= 0),
  PRIMARY KEY (id_transaksi, id_barang, id_batch),
  FOREIGN KEY (id_transaksi, id_barang)
    REFERENCES transaction_details (id_transaksi, id_barang) ON DELETE RESTRICT
);
CREATE INDEX idx_transaction_detail_costs_batch ON transaction_detail_costs (id_batch);

-- =============================================================================
-- TRIGGERS & FUNCTIONS
-- =============================================================================

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
      || '-' || to_char(NEW.dibuat_pada, 'YYMM') || '-'
      || lpad((CASE NEW.tipe_transaksi
                 WHEN 'OUT' THEN nextval('seq_faktur_out')
                 WHEN 'IN'  THEN nextval('seq_faktur_in')
                 ELSE            nextval('seq_faktur_adj')
               END)::text, 4, '0');
  END IF;

  IF NEW.tipe_transaksi = 'OUT' AND NEW.kedaluwarsa_pada IS NULL THEN
    NEW.kedaluwarsa_pada := NEW.dibuat_pada + interval '24 hours';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_awal
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_awal();

CREATE FUNCTION fn_transaksi_pencatat_valid() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_peran             users.peran%TYPE;
  v_aktif             users.aktif%TYPE;
  v_validasi_pencatat BOOLEAN := TRUE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_validasi_pencatat :=
      NEW.dicatat_oleh IS DISTINCT FROM OLD.dicatat_oleh
      OR NEW.tipe_transaksi IS DISTINCT FROM OLD.tipe_transaksi
      OR NEW.id_pelanggan IS DISTINCT FROM OLD.id_pelanggan;
  END IF;

  SELECT peran, aktif INTO v_peran, v_aktif
    FROM users WHERE id = NEW.dicatat_oleh FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pencatat transaksi tidak ditemukan'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_validasi_pencatat AND (
    NOT v_aktif OR (
      v_peran NOT IN ('ADMIN', 'MECHANIC')
      AND (v_peran <> 'CUSTOMER' OR NEW.tipe_transaksi <> 'OUT'
           OR NEW.id_pelanggan IS DISTINCT FROM NEW.dicatat_oleh)
    )
  ) THEN
    RAISE EXCEPTION 'Pencatat harus staf aktif atau pelanggan aktif yang membuat pesanan sendiri'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_peran = 'CUSTOMER' AND NEW.diskon <> 0 THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Diskon pesanan pelanggan hanya dapat ditetapkan saat diselesaikan staf'
        USING ERRCODE = 'check_violation';
    ELSIF OLD.status <> 'PENDING' OR NEW.status <> 'COMPLETED'
          OR NEW.diselesaikan_oleh IS NULL THEN
      RAISE EXCEPTION 'Diskon pesanan pelanggan hanya dapat ditetapkan saat diselesaikan staf'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_pencatat_valid
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_pencatat_valid();

CREATE TRIGGER trg_transaksi_pencatat_update_valid
  BEFORE UPDATE OF dicatat_oleh, tipe_transaksi, id_pelanggan, diskon, diselesaikan_oleh ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_pencatat_valid();

CREATE FUNCTION fn_transaksi_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaksi berstatus % tidak dapat diubah', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.tipe_transaksi IS DISTINCT FROM OLD.tipe_transaksi THEN
    RAISE EXCEPTION 'Tipe transaksi tidak dapat diubah setelah dibuat'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_immutable
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION fn_transaksi_immutable();

CREATE FUNCTION fn_detail_sebelum_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_tipe     transactions.tipe_transaksi%TYPE;
  v_status   transactions.status%TYPE;
  v_peran    users.peran%TYPE;
  v_p        products%ROWTYPE;
  v_tertahan BIGINT;
BEGIN
  SELECT t.tipe_transaksi, t.status, u.peran INTO v_tipe, v_status, v_peran
    FROM transactions t
    JOIN users u ON u.id = t.dicatat_oleh
   WHERE t.id = NEW.id_transaksi
   FOR SHARE OF t;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaksi % tidak ditemukan', NEW.id_transaksi
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Barang hanya bisa ditambahkan ke transaksi PENDING (status sekarang: %)', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_p FROM products WHERE id = NEW.id_barang FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barang dengan id % tidak ditemukan', NEW.id_barang
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NOT v_p.aktif THEN
    RAISE EXCEPTION 'Barang "%" sudah tidak dijual', v_p.nama_barang
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_tipe = 'OUT' AND v_peran = 'CUSTOMER' THEN
    NEW.harga_satuan_real := v_p.harga_jual_default;
  ELSIF v_tipe = 'ADJ_IN' THEN
    IF v_p.harga_beli_default <= 0 THEN
      RAISE EXCEPTION 'Harga beli acuan "%" harus diisi sebelum koreksi stok masuk', v_p.nama_barang
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.harga_satuan_real := v_p.harga_beli_default;
  ELSIF NEW.harga_satuan_real IS NULL THEN
    NEW.harga_satuan_real := CASE WHEN v_tipe = 'OUT'
                                  THEN v_p.harga_jual_default
                                  ELSE v_p.harga_beli_default END;
  END IF;

  IF v_tipe = 'OUT' THEN
    NEW.harga_modal := v_p.harga_beli_default;

    SELECT COALESCE(SUM(d.jumlah), 0) INTO v_tertahan
      FROM transaction_details d
      JOIN transactions t ON t.id = d.id_transaksi
     WHERE d.id_barang = NEW.id_barang
       AND t.tipe_transaksi = 'OUT'
       AND t.status = 'PENDING'
       AND t.kedaluwarsa_pada > now();

    IF NEW.jumlah > (v_p.stok - v_tertahan) THEN
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

CREATE FUNCTION fn_detail_terkunci() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Baris detail tidak bisa diubah; hapus lalu tambahkan ulang selagi transaksi PENDING'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT status FROM transactions WHERE id = OLD.id_transaksi) <> 'PENDING' THEN
    RAISE EXCEPTION 'Detail transaksi yang sudah selesai/batal tidak boleh dihapus'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_detail_terkunci
  BEFORE UPDATE OR DELETE ON transaction_details
  FOR EACH ROW EXECUTE FUNCTION fn_detail_terkunci();

CREATE FUNCTION fn_transaksi_ubah_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r                  RECORD;
  b                  RECORD;
  v_stok             products.stok%TYPE;
  v_nama             products.nama_barang%TYPE;
  v_delta            INTEGER;
  v_subtotal         BIGINT;
  v_left             INTEGER;
  v_take             INTEGER;
  v_penyelesai       users.peran%TYPE;
  v_penyelesai_aktif users.aktif%TYPE;
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaksi % sudah % dan tidak bisa diubah lagi', OLD.no_faktur, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    IF NEW.diselesaikan_oleh IS NULL THEN
      RAISE EXCEPTION 'Penyelesai transaksi wajib diisi'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT peran, aktif INTO v_penyelesai, v_penyelesai_aktif
      FROM users WHERE id = NEW.diselesaikan_oleh FOR SHARE;
    IF NOT FOUND OR NOT v_penyelesai_aktif OR v_penyelesai NOT IN ('ADMIN', 'MECHANIC') THEN
      RAISE EXCEPTION 'Penyelesai transaksi harus staf aktif'
        USING ERRCODE = 'check_violation';
    END IF;

    NEW.selesai_pada := COALESCE(NEW.selesai_pada, now());

    IF NEW.kedaluwarsa_pada IS NOT NULL AND NEW.selesai_pada > NEW.kedaluwarsa_pada THEN
      RAISE EXCEPTION 'Transaksi % melewati batas penahanan stok (%)', NEW.no_faktur, NEW.kedaluwarsa_pada
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT SUM(subtotal) INTO v_subtotal
      FROM transaction_details WHERE id_transaksi = NEW.id;
    IF v_subtotal IS NULL THEN
      RAISE EXCEPTION 'Transaksi % belum memiliki barang', NEW.no_faktur
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.diskon > v_subtotal THEN
      RAISE EXCEPTION 'Diskon (%) melebihi subtotal (%)', NEW.diskon, v_subtotal
        USING ERRCODE = 'check_violation';
    END IF;

    FOR r IN
      SELECT id_barang, jumlah, harga_satuan_real
        FROM transaction_details
       WHERE id_transaksi = NEW.id
       ORDER BY id_barang
    LOOP
      SELECT stok, nama_barang INTO v_stok, v_nama
        FROM products WHERE id = r.id_barang FOR UPDATE;

      v_delta := CASE WHEN NEW.tipe_transaksi IN ('IN', 'ADJ_IN') THEN r.jumlah ELSE -r.jumlah END;

      IF v_stok + v_delta < 0 THEN
        RAISE EXCEPTION 'Stok fisik "%" tidak cukup (stok %, dibutuhkan %)', v_nama, v_stok, r.jumlah
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.tipe_transaksi IN ('IN', 'ADJ_IN') THEN
        IF EXISTS (
          SELECT 1
            FROM inventory_batches
           WHERE id_barang = r.id_barang
             AND dibuat_pada > NEW.selesai_pada
        ) THEN
          RAISE EXCEPTION 'Penerimaan barang "%" tidak boleh lebih lama dari batch yang sudah tercatat', v_nama
            USING ERRCODE = 'check_violation';
        END IF;
        INSERT INTO inventory_batches (
          id_barang, id_transaksi_sumber, jumlah_diterima, jumlah_sisa, harga_modal_satuan, dibuat_pada
        ) VALUES (r.id_barang, NEW.id, r.jumlah, r.jumlah, r.harga_satuan_real, NEW.selesai_pada);
      ELSE
        v_left := r.jumlah;
        FOR b IN
          SELECT id, jumlah_sisa, harga_modal_satuan
            FROM inventory_batches
           WHERE id_barang = r.id_barang
             AND jumlah_sisa > 0
             AND dibuat_pada <= NEW.selesai_pada
           ORDER BY dibuat_pada, id
           FOR UPDATE
        LOOP
          EXIT WHEN v_left = 0;
          v_take := LEAST(v_left, b.jumlah_sisa);
          UPDATE inventory_batches
             SET jumlah_sisa = jumlah_sisa - v_take
           WHERE id = b.id;
          INSERT INTO transaction_detail_costs (
            id_transaksi, id_barang, id_batch, jumlah, harga_modal_satuan
          ) VALUES (NEW.id, r.id_barang, b.id, v_take, b.harga_modal_satuan);
          v_left := v_left - v_take;
        END LOOP;

        IF v_left > 0 THEN
          RAISE EXCEPTION 'Lapisan stok "%" tidak cukup untuk menyelesaikan transaksi', v_nama
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      UPDATE products
         SET stok               = stok + v_delta,
             diperbarui_pada    = now(),
             harga_beli_default = CASE WHEN NEW.tipe_transaksi = 'IN'
                                            AND NEW.update_harga_beli_default
                                       THEN r.harga_satuan_real
                                       ELSE harga_beli_default END
       WHERE id = r.id_barang;
    END LOOP;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_transaksi_ubah_status
  BEFORE UPDATE OF status ON transactions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION fn_transaksi_ubah_status();

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE VIEW v_stok_barang AS
SELECT x.*,
       CASE
         WHEN x.tersedia <= 0              THEN 'Habis'
         WHEN x.tersedia <= x.stok_minimal THEN 'Menipis'
         ELSE 'Tersedia'
       END AS status_stok
FROM (
  SELECT p.id                           AS product_id,
         p.kode_barang,
         p.nama_barang,
         p.jenis_barang,
         p.merk,
         p.harga_jual_default           AS harga_jual,
         p.harga_beli_default           AS harga_beli,
         p.stok,
         p.stok_minimal,
         p.aktif,
         COALESCE(h.tertahan, 0)        AS tertahan,
         p.stok - COALESCE(h.tertahan, 0) AS tersedia
  FROM products p
  LEFT JOIN (
    SELECT d.id_barang, SUM(d.jumlah) AS tertahan
    FROM transaction_details d
    JOIN transactions t ON t.id = d.id_transaksi
    WHERE t.tipe_transaksi = 'OUT'
      AND t.status = 'PENDING'
      AND t.kedaluwarsa_pada > now()
    GROUP BY d.id_barang
  ) h ON h.id_barang = p.id
) x;

CREATE VIEW v_transaksi_header AS
SELECT t.id                                           AS transaction_id,
       t.no_faktur,
       t.tipe_transaksi,
       t.status,
       t.dibuat_pada                                  AS tgl_transaksi,
       t.kedaluwarsa_pada                             AS expired_at,
       t.selesai_pada                                 AS completed_at,
       t.id_pelanggan                                 AS customer_id,
       COALESCE(c.nama_lengkap, t.nama_pelanggan)     AS nama_pelanggan,
       s.nama_supplier,
       a.nama_lengkap                                 AS dicatat_oleh,
       COUNT(td.id_barang)                            AS jumlah_jenis,
       COALESCE(SUM(td.jumlah), 0)                    AS jumlah_item,
       COALESCE(SUM(td.subtotal), 0)                  AS subtotal,
       t.diskon,
       COALESCE(SUM(td.subtotal), 0) - t.diskon       AS total_bayar
FROM transactions t
JOIN users a                    ON a.id = t.dicatat_oleh
LEFT JOIN users c               ON c.id = t.id_pelanggan
LEFT JOIN suppliers s           ON s.id = t.id_supplier
LEFT JOIN transaction_details td ON td.id_transaksi = t.id
GROUP BY t.id, a.id, c.id, s.id;

CREATE VIEW v_kartu_stok AS
SELECT k.*, k.stok_akhir - k.perubahan AS stok_awal
FROM (
  SELECT d.id_barang                                  AS product_id,
         p.kode_barang,
         p.nama_barang,
         t.selesai_pada                               AS waktu,
         t.no_faktur,
         t.tipe_transaksi,
         t.catatan,
         CASE WHEN t.tipe_transaksi IN ('IN', 'ADJ_IN') THEN d.jumlah ELSE -d.jumlah END AS perubahan,
         SUM(CASE WHEN t.tipe_transaksi IN ('IN', 'ADJ_IN') THEN d.jumlah ELSE -d.jumlah END)
           OVER (PARTITION BY d.id_barang
                 ORDER BY t.selesai_pada, t.id
                 ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS stok_akhir
  FROM transaction_details d
  JOIN transactions t ON t.id = d.id_transaksi
  JOIN products p     ON p.id = d.id_barang
  WHERE t.status = 'COMPLETED'
) k;

CREATE VIEW v_laporan_laba_rugi AS
WITH per_transaksi AS (
  SELECT t.id,
         date_trunc('month', t.selesai_pada) AS bulan,
         t.diskon,
         SUM(td.subtotal)                    AS penjualan,
         SUM(COALESCE(c.modal, td.jumlah * td.harga_modal)) AS modal
  FROM transactions t
  JOIN transaction_details td ON td.id_transaksi = t.id
  LEFT JOIN LATERAL (
    SELECT SUM(c.jumlah::bigint * c.harga_modal_satuan) AS modal
      FROM transaction_detail_costs c
     WHERE c.id_transaksi = td.id_transaksi
       AND c.id_barang = td.id_barang
  ) c ON TRUE
  WHERE t.status = 'COMPLETED' AND t.tipe_transaksi = 'OUT'
  GROUP BY t.id
)
SELECT bulan,
       COUNT(*)                                  AS total_transaksi,
       SUM(penjualan)                            AS penjualan_kotor,
       SUM(diskon)                               AS total_diskon,
       SUM(penjualan) - SUM(diskon)              AS pendapatan_bersih,
       SUM(modal)                                AS total_modal,
       SUM(penjualan) - SUM(diskon) - SUM(modal) AS laba_kotor
FROM per_transaksi
GROUP BY bulan;

CREATE VIEW v_laporan_adj_out AS
WITH detail AS (
  SELECT id_transaksi, SUM(jumlah) AS jumlah_barang
    FROM transaction_details
   GROUP BY id_transaksi
),
biaya AS (
  SELECT id_transaksi,
         SUM(jumlah::bigint * harga_modal_satuan) AS nilai_biaya_fifo
    FROM transaction_detail_costs
   GROUP BY id_transaksi
)
SELECT t.id                            AS transaction_id,
       t.no_faktur,
       t.selesai_pada                  AS completed_at,
       t.catatan,
       COALESCE(d.jumlah_barang, 0)    AS jumlah_barang,
       COALESCE(b.nilai_biaya_fifo, 0) AS nilai_biaya_fifo
FROM transactions t
LEFT JOIN detail d ON d.id_transaksi = t.id
LEFT JOIN biaya b  ON b.id_transaksi = t.id
WHERE t.tipe_transaksi = 'ADJ_OUT'
  AND t.status = 'COMPLETED';

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

CREATE FUNCTION expire_pending() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_n INTEGER;
BEGIN
  UPDATE transactions
     SET status = 'EXPIRED'
   WHERE status = 'PENDING'
     AND tipe_transaksi = 'OUT'
     AND kedaluwarsa_pada < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

CREATE FUNCTION buat_penjualan(
  p_dicatat_oleh   INTEGER,
  p_items          JSONB,
  p_id_pelanggan   INTEGER DEFAULT NULL,
  p_nama_pelanggan TEXT    DEFAULT NULL,
  p_diskon         INTEGER DEFAULT 0,
  p_jam_tahan      INTEGER DEFAULT 24
) RETURNS TABLE (o_id INTEGER, o_no_faktur TEXT, o_kedaluwarsa_pada TIMESTAMPTZ, o_total BIGINT)
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

  INSERT INTO transactions (tipe_transaksi, id_pelanggan, nama_pelanggan, dicatat_oleh, diskon, kedaluwarsa_pada)
  VALUES ('OUT', p_id_pelanggan, p_nama_pelanggan, p_dicatat_oleh, p_diskon,
          now() + make_interval(hours => p_jam_tahan))
  RETURNING id, no_faktur, kedaluwarsa_pada INTO v_id, v_no, v_exp;

  INSERT INTO transaction_details (id_transaksi, id_barang, jumlah, harga_satuan_real)
  SELECT v_id,
         (e ->> 'id_barang')::integer,
         SUM((e ->> 'jumlah')::integer),
         MAX((e ->> 'harga')::integer)
    FROM jsonb_array_elements(p_items) AS e
   GROUP BY (e ->> 'id_barang')::integer
   ORDER BY (e ->> 'id_barang')::integer;

  SELECT SUM(subtotal) INTO v_subtotal
    FROM transaction_details WHERE id_transaksi = v_id;

  IF p_diskon > v_subtotal THEN
    RAISE EXCEPTION 'Diskon (%) melebihi subtotal (%)', p_diskon, v_subtotal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY SELECT v_id, v_no, v_exp, v_subtotal - p_diskon;
END $$;

-- =============================================================================
-- INITIAL ADMIN ACCOUNT ONLY
-- =============================================================================

DO $$
DECLARE
  v_admin_password TEXT := encode(gen_random_bytes(24), 'hex');
BEGIN
  INSERT INTO users (id, nama_pengguna, kata_sandi_hash, nama_lengkap, no_telepon, alamat, peran)
  VALUES (
    1,
    'admin',
    crypt(v_admin_password, gen_salt('bf', 12)),
    'Admin Utama',
    '081234567890',
    'Jl. Raya Contoh No. 1',
    'ADMIN'
  );
  RAISE NOTICE 'Initial admin password (save it now): %', v_admin_password;
END $$;

SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));
ANALYZE;