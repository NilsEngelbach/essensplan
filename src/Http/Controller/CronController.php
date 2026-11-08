<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Config;
use Essensplan\Console\Console;
use Essensplan\Console\ConsoleError;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Service\RateLimiter;
use Psr\Container\ContainerInterface;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * GET /cron?token=<CRON_TOKEN> for the hosting's URL cron (all-inkl): runs `bin/console cron`
 * (import jobs nobody picked up, then purge). A missing or short token switches it off; a wrong
 * one answers 404 like an unknown path and counts against the IP. Plain-text answer.
 */
final class CronController
{
    private const MIN_TOKEN = 32;

    public function __construct(
        private readonly ContainerInterface $c,
        private readonly Config $config,
        private readonly RateLimiter $limiter,
    ) {
    }

    public function cron(Request $req, Response $res): Response
    {
        $this->guard($req, (string) ($req->getQueryParams()['token'] ?? ''));
        @set_time_limit(300);
        $lines = [];
        $status = 200;
        try {
            (new Console($this->c, $this->config))->run('cron', [], function (string $s) use (&$lines) {
                $lines[] = $s;
            });
        } catch (ConsoleError | ApiError $e) {
            $status = 400;
            $lines[] = 'FEHLER: ' . $e->getMessage();
        } catch (\Throwable $e) {
            error_log('[essensplan] cron: ' . $e::class . ': ' . $e->getMessage());
            $status = 500;
            $lines[] = 'FEHLER: ' . $e::class . ': ' . $e->getMessage();
        }
        $res->getBody()->write(implode("\n", $lines) . "\n");
        return $res->withStatus($status)->withHeader('Content-Type', 'text/plain; charset=utf-8')->withHeader('Cache-Control', 'no-store');
    }

    private function guard(Request $req, string $given): void
    {
        $token = $this->config->get('CRON_TOKEN');
        $bucket = 'cron:' . Io::ip($req, $this->config);
        $this->limiter->check($bucket, 10);
        if (strlen($token) < self::MIN_TOKEN || !hash_equals($token, $given)) {
            if ($given !== '') {
                $this->limiter->add($bucket, 600);
            }
            throw new ApiError(404, 'not_found', 'Diese Adresse gibt es nicht.');
        }
    }
}
