<?php
declare(strict_types=1);

namespace App;

/** Penyusun WHERE untuk daftar barang (publik dan admin) dari v_stok_barang. */
final class ProductFilter
{
    /** @return array{0:string,1:array<string,mixed>} [klausa WHERE, parameter] */
    public static function build(bool $admin): array
    {
        $where = [];
        $args  = [];

        $aktif = $admin ? Http::query('aktif', 'true') : 'true';
        if ($aktif === 'true') {
            $where[] = 'aktif';
        } elseif ($aktif === 'false') {
            $where[] = 'NOT aktif';
        } // 'all' = tanpa filter

        $q = Http::query('q');
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(nama_barang ILIKE :q1 OR jenis_barang ILIKE :q2 OR kode_barang ILIKE :q3)';
            $args += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }

        $jenis = Http::query('jenis');
        if ($jenis !== '' && strtolower($jenis) !== 'semua') {
            $j = Jenis::normalize($jenis);
            if ($j === null) {
                throw new HttpException('Jenis barang tidak dikenal', 422);
            }
            $where[] = 'jenis_barang = :jenis';
            $args['jenis'] = $j;
        }

        $status = $admin ? Http::query('status') : '';
        if ($status !== '') {
            if (!in_array($status, ['Habis', 'Menipis', 'Tersedia'], true)) {
                throw new HttpException('Status stok harus Habis, Menipis, atau Tersedia', 422);
            }
            $where[] = 'status_stok = :status';
            $args['status'] = $status;
        }

        return [$where ? implode(' AND ', $where) : 'TRUE', $args];
    }
}
