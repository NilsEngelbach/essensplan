<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Config;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Mcp\Server;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** /mcp: POST only, Bearer key only (Authenticate), Origin checked. */
final class McpController
{
    public function __construct(private readonly Server $server, private readonly Config $config)
    {
    }

    public function post(Request $req, Response $res): Response
    {
        $this->checkOrigin($req);
        $raw = (string) $req->getBody();
        try {
            $msg = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            return Io::json($res, Server::error(null, -32700, 'Parse error'), 400);
        }
        $p = Io::principal($req)->viaMcp();
        $out = $this->server->handle($p, $msg, $req->getHeaderLine('MCP-Protocol-Version'));
        if ($out === null) {
            return $res->withStatus(202);
        }
        return Io::json($res, $out);
    }

    /** No server-push stream and no session to delete. */
    public function other(Request $req, Response $res): Response
    {
        return Io::json($res, Server::error(null, -32000, 'Method not allowed: this server is stateless and only accepts POST.'), 405)
            ->withHeader('Allow', 'POST');
    }

    /** DNS-rebinding guard: an Origin, if sent, must be the app's own. */
    private function checkOrigin(Request $req): void
    {
        $origin = $req->getHeaderLine('Origin');
        if ($origin === '') {
            return;
        }
        $allowed = parse_url($this->config->appUrl());
        $o = parse_url($origin);
        if (($o['host'] ?? '') !== ($allowed['host'] ?? '') || ($o['scheme'] ?? '') !== ($allowed['scheme'] ?? '')) {
            throw new ApiError(403, 'forbidden_origin', 'Origin not allowed.');
        }
    }
}
