<?php

declare(strict_types=1);

// Front controller: /api/v1 (REST), /mcp (MCP), everything else the SPA.
// The docroot is this folder (Local: junction target; all-inkl: domain docroot).

// php -S localhost:8080 -t public public/index.php: let the built-in server serve real files.
if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . parse_url((string) $_SERVER['REQUEST_URI'], PHP_URL_PATH))) {
    return false;
}

require dirname(__DIR__) . '/vendor/autoload.php';

date_default_timezone_set('UTC');

Essensplan\App::create()->run();
