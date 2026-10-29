<?php
declare(strict_types=1);

namespace App;

/** Validator sederhana: kumpulkan semua galat, lalu panggil check() sekali. */
final class Input
{
    /** @var array<string,mixed> */
    private array $errors = [];

    public function __construct(private array $data)
    {
    }

    public function has(string $key): bool
    {
        return array_key_exists($key, $this->data);
    }

    public function raw(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    public function error(string $key, string $message): void
    {
        $this->errors[$key] = $message;
    }

    public function str(string $key, int $min = 1, int $max = 255, bool $required = true, ?string $pattern = null): ?string
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || (is_string($v) && trim($v) === '')) {
            if ($required) {
                $this->errors[$key] = 'Wajib diisi';
            }
            return null;
        }
        if (!is_string($v)) {
            $this->errors[$key] = 'Harus berupa teks';
            return null;
        }
        $v = trim($v);
        $len = mb_strlen($v);
        if ($len < $min || $len > $max) {
            $this->errors[$key] = "Panjang harus $min-$max karakter";
            return null;
        }
        if ($pattern !== null && !preg_match($pattern, $v)) {
            $this->errors[$key] = 'Format tidak valid';
            return null;
        }
        return $v;
    }

    /** Password tidak di-trim; batas atas dalam byte (bcrypt maksimal 72). */
    public function password(string $key, int $min, int $max): ?string
    {
        $v = $this->data[$key] ?? null;
        if (!is_string($v) || $v === '') {
            $this->errors[$key] = 'Wajib diisi';
            return null;
        }
        if (strlen($v) < $min || strlen($v) > $max) {
            $this->errors[$key] = "Panjang harus $min-$max karakter";
            return null;
        }
        return $v;
    }

    public function int(string $key, int $min = 0, int $max = 2000000000, bool $required = true): ?int
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$key] = 'Wajib diisi';
            }
            return null;
        }
        if (is_string($v) && preg_match('/^-?\d+$/', $v)) {
            $v = (int) $v;
        }
        if (!is_int($v)) {
            $this->errors[$key] = 'Harus berupa bilangan bulat';
            return null;
        }
        if ($v < $min || $v > $max) {
            $this->errors[$key] = "Harus antara $min dan $max";
            return null;
        }
        return $v;
    }

    /** @param list<string> $allowed */
    public function enum(string $key, array $allowed, bool $required = true): ?string
    {
        $v = $this->data[$key] ?? null;
        if ($v === null || $v === '') {
            if ($required) {
                $this->errors[$key] = 'Wajib diisi';
            }
            return null;
        }
        if (!is_string($v) || !in_array($v, $allowed, true)) {
            $this->errors[$key] = 'Harus salah satu dari: ' . implode(', ', $allowed);
            return null;
        }
        return $v;
    }

    public function bool(string $key): ?bool
    {
        if (!array_key_exists($key, $this->data)) {
            return null;
        }
        if (!is_bool($this->data[$key])) {
            $this->errors[$key] = 'Harus true atau false';
            return null;
        }
        return $this->data[$key];
    }

    public function check(): void
    {
        if ($this->errors) {
            throw new HttpException('Data tidak valid', 422, $this->errors);
        }
    }

    /**
     * Validasi daftar barang [{product_id, jumlah, harga?}], barang kembar digabung.
     * Harga hanya diterima bila $allowPrice (admin); dari pelanggan selalu diabaikan.
     *
     * @return list<array{product_id:int,jumlah:int,harga:?int}>
     */
    public static function items(mixed $raw, bool $allowPrice, int $maxLines = 50): array
    {
        if (!is_array($raw) || $raw === [] || !array_is_list($raw)) {
            throw new HttpException('Data tidak valid', 422, ['items' => 'Wajib berupa daftar barang (minimal 1)']);
        }
        if (count($raw) > $maxLines) {
            throw new HttpException('Data tidak valid', 422, ['items' => "Maksimal $maxLines jenis barang"]);
        }

        $merged = [];
        foreach ($raw as $i => $row) {
            if (!is_array($row)) {
                throw new HttpException('Data tidak valid', 422, ["items.$i" => 'Harus berupa object']);
            }
            $line  = new self($row);
            $pid   = $line->int('product_id', 1);
            $qty   = $line->int('jumlah', 1, 10000);
            $price = $allowPrice ? $line->int('harga', 0, 2000000000, false) : null;
            try {
                $line->check();
            } catch (HttpException $e) {
                throw new HttpException('Data tidak valid', 422, ["items.$i" => $e->details]);
            }

            if (isset($merged[$pid])) {
                $merged[$pid]['jumlah'] += $qty;
                if ($merged[$pid]['jumlah'] > 10000) {
                    throw new HttpException('Data tidak valid', 422, ["items.$i" => ['jumlah' => 'Total jumlah barang melebihi 10000']]);
                }
                if ($price !== null) {
                    $merged[$pid]['harga'] = $price;
                }
            } else {
                $merged[$pid] = ['product_id' => $pid, 'jumlah' => $qty, 'harga' => $price];
            }
        }
        return array_values($merged);
    }
}
