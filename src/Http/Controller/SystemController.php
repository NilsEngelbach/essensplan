<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Domain\Catalog;
use Essensplan\Domain\Shopping;
use Essensplan\Http\Io;
use Essensplan\Http\OpenApi;
use Essensplan\Service\AuthService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class SystemController
{
    public function __construct(private readonly Db $db, private readonly Clock $clock, private readonly Config $config)
    {
    }

    public function health(Request $req, Response $res): Response
    {
        try {
            $db = $this->db->value('SELECT 1') == 1 ? 'ok' : 'down';
        } catch (\Throwable) {
            $db = 'down';
        }
        return Io::json($res, ['status' => $db === 'ok' ? 'ok' : 'degraded', 'db' => $db, 'time' => $this->clock->now()->format(DATE_ATOM), 'php' => PHP_VERSION], $db === 'ok' ? 200 : 503);
    }

    public function config(Request $req, Response $res): Response
    {
        $slots = [];
        foreach (Catalog::SLOTS as $key => $s) {
            $slots[] = ['key' => $key, 'name' => $s['name'], 'short' => $s['short']];
        }
        return Io::json($res, [
            'registrationEnabled' => $this->config->bool('REGISTRATION_ENABLED'),
            'minPassword' => AuthService::MIN_PASSWORD,
            'slots' => $slots,
            'categories' => Catalog::CATEGORIES,
            'tags' => Catalog::TAGS,
            'difficulties' => Catalog::DIFFICULTIES,
            'scopes' => Catalog::SCOPES,
            'sections' => Shopping::SECTIONS,
            'presets' => Catalog::PRESETS,
        ]);
    }

    public function openapi(Request $req, Response $res): Response
    {
        return Io::json($res, OpenApi::document($this->config))->withHeader('Cache-Control', 'public, max-age=300');
    }
}
