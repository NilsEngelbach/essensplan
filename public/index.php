<?php

declare(strict_types=1);

// Front controller: /api/v1 (REST), /mcp (MCP), /media (photos), /ops + /cron (operator), everything else the SPA.
// The docroot is this folder (Local: junction target; all-inkl: domain docroot).

// php -S localhost:8080 -t public public/index.php: let the built-in server serve real files.
if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    return false;
}

// deploy.sh puts ../.maintenance in place while it uploads code and migrates. Checked before
// anything is loaded, so a half-uploaded vendor/ never runs. /ops/ stays open for the migration.
$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
if (is_file(dirname(__DIR__) . '/.maintenance') && !str_starts_with($path, '/ops/')) {
    http_response_code(503);
    header('Retry-After: 30');
    header('Cache-Control: no-store');
    $text = 'Essensplan wird gerade aktualisiert. Versuch es in einer Minute noch einmal.';
    if (str_starts_with($path, '/api/') || str_starts_with($path, '/mcp') || str_starts_with($path, '/media/')) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => ['code' => 'maintenance', 'message' => $text]], JSON_UNESCAPED_UNICODE);
    } else {
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            . '<meta http-equiv="refresh" content="30"><title>Essensplan</title>'
            . '<style>body{font:17px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f4ef;color:#1f1d1a}'
            . '@media (prefers-color-scheme:dark){body{background:#151412;color:#ece8e0}}p{max-width:32ch;padding:0 16px;text-align:center}</style>'
            . "<p>$text</p>";
    }
    return;
}

require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set('UTC');

$container = Essensplan\App::container();
Essensplan\App::create($container)->run();
// AI imports keep working after the answer went out (PHP-FPM only, see AfterResponse).
$container->get(Essensplan\Http\AfterResponse::class)->run();
