<?php
/* =============================================================
   api/db.php — Koneksi database PostgreSQL via PDO
   Sesuaikan konstanta di bawah bila nama DB / kredensial berbeda.
   ============================================================= */

define('DB_HOST', '127.0.0.1');
define('DB_PORT', '5432');
define('DB_NAME', 'bengkel2');      // ganti sesuai nama database Anda
define('DB_USER', 'postgres');
define('DB_PASS', 'postgres');     // ganti sesuai password PostgreSQL Anda

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dsn = sprintf(
        'pgsql:host=%s;port=%s;dbname=%s',
        DB_HOST, DB_PORT, DB_NAME
    );

    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}