<?php
declare(strict_types=1);

namespace App;

/** Pembuat teks dan tautan WhatsApp (wa.me). */
final class Wa
{
    public static function orderText(array $t): string
    {
        $lines = ['Halo, berikut pesanan Anda di Sumber Lancar:'];
        foreach ($t['items'] as $i) {
            $lines[] = '- ' . $i['nama_barang'] . ' x' . $i['jumlah'];
        }
        $lines[] = 'Total: Rp ' . number_format((int) $t['total_bayar'], 0, ',', '.');
        $lines[] = 'Faktur: ' . $t['no_faktur'];
        return implode("\n", $lines);
    }

    /** "0812-3456-789" -> "628123456789" */
    public static function normalizePhone(string $phone): ?string
    {
        $d = preg_replace('/\D+/', '', $phone) ?? '';
        if ($d === '') {
            return null;
        }
        return str_starts_with($d, '0') ? '62' . substr($d, 1) : $d;
    }

    public static function url(string $digits, string $text): string
    {
        return 'https://wa.me/' . $digits . '?text=' . rawurlencode($text);
    }
}
