<?php
declare(strict_types=1);

namespace App;

final class Http
{
    // ---------- Respons ----------

    public static function json(mixed $data, int $status = 200): never
    {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        http_response_code($status);
        echo json_encode(
            self::normalize($data),
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR
        );
        exit;
    }

    public static function ok(mixed $data, ?array $meta = null, int $status = 200): never
    {
        $body = ['data' => $data];
        if ($meta !== null) {
            $body['meta'] = $meta;
        }
        self::json($body, $status);
    }

    public static function error(string $message, int $status, array $details = []): never
    {
        $err = ['message' => $message];
        if ($details) {
            $err['details'] = $details;
        }
        self::json(['error' => $err], $status);
    }

    /** Ubah timestamp PostgreSQL ("2026-10-21 10:00:00+07") menjadi ISO 8601 agar mudah di-parse JavaScript. */
    private static function normalize(mixed $v): mixed
    {
        if (is_array($v)) {
            return array_map([self::class, 'normalize'], $v);
        }
        if (is_string($v)
            && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}(?::?\d{2})?$/', $v)) {
            try {
                return (new \DateTimeImmutable($v))->format(\DATE_ATOM);
            } catch (\Throwable) {
                return $v;
            }
        }
        return $v;
    }

    // ---------- Permintaan ----------

    /** Body JSON (object). Kosong -> []. */
    public static function body(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return $cache = [];
        }
        if (strlen($raw) > 102400) {
            throw new HttpException('Body terlalu besar', 413);
        }
        $data = json_decode($raw, true);
        if (!is_array($data)) {
            throw new HttpException('Body harus berupa JSON object', 400);
        }
        return $cache = $data;
    }

    public static function query(string $key, string $default = ''): string
    {
        $v = $_GET[$key] ?? $default;
        return is_string($v) ? trim($v) : $default;
    }

    public static function intQuery(string $key, int $default, int $min, int $max): int
    {
        $v = $_GET[$key] ?? null;
        if (!is_string($v) || !preg_match('/^\d+$/', $v)) {
            return $default;
        }
        return max($min, min($max, (int) $v));
    }

    /** @return array{0:int,1:int,2:int} [halaman, per_halaman, offset] */
    public static function paging(): array
    {
        $max  = (int) Config::get('app.max_per_page', 50);
        $page = self::intQuery('page', 1, 1, 1000000);
        $per  = self::intQuery('per_page', (int) Config::get('app.per_page', 12), 1, $max);
        return [$page, $per, ($page - 1) * $per];
    }

    public static function meta(int $page, int $per, int $total): array
    {
        return [
            'page'        => $page,
            'per_page'    => $per,
            'total'       => $total,
            'total_pages' => (int) ceil($total / $per),
        ];
    }

    public static function cors(): void
    {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed = Config::get('app.allowed_origins', []);
        if ($origin !== '' && is_array($allowed) && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Headers: Content-Type');
            header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
            header('Vary: Origin');
        }
    }

    // ---------- Galat database ----------

    /**
     * Pesan trigger/fungsi di database (mis. "Stok tersedia ... tidak cukup") sudah berbahasa
     * Indonesia dan aman ditampilkan. Pesan constraint bawaan PostgreSQL dipetakan ke teks ramah.
     */
    public static function fromPdo(\PDOException $e): never
    {
        $state = (string) ($e->errorInfo[0] ?? $e->getCode());
        $raw   = (string) ($e->errorInfo[2] ?? $e->getMessage());
        $msg   = trim(explode("\n", preg_replace('/^ERROR:\s+/', '', $raw) ?? $raw)[0]);

        switch ($state) {
            case '23505': // unique_violation
                $map = [
                    'users_username_key'              => 'Username sudah dipakai',
                    'products_kode_barang_key'        => 'Kode barang sudah dipakai',
                    'suppliers_nama_supplier_key'     => 'Nama supplier sudah ada',
                    'transactions_no_faktur_key'      => 'Nomor faktur bentrok, coba lagi',
                    'transaction_details_pkey'        => 'Barang yang sama sudah ada di transaksi ini',
                ];
                preg_match('/unique constraint "([^"]+)"/', $msg, $m);
                self::error($map[$m[1] ?? ''] ?? 'Data sudah ada', 409);

            case '23503': // foreign_key_violation
                if (str_contains($msg, 'violates foreign key constraint')) {
                    if (str_starts_with($msg, 'insert or update')) {
                        self::error('Referensi data tidak valid', 422);
                    }
                    self::error('Data tidak bisa dihapus/diubah karena sudah dipakai di transaksi', 409);
                }
                self::error($msg, 422);

            case '23514': // check_violation
                if (str_contains($msg, 'violates check constraint')) {
                    $map = [
                        'ck_supplier'       => 'Pembelian (IN) wajib memiliki supplier',
                        'ck_pelanggan_out'  => 'Penjualan harus memiliki pelanggan terdaftar atau nama pelanggan umum',
                        'ck_pelanggan_satu' => 'Isi salah satu saja: pelanggan terdaftar atau nama pelanggan umum',
                        'ck_pelanggan_tipe' => 'Pelanggan hanya boleh diisi pada penjualan',
                        'ck_expired'        => 'Batas waktu penahanan harus setelah waktu transaksi dibuat',
                        'ck_expired_out'    => 'Penjualan wajib memiliki batas waktu penahanan',
                        'ck_catatan_adj'    => 'Koreksi stok wajib memiliki catatan alasan',
                        'ck_bayar'          => 'Metode bayar wajib diisi',
                        'ck_selesai'        => 'Status dan waktu selesai tidak konsisten',
                    ];
                    preg_match('/check constraint "([^"]+)"/', $msg, $m);
                    self::error($map[$m[1] ?? ''] ?? 'Data tidak memenuhi aturan database', 422);
                }
                self::error($msg, 422);

            case '22023': // invalid_parameter_value (mis. keranjang kosong)
                self::error($msg, 422);

            case '23502': // not_null_violation
            case '22P02': // invalid_text_representation
            case '22003': // numeric_value_out_of_range
                self::error('Format data tidak valid', 422);
        }

        error_log('[DB ' . $state . '] ' . $raw);
        self::error(
            (bool) Config::get('app.debug') ? $raw : 'Terjadi kesalahan pada database',
            500
        );
    }
}
