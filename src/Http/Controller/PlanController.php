<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Domain\Catalog;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Service\PlanService;
use Essensplan\Util;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class PlanController
{
    public function __construct(private readonly PlanService $plan)
    {
    }

    public function slots(Request $req, Response $res): Response
    {
        return Io::json($res, ['items' => $this->plan->slots()]);
    }

    public function list(Request $req, Response $res): Response
    {
        $q = $req->getQueryParams();
        $from = (string) ($q['from'] ?? '');
        $to = (string) ($q['to'] ?? '');
        return Io::json($res, ['from' => $from, 'to' => $to, 'entries' => $this->plan->list(Io::principal($req), $from, $to)]);
    }

    public function add(Request $req, Response $res): Response
    {
        return Io::json($res, $this->plan->add(Io::principal($req), Io::body($req, 'plan-entry')), 201);
    }

    public function move(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->plan->move(Io::principal($req), Io::arg($args, 'id'), Io::body($req, 'plan-entry-patch')));
    }

    public function remove(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->plan->remove(Io::principal($req), Io::arg($args, 'id')));
    }

    public function restore(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->plan->restore(Io::principal($req), Io::arg($args, 'id')));
    }

    public function seen(Request $req, Response $res): Response
    {
        return Io::json($res, ['updated' => $this->plan->markSeen(Io::principal($req), Io::body($req, 'ids')['ids'])]);
    }

    public function presets(Request $req, Response $res): Response
    {
        return Io::json($res, ['items' => $this->plan->presets(Io::principal($req))]);
    }

    public function suggestions(Request $req, Response $res): Response
    {
        $q = $req->getQueryParams();
        $weekStart = (string) ($q['weekStart'] ?? $q['date'] ?? '');
        $slot = (string) ($q['slot'] ?? 'lunch');
        if (!Util::isDate($weekStart)) {
            throw ApiError::field('weekStart', 'weekStart als YYYY-MM-DD.');
        }
        if (!isset(Catalog::SLOTS[$slot])) {
            throw ApiError::field('slot', 'slot ist breakfast, lunch, dinner oder snack.');
        }
        return Io::json($res, ['weekStart' => $weekStart, 'slot' => $slot, 'shelves' => $this->plan->suggestions(Io::principal($req), $weekStart, $slot)]);
    }
}
