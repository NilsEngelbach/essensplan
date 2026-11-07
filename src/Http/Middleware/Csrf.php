<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Unsafe requests with a session need the X-CSRF-Token header of that session. */
final class Csrf implements MiddlewareInterface
{
    public function process(Request $req, Handler $handler): Response
    {
        $p = $req->getAttribute('principal');
        if ($p instanceof Principal && $p->session !== null && !in_array($req->getMethod(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            if (!hash_equals((string) $p->session['csrf_token'], $req->getHeaderLine('X-CSRF-Token'))) {
                throw new ApiError(403, 'csrf_failed', 'Die Sitzung ist abgelaufen. Lade die Seite neu.');
            }
        }
        return $handler->handle($req);
    }
}
