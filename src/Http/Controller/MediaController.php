<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Service\MediaStore;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * GET /media/{userId}/{name}.jpg: recipe photos, only for the family they
 * belong to (session cookie, which <img> sends along) or an API key with
 * recipes:read. Another family's photo answers 404, like a missing one.
 * Names are random and never change, so browsers may keep them a year.
 */
final class MediaController
{
    public function __construct(private readonly MediaStore $media)
    {
    }

    public function get(Request $req, Response $res, array $args): Response
    {
        $p = Io::principal($req);
        if (!$p->can('recipes:read')) {
            throw new ApiError(403, 'forbidden_scope', 'Diesem Schlüssel fehlt das Recht recipes:read.');
        }
        $user = Io::arg($args, 'user');
        $file = $user === $p->userId ? $this->media->file($user, Io::arg($args, 'file')) : null;
        if ($file === null) {
            throw ApiError::notFound('Dieses Foto gibt es nicht.');
        }
        $etag = '"' . substr(sha1($file . '|' . filesize($file) . '|' . filemtime($file)), 0, 20) . '"';
        $res = $res
            ->withHeader('Cache-Control', 'private, max-age=31536000, immutable')
            ->withHeader('ETag', $etag)
            ->withHeader('Last-Modified', gmdate('D, d M Y H:i:s \G\M\T', (int) filemtime($file)))
            ->withHeader('X-Content-Type-Options', 'nosniff');
        if (in_array($etag, array_map('trim', explode(',', $req->getHeaderLine('If-None-Match'))), true)) {
            return $res->withStatus(304);
        }
        $res->getBody()->write((string) file_get_contents($file));
        return $res->withHeader('Content-Type', 'image/jpeg')->withHeader('Content-Length', (string) filesize($file));
    }
}
