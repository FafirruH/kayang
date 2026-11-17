<?php
/* =============================================================
   api/config.php — Simpan & baca konfigurasi aplikasi
   GET  /api/config.php        → kembalikan config saat ini
   POST /api/config.php        → simpan config baru
   ============================================================= */

header('Content-Type: application/json; charset=utf-8');

$CONFIG_FILE = __DIR__ . '/config.json';

$DEFAULTS = [
    'wa_number'        => '62895326202002',
    'wa_nama'          => 'Admin Sumber Lancar',
    'format_pesanan'   => "Halo Admin, saya ingin memesan:\n{items}\nTotal: {total}\nNo. Invoice: {invoice}",
    'format_panggilan' => "Halo Admin Sumber Lancar, saya ingin memanggil montir:\n\nNama: {nama}\nLokasi: {alamat}\nJenis Motor: {motor}\nKeluhan: {keluhan}\n\nMohon segera dibantu. Terima kasih.",
];

function json_ok(mixed $data): never
{
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_err(string $msg, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'message' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function load_config(string $file, array $defaults): array
{
    if (!file_exists($file)) return $defaults;
    $data = json_decode(file_get_contents($file), true);
    return is_array($data) ? array_merge($defaults, $data) : $defaults;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$host = $_SERVER['HTTP_HOST'] ?? '';
$scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://';
$sameOrigin = $host !== '' && $origin !== '' && hash_equals($scheme . $host, $origin);
$allowedOrigins = App\Config::get('app.allowed_origins', []);
$originAllowed = $sameOrigin || (
    $origin !== '' && is_array($allowedOrigins) && in_array($origin, $allowedOrigins, true)
);

header('Vary: Origin');

if ($originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'OPTIONS') {
    if ($origin !== '' && !$originAllowed) {
        json_err('Origin tidak diizinkan', 403);
    }
    http_response_code(204);
    exit;
}

// ── GET ──────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    json_ok(load_config($CONFIG_FILE, $DEFAULTS));
}

// ── POST ─────────────────────────────────────────────────────────────────────
if ($method === 'POST') {
    if (!$originAllowed) {
        json_err('Origin tidak diizinkan', 403);
    }
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
    if ($contentType !== 'application/json') {
        json_err('Content-Type harus application/json', 415);
    }

    $user = App\Auth::user();
    if ($user === null) {
        json_err('Silakan login terlebih dahulu', 401);
    }
    if (($user['role'] ?? '') !== 'ADMIN') {
        json_err('Akses ditolak', 403);
    }

    $raw  = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) json_err('Request body harus JSON.');

    $config  = load_config($CONFIG_FILE, $DEFAULTS);
    $isMainAdmin = isset($user['username']) && strtolower((string) $user['username']) === 'admin';
    if (!$isMainAdmin && array_key_exists('wa_number', $data)) {
        $requestedNumber = preg_replace('/[\s\-().+]/', '', (string) $data['wa_number']);
        $currentNumber = preg_replace('/[\s\-().+]/', '', (string) $config['wa_number']);
        if ($requestedNumber !== $currentNumber) {
            json_err('Hanya Admin Utama yang dapat mengubah nomor WhatsApp.', 403);
        }
    }

    $allowed = array_keys($DEFAULTS);

    foreach ($allowed as $key) {
        if (array_key_exists($key, $data)) {
            $config[$key] = trim((string)$data[$key]);
        }
    }

    // Validasi nomor WA
    $num = preg_replace('/[\s\-().+]/', '', $config['wa_number']);
    if (!preg_match('/^(08|62)\d{8,13}$/', $num)) {
        json_err('Nomor WhatsApp tidak valid. Gunakan format 08xxx atau 62xxx.');
    }
    $config['wa_number'] = $num;

    if (@file_put_contents(
        $CONFIG_FILE,
        json_encode($config, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
    ) === false) {
        json_err('Gagal menyimpan konfigurasi. Periksa izin tulis folder api/.', 500);
    }

    json_ok($config);
}

json_err('Method tidak didukung.', 405);
