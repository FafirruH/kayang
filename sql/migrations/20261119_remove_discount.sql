DROP FUNCTION IF EXISTS buat_penjualan(integer, jsonb, integer, text, integer, integer);
DROP FUNCTION IF EXISTS buat_penjualan(integer, jsonb, integer, text, integer);

CREATE FUNCTION buat_penjualan(
  p_dicatat_oleh   INTEGER,
  p_items          JSONB,
  p_id_pelanggan   INTEGER DEFAULT NULL,
  p_nama_pelanggan TEXT    DEFAULT NULL,
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

  INSERT INTO transactions (tipe_transaksi, id_pelanggan, nama_pelanggan, dicatat_oleh, kedaluwarsa_pada)
  VALUES ('OUT', p_id_pelanggan, p_nama_pelanggan, p_dicatat_oleh,
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

  RETURN QUERY SELECT v_id, v_no, v_exp, v_subtotal;
END $$;
