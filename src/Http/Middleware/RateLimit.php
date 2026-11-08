<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Config;
use Essensplan\Http\Io;
use Essensplan\Service\RateLimiter;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Per key (Bearer) or per IP, before anything else touches the database. */
final class RateLimit implements MiddlewareInterface
{
    public function __construct(private readonly RateLimiter $limiter, private readonly Config $config)
    {
    }

    public function process(Request $req, Handler $handler): Response
    {
        $def = RouteInfo::def($req);
        // Photos are exempt: a recipe list loads dozens at once, and each needs a session anyway.
        if ($def !== null && !in_array($def[3], ['public', 'media'], true)) {
            $bearer = Authenticate::bearer($req);
            if ($bearer !== null) {
                $this->limiter->hit('key:' . substr(hash('sha256', $bearer), 0, 32), $this->config->int('RATE_LIMIT_KEY', 120), 60);
            } else {
                $this->limiter->hit('ip:' . Io::ip($req, $this->config), $this->config->int('RATE_LIMIT_IP', 300), 60);
            }
        }
        return $handler->handle($req);
    }
}
