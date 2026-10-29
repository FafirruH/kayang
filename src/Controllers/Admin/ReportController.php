<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Db;
use App\Http;
use App\HttpException;
use App\Transactions;

/** Dashboard dan laporan: memakai view serta query join/group by/having/subquery/CTE dari skema. */
final class ReportController
{
    /** GET /api/admin/dashboard - kartu statistik, transaksi terbaru, terlaris, per jenis, laba rugi. */
    public static function dashboard(array $params, ?array $user): void
    {
        Transactions::refreshExpired();

        $stats = Db::one(<<<'SQL'
            SELECT
              (SELECT COALESCE(SUM(total_bayar), 0) FROM v_transaksi_header
                WHERE tipe_transaksi = 'OUT' AND status = 'COMPLETED'
                  AND date_trunc('month', completed_at) = date_trunc('month', now()))      AS pendapatan_bulan_ini,
              (SELECT COUNT(*) FROM transactions
                WHERE tipe_transaksi = 'OUT' AND status = 'PENDING' AND expired_at > now()) AS pesanan_menahan_stok,
              (SELECT COALESCE(SUM(stok::bigint * harga_beli_default), 0)
                 FROM products WHERE aktif)                                                AS nilai_persediaan,
              (SELECT COUNT(*) FROM v_stok_barang
                WHERE aktif AND status_stok <> 'Tersedia')                                 AS barang_perlu_perhatian,
              (SELECT COUNT(*) FROM users WHERE role = 'CUSTOMER')                         AS pelanggan_terdaftar
            SQL);

        $recent = Db::all(<<<'SQL'
            SELECT transaction_id, no_faktur, tipe_transaksi, COALESCE(nama_pelanggan, nama_supplier) AS pihak,
                   tgl_transaksi::date AS tanggal, total_bayar, status
              FROM v_transaksi_header
             ORDER BY tgl_transaksi DESC
             LIMIT 5
            SQL);

        Http::ok([
            'stats'        => $stats,
            'recent'       => $recent,
            'top_products' => self::topProducts(30, 3, 5),
            'by_category'  => self::byCategory(),
            'profit'       => self::profit(6),
        ]);
    }

    /** GET /api/admin/reports/holds - pesanan yang sedang MENAHAN stok (belum bayar). */
    public static function holds(array $params, ?array $user): void
    {
        Transactions::refreshExpired();
        Http::ok(Db::all(<<<'SQL'
            SELECT h.transaction_id, h.no_faktur, h.nama_pelanggan, h.total_bayar, h.expired_at,
                   GREATEST(CAST(EXTRACT(EPOCH FROM (h.expired_at - now())) AS integer), 0) AS sisa_detik,
                   string_agg(p.nama_barang || ' x' || d.jumlah, ', ' ORDER BY p.nama_barang) AS isi_pesanan
              FROM v_transaksi_header h
              JOIN transaction_details d ON d.transaction_id = h.transaction_id
              JOIN products p            ON p.id = d.product_id
             WHERE h.tipe_transaksi = 'OUT' AND h.status = 'PENDING' AND h.expired_at > now()
             GROUP BY h.transaction_id, h.no_faktur, h.nama_pelanggan, h.total_bayar, h.expired_at
             ORDER BY h.expired_at
            SQL));
    }

    /** GET /api/admin/reports/restock - barang yang perlu dipesan ke supplier (CTE bertingkat). */
    public static function restock(array $params, ?array $user): void
    {
        Http::ok(Db::all(<<<'SQL'
            WITH penjualan_30 AS (
              SELECT d.product_id, SUM(d.jumlah) AS terjual
                FROM transaction_details d
                JOIN transactions t ON t.id = d.transaction_id
               WHERE t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED'
                 AND t.completed_at >= now() - interval '30 days'
               GROUP BY d.product_id
            ),
            po_masuk AS (
              SELECT d.product_id, SUM(d.jumlah) AS dipesan
                FROM transaction_details d
                JOIN transactions t ON t.id = d.transaction_id
               WHERE t.tipe_transaksi = 'IN' AND t.status = 'PENDING'
               GROUP BY d.product_id
            ),
            analisis AS (
              SELECT v.kode_barang, v.nama_barang, v.jenis_barang,
                     v.stok, v.tertahan, v.tersedia, v.stok_minimal, v.status_stok,
                     COALESCE(s.terjual, 0)        AS terjual_30_hari,
                     COALESCE(s.terjual, 0) / 30.0 AS rata_per_hari,
                     COALESCE(po.dipesan, 0)       AS sudah_dipesan,
                     CASE WHEN COALESCE(s.terjual, 0) = 0 THEN NULL
                          ELSE CAST(ROUND(v.tersedia / (s.terjual / 30.0), 1) AS float8)
                     END                           AS hari_tersisa
                FROM v_stok_barang v
                LEFT JOIN penjualan_30 s ON s.product_id  = v.product_id
                LEFT JOIN po_masuk    po ON po.product_id = v.product_id
               WHERE v.aktif
            )
            SELECT kode_barang, nama_barang, jenis_barang, stok, tertahan, tersedia, status_stok,
                   terjual_30_hari, hari_tersisa, sudah_dipesan,
                   GREATEST(CEIL(rata_per_hari * 30)::integer + stok_minimal - tersedia - sudah_dipesan, 0) AS saran_beli
              FROM analisis
             WHERE status_stok <> 'Tersedia' OR hari_tersisa < 14
             ORDER BY (status_stok = 'Habis') DESC, hari_tersisa NULLS LAST, nama_barang
            SQL));
    }

    /** GET /api/admin/reports/dead-stock - barang bermodal tertahan yang belum pernah terjual (NOT EXISTS). */
    public static function deadStock(array $params, ?array $user): void
    {
        Http::ok(Db::all(<<<'SQL'
            SELECT v.kode_barang, v.nama_barang, v.stok, v.stok * v.harga_beli AS nilai_modal_mengendap
              FROM v_stok_barang v
             WHERE v.aktif AND v.stok > 0
               AND NOT EXISTS (
                     SELECT 1
                       FROM transaction_details d
                       JOIN transactions t ON t.id = d.transaction_id
                      WHERE d.product_id = v.product_id
                        AND t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED')
             ORDER BY nilai_modal_mengendap DESC
            SQL));
    }

    /** GET /api/admin/reports/kartu-stok?product_id=1&limit=50 - riwayat keluar-masuk satu barang. */
    public static function kartuStok(array $params, ?array $user): void
    {
        $pid = Http::intQuery('product_id', 0, 0, 2000000000);
        if ($pid === 0) {
            throw new HttpException('Parameter product_id wajib diisi', 422);
        }
        $limit = Http::intQuery('limit', 50, 1, 200);
        Http::ok(Db::all(
            'SELECT waktu, no_faktur, tipe_transaksi, stok_awal, perubahan, stok_akhir, catatan
               FROM v_kartu_stok
              WHERE product_id = :id
              ORDER BY waktu DESC
              LIMIT :lim',
            ['id' => $pid, 'lim' => $limit]
        ));
    }

    /** GET /api/admin/reports/audit-stok - stok tercatat harus sama dengan jumlah riwayat (hasil benar: kosong). */
    public static function auditStok(array $params, ?array $user): void
    {
        Http::ok(Db::all(<<<'SQL'
            SELECT p.kode_barang, p.stok AS stok_tercatat,
                   COALESCE(SUM(k.perubahan), 0)          AS stok_dari_riwayat,
                   p.stok - COALESCE(SUM(k.perubahan), 0) AS selisih
              FROM products p
              LEFT JOIN v_kartu_stok k ON k.product_id = p.id
             GROUP BY p.id
            HAVING p.stok <> COALESCE(SUM(k.perubahan), 0)
            SQL));
    }

    /** GET /api/admin/reports/profit?bulan=6 - laba rugi bulanan. */
    public static function profitReport(array $params, ?array $user): void
    {
        Http::ok(self::profit(Http::intQuery('bulan', 6, 1, 36)));
    }

    /** GET /api/admin/reports/top-products?hari=30&min=3&limit=5 */
    public static function topProductsReport(array $params, ?array $user): void
    {
        Http::ok(self::topProducts(
            Http::intQuery('hari', 30, 1, 365),
            Http::intQuery('min', 3, 1, 100000),
            Http::intQuery('limit', 5, 1, 50)
        ));
    }

    /** GET /api/admin/reports/by-category */
    public static function byCategoryReport(array $params, ?array $user): void
    {
        Http::ok(self::byCategory());
    }

    /** GET /api/admin/reports/top-customers - belanja di atas rata-rata (CTE + subquery). */
    public static function topCustomers(array $params, ?array $user): void
    {
        Http::ok(Db::all(<<<'SQL'
            WITH belanja AS (
              SELECT customer_id, nama_pelanggan,
                     COUNT(*)         AS jumlah_transaksi,
                     SUM(total_bayar) AS total_belanja
                FROM v_transaksi_header
               WHERE tipe_transaksi = 'OUT' AND status = 'COMPLETED' AND customer_id IS NOT NULL
               GROUP BY customer_id, nama_pelanggan
            )
            SELECT customer_id, nama_pelanggan, jumlah_transaksi, total_belanja
              FROM belanja
             WHERE total_belanja > (SELECT AVG(total_belanja) FROM belanja)
             ORDER BY total_belanja DESC
            SQL));
    }

    /** GET /api/admin/reports/suppliers?min=1000000 - rekap pembelian per supplier. */
    public static function supplierRecap(array $params, ?array $user): void
    {
        Http::ok(Db::all(
            "SELECT s.id AS supplier_id, s.nama_supplier,
                    COUNT(DISTINCT t.id) AS jumlah_pembelian,
                    SUM(d.jumlah)        AS unit_dibeli,
                    SUM(d.subtotal)      AS total_pembelian
               FROM suppliers s
               JOIN transactions t        ON t.supplier_id = s.id
                                         AND t.tipe_transaksi = 'IN' AND t.status = 'COMPLETED'
               JOIN transaction_details d ON d.transaction_id = t.id
              GROUP BY s.id
             HAVING SUM(d.subtotal) >= :min
              ORDER BY total_pembelian DESC",
            ['min' => Http::intQuery('min', 1000000, 0, 2000000000)]
        ));
    }

    // ---------- query bersama ----------

    private static function topProducts(int $days, int $min, int $limit): array
    {
        return Db::all(
            "SELECT p.kode_barang, p.nama_barang, p.jenis_barang,
                    SUM(d.jumlah)   AS terjual,
                    SUM(d.subtotal) AS omzet,
                    SUM(d.jumlah * (d.harga_satuan_real - d.harga_modal)) AS laba_kotor
               FROM transaction_details d
               JOIN transactions t ON t.id = d.transaction_id
               JOIN products     p ON p.id = d.product_id
              WHERE t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED'
                AND t.completed_at >= now() - make_interval(days => CAST(:hari AS integer))
              GROUP BY p.id
             HAVING SUM(d.jumlah) >= :min
              ORDER BY terjual DESC, omzet DESC
              LIMIT :lim",
            ['hari' => $days, 'min' => $min, 'lim' => $limit]
        );
    }

    private static function byCategory(): array
    {
        return Db::all(<<<'SQL'
            SELECT p.jenis_barang,
                   COUNT(DISTINCT t.id) AS jumlah_transaksi,
                   SUM(d.jumlah)        AS unit_terjual,
                   SUM(d.subtotal)      AS omzet
              FROM products p
              JOIN transaction_details d ON d.product_id = p.id
              JOIN transactions t        ON t.id = d.transaction_id
             WHERE t.tipe_transaksi = 'OUT' AND t.status = 'COMPLETED'
             GROUP BY p.jenis_barang
            HAVING SUM(d.subtotal) >= 100000
             ORDER BY omzet DESC
            SQL);
    }

    private static function profit(int $months): array
    {
        return Db::all(
            "SELECT to_char(bulan, 'YYYY-MM') AS bulan, total_transaksi, penjualan_kotor, total_diskon,
                    pendapatan_bersih, total_modal, laba_kotor
               FROM v_laporan_laba_rugi
              ORDER BY v_laporan_laba_rugi.bulan DESC
              LIMIT :lim",
            ['lim' => $months]
        );
    }
}
