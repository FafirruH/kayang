<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Db;
use App\Http;
use App\ProductFilter;

/** Endpoint publik: katalog sparepart. */
final class CatalogController
{
    /** GET /api/health */
    public static function health(array $params, ?array $user): void
    {
        $ok = true;
        try {
            Db::val('SELECT 1');
        } catch (\Throwable) {
            $ok = false;
        }
        Http::ok(['status' => $ok ? 'ok' : 'db_error'], null, $ok ? 200 : 503);
    }

    /**
     * GET /api/products?q=&jenis=&page=&per_page=
     * Label stok memakai stok TERSEDIA (stok fisik dikurangi yang tertahan pesanan belum bayar).
     */
    public static function products(array $params, ?array $user): void
    {
        [$page, $per, $off] = Http::paging();
        [$where, $args]     = ProductFilter::build(false);

        $total = (int) Db::val("SELECT COUNT(*) FROM v_stok_barang WHERE $where", $args);
        $rows  = Db::all(
            "SELECT product_id, kode_barang, nama_barang, jenis_barang, merk, harga_jual, tersedia, status_stok
               FROM v_stok_barang
              WHERE $where
              ORDER BY (status_stok = 'Habis'), nama_barang
              LIMIT :lim OFFSET :off",
            $args + ['lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** GET /api/categories - untuk chip filter katalog. */
    public static function categories(array $params, ?array $user): void
    {
        Http::ok(Db::all(
            'SELECT jenis_barang AS jenis, COUNT(*) AS jumlah
               FROM v_stok_barang WHERE aktif
              GROUP BY jenis_barang ORDER BY jenis_barang'
        ));
    }
}
