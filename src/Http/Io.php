<?php

declare(strict_types=1);

namespace Essensplan\Http;

use Essensplan\Config;
use Essensplan\Schema\Schemas;
use Essensplan\Util;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Request/response helpers shared by the controllers. */
final class Io
{
    public const COOKIE = 'esp_session';

    /**
     * The JSON body, validated against a named schema.
     *
     * @return array<string, mixed>
     */
    public static function body(Request $req, ?string $schema = null): array
    {
        $raw = (string) $req->getBody();
        if (trim($raw) === '') {
            $raw = '{}';
        } elseif (!str_contains(strtolower($req->getHeaderLine('Content-Type')), 'application/json')) {
            throw new ApiError(415, 'unsupported_media_type', 'Bitte schick JSON.');
        }
        try {
            $data = json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw ApiError::badRequest('Die Anfrage ist kein gültiges JSON.');
        }
        if (!$data instanceof \stdClass) {
            throw ApiError::badRequest('Erwartet wird ein JSON-Objekt.');
        }
        if ($schema !== null) {
            Schemas::validate($schema, $data);
        }
        return json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
    }

    public static function json(Response $res, mixed $data, int $status = 200): Response
    {
        $res->getBody()->write(Util::json($data));
        return $res->withStatus($status)->withHeader('Content-Type', 'application/json; charset=utf-8')->withHeader('Cache-Control', 'no-store');
    }

    public static function noContent(Response $res): Response
    {
        return $res->withStatus(204)->withHeader('Cache-Control', 'no-store');
    }

    public static function principal(Request $req): Principal
    {
        return $req->getAttribute('principal') ?? throw ApiError::unauthenticated();
    }

    /** Client IP; X-Forwarded-For only from TRUSTED_PROXIES. */
    public static function ip(Request $req, Config $config): ?string
    {
        $remote = $req->getServerParams()['REMOTE_ADDR'] ?? null;
        $trusted = array_filter(array_map('trim', explode(',', $config->get('TRUSTED_PROXIES'))));
        if ($remote !== null && in_array($remote, $trusted, true)) {
            $fwd = trim(explode(',', $req->getHeaderLine('X-Forwarded-For'))[0]);
            if (filter_var($fwd, FILTER_VALIDATE_IP)) {
                return $fwd;
            }
        }
        return $remote;
    }

    public static function userAgent(Request $req): string
    {
        return $req->getHeaderLine('User-Agent');
    }

    /** Persistent cookie when remembered (rolling year), else a browser-session cookie. */
    public static function withSessionCookie(Response $res, Config $config, string $token, bool $remember, int $days = 365): Response
    {
        $parts = [self::COOKIE . '=' . $token, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
        if ($remember) {
            $parts[] = 'Max-Age=' . ($days * 86400);
            $parts[] = 'Expires=' . gmdate('D, d M Y H:i:s \G\M\T', time() + $days * 86400);
        }
        if ($config->secureCookies()) {
            $parts[] = 'Secure';
        }
        return $res->withAddedHeader('Set-Cookie', implode('; ', $parts));
    }

    public static function withoutSessionCookie(Response $res, Config $config): Response
    {
        $parts = [self::COOKIE . '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT'];
        if ($config->secureCookies()) {
            $parts[] = 'Secure';
        }
        return $res->withAddedHeader('Set-Cookie', implode('; ', $parts));
    }

    /** Route arguments arrive decoded (Slim decodes the path before matching). */
    public static function arg(array $args, string $name): string
    {
        return (string) ($args[$name] ?? '');
    }
}
