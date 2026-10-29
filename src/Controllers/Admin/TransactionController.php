<?php
declare(strict_types=1);

namespace App\Controllers\Admin;

use App\Config;
use App\Db;
use App\Http;
use App\HttpException;
use App\Input;
use App\Transactions;
use App\Wa;

/** Transaksi: daftar, penjualan (menahan stok), barang masuk, dan perubahan status. */
final class TransactionController
{
    private const TIPE = ['IN', 'OUT', 'ADJ_IN', 'ADJ_OUT'];
    private const STATUS = ['PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED'];

    /** GET /api/admin/transactions?tipe=&status=&q=&from=YYYY-MM-DD&to=YYYY-MM-DD */
    public static function index(array $params, ?array $user): void
    {
        Transactions::refreshExpired();
        [$page, $per, $off] = Http::paging();

        $where = [];
        $args  = [];

        $tipe = Http::query('tipe');
        if ($tipe !== '') {
            if (!in_array($tipe, self::TIPE, true)) {
                throw new HttpException('Tipe transaksi tidak valid', 422);
            }
            $where[] = 'tipe_transaksi = :tipe';
            $args['tipe'] = $tipe;
        }
        $status = Http::query('status');
        if ($status !== '') {
            if (!in_array($status, self::STATUS, true)) {
                throw new HttpException('Status tidak valid', 422);
            }
            $where[] = 'status = :status';
            $args['status'] = $status;
        }
        $q = Http::query('q');
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(no_faktur ILIKE :q1 OR nama_pelanggan ILIKE :q2 OR nama_supplier ILIKE :q3)';
            $args += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        foreach (['from' => '>= CAST(:from AS date)', 'to' => '< CAST(:to AS date) + 1'] as $k => $cond) {
            $d = Http::query($k);
            if ($d !== '') {
                if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                    throw new HttpException("Parameter $k harus berformat YYYY-MM-DD", 422);
                }
                $where[] = "tgl_transaksi $cond";
                $args[$k] = $d;
            }
        }
        $w = $where ? implode(' AND ', $where) : 'TRUE';

        $total = (int) Db::val("SELECT COUNT(*) FROM v_transaksi_header WHERE $w", $args);
        $rows  = Db::all(
            'SELECT ' . Transactions::COLS . " FROM v_transaksi_header WHERE $w
              ORDER BY tgl_transaksi DESC LIMIT :lim OFFSET :off",
            $args + ['lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** GET /api/admin/transactions/{id} */
    public static function show(array $params, ?array $user): void
    {
        Transactions::refreshExpired();
        $t = Transactions::find($params['id']);
        if ($t === null) {
            throw new HttpException('Transaksi tidak ditemukan', 404);
        }
        Http::ok($t);
    }

    /**
     * POST /api/admin/transactions/sales
     * {"customer_id":4 | "nama_pelanggan":"Pak Darmo", "items":[{"product_id":1,"jumlah":2,"harga":50000}],
     *  "diskon":0, "jam_tahan":24}
     * Membuat penjualan PENDING yang menahan stok. "harga" = harga kesepakatan (opsional).
     */
    public static function createSale(array $params, ?array $user): void
    {
        $in   = new Input(Http::body());
        $cust = $in->int('customer_id', 1, 2000000000, false);
        $nama = $in->str('nama_pelanggan', 2, 100, false);
        $disk = $in->int('diskon', 0, 2000000000, false) ?? 0;
        $jam  = $in->int('jam_tahan', 1, 168, false) ?? (int) Config::get('app.hold_hours', 24);
        if (($cust === null) === ($nama === null)) {
            $in->error('customer_id', 'Isi salah satu: customer_id (pelanggan terdaftar) atau nama_pelanggan (pembeli umum)');
        }
        $in->check();
        $items = Input::items($in->raw('items'), true);

        if ($cust !== null) {
            $ok = Db::val("SELECT 1 FROM users WHERE id = :id AND role = 'CUSTOMER' AND aktif", ['id' => $cust]);
            if ($ok === null) {
                throw new HttpException('Data tidak valid', 422, ['customer_id' => 'Pelanggan tidak ditemukan']);
            }
        }

        $json = json_encode(array_map(
            static fn(array $i): array => array_filter(
                ['product_id' => $i['product_id'], 'jumlah' => $i['jumlah'], 'harga' => $i['harga']],
                static fn($x) => $x !== null
            ),
            $items
        ));

        $id = (int) Db::tx(static fn() => Db::val(
            'SELECT o_id FROM buat_penjualan(
                 CAST(:staff AS integer), CAST(:items AS jsonb), CAST(:cust AS integer),
                 CAST(:nama AS text), CAST(:disk AS integer), CAST(:jam AS integer))',
            ['staff' => $user['id'], 'items' => $json, 'cust' => $cust, 'nama' => $nama, 'disk' => $disk, 'jam' => $jam]
        ));
        Http::ok(Transactions::find($id), null, 201);
    }

    /**
     * POST /api/admin/transactions/purchases
     * {"supplier_id":1,"no_referensi":"SJ-001","catatan":"...","items":[{"product_id":1,"jumlah":20,"harga":46000}]}
     * Membuat pesanan ke supplier (PENDING). Stok bertambah saat diubah ke COMPLETED (barang diterima).
     */
    public static function createPurchase(array $params, ?array $user): void
    {
        $in  = new Input(Http::body());
        $sup = $in->int('supplier_id', 1);
        $ref = $in->str('no_referensi', 1, 50, false);
        $cat = $in->str('catatan', 1, 500, false);
        $in->check();
        $items = Input::items($in->raw('items'), true);

        if (Db::val('SELECT 1 FROM suppliers WHERE id = :id AND aktif', ['id' => $sup]) === null) {
            throw new HttpException('Data tidak valid', 422, ['supplier_id' => 'Supplier tidak ditemukan']);
        }

        $id = (int) Db::tx(static function () use ($user, $sup, $ref, $cat, $items) {
            $id = (int) Db::val(
                "INSERT INTO transactions (tipe_transaksi, supplier_id, dicatat_oleh, no_referensi, catatan)
                 VALUES ('IN', :s, :u, :r, :c) RETURNING id",
                ['s' => $sup, 'u' => $user['id'], 'r' => $ref, 'c' => $cat]
            );
            foreach ($items as $i) {
                Db::exec(
                    'INSERT INTO transaction_details (transaction_id, product_id, jumlah, harga_satuan_real)
                     VALUES (:t, :p, :j, :h)',
                    ['t' => $id, 'p' => $i['product_id'], 'j' => $i['jumlah'], 'h' => $i['harga']]
                );
            }
            return $id;
        });
        Http::ok(Transactions::find($id), null, 201);
    }

    /**
     * PATCH /api/admin/transactions/{id}/status
     * {"status":"COMPLETED","metode_bayar":"TUNAI","diskon":5000}  atau  {"status":"CANCELLED","catatan":"..."}
     * COMPLETED = dibayar & barang diserahkan/diterima -> stok fisik berubah (trigger di database).
     */
    public static function updateStatus(array $params, ?array $user): void
    {
        $in      = new Input(Http::body());
        $status  = $in->enum('status', ['COMPLETED', 'CANCELLED']);
        $metode  = $in->enum('metode_bayar', ['TUNAI', 'TRANSFER', 'QRIS'], false);
        $diskon  = $in->int('diskon', 0, 2000000000, false);
        $catatan = $in->str('catatan', 1, 500, false);
        $in->check();

        $t = Db::one('SELECT tipe_transaksi, status FROM transactions WHERE id = :id', ['id' => $params['id']]);
        if ($t === null) {
            throw new HttpException('Transaksi tidak ditemukan', 404);
        }
        if ($t['status'] !== 'PENDING') {
            throw new HttpException('Transaksi sudah ' . $t['status'] . ' dan tidak bisa diubah lagi', 409);
        }
        if ($status === 'COMPLETED' && in_array($t['tipe_transaksi'], ['IN', 'OUT'], true) && $metode === null) {
            throw new HttpException('Data tidak valid', 422, ['metode_bayar' => 'Wajib diisi saat transaksi diselesaikan']);
        }

        $n = Db::exec(
            "UPDATE transactions
                SET status       = :s,
                    metode_bayar = COALESCE(CAST(:m AS varchar), metode_bayar),
                    diskon       = COALESCE(CAST(:d AS integer), diskon),
                    catatan      = COALESCE(CAST(:c AS text), catatan)
              WHERE id = :id AND status = 'PENDING'",
            ['s' => $status, 'm' => $metode, 'd' => $diskon, 'c' => $catatan, 'id' => $params['id']]
        );
        if ($n === 0) {
            throw new HttpException('Status transaksi baru saja berubah, muat ulang data', 409);
        }
        Http::ok(Transactions::find($params['id']));
    }

    /** GET /api/admin/transactions/{id}/whatsapp - teks & tautan WhatsApp ke pelanggan (hanya penjualan). */
    public static function whatsapp(array $params, ?array $user): void
    {
        $t = Transactions::find($params['id']);
        if ($t === null) {
            throw new HttpException('Transaksi tidak ditemukan', 404);
        }
        if ($t['tipe_transaksi'] !== 'OUT') {
            throw new HttpException('Hanya tersedia untuk transaksi penjualan', 422);
        }
        $phone = Db::val(
            'SELECT u.no_telepon FROM transactions t JOIN users u ON u.id = t.customer_id WHERE t.id = :id',
            ['id' => $params['id']]
        );
        $text   = Wa::orderText($t);
        $digits = $phone !== null ? Wa::normalizePhone((string) $phone) : null;
        Http::ok(['text' => $text, 'url' => $digits !== null ? Wa::url($digits, $text) : null]);
    }
}
