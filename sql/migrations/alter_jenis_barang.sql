-- Migration: longgarkan constraint jenis_barang agar admin bisa isi kategori bebas
-- Jalankan sekali di database: psql -d <dbname> -f sql/migrations/alter_jenis_barang.sql

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_jenis_barang_check;

ALTER TABLE products
  ADD CONSTRAINT products_jenis_barang_check
  CHECK (length(trim(jenis_barang)) >= 2 AND length(jenis_barang) <= 30);
