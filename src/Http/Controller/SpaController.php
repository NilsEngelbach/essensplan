<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Http\ApiError;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Everything outside /api/v1 and /mcp: the React SPA from public/app.
 * Built assets (Vite base /app/) are normally served by nginx/Apache as plain
 * files; this serves them too when a request reaches PHP (php -S).
 */
final class SpaController
{
    private const TYPES = [
        'js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml', 'png' => 'image/png',
        'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'ico' => 'image/x-icon', 'json' => 'application/json',
        'webmanifest' => 'application/manifest+json', 'woff2' => 'font/woff2', 'txt' => 'text/plain',
    ];

    public function __construct(private readonly string $appDir)
    {
    }

    public function __invoke(Request $req, Response $res): Response
    {
        $path = rawurldecode($req->getUri()->getPath());
        if (str_starts_with($path, '/api/')) {
            throw new ApiError(404, 'not_found', 'Diese Adresse gibt es nicht.');
        }
        $file = realpath($this->appDir . '/' . ltrim($path, '/'));
        $root = realpath($this->appDir);
        if ($root !== false && $file !== false && is_file($file) && str_starts_with($file, $root . DIRECTORY_SEPARATOR)) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (isset(self::TYPES[$ext])) {
                $res->getBody()->write((string) file_get_contents($file));
                $cache = str_contains($path, '/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
                return $res->withHeader('Content-Type', self::TYPES[$ext])->withHeader('Cache-Control', $cache);
            }
        }
        $index = $this->appDir . '/index.html';
        if (!is_file($index)) {
            $res->getBody()->write('<!doctype html><meta charset="utf-8"><title>Essensplan</title><p>Das Frontend ist noch nicht gebaut (cd frontend &amp;&amp; npm run build).</p>');
            return $res->withHeader('Content-Type', 'text/html; charset=utf-8');
        }
        $res->getBody()->write((string) file_get_contents($index));
        return $res->withHeader('Content-Type', 'text/html; charset=utf-8')->withHeader('Cache-Control', 'no-cache');
    }
}
