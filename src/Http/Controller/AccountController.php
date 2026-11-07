<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Config;
use Essensplan\Http\Io;
use Essensplan\Service\AuthService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** /auth/* and /me (D19). Session only, except GET /me. */
final class AccountController
{
    public function __construct(private readonly AuthService $auth, private readonly Config $config)
    {
    }

    /** Login, pairing and reset (also the invite link) all answer the same way and set the cookie. */
    private function started(Response $res, array $r, int $status = 200): Response
    {
        $remember = (bool) $r['session']['remember'];
        $body = [
            'account' => $this->auth->accountJson($r['user']),
            'session' => $this->auth->sessionJson($r['session'], $r['session']['id']),
            'csrfToken' => $r['session']['csrf_token'],
        ];
        return Io::withSessionCookie(Io::json($res, $body, $status), $this->config, $r['token'], $remember);
    }

    public function login(Request $req, Response $res): Response
    {
        $b = Io::body($req, 'login');
        $r = $this->auth->login($b['email'], $b['password'], $b['remember'] ?? true, Io::userAgent($req), Io::ip($req, $this->config));
        return $this->started($res, $r);
    }

    public function logout(Request $req, Response $res): Response
    {
        $this->auth->logout(Io::principal($req));
        return Io::withoutSessionCookie(Io::noContent($res), $this->config);
    }

    public function pair(Request $req, Response $res): Response
    {
        $b = Io::body($req, 'pair');
        $r = $this->auth->pair($b['code'] ?? null, $b['token'] ?? null, Io::userAgent($req), Io::ip($req, $this->config));
        return $this->started($res, $r);
    }

    public function createLink(Request $req, Response $res): Response
    {
        return Io::json($res, $this->auth->createDeviceLink(Io::principal($req)), 201);
    }

    public function getLink(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->auth->getDeviceLink(Io::principal($req), Io::arg($args, 'id')));
    }

    public function deleteLink(Request $req, Response $res, array $args): Response
    {
        $this->auth->cancelDeviceLink(Io::principal($req), Io::arg($args, 'id'));
        return Io::noContent($res);
    }

    public function sessions(Request $req, Response $res): Response
    {
        return Io::json($res, ['items' => $this->auth->listSessions(Io::principal($req))]);
    }

    public function revokeSession(Request $req, Response $res, array $args): Response
    {
        $p = Io::principal($req);
        $id = Io::arg($args, 'id');
        $this->auth->revokeSession($p, $id);
        $res = Io::noContent($res);
        return $id === $p->sessionId() ? Io::withoutSessionCookie($res, $this->config) : $res;
    }

    public function revokeOthers(Request $req, Response $res): Response
    {
        return Io::json($res, ['revoked' => $this->auth->revokeOthers(Io::principal($req))]);
    }

    public function forgot(Request $req, Response $res): Response
    {
        $this->auth->forgotPassword(Io::body($req, 'forgot')['email'], Io::ip($req, $this->config));
        return Io::noContent($res);
    }

    public function checkReset(Request $req, Response $res): Response
    {
        return Io::json($res, $this->auth->checkResetToken(Io::body($req, 'reset-check')['token']));
    }

    public function reset(Request $req, Response $res): Response
    {
        $b = Io::body($req, 'reset');
        $r = $this->auth->resetPassword($b['token'], $b['password'], $b['revokeOthers'] ?? false, Io::userAgent($req), Io::ip($req, $this->config));
        return $this->started($res, $r);
    }

    public function me(Request $req, Response $res): Response
    {
        return Io::json($res, $this->auth->me(Io::principal($req)));
    }

    public function updateMe(Request $req, Response $res): Response
    {
        return Io::json($res, $this->auth->updateMe(Io::principal($req), Io::body($req, 'me-patch')));
    }
}
