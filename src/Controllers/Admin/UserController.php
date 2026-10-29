<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Db;
use App\Http;
use App\HttpException;
use App\Input;

final class UserController
{
    private const ROLES = ['ADMIN', 'MECHANIC', 'CUSTOMER'];

    /** GET /api/admin/users?role=&q=&aktif= - daftar akun beserta jumlah transaksi. */
    public static function index(array $params, ?array $user): void
    {
        [$page, $per, $off] = Http::paging();
        $where = [];
        $args  = [];

        $role = Http::query('role');
        if ($role !== '') {
            if (!in_array($role, self::ROLES, true)) {
                throw new HttpException('Role tidak valid', 422);
            }
            $where[] = 'u.role = :role';
            $args['role'] = $role;
        }
        $aktif = Http::query('aktif');
        if ($aktif === 'true') {
            $where[] = 'u.aktif';
        } elseif ($aktif === 'false') {
            $where[] = 'NOT u.aktif';
        }
        $q = Http::query('q');
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(u.username ILIKE :q1 OR u.nama_lengkap ILIKE :q2)';
            $args += ['q1' => $like, 'q2' => $like];
        }
        $w = $where ? implode(' AND ', $where) : 'TRUE';

        $total = (int) Db::val("SELECT COUNT(*) FROM users u WHERE $w", $args);
        $rows  = Db::all(
            "SELECT u.id, u.username, u.nama_lengkap, u.no_telepon, u.role, u.aktif, u.created_at,
                    COUNT(t.id) AS jumlah_transaksi
               FROM users u
               LEFT JOIN transactions t ON t.customer_id = u.id
              WHERE $w
              GROUP BY u.id
              ORDER BY u.role, u.username
              LIMIT :lim OFFSET :off",
            $args + ['lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** POST /api/admin/users - buat akun (mis. montir atau admin baru). */
    public static function create(array $params, ?array $user): void
    {
        $in       = new Input(Http::body());
        $username = $in->str('username', 3, 50, true, '/^[A-Za-z0-9_.]+$/');
        $password = $in->password('password', 6, 72);
        $nama     = $in->str('nama_lengkap', 2, 100);
        $telp     = $in->str('no_telepon', 8, 20, true, '/^[0-9+\- ]+$/');
        $alamat   = $in->str('alamat', 1, 500, false);
        $role     = $in->enum('role', self::ROLES);
        $in->check();

        $row = Db::one(
            'INSERT INTO users (username, password_hash, nama_lengkap, no_telepon, alamat, role)
             VALUES (:u, :h, :n, :t, :a, :r)
             RETURNING id, username, nama_lengkap, no_telepon, role, aktif',
            [
                'u' => strtolower((string) $username),
                'h' => password_hash((string) $password, PASSWORD_BCRYPT),
                'n' => $nama, 't' => $telp, 'a' => $alamat, 'r' => $role,
            ]
        );
        Http::ok($row, null, 201);
    }

    /** PATCH /api/admin/users/{id}  {role?, aktif?, nama_lengkap?, no_telepon?, alamat?, password?} */
    public static function update(array $params, ?array $user): void
    {
        $in = new Input(Http::body());
        $f  = [];

        $role = $in->enum('role', self::ROLES, false);
        if ($role !== null) { $f['role'] = $role; }
        $b = $in->bool('aktif');
        if ($b !== null) { $f['aktif'] = Db::bool($b); }
        $v = $in->str('nama_lengkap', 2, 100, false);
        if ($v !== null) { $f['nama_lengkap'] = $v; }
        $v = $in->str('no_telepon', 8, 20, false, '/^[0-9+\- ]+$/');
        if ($v !== null) { $f['no_telepon'] = $v; }
        $v = $in->str('alamat', 1, 500, false);
        if ($v !== null) { $f['alamat'] = $v; }
        if ($in->has('password')) {
            $pw = $in->password('password', 6, 72);
            if ($pw !== null) { $f['password_hash'] = password_hash($pw, PASSWORD_BCRYPT); }
        }
        $in->check();
        if (!$f) {
            throw new HttpException('Tidak ada data yang diubah', 422);
        }

        // Admin tidak boleh mengunci dirinya sendiri.
        if ($params['id'] === $user['id']
            && (isset($f['aktif']) && $f['aktif'] === 'false' || isset($f['role']) && $f['role'] !== 'ADMIN')) {
            throw new HttpException('Anda tidak bisa menonaktifkan atau menurunkan role akun sendiri', 422);
        }

        $set = implode(', ', array_map(static fn(string $k): string => "$k = :$k", array_keys($f)));
        $row = Db::one(
            "UPDATE users SET $set WHERE id = :id RETURNING id, username, nama_lengkap, no_telepon, role, aktif",
            $f + ['id' => $params['id']]
        );
        if ($row === null) {
            throw new HttpException('Akun tidak ditemukan', 404);
        }
        Http::ok($row);
    }
}
