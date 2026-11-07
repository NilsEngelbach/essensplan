<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Http\Io;
use Essensplan\Service\ActivityService;
use Essensplan\Service\ApiKeyService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** Konto → API & Agenten: keys and the activity log. Session only. */
final class AgentController
{
    public function __construct(private readonly ApiKeyService $keys, private readonly ActivityService $activity)
    {
    }

    public function keys(Request $req, Response $res): Response
    {
        return Io::json($res, ['items' => $this->keys->list(Io::principal($req))]);
    }

    public function createKey(Request $req, Response $res): Response
    {
        return Io::json($res, $this->keys->create(Io::principal($req), Io::body($req, 'api-key')), 201);
    }

    public function patchKey(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->keys->setClient(Io::principal($req), Io::arg($args, 'id'), Io::body($req, 'api-key-patch')['client']));
    }

    public function revokeKey(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->keys->revoke(Io::principal($req), Io::arg($args, 'id')));
    }

    public function unrevokeKey(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->keys->unrevoke(Io::principal($req), Io::arg($args, 'id')));
    }

    public function activity(Request $req, Response $res): Response
    {
        $limit = (int) ($req->getQueryParams()['limit'] ?? 100);
        return Io::json($res, ['items' => $this->activity->list(Io::principal($req), $limit)]);
    }

    public function unseen(Request $req, Response $res): Response
    {
        return Io::json($res, $this->activity->unseen(Io::principal($req)));
    }

    public function seen(Request $req, Response $res): Response
    {
        $b = Io::body($req, 'activity-seen');
        return Io::json($res, ['updated' => $this->activity->markSeen(Io::principal($req), $b['ids'] ?? null, $b['recipeId'] ?? null)]);
    }

    public function undo(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->activity->undo(Io::principal($req), Io::arg($args, 'id')));
    }
}
