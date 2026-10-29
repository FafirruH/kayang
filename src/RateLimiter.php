<?php
declare(strict_types=1);

namespace App;

/** Pembatas percobaan login sederhana berbasis file (tanpa ekstensi tambahan). */
final class RateLimiter
{
    private static function file(string $key): string
    {
        return sys_get_temp_dir() . '/sl_rl_' . sha1($key);
    }

    /** @return list<int> */
    private static function hits(string $key, int $window): array
    {
        $f = self::file($key);
        if (!is_file($f)) {
            return [];
        }
        $d = json_decode((string) @file_get_contents($f), true);
        $min = time() - $window;
        return is_array($d)
            ? array_values(array_filter($d, static fn($t) => is_int($t) && $t > $min))
            : [];
    }

    public static function assertAllowed(string $key, int $max, int $window): void
    {
        if (count(self::hits($key, $window)) >= $max) {
            throw new HttpException('Terlalu banyak percobaan login. Coba lagi beberapa menit lagi.', 429);
        }
    }

    public static function fail(string $key, int $window): void
    {
        $hits = self::hits($key, $window);
        $hits[] = time();
        @file_put_contents(self::file($key), json_encode($hits), LOCK_EX);
    }

    public static function clear(string $key): void
    {
        @unlink(self::file($key));
    }
}
