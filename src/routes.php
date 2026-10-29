<?php
declare(strict_types=1);

use App\Controllers\Admin\ProductController;
use App\Controllers\Admin\ReportController;
use App\Controllers\Admin\SupplierController;
use App\Controllers\Admin\TransactionController;
use App\Controllers\Admin\UserController;
use App\Controllers\AuthController;
use App\Controllers\CatalogController;
use App\Controllers\OrderController;
use App\Router;

/*
 * $roles: null = publik | [] = harus login | ['ADMIN'] = role tertentu.
 */
return static function (Router $r): void {
    $customer = ['CUSTOMER'];
    $staff    = ['ADMIN', 'MECHANIC'];   // montir boleh melihat stok
    $admin    = ['ADMIN'];

    // ----- Publik -----
    $r->add('GET', '/api/health',     [CatalogController::class, 'health']);
    $r->add('GET', '/api/products',   [CatalogController::class, 'products']);
    $r->add('GET', '/api/categories', [CatalogController::class, 'categories']);

    // ----- Autentikasi -----
    $r->add('POST', '/api/auth/register', [AuthController::class, 'register']);
    $r->add('POST', '/api/auth/login',    [AuthController::class, 'login']);
    $r->add('POST', '/api/auth/logout',   [AuthController::class, 'logout']);
    $r->add('GET',  '/api/auth/me',       [AuthController::class, 'me'], []);

    // ----- Pelanggan -----
    $r->add('POST', '/api/orders',               [OrderController::class, 'create'], $customer);
    $r->add('GET',  '/api/orders',               [OrderController::class, 'index'],  $customer);
    $r->add('GET',  '/api/orders/{id}',          [OrderController::class, 'show'],   $customer);
    $r->add('POST', '/api/orders/{id}/cancel',   [OrderController::class, 'cancel'], $customer);

    // ----- Admin: barang & stok -----
    $r->add('GET',    '/api/admin/products',        [ProductController::class, 'index'],   $staff);
    $r->add('GET',    '/api/admin/products/{id}',   [ProductController::class, 'show'],    $staff);
    $r->add('POST',   '/api/admin/products',        [ProductController::class, 'create'],  $admin);
    $r->add('PUT',    '/api/admin/products/{id}',   [ProductController::class, 'update'],  $admin);
    $r->add('DELETE', '/api/admin/products/{id}',   [ProductController::class, 'destroy'], $admin);
    $r->add('POST',   '/api/admin/stock-adjustments', [ProductController::class, 'adjust'], $admin);

    // ----- Admin: transaksi -----
    $r->add('GET',   '/api/admin/transactions',                  [TransactionController::class, 'index'],        $admin);
    $r->add('GET',   '/api/admin/transactions/{id}',             [TransactionController::class, 'show'],         $admin);
    $r->add('POST',  '/api/admin/transactions/sales',            [TransactionController::class, 'createSale'],   $admin);
    $r->add('POST',  '/api/admin/transactions/purchases',        [TransactionController::class, 'createPurchase'], $admin);
    $r->add('PATCH', '/api/admin/transactions/{id}/status',      [TransactionController::class, 'updateStatus'], $admin);
    $r->add('GET',   '/api/admin/transactions/{id}/whatsapp',    [TransactionController::class, 'whatsapp'],     $admin);

    // ----- Admin: supplier & akun -----
    $r->add('GET',    '/api/admin/suppliers',        [SupplierController::class, 'index'],   $admin);
    $r->add('POST',   '/api/admin/suppliers',        [SupplierController::class, 'create'],  $admin);
    $r->add('PUT',    '/api/admin/suppliers/{id}',   [SupplierController::class, 'update'],  $admin);
    $r->add('DELETE', '/api/admin/suppliers/{id}',   [SupplierController::class, 'destroy'], $admin);

    $r->add('GET',   '/api/admin/users',        [UserController::class, 'index'],  $admin);
    $r->add('POST',  '/api/admin/users',        [UserController::class, 'create'], $admin);
    $r->add('PATCH', '/api/admin/users/{id}',   [UserController::class, 'update'], $admin);

    // ----- Admin: dashboard & laporan -----
    $r->add('GET', '/api/admin/dashboard',               [ReportController::class, 'dashboard'],          $admin);
    $r->add('GET', '/api/admin/reports/holds',           [ReportController::class, 'holds'],              $admin);
    $r->add('GET', '/api/admin/reports/restock',         [ReportController::class, 'restock'],            $admin);
    $r->add('GET', '/api/admin/reports/dead-stock',      [ReportController::class, 'deadStock'],          $admin);
    $r->add('GET', '/api/admin/reports/kartu-stok',      [ReportController::class, 'kartuStok'],          $admin);
    $r->add('GET', '/api/admin/reports/audit-stok',      [ReportController::class, 'auditStok'],          $admin);
    $r->add('GET', '/api/admin/reports/profit',          [ReportController::class, 'profitReport'],       $admin);
    $r->add('GET', '/api/admin/reports/top-products',    [ReportController::class, 'topProductsReport'],  $admin);
    $r->add('GET', '/api/admin/reports/by-category',     [ReportController::class, 'byCategoryReport'],   $admin);
    $r->add('GET', '/api/admin/reports/top-customers',   [ReportController::class, 'topCustomers'],       $admin);
    $r->add('GET', '/api/admin/reports/suppliers',       [ReportController::class, 'supplierRecap'],      $admin);
};
