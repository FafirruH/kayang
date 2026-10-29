<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Config;
use App\Db;
use App\Http;
use App\HttpException;
use App\Input;
use App\Transactions;
use App\Wa;

/** Pesanan milik pelanggan yang sedang login (role CUSTOMER). */
final class OrderController
{
    /**
     * POST /api/orders  {"items":[{"product_id":1,"jumlah":2}]}
     * Membuat pesanan PENDING yang MENAHAN stok (fungsi buat_penjualan). Stok fisik baru
     * berkurang saat admin menandai COMPLETED setelah pembayaran. Harga dari klien diabaikan.
     */
    public static function create(array $params, ?array $user): void
    {
        $in    = new Input(Http::body());
        $items = Input::items($in->raw('items'), false);

        $json = json_encode(array_map(
            static fn(array $i): array => ['product_id' => $i['product_id'], 'jumlah' => $i['jumlah']],
            $items
        ));

        $id = (int) Db::tx(static fn() => Db::val(
            'SELECT o_id FROM buat_penjualan(
                 CAST(:staff AS integer), CAST(:items AS jsonb), CAST(:cust AS integer),
                 NULL, 0, CAST(:hours AS integer))',
            [
                'staff' => $user['id'],      // pelanggan mencatat pesanannya sendiri
                'items' => $json,
                'cust'  => $user['id'],
                'hours' => (int) Config::get('app.hold_hours', 24),
            ]
        ));

        $order = Transactions::find($id, $user['id']);
        $order['wa_url'] = Wa::url(
            (string) Config::get('app.wa_number', ''),
            Wa::orderText($order)
        );
        Http::ok($order, null, 201);
    }

    /** GET /api/orders?page= - riwayat pesanan sendiri. */
    public static function index(array $params, ?array $user): void
    {
        Transactions::refreshExpired();
        [$page, $per, $off] = Http::paging();

        $total = (int) Db::val(
            "SELECT COUNT(*) FROM v_transaksi_header WHERE customer_id = :cid AND tipe_transaksi = 'OUT'",
            ['cid' => $user['id']]
        );
        $rows = Db::all(
            "SELECT " . Transactions::COLS . "
               FROM v_transaksi_header
              WHERE customer_id = :cid AND tipe_transaksi = 'OUT'
              ORDER BY tgl_transaksi DESC
              LIMIT :lim OFFSET :off",
            ['cid' => $user['id'], 'lim' => $per, 'off' => $off]
        );
        Http::ok($rows, Http::meta($page, $per, $total));
    }

    /** GET /api/orders/{id} */
    public static function show(array $params, ?array $user): void
    {
        Transactions::refreshExpired();
        $order = Transactions::find($params['id'], $user['id']);
        if ($order === null) {
            throw new HttpException('Pesanan tidak ditemukan', 404);
        }
        Http::ok($order);
    }

    /** POST /api/orders/{id}/cancel - hanya pesanan PENDING milik sendiri. */
    public static function cancel(array $params, ?array $user): void
    {
        $n = Db::exec(
            "UPDATE transactions
                SET status = 'CANCELLED', catatan = COALESCE(catatan, 'Dibatalkan pelanggan')
              WHERE id = :id AND customer_id = :cid AND tipe_transaksi = 'OUT' AND status = 'PENDING'",
            ['id' => $params['id'], 'cid' => $user['id']]
        );
        if ($n === 0) {
            if (Transactions::find($params['id'], $user['id']) === null) {
                throw new HttpException('Pesanan tidak ditemukan', 404);
            }
            throw new HttpException('Hanya pesanan berstatus PENDING yang dapat dibatalkan', 409);
        }
        Http::ok(Transactions::find($params['id'], $user['id']));
    }
}
