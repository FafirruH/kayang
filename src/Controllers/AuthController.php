<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Auth;
use App\Db;
use App\Http;
use App\HttpException;
use App\Input;
use App\RateLimiter;

final class AuthController
{
    /** POST /api/auth/register - selalu membuat role CUSTOMER. */
    public static function register(array $params, ?array $user): void
    {
        $in       = new Input(Http::body());
        $username = $in->str('username', 3, 50, true, '/^[A-Za-z0-9_.]+$/');
        $password = $in->password('password', 6, 72);
        $nama     = $in->str('nama_lengkap', 2, 100);
        $telp     = $in->str('no_telepon', 8, 20, true, '/^[0-9+\- ]+$/');
        $alamat   = $in->str('alamat', 1, 500, false);
        if ($in->has('password2') && $in->raw('password2') !== $password) {
            $in->error('password2', 'Password tidak sama');
        }
        $in->check();

        $row = Db::one(
            "INSERT INTO users (nama_pengguna, kata_sandi_hash, nama_lengkap, no_telepon, alamat, peran)
             VALUES (:u, :h, :n, :t, :a, 'CUSTOMER')
             RETURNING id, nama_pengguna AS username, nama_lengkap, no_telepon, peran AS role",
            [
                'u' => strtolower((string) $username),
                'h' => password_hash((string) $password, PASSWORD_BCRYPT),
                'n' => $nama,
                't' => $telp,
                'a' => $alamat,
            ]
        );
        Http::ok($row, null, 201);
    }

    /** POST /api/auth/login */
    public static function login(array $params, ?array $user): void
    {
        $in       = new Input(Http::body());
        $username = strtolower((string) $in->str('username', 1, 50));
        $password = (string) $in->password('password', 1, 200);
        $in->check();

        $key = ($_SERVER['REMOTE_ADDR'] ?? '-') . '|' . $username;
        RateLimiter::assertAllowed($key, 5, 600);

        $row = Db::one(
            'SELECT id, nama_pengguna AS username, kata_sandi_hash AS password_hash,
                    nama_lengkap, no_telepon, alamat, peran AS role
               FROM users WHERE nama_pengguna = :u AND aktif',
            ['u' => $username]
        );

        if ($row === null) {
            password_hash($password, PASSWORD_BCRYPT);   // samakan waktu respons (cegah user enumeration)
            $ok = false;
        } else {
            $ok = password_verify($password, (string) $row['password_hash']);
        }

        if (!$ok) {
            RateLimiter::fail($key, 600);
            throw new HttpException('Username atau password salah', 401);
        }

        RateLimiter::clear($key);
        Auth::login((int) $row['id']);
        unset($row['password_hash']);
        Http::ok($row);
    }

    /** POST /api/auth/logout */
    public static function logout(array $params, ?array $user): void
    {
        Auth::logout();
        Http::ok(['logged_out' => true]);
    }

    /**
     * PATCH /api/auth/me - pelanggan mengubah akunnya sendiri.
     * {current_password (wajib), username?, nama_lengkap?, no_telepon?, alamat?, password? (password baru)}
     * Password saat ini selalu diverifikasi ulang sebelum perubahan disimpan.
     */
    public static function updateMe(array $params, ?array $user): void
    {
        $in      = new Input(Http::body());
        $current = (string) $in->password('current_password', 1, 200);
        $f       = [];

        $v = $in->str('username', 3, 50, false, '/^[A-Za-z0-9_.]+$/');
        if ($v !== null) { $f['nama_pengguna'] = strtolower($v); }
        $v = $in->str('nama_lengkap', 2, 100, false);
        if ($v !== null) { $f['nama_lengkap'] = $v; }
        $v = $in->str('no_telepon', 8, 20, false, '/^[0-9+\\- ]+$/');
        if ($v !== null) { $f['no_telepon'] = $v; }
        if ($in->has('alamat')) {
            $rawAddress = $in->raw('alamat');
            $f['alamat'] = $rawAddress === null || (is_string($rawAddress) && trim($rawAddress) === '')
                ? null
                : $in->str('alamat', 1, 500, false);
        }
        if ($in->has('password') && $in->raw('password') !== '' && $in->raw('password') !== null) {
            $pw = $in->password('password', 6, 72);
            if ($pw !== null) { $f['kata_sandi_hash'] = password_hash($pw, PASSWORD_BCRYPT); }
        }
        $in->check();
        if (!$f) {
            throw new HttpException('Tidak ada data yang diubah', 422);
        }

        $key = ($_SERVER['REMOTE_ADDR'] ?? '-') . '|pw|' . $user['id'];
        RateLimiter::assertAllowed($key, 5, 600);
        $hash = (string) Db::val('SELECT kata_sandi_hash FROM users WHERE id = :id', ['id' => $user['id']]);
        if (!password_verify($current, $hash)) {
            RateLimiter::fail($key, 600);
            throw new HttpException('Data tidak valid', 422, ['current_password' => 'Password salah']);
        }
        RateLimiter::clear($key);

        if (isset($f['nama_pengguna'])
            && Db::val('SELECT 1 FROM users WHERE nama_pengguna = :u AND id <> :id', ['u' => $f['nama_pengguna'], 'id' => $user['id']])) {
            throw new HttpException('Data tidak valid', 422, ['username' => 'Username sudah dipakai']);
        }

        $set = implode(', ', array_map(static fn(string $k): string => "$k = :$k", array_keys($f)));
        $row = Db::one(
            "UPDATE users SET $set WHERE id = :id
             RETURNING id, nama_pengguna AS username, nama_lengkap, no_telepon, alamat, peran AS role",
            $f + ['id' => $user['id']]
        );
        Http::ok($row);
    }

    /** GET /api/auth/me */
    public static function me(array $params, ?array $user): void
    {
        Http::ok($user);
    }
}
