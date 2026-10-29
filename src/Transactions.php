<?php
declare(strict_types=1);

namespace App;

/** Akses data transaksi bersama (dipakai pelanggan dan admin). */
final class Transactions
{
    public const COLS = 'transaction_id, no_faktur, tipe_transaksi, status, tgl_transaksi, expired_at, completed_at,
        customer_id, nama_pelanggan, nama_supplier, dicatat_oleh, jumlah_jenis, jumlah_item, subtotal, diskon, total_bayar';

    /** Rapikan status pesanan yang lewat batas penahanan (idempotent). */
    public static function refreshExpired(): void
    {
        Db::val('SELECT expire_pending()');
    }

    public static function items(int $id): array
    {
        return Db::all(
            'SELECT d.product_id, p.kode_barang, p.nama_barang, d.jumlah, d.harga_satuan_real, d.subtotal
               FROM transaction_details d
               JOIN products p ON p.id = d.product_id
              WHERE d.transaction_id = :id
              ORDER BY p.nama_barang',
            ['id' => $id]
        );
    }

    /** Header + item. Bila $customerId diisi, hanya transaksi milik pelanggan itu. */
    public static function find(int $id, ?int $customerId = null): ?array
    {
        $sql  = 'SELECT ' . self::COLS . ' FROM v_transaksi_header WHERE transaction_id = :id';
        $args = ['id' => $id];
        if ($customerId !== null) {
            $sql .= ' AND customer_id = :cid';
            $args['cid'] = $customerId;
        }
        $head = Db::one($sql, $args);
        if ($head === null) {
            return null;
        }
        $extra = Db::one(
            'SELECT metode_bayar, no_referensi, catatan FROM transactions WHERE id = :id',
            ['id' => $id]
        ) ?? [];
        return array_merge($head, $extra, ['items' => self::items($id)]);
    }
}
