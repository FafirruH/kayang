<?php
$host     = 'localhost';
$port     = '5432';
$dbname   = 'bengkel2';
$user     = 'postgres';
$password = 'postgres';

try {
    $dsn = "pgsql:host=$host;port=$port;dbname=$dbname";

    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    die("Koneksi gagal: " . $e->getMessage());
}

function db(): PDO {
    global $pdo;
    return $pdo;
}