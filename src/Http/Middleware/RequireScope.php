<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Keys may only do what their scopes allow (write implies read, D18). */
final class RequireScope implements MiddlewareInterface
{
    public function process(Request $req, Handler $handler): Response
    {
        $def = RouteInfo::def($req);
        $p = $req->getAttribute('principal');
        $scope = $def[3] ?? 'public';
        if ($p instanceof Principal && $p->isKey() && str_contains($scope, ':') && !$p->can($scope)) {
            throw new ApiError(403, 'forbidden_scope', "Diesem Schlüssel fehlt das Recht $scope.");
        }
        return $handler->handle($req);
    }
}
