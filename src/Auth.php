<?php
declare(strict_types=1);

namespace App;

/**
 * Sesi PHP native (cookie HttpOnly + SameSite=Lax). Peran dibaca ulang dari database
 * pada setiap permintaan, jadi perubahan role / penonaktifan akun langsung berlaku.
 */
final class Auth
{
    private const COOKIE = 'sl_sid';

    private static bool $loaded = false;
    private static ?array $user = null;

    private static function configure(): void
    {
        if (session_status() !== PHP_SESSION_NONE) {
            return;
        }
        $ttl    = (int) Config::get('app.session_hours', 8) * 3600;
        $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
        session_name(self::COOKIE);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', (string) $ttl);
        session_set_cookie_params([
            'lifetime' => $ttl,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function user(): ?array
    {
        if (self::$loaded) {
            return self::$user;
        }
        self::$loaded = true;

        if (!isset($_COOKIE[self::COOKIE])) {
            return null;
        }
        self::configure();
        if (session_status() === PHP_SESSION_NONE) {
            session_start(['read_and_close' => true]); // tidak mengunci file sesi
        }
        $uid = $_SESSION['uid'] ?? null;
        if (!is_int($uid)) {
            return null;
        }
        $u = Db::one(
            'SELECT id, username, nama_lengkap, no_telepon, role FROM users WHERE id = :id AND aktif',
            ['id' => $uid]
        );
        if ($u !== null) {
            $u['id'] = (int) $u['id'];
        }
        return self::$user = $u;
    }

    public static function login(int $uid): void
    {
        self::configure();
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
        session_regenerate_id(true);   // cegah session fixation
        $_SESSION['uid'] = $uid;
        session_write_close();
        self::$loaded = false;
        self::$user = null;
    }

    public static function logout(): void
    {
        if (isset($_COOKIE[self::COOKIE])) {
            self::configure();
            if (session_status() === PHP_SESSION_NONE) {
                session_start();
            }
            $_SESSION = [];
            session_destroy();
            setcookie(self::COOKIE, '', [
                'expires'  => time() - 3600,
                'path'     => '/',
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        }
        self::$loaded = false;
        self::$user = null;
    }

    /**
     * @param list<string> $roles kosong = cukup sudah login
     * @return array<string,mixed> pengguna saat ini
     */
    public static function guard(array $roles): array
    {
        $u = self::user();
        if ($u === null) {
            throw new HttpException('Silakan login terlebih dahulu', 401);
        }
        if ($roles && !in_array($u['role'], $roles, true)) {
            throw new HttpException('Akses ditolak', 403);
        }
        return $u;
    }
}
