<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Http\Routes;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteContext;

/**
 * Order (outermost first): JsonErrors → Slim routing → RateLimit →
 * Authenticate → RequireScope → Csrf. Routing only resolves the route, so
 * the later steps can read its entry in the Routes table.
 */
final class RouteInfo
{
    public static function def(Request $req): ?array
    {
        $route = $req->getAttribute(RouteContext::ROUTE);
        if ($route === null) {
            return null;
        }
        if (str_starts_with((string) $route->getName(), 'mcp ')) {
            return ['POST', '/mcp', [], 'mcp', null, ''];
        }
        if (str_starts_with((string) $route->getName(), 'spa ')) {
            return ['GET', '/', [], 'public', null, ''];
        }
        return Routes::byName((string) $route->getName());
    }
}
