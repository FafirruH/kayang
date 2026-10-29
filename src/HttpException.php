<?php
declare(strict_types=1);

namespace App;

/** Galat yang aman ditampilkan ke klien (pesan, kode HTTP, detail per field). */
final class HttpException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 400,
        public readonly array $details = []
    ) {
        parent::__construct($message);
    }
}
