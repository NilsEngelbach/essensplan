<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Essensplan\Service\MediaStore;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;

final class ImageController
{
    public function __construct(private readonly MediaStore $media)
    {
    }

    /** Multipart field `file` (the SPA) or the image as the whole body (curl --data-binary). */
    public function upload(Request $req, Response $res): Response
    {
        $file = $req->getUploadedFiles()['file'] ?? null;
        if ($file instanceof UploadedFileInterface) {
            if ($file->getError() === UPLOAD_ERR_INI_SIZE || $file->getError() === UPLOAD_ERR_FORM_SIZE) {
                throw new ApiError(413, 'too_large', 'Das Bild ist zu groß (höchstens 15 MB).');
            }
            if ($file->getError() !== UPLOAD_ERR_OK) {
                throw ApiError::field('file', 'Das Bild kam nicht vollständig an. Versuch es noch mal.');
            }
            $bytes = (string) $file->getStream();
        } elseif (str_starts_with(strtolower($req->getHeaderLine('Content-Type')), 'image/')) {
            $bytes = (string) $req->getBody();
        } else {
            throw new ApiError(415, 'unsupported_media_type', 'Schick das Bild als multipart-Feld „file“ oder als image/*-Body.');
        }
        return Io::json($res, $this->media->store(Io::principal($req)->userId, $bytes), 201);
    }
}
