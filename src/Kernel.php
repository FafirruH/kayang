<?php
declare(strict_types=1);

namespace App;

final class Kernel
{
    public static function run(): void
    {
        try {
            Http::cors();
            $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
            $path = self::path();

            if ($method === 'OPTIONS') {
                http_response_code(204);
                exit;
            }

            // JSON requests and the custom header on image uploads prevent simple cross-site form posts.
            if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
                $imageUpload = $method === 'POST'
                    && preg_match('#^/api/admin/products/[0-9]+/image$#D', $path) === 1;
                if ($imageUpload) {
                    if (!str_starts_with($ct, 'multipart/form-data;')) {
                        throw new HttpException('Content-Type harus multipart/form-data', 415);
                    }
                    if (($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
                        throw new HttpException('Header permintaan tidak valid', 403);
                    }
                } elseif (!str_starts_with($ct, 'application/json')) {
                    throw new HttpException('Content-Type harus application/json', 415);
                }
            }

            $router = new Router();
            (require __DIR__ . '/routes.php')($router);
            $router->dispatch($method, $path);
        } catch (HttpException $e) {
            Http::error($e->getMessage(), $e->status, $e->details);
        } catch (\PDOException $e) {
            Http::fromPdo($e);
        } catch (\Throwable $e) {
            error_log('[ERR] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            Http::error(
                (bool) Config::get('app.debug') ? $e->getMessage() : 'Terjadi kesalahan pada server',
                500
            );
        }
    }

    private static function path(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Server bawaan PHP selalu melayani dari akar; Apache bisa berada di subfolder.
        $base = PHP_SAPI === 'cli-server'
            ? ''
            : rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base));
        }
        return '/' . trim(rawurldecode($path), '/');
    }
}
