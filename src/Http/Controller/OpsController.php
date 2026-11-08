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
 * The operator's door on hosts without SSH (all-inkl), used by deploy.sh:
 *   POST /ops/migrate · POST /ops/check · POST /ops/console {command, args}
 * with header X-Ops-Token: <OPS_TOKEN>, and GET /cron?token=<CRON_TOKEN> for
 * the hosting's cron. A missing or short token switches the door off; a
 * wrong one answers 404 like an unknown path and counts against the IP.
 * Plain-text answers, one line per output line.
 */
final class OpsController
{
    private const MIN_TOKEN = 32;

    public function __construct(
        private readonly ContainerInterface $c,
        private readonly Config $config,
        private readonly RateLimiter $limiter,
    ) {
    }

    public function ops(Request $req, Response $res, array $args): Response
    {
        $this->guard($req, 'OPS_TOKEN', $req->getHeaderLine('X-Ops-Token'));
        $action = Io::arg($args, 'action');
        [$command, $opts] = match ($action) {
            'migrate' => ['migrate', []],
            'check' => ['check', []],
            'console' => $this->consoleCommand($req),
            default => throw new ApiError(404, 'not_found', 'Diese Adresse gibt es nicht.'),
        };
        return $this->run($res, $command, $opts);
    }

    public function cron(Request $req, Response $res): Response
    {
        $this->guard($req, 'CRON_TOKEN', (string) ($req->getQueryParams()['token'] ?? ''));
        return $this->run($res, 'cron', []);
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function consoleCommand(Request $req): array
    {
        $body = Io::body($req);
        $command = is_string($body['command'] ?? null) ? $body['command'] : '';
        if (!in_array($command, Console::HTTP_COMMANDS, true)) {
            throw new ApiError(400, 'command_not_allowed', "Über HTTP gehen nur: " . implode(', ', Console::HTTP_COMMANDS) . '. Den Rest mit bin/console auf einem Rechner mit Zugriff auf die Datenbank.');
        }
        $args = array_values(array_filter(is_array($body['args'] ?? null) ? $body['args'] : [], 'is_string'));
        return [$command, Console::parse($args)];
    }

    private function run(Response $res, string $command, array $opts): Response
    {
        @set_time_limit(300);
        $lines = [];
        $status = 200;
        try {
            (new Console($this->c, $this->config))->run($command, $opts, function (string $s) use (&$lines) {
                $lines[] = $s;
            });
        } catch (ConsoleError | ApiError $e) {
            $status = 400;
            $lines[] = 'FEHLER: ' . $e->getMessage();
        } catch (\Throwable $e) {
            error_log('[essensplan] ops ' . $command . ': ' . $e::class . ': ' . $e->getMessage());
            $status = 500;
            $lines[] = 'FEHLER: ' . $e::class . ': ' . $e->getMessage();
        }
        $res->getBody()->write(implode("\n", $lines) . "\n");
        return $res->withStatus($status)->withHeader('Content-Type', 'text/plain; charset=utf-8')->withHeader('Cache-Control', 'no-store');
    }

    private function guard(Request $req, string $env, string $given): void
    {
        $token = $this->config->get($env);
        $bucket = 'ops:' . Io::ip($req, $this->config);
        $this->limited(fn () => $this->limiter->check($bucket, 10));
        if (strlen($token) < self::MIN_TOKEN || !hash_equals($token, $given)) {
            if ($given !== '') {
                $this->limited(fn () => $this->limiter->add($bucket, 600));
            }
            throw new ApiError(404, 'not_found', 'Diese Adresse gibt es nicht.');
        }
    }

    /** Before the first migration there is no rate_limits table; the very first migrate must still get through. */
    private function limited(callable $fn): void
    {
        try {
            $fn();
        } catch (\PDOException $e) {
            if (!str_contains($e->getMessage(), '1146')) {
                throw $e;
            }
        }
    }
}
