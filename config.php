<?php
declare(strict_types=1);

/*
 * Konfigurasi. Nilai bisa diubah lewat environment variable
 * atau file config.local.php (lihat config.local.example.php).
 */
$env = static fn(string $key, string $default): string =>
    ($v = getenv($key)) !== false && $v !== '' ? $v : $default;

$config = [
    'db' => [
        'host' => $env('DB_HOST', '127.0.0.1'),
        'port' => $env('DB_PORT', '5432'),
        'name' => $env('DB_NAME', 'bengkel2'),
        'user' => $env('DB_USER', 'postgres'),
        'pass' => $env('DB_PASS', ''),
    ],
    'app' => [
        'debug'           => $env('APP_DEBUG', '0') === '1',
        'timezone'        => 'Asia/Jakarta',
        // Asal frontend yang boleh memanggil API dengan cookie (mis. Live Server)
        'allowed_origins' => array_values(array_filter(array_map('trim', explode(
            ',',
            $env('ALLOWED_ORIGINS', 'http://localhost:5500,http://127.0.0.1:5500')
        )))),
        'wa_number'       => $env('WA_NUMBER', '6281234567890'),  // nomor WhatsApp admin
        'hold_hours'      => 24,   // lama stok ditahan untuk pesanan pelanggan
        'per_page'        => 12,   // ringan untuk perangkat low end
        'max_per_page'    => 50,
        'session_hours'   => 8,
    ],
];

$local = __DIR__ . '/config.local.php';
if (is_file($local)) {
    $config = array_replace_recursive($config, require $local);
}

return $config;
