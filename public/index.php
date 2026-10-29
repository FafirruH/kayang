<?php
declare(strict_types=1);

// Server bawaan PHP: biarkan file statis (jika ada) dilayani apa adanya.
if (PHP_SAPI === 'cli-server') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if ($path !== '/' && is_file(__DIR__ . $path)) {
        return false;
    }
}

require dirname(__DIR__) . '/src/bootstrap.php';

App\Kernel::run();
