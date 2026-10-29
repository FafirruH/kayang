<?php
declare(strict_types=1);

// Salin menjadi config.local.php lalu sesuaikan (file ini tidak dibaca langsung).
return [
    'db' => [
        'host' => '127.0.0.1',
        'port' => '5432',
        'name' => 'bengkel2',
        'user' => 'postgres',
        'pass' => 'postgres',
    ],
    'app' => [
        'debug'     => false,
        'wa_number' => '62895326202002',
    ],
];