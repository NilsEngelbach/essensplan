<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Http\Io;
use Essensplan\Service\ShoppingService;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ShoppingController
{
    public function __construct(private readonly ShoppingService $shopping)
    {
    }

    public function current(Request $req, Response $res): Response
    {
        return Io::json($res, $this->shopping->current(Io::principal($req)));
    }

    public function setDays(Request $req, Response $res): Response
    {
        return Io::json($res, $this->shopping->setDays(Io::principal($req), Io::body($req, 'trip-days')['days']));
    }

    public function setItem(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->shopping->setItem(Io::principal($req), Io::arg($args, 'key'), Io::body($req, 'item-patch')));
    }

    public function seen(Request $req, Response $res): Response
    {
        $this->shopping->markSeen(Io::principal($req), Io::body($req, 'keys')['keys']);
        return Io::noContent($res);
    }

    public function addManual(Request $req, Response $res): Response
    {
        return Io::json($res, $this->shopping->addManual(Io::principal($req), Io::body($req, 'manual-item')['name']), 201);
    }

    public function removeManual(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->shopping->removeManual(Io::principal($req), Io::arg($args, 'id')));
    }

    public function restoreManual(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->shopping->restoreManual(Io::principal($req), Io::arg($args, 'id')));
    }

    public function complete(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->shopping->complete(Io::principal($req), Io::arg($args, 'id')));
    }

    public function reopen(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, $this->shopping->reopen(Io::principal($req), Io::arg($args, 'id')));
    }

    public function getOrder(Request $req, Response $res): Response
    {
        return Io::json($res, ['sections' => $this->shopping->sectionOrder(Io::principal($req)->userId)]);
    }

    public function putOrder(Request $req, Response $res): Response
    {
        return Io::json($res, ['sections' => $this->shopping->saveSectionOrder(Io::principal($req), Io::body($req, 'section-order')['sections'])]);
    }
}
