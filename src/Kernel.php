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

            if ($method === 'OPTIONS') {
                http_response_code(204);
                exit;
            }

            // Perlindungan CSRF: permintaan yang mengubah data wajib bertipe JSON.
            // Dari situs lain, ini memicu preflight CORS yang ditolak (kecuali origin diizinkan).
            if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                $ct = strtolower($_SERVER['CONTENT_TYPE'] ?? '');
                if (!str_starts_with($ct, 'application/json')) {
                    throw new HttpException('Content-Type harus application/json', 415);
                }
            }

            $router = new Router();
            (require __DIR__ . '/routes.php')($router);
            $router->dispatch($method, self::path());
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
