BEGIN;

LOCK TABLE transactions, transaction_details, products IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS inventory_batches (
  id                    BIGSERIAL PRIMARY KEY,
  product_id            INTEGER NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  source_transaction_id INTEGER REFERENCES transactions (id) ON DELETE RESTRICT,
  received_quantity     INTEGER NOT NULL CHECK (received_quantity > 0),
  remaining_quantity    INTEGER NOT NULL CHECK (remaining_quantity >= 0 AND remaining_quantity <= received_quantity),
  unit_cost             INTEGER NOT NULL CHECK (unit_cost >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_transaction_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_fifo
  ON inventory_batches (product_id, created_at, id)
  WHERE remaining_quantity > 0;

CREATE TABLE IF NOT EXISTS transaction_detail_costs (
  transaction_id INTEGER NOT NULL,
  product_id     INTEGER NOT NULL,
  batch_id       BIGINT NOT NULL REFERENCES inventory_batches (id) ON DELETE RESTRICT,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost      INTEGER NOT NULL CHECK (unit_cost >= 0),
  PRIMARY KEY (transaction_id, product_id, batch_id),
  FOREIGN KEY (transaction_id, product_id)
    REFERENCES transaction_details (transaction_id, product_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_transaction_detail_costs_batch
  ON transaction_detail_costs (batch_id);

-- Existing stock is represented by one opening batch at its current recorded cost.
INSERT INTO inventory_batches (
  product_id, source_transaction_id, received_quantity, remaining_quantity, unit_cost
)
SELECT p.id, NULL, p.stok, p.stok, p.harga_beli_default
  FROM products p
 WHERE p.stok > 0
   AND NOT EXISTS (
     SELECT 1 FROM inventory_batches b WHERE b.product_id = p.id
   );

CREATE OR REPLACE FUNCTION fn_transaksi_ubah_status() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r          RECORD;
  b          RECORD;
  v_stok     products.stok%TYPE;
  v_nama     products.nama_barang%TYPE;
  v_delta    INTEGER;
  v_subtotal BIGINT;
  v_left     INTEGER;
  v_take     INTEGER;
BEGIN
  IF OLD.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Transaksi % sudah % dan tidak bisa diubah lagi', OLD.no_faktur, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());

    IF NEW.expired_at IS NOT NULL AND NEW.completed_at > NEW.expired_at THEN
      RAISE EXCEPTION 'Transaksi % melewati batas penahanan stok (%)', OLD.no_faktur, NEW.expired_at
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT SUM(subtotal) INTO v_subtotal
      FROM transaction_details WHERE transaction_id = NEW.id;
    IF v_subtotal IS NULL THEN
      RAISE EXCEPTION 'Transaksi % belum memiliki barang', OLD.no_faktur
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
       ORDER BY product_id
    LOOP
      SELECT stok, nama_barang INTO v_stok, v_nama
        FROM products WHERE id = r.product_id FOR UPDATE;

      v_delta := CASE WHEN NEW.tipe_transaksi IN ('IN', 'ADJ_IN') THEN r.jumlah ELSE -r.jumlah END;

      IF v_stok + v_delta < 0 THEN
        RAISE EXCEPTION 'Stok fisik "%" tidak cukup (stok %, dibutuhkan %)', v_nama, v_stok, r.jumlah
          USING ERRCODE = 'check_violation';
      END IF;

      IF NEW.tipe_transaksi IN ('IN', 'ADJ_IN') THEN
        INSERT INTO inventory_batches (
          product_id, source_transaction_id, received_quantity, remaining_quantity, unit_cost
        ) VALUES (r.product_id, NEW.id, r.jumlah, r.jumlah, r.harga_satuan_real);
      ELSE
        v_left := r.jumlah;
        FOR b IN
          SELECT id, remaining_quantity, unit_cost
            FROM inventory_batches
           WHERE product_id = r.product_id AND remaining_quantity > 0
           ORDER BY created_at, id
           FOR UPDATE
        LOOP
          EXIT WHEN v_left = 0;
          v_take := LEAST(v_left, b.remaining_quantity);
          UPDATE inventory_batches
             SET remaining_quantity = remaining_quantity - v_take
           WHERE id = b.id;
          INSERT INTO transaction_detail_costs (
            transaction_id, product_id, batch_id, quantity, unit_cost
          ) VALUES (NEW.id, r.product_id, b.id, v_take, b.unit_cost);
          v_left := v_left - v_take;
        END LOOP;

        IF v_left > 0 THEN
          RAISE EXCEPTION 'Lapisan stok "%" tidak cukup untuk menyelesaikan transaksi', v_nama
            USING ERRCODE = 'check_violation';
        END IF;
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

DROP VIEW v_laporan_laba_rugi;
CREATE VIEW v_laporan_laba_rugi AS
WITH per_transaksi AS (
  SELECT t.id,
         date_trunc('month', t.completed_at) AS bulan,
         t.diskon,
         SUM(td.subtotal) AS penjualan,
         SUM(COALESCE(c.modal, td.jumlah * td.harga_modal)) AS modal
  FROM transactions t
  JOIN transaction_details td ON td.transaction_id = t.id
  LEFT JOIN LATERAL (
    SELECT SUM(c.quantity::bigint * c.unit_cost) AS modal
      FROM transaction_detail_costs c
     WHERE c.transaction_id = td.transaction_id
       AND c.product_id = td.product_id
  ) c ON TRUE
  WHERE t.status = 'COMPLETED' AND t.tipe_transaksi = 'OUT'
  GROUP BY t.id
)
SELECT bulan,
       COUNT(*) AS total_transaksi,
       SUM(penjualan) AS penjualan_kotor,
       SUM(diskon) AS total_diskon,
       SUM(penjualan) - SUM(diskon) AS pendapatan_bersih,
       SUM(modal) AS total_modal,
       SUM(penjualan) - SUM(diskon) - SUM(modal) AS laba_kotor
FROM per_transaksi
GROUP BY bulan;

COMMIT;
