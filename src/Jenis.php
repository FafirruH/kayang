<?php
declare(strict_types=1);

namespace App;

/** Daftar jenis barang; harus sama dengan CHECK pada products.jenis_barang. */
final class Jenis
{
    public const ALL = ['Oli', 'Rem', 'Busi', 'Ban', 'Aki', 'Rantai', 'Filter'];

    public static function normalize(string $value): ?string
    {
        foreach (self::ALL as $j) {
            if (strcasecmp($j, $value) === 0) {
                return $j;
            }
        }
        return null;
    }
}
