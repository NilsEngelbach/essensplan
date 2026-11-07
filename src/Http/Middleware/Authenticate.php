<?php

declare(strict_types=1);

namespace Essensplan\Http\Middleware;

use Essensplan\Config;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Http\Principal;
use Essensplan\Service\ApiKeyService;
use Essensplan\Service\AuthService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;

/** Session cookie or Bearer key → `principal` attribute. */
final class Authenticate implements MiddlewareInterface
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly ApiKeyService $keys,
        private readonly Config $config,
    ) {
    }

    public static function bearer(Request $req): ?string
    {
        $h = $req->getHeaderLine('Authorization');
        if ($h === '') {
            // Apache without the .htaccess rewrite drops the header; some setups keep it here.
            $h = (string) ($req->getServerParams()['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        }
        return preg_match('/^Bearer\s+(\S+)$/i', $h, $m) ? $m[1] : null;
    }

    public function process(Request $req, Handler $handler): Response
    {
        $def = RouteInfo::def($req);
        $auth = $def[3] ?? 'public';
        if ($auth === 'public') {
            return $handler->handle($req);
        }
        $bearer = self::bearer($req);
        if ($bearer !== null) {
            if (in_array($auth, ['guest', 'session'], true)) {
                throw new ApiError(403, 'session_required', 'Das geht nur in der App, nicht mit einem API-Schlüssel.');
            }
            $key = $this->keys->authenticate($bearer, Io::ip($req, $this->config));
            if ($key === null) {
                throw new ApiError(401, 'invalid_key', 'Dieser API-Schlüssel ist ungültig, abgelaufen oder widerrufen.', [], ['WWW-Authenticate' => 'Bearer error="invalid_token"']);
            }
            return $handler->handle($req->withAttribute('principal', Principal::forKey($key, $auth === 'mcp' ? 'mcp' : 'api')));
        }
        if ($auth === 'mcp') {
            throw ApiError::unauthenticated();
        }
        $session = $this->auth->sessionForToken((string) ($req->getCookieParams()[Io::COOKIE] ?? ''));
        if ($session === null) {
            if ($auth === 'guest') {
                return $handler->handle($req);
            }
            throw ApiError::unauthenticated();
        }
        $resend = $this->auth->touch($session);
        $res = $handler->handle($req->withAttribute('principal', Principal::forSession($session)));
        if ($resend && !$res->hasHeader('Set-Cookie')) {
            $res = Io::withSessionCookie($res, $this->config, (string) $req->getCookieParams()[Io::COOKIE], true);
        }
        return $res;
    }
}
