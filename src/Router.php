<?php
declare(strict_types=1);

namespace App;

final class Router
{
    /** @var list<array{0:string,1:string,2:array|\Closure,3:?array}> */
    private array $routes = [];

    /**
     * @param ?array $roles null = publik; [] = semua yang sudah login; ['ADMIN', ...] = role tertentu
     */
    public function add(string $method, string $pattern, array|\Closure $handler, ?array $roles = null): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[0-9]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler, $roles];
    }

    public function dispatch(string $method, string $path): void
    {
        $allowed = [];
        foreach ($this->routes as [$m, $regex, $handler, $roles]) {
            if (!preg_match($regex, $path, $matches)) {
                continue;
            }
            if ($m !== $method) {
                $allowed[] = $m;
                continue;
            }
            $params = [];
            foreach ($matches as $k => $v) {
                if (is_string($k)) {
                    $params[$k] = (int) $v;
                }
            }
            $user = $roles === null ? null : Auth::guard($roles);
            $handler($params, $user);
            return;
        }
        if ($allowed) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            throw new HttpException('Metode tidak diizinkan', 405);
        }
        throw new HttpException('Endpoint tidak ditemukan', 404);
    }
}
