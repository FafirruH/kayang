<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Db;
use App\Http;
use App\HttpException;
use App\Input;
use App\Jenis;
use App\ProductFilter;
use App\Transactions;

/**
 * Master barang. Stok fisik TIDAK diubah langsung lewat API ini: perubahan stok hanya
 * lewat transaksi (barang masuk / penjualan) atau penyesuaian stok, agar kartu stok selalu sinkron.
 */
final class ProductController
{
    private const LIST_COLS = 'product_id, kode_barang, nama_barang, jenis_barang, merk, harga_beli, harga_jual,
        stok, tertahan, tersedia, stok_minimal, status_stok, aktif';

    /** GET /api/admin/products?q=&jenis=&status=&aktif=true|false|all */
    public static function index(array $params, ?array $user): void
    {
        [$page, $per, $off] = Http::paging();
        [$where, $args]     = ProductFilter::build(true);

        $total = (int) Db::val("SELECT COUNT(*) FROM v_stok_barang WHERE $where", $args);
        $rows  = Db::all(
            'SELECT ' . self::LIST_COLS . " FROM v_stok_barang WHERE $where
              ORDER BY nama_barang LIMIT :lim OFFSET :off",
            $args + ['lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** GET /api/admin/products/{id} */
    public static function show(array $params, ?array $user): void
    {
        $row = Db::one(
            'SELECT v.*, p.updated_at
               FROM v_stok_barang v JOIN products p ON p.id = v.product_id
              WHERE v.product_id = :id',
            ['id' => $params['id']]
        );
        if ($row === null) {
            throw new HttpException('Barang tidak ditemukan', 404);
        }
        Http::ok($row);
    }

    /** POST /api/admin/products  (stok_awal opsional -> dicatat sebagai koreksi ADJ_IN) */
    public static function create(array $params, ?array $user): void
    {
        $in    = new Input(Http::body());
        $kode  = $in->str('kode_barang', 2, 30, true, '/^[A-Za-z0-9_-]+$/');
        $nama  = $in->str('nama_barang', 2, 100);
        $jenis = $in->enum('jenis_barang', Jenis::ALL);
        $merk  = $in->str('merk', 1, 50, false);
        $beli  = $in->int('harga_beli_default', 0, 2000000000, false) ?? 0;
        $jual  = $in->int('harga_jual_default', 0, 2000000000, false) ?? 0;
        $min   = $in->int('stok_minimal', 0, 1000000, false) ?? 5;
        $awal  = $in->int('stok_awal', 0, 1000000, false) ?? 0;
        $in->check();

        $id = (int) Db::tx(static function () use ($user, $kode, $nama, $jenis, $merk, $beli, $jual, $min, $awal) {
            $id = (int) Db::val(
                'INSERT INTO products (kode_barang, nama_barang, jenis_barang, merk,
                                       harga_beli_default, harga_jual_default, stok_minimal)
                 VALUES (:k, :n, :j, :m, :b, :h, :s) RETURNING id',
                ['k' => strtoupper((string) $kode), 'n' => $nama, 'j' => $jenis, 'm' => $merk,
                 'b' => $beli, 'h' => $jual, 's' => $min]
            );
            if ($awal > 0) {
                self::postAdjustment($user['id'], $id, 'ADJ_IN', $awal, 'Stok awal barang');
            }
            return $id;
        });

        Http::ok(Db::one('SELECT ' . self::LIST_COLS . ' FROM v_stok_barang WHERE product_id = :id', ['id' => $id]), null, 201);
    }

    /** PUT /api/admin/products/{id}  (sebagian field boleh) */
    public static function update(array $params, ?array $user): void
    {
        $in = new Input(Http::body());
        if ($in->has('stok')) {
            $in->error('stok', 'Stok tidak diubah langsung; gunakan penyesuaian stok atau transaksi barang masuk');
        }

        $f = [];
        $v = $in->str('nama_barang', 2, 100, false);
        if ($v !== null) { $f['nama_barang'] = $v; }
        $v = $in->enum('jenis_barang', Jenis::ALL, false);
        if ($v !== null) { $f['jenis_barang'] = $v; }
        $v = $in->str('merk', 1, 50, false);
        if ($v !== null) { $f['merk'] = $v; }
        foreach (['harga_beli_default', 'harga_jual_default', 'stok_minimal'] as $k) {
            $n = $in->int($k, 0, 2000000000, false);
            if ($n !== null) { $f[$k] = $n; }
        }
        $b = $in->bool('aktif');
        if ($b !== null) { $f['aktif'] = Db::bool($b); }
        $in->check();

        if (!$f) {
            throw new HttpException('Tidak ada data yang diubah', 422);
        }
        // Nama kolom berasal dari daftar tetap di atas (bukan input pengguna).
        $set = implode(', ', array_map(static fn(string $k): string => "$k = :$k", array_keys($f)));
        $n = Db::exec("UPDATE products SET $set, updated_at = now() WHERE id = :id", $f + ['id' => $params['id']]);
        if ($n === 0) {
            throw new HttpException('Barang tidak ditemukan', 404);
        }
        self::show($params, $user);
    }

    /** DELETE /api/admin/products/{id} - hapus lunak (aktif = false); riwayat transaksi tetap utuh. */
    public static function destroy(array $params, ?array $user): void
    {
        $n = Db::exec('UPDATE products SET aktif = false, updated_at = now() WHERE id = :id', ['id' => $params['id']]);
        if ($n === 0) {
            throw new HttpException('Barang tidak ditemukan', 404);
        }
        Http::ok(['product_id' => $params['id'], 'aktif' => false]);
    }

    /**
     * POST /api/admin/stock-adjustments
     * {"product_id":1,"arah":"TAMBAH"|"KURANG","jumlah":2,"catatan":"Selisih stock opname"}
     */
    public static function adjust(array $params, ?array $user): void
    {
        $in    = new Input(Http::body());
        $pid   = $in->int('product_id', 1);
        $arah  = $in->enum('arah', ['TAMBAH', 'KURANG']);
        $qty   = $in->int('jumlah', 1, 100000);
        $alasan = $in->str('catatan', 3, 500);
        $in->check();

        $tid = (int) Db::tx(static function () use ($user, $pid, $arah, $qty, $alasan) {
            // Kunci baris barang agar tidak berebut dengan pesanan yang sedang masuk.
            $stok = Db::val('SELECT stok FROM products WHERE id = :id AND aktif FOR UPDATE', ['id' => $pid]);
            if ($stok === null) {
                throw new HttpException('Barang tidak ditemukan atau nonaktif', 404);
            }
            if ($arah === 'KURANG') {
                $tersedia = (int) Db::val('SELECT tersedia FROM v_stok_barang WHERE product_id = :id', ['id' => $pid]);
                if ($qty > $tersedia) {
                    throw new HttpException(
                        "Jumlah melebihi stok tersedia ($tersedia); sebagian stok sedang tertahan pesanan atau tidak cukup",
                        422
                    );
                }
            }
            return self::postAdjustment($user['id'], $pid, $arah === 'TAMBAH' ? 'ADJ_IN' : 'ADJ_OUT', $qty, $alasan);
        });

        Http::ok(Transactions::find($tid), null, 201);
    }

    /** Buat transaksi koreksi (ADJ_IN / ADJ_OUT) satu barang dan langsung COMPLETED. Harus dalam transaksi DB. */
    private static function postAdjustment(int $staffId, int $productId, string $tipe, int $qty, string $catatan): int
    {
        $tid = (int) Db::val(
            'INSERT INTO transactions (tipe_transaksi, dicatat_oleh, catatan) VALUES (:t, :u, :c) RETURNING id',
            ['t' => $tipe, 'u' => $staffId, 'c' => $catatan]
        );
        Db::exec(
            'INSERT INTO transaction_details (transaction_id, product_id, jumlah) VALUES (:t, :p, :j)',
            ['t' => $tid, 'p' => $productId, 'j' => $qty]
        );
        Db::exec("UPDATE transactions SET status = 'COMPLETED' WHERE id = :t", ['t' => $tid]);
        return $tid;
    }
}
