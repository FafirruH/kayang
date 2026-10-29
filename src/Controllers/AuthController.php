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
            "INSERT INTO users (username, password_hash, nama_lengkap, no_telepon, alamat, role)
             VALUES (:u, :h, :n, :t, :a, 'CUSTOMER')
             RETURNING id, username, nama_lengkap, no_telepon, role",
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
            'SELECT id, username, password_hash, nama_lengkap, no_telepon, role
               FROM users WHERE username = :u AND aktif',
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

    /** GET /api/auth/me */
    public static function me(array $params, ?array $user): void
    {
        Http::ok($user);
    }
}
