<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Db;
use App\Http;
use App\HttpException;
use App\Input;

final class SupplierController
{
    private const COLS = 'id, nama_supplier, no_telepon, alamat, aktif, created_at';

    /** GET /api/admin/suppliers?q=&aktif=true|false|all */
    public static function index(array $params, ?array $user): void
    {
        [$page, $per, $off] = Http::paging();
        $where = [];
        $args  = [];

        $aktif = Http::query('aktif', 'true');
        if ($aktif === 'true') {
            $where[] = 'aktif';
        } elseif ($aktif === 'false') {
            $where[] = 'NOT aktif';
        }
        $q = Http::query('q');
        if ($q !== '') {
            $where[] = 'nama_supplier ILIKE :q';
            $args['q'] = '%' . addcslashes($q, '%_\\') . '%';
        }
        $w = $where ? implode(' AND ', $where) : 'TRUE';

        $total = (int) Db::val("SELECT COUNT(*) FROM suppliers WHERE $w", $args);
        $rows  = Db::all(
            'SELECT ' . self::COLS . " FROM suppliers WHERE $w ORDER BY nama_supplier LIMIT :lim OFFSET :off",
            $args + ['lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** POST /api/admin/suppliers */
    public static function create(array $params, ?array $user): void
    {
        $in     = new Input(Http::body());
        $nama   = $in->str('nama_supplier', 2, 100);
        $telp   = $in->str('no_telepon', 8, 20, true, '/^[0-9+\- ]+$/');
        $alamat = $in->str('alamat', 1, 500, false);
        $in->check();

        $row = Db::one(
            'INSERT INTO suppliers (nama_supplier, no_telepon, alamat) VALUES (:n, :t, :a) RETURNING ' . self::COLS,
            ['n' => $nama, 't' => $telp, 'a' => $alamat]
        );
        Http::ok($row, null, 201);
    }

    /** PUT /api/admin/suppliers/{id} (sebagian field boleh) */
    public static function update(array $params, ?array $user): void
    {
        $in = new Input(Http::body());
        $f  = [];
        $v = $in->str('nama_supplier', 2, 100, false);
        if ($v !== null) { $f['nama_supplier'] = $v; }
        $v = $in->str('no_telepon', 8, 20, false, '/^[0-9+\- ]+$/');
        if ($v !== null) { $f['no_telepon'] = $v; }
        $v = $in->str('alamat', 1, 500, false);
        if ($v !== null) { $f['alamat'] = $v; }
        $b = $in->bool('aktif');
        if ($b !== null) { $f['aktif'] = Db::bool($b); }
        $in->check();
        if (!$f) {
            throw new HttpException('Tidak ada data yang diubah', 422);
        }

        $set = implode(', ', array_map(static fn(string $k): string => "$k = :$k", array_keys($f)));
        $row = Db::one("UPDATE suppliers SET $set WHERE id = :id RETURNING " . self::COLS, $f + ['id' => $params['id']]);
        if ($row === null) {
            throw new HttpException('Supplier tidak ditemukan', 404);
        }
        Http::ok($row);
    }

    /** DELETE /api/admin/suppliers/{id} - hapus lunak. */
    public static function destroy(array $params, ?array $user): void
    {
        $n = Db::exec('UPDATE suppliers SET aktif = false WHERE id = :id', ['id' => $params['id']]);
        if ($n === 0) {
            throw new HttpException('Supplier tidak ditemukan', 404);
        }
        Http::ok(['id' => $params['id'], 'aktif' => false]);
    }
}
