<?php
/* =============================================================
   api/products.php — REST API untuk tabel products

   GET    /api/products.php              → daftar produk aktif (katalog)
   GET    /api/products.php?all=1        → semua produk termasuk nonaktif (admin)
   GET    /api/products.php?id=5         → satu produk
   POST   /api/products.php              → tambah produk baru
   PUT    /api/products.php?id=5         → update produk
   DELETE /api/products.php?id=5         → nonaktifkan produk (soft delete)
   ============================================================= */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

require_once __DIR__ . '/db.php';

function json_ok(mixed $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function json_err(string $message, int $code = 400): never
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function body(): array
{
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!is_array($data)) json_err('Request body harus JSON.', 400);
    return $data;
}

// ── Validasi kolom yang boleh dikirim dari form ────────────────────────────
$ALLOWED_JENIS = ['Oli', 'Rem', 'Busi', 'Ban', 'Aki', 'Rantai', 'Filter'];

function validate_product(array $data, bool $require_all = true): array
{
    global $ALLOWED_JENIS;
    $errors = [];

    if ($require_all || array_key_exists('nama_barang', $data)) {
        $v = trim($data['nama_barang'] ?? '');
        if ($v === '') $errors[] = 'Nama barang wajib diisi.';
    }

    if ($require_all || array_key_exists('jenis_barang', $data)) {
        $v = $data['jenis_barang'] ?? '';
        if (!in_array($v, $ALLOWED_JENIS, true))
            $errors[] = 'Kategori tidak valid. Pilihan: ' . implode(', ', $ALLOWED_JENIS);
    }

    if ($require_all || array_key_exists('harga_jual_default', $data)) {
        $v = $data['harga_jual_default'] ?? null;
        if (!is_numeric($v) || (int)$v < 0)
            $errors[] = 'Harga jual harus angka >= 0.';
    }

    if ($require_all || array_key_exists('stok', $data)) {
        $v = $data['stok'] ?? null;
        if (!is_numeric($v) || (int)$v < 0)
            $errors[] = 'Stok harus angka >= 0.';
    }

    return $errors;
}

// ─────────────────────────────────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;

try {
    $pdo = db();

    // ── GET ──────────────────────────────────────────────────────────────────
    if ($method === 'GET') {

        // Satu produk
        if ($id !== null) {
            $stmt = $pdo->prepare(
                'SELECT product_id, kode_barang, nama_barang, jenis_barang, merk,
                        harga_jual, harga_beli, stok, stok_minimal,
                        tertahan, tersedia, status_stok, aktif
                   FROM v_stok_barang
                  WHERE product_id = :id'
            );
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) json_err('Produk tidak ditemukan.', 404);
            json_ok($row);
        }

        // Daftar produk
        $showAll = isset($_GET['all']) && $_GET['all'] == '1';
        $q       = trim($_GET['q']    ?? '');
        $jenis   = trim($_GET['jenis'] ?? '');
        $page    = max(1, (int)($_GET['page']  ?? 1));
        $limit   = min(100, max(1, (int)($_GET['limit'] ?? 50)));
        $offset  = ($page - 1) * $limit;

        $where  = $showAll ? [] : ['aktif = TRUE'];
        $params = [];

        if ($q !== '') {
            $where[]         = "(nama_barang ILIKE :q OR jenis_barang ILIKE :q OR kode_barang ILIKE :q)";
            $params[':q']    = '%' . $q . '%';
        }
        if ($jenis !== '' && $jenis !== 'semua') {
            // Normalise: "oli" → "Oli"
            $jenisTitle      = ucfirst(strtolower($jenis));
            $where[]         = 'jenis_barang = :jenis';
            $params[':jenis'] = $jenisTitle;
        }

        $whereSQL = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        // Total untuk pagination
        $countStmt = $pdo->prepare("SELECT COUNT(*) FROM v_stok_barang $whereSQL");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        $params[':limit']  = $limit;
        $params[':offset'] = $offset;

        $stmt = $pdo->prepare(
            "SELECT product_id, kode_barang, nama_barang, jenis_barang, merk,
                    harga_jual, harga_beli, stok, stok_minimal,
                    tertahan, tersedia, status_stok, aktif
               FROM v_stok_barang
              $whereSQL
              ORDER BY (status_stok = 'Habis'), nama_barang
              LIMIT :limit OFFSET :offset"
        );
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        json_ok([
            'items'      => $rows,
            'total'      => $total,
            'page'       => $page,
            'limit'      => $limit,
            'total_pages' => (int)ceil($total / $limit),
        ]);
    }

    // ── POST (tambah produk baru) ─────────────────────────────────────────────
    if ($method === 'POST') {
        $data   = body();
        $errors = validate_product($data, true);
        if ($errors) json_err(implode(' ', $errors));

        // Generate kode_barang otomatis bila tidak dikirim
        if (empty($data['kode_barang'])) {
            $prefix = strtoupper(substr($data['jenis_barang'], 0, 3));
            $stmt   = $pdo->prepare(
                "SELECT kode_barang FROM products
                  WHERE kode_barang LIKE :prefix
                  ORDER BY kode_barang DESC LIMIT 1"
            );
            $stmt->execute([':prefix' => $prefix . '-%']);
            $last = $stmt->fetchColumn();
            $num  = $last ? ((int)substr($last, strrpos($last, '-') + 1) + 1) : 1;
            $data['kode_barang'] = $prefix . '-' . str_pad($num, 3, '0', STR_PAD_LEFT);
        }

        $stmt = $pdo->prepare(
            "INSERT INTO products
               (kode_barang, nama_barang, jenis_barang, merk,
                harga_beli_default, harga_jual_default, stok, stok_minimal, aktif)
             VALUES
               (:kode, :nama, :jenis, :merk, :harga_beli, :harga_jual, :stok, :stok_min, TRUE)
             RETURNING id"
        );
        $stmt->execute([
            ':kode'       => $data['kode_barang'],
            ':nama'       => trim($data['nama_barang']),
            ':jenis'      => $data['jenis_barang'],
            ':merk'       => trim($data['merk'] ?? ''),
            ':harga_beli' => (int)($data['harga_beli_default'] ?? 0),
            ':harga_jual' => (int)$data['harga_jual_default'],
            ':stok'       => (int)$data['stok'],
            ':stok_min'   => (int)($data['stok_minimal'] ?? 5),
        ]);
        $newId = $stmt->fetchColumn();
        json_ok(['id' => $newId, 'kode_barang' => $data['kode_barang']], 201);
    }

    // ── PUT (update produk) ───────────────────────────────────────────────────
    if ($method === 'PUT') {
        if (!$id) json_err('Parameter id wajib untuk update.', 400);

        $data   = body();
        $errors = validate_product($data, false);   // hanya validasi field yang dikirim
        if ($errors) json_err(implode(' ', $errors));

        // Bangun SET dinamis agar tidak wajib kirim semua kolom
        $map = [
            'nama_barang'        => ':nama',
            'jenis_barang'       => ':jenis',
            'merk'               => ':merk',
            'harga_jual_default' => ':harga_jual',
            'harga_beli_default' => ':harga_beli',
            'stok'               => ':stok',
            'stok_minimal'       => ':stok_min',
            'aktif'              => ':aktif',
        ];

        $sets   = [];
        $params = [':id' => $id];

        foreach ($map as $col => $placeholder) {
            if (array_key_exists($col, $data)) {
                $sets[]             = "$col = $placeholder";
                $params[$placeholder] = in_array($col, ['stok','harga_jual_default','harga_beli_default','stok_minimal'], true)
                    ? (int)$data[$col]
                    : (($col === 'aktif') ? (bool)$data[$col] : trim($data[$col]));
            }
        }

        if (!$sets) json_err('Tidak ada field yang diupdate.', 400);
        $sets[] = "updated_at = now()";

        $stmt = $pdo->prepare(
            "UPDATE products SET " . implode(', ', $sets) . " WHERE id = :id"
        );
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) json_err('Produk tidak ditemukan.', 404);
        json_ok(['updated' => true]);
    }

    // ── DELETE (soft delete: aktif = FALSE) ────────────────────────────────
    if ($method === 'DELETE') {
        if (!$id) json_err('Parameter id wajib untuk hapus.', 400);

        $stmt = $pdo->prepare(
            "UPDATE products SET aktif = FALSE, updated_at = now() WHERE id = :id AND aktif = TRUE"
        );
        $stmt->execute([':id' => $id]);

        if ($stmt->rowCount() === 0) json_err('Produk tidak ditemukan atau sudah dihapus.', 404);
        json_ok(['deleted' => true]);
    }

    json_err('Method tidak didukung.', 405);

} catch (PDOException $e) {
    // Sembunyikan detail dari client, log di server
    error_log('[products.php] ' . $e->getMessage());
    json_err('Terjadi kesalahan database. Silakan coba lagi.', 500);
}
