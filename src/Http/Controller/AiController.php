<?php

declare(strict_types=1);

namespace Essensplan\Http\Controller;

use Essensplan\Ai\ImportJobs;
use Essensplan\Http\AfterResponse;
use Essensplan\Http\ApiError;
use Essensplan\Http\Io;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Message\UploadedFileInterface;

/** POST /ai/import (link as JSON, photo as multipart `photo` or image/* body) and GET /ai/jobs/{id}. */
final class AiController
{
    public function __construct(private readonly ImportJobs $jobs, private readonly AfterResponse $after)
    {
    }

    public function import(Request $req, Response $res): Response
    {
        $p = Io::principal($req);
        $file = $req->getUploadedFiles()['photo'] ?? null;
        if ($file instanceof UploadedFileInterface) {
            if (in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
                throw new ApiError(413, 'too_large', 'Das Foto ist zu groß (höchstens 15 MB).');
            }
            if ($file->getError() !== UPLOAD_ERR_OK) {
                throw ApiError::field('photo', 'Das Foto kam nicht vollständig an. Versuch es noch mal.');
            }
            $source = ['photo' => (string) $file->getStream()];
        } elseif (str_starts_with(strtolower($req->getHeaderLine('Content-Type')), 'image/')) {
            $source = ['photo' => (string) $req->getBody()];
        } else {
            $source = ['url' => trim((string) Io::body($req, 'ai-import')['url'])];
        }
        $job = $this->jobs->create($p, $source);

        // PHP-FPM answers right away and keeps working; the SPA polls. Elsewhere the request waits.
        if ($this->after->canDetach()) {
            $id = $job['id'];
            $this->after->add(fn () => $this->jobs->run($id));
            return Io::json($res, ImportJobs::json($job), 202);
        }
        $this->jobs->run($job['id']);
        return Io::json($res, ImportJobs::json($this->jobs->poll($p, $job['id'])), 200);
    }

    public function job(Request $req, Response $res, array $args): Response
    {
        return Io::json($res, ImportJobs::json($this->jobs->poll(Io::principal($req), Io::arg($args, 'id'))));
    }
}
