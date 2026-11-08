<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\App;
use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Service\MediaStore;
use Essensplan\Service\RateLimiter;
use Essensplan\Util;

/**
 * AI import jobs (ai_jobs). A job is created by POST /ai/import and run
 *  - after the response under PHP-FPM (all-inkl), the SPA polls GET /ai/jobs/{id};
 *  - otherwise inside the request (php -S, Local's php-cgi), which then answers finished.
 * A job nobody started (the process died) is picked up by the next poll after
 * 20 s or by the cron (jobs:run); one running for more than 10 min is failed.
 * Photos wait in storage/ai-input/ until their job has run.
 */
final class ImportJobs
{
    public const TYPE = 'recipe-import';
    private const PICKUP_AFTER = 20;
    private const STALE_AFTER = 600;

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly Config $config,
        private readonly RateLimiter $limiter,
        private readonly Ai $ai,
        private readonly RecipeImporter $importer,
    ) {
    }

    /**
     * @param array{url?: string, photo?: string} $source a link, or the uploaded photo's bytes
     * @return array<string, mixed> the job row
     */
    public function create(Principal $p, array $source): array
    {
        $this->ai->require();
        $this->limiter->hit('ai-import:' . $p->userId, $this->config->int('AI_IMPORTS_PER_HOUR', 30), 3600);
        $id = Util::uuid();
        $input = ['keyId' => Ai::keyId($p), 'via' => $p->via()];
        if (isset($source['url'])) {
            $input['kind'] = 'url';
            $input['url'] = $source['url'];
        } else {
            $input['kind'] = 'photo';
            $input['photo'] = "$id.jpg";
            self::writePhoto($this->inputDir() . "/$id.jpg", (string) ($source['photo'] ?? ''));
        }
        $this->db->insert('ai_jobs', [
            'id' => $id,
            'user_id' => $p->userId,
            'type' => self::TYPE,
            'status' => 'queued',
            'progress' => 0,
            'input' => Util::json($input),
            'created_at' => $this->clock->db(),
        ]);
        return $this->row($p->userId, $id);
    }

    /** Runs the job if it is still queued (atomic claim, so only one process does). */
    public function run(string $id): void
    {
        $claimed = $this->db->exec("UPDATE ai_jobs SET status = 'running', progress = 0 WHERE id = ? AND status = 'queued'", [$id]);
        if ($claimed !== 1) {
            return;
        }
        $job = $this->db->one('SELECT * FROM ai_jobs WHERE id = ?', [$id]) ?? throw new \LogicException('job vanished');
        $input = Util::decode($job['input']);
        $photo = isset($input['photo']) ? $this->inputDir() . '/' . basename((string) $input['photo']) : null;
        @set_time_limit(300);
        $step = function (int $s) use ($id): void {
            $this->db->exec('UPDATE ai_jobs SET progress = ? WHERE id = ?', [$s, $id]);
        };
        try {
            $draft = $input['kind'] === 'url'
                ? $this->importer->fromUrl($job['user_id'], $input['keyId'] ?? null, (string) $input['url'], $step)
                : $this->importer->fromPhoto($job['user_id'], $input['keyId'] ?? null, (string) @file_get_contents((string) $photo), $step);
            $this->finish($id, 'done', ['draft' => $draft], null);
        } catch (ApiError $e) {
            $this->finish($id, 'failed', null, ['code' => $e->errorCode, 'message' => $e->getMessage()]);
        } catch (\Throwable $e) {
            error_log('[essensplan] import job ' . $id . ': ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            $this->finish($id, 'failed', null, ['code' => 'import_failed', 'message' => 'Das Lesen ist fehlgeschlagen. Versuch es noch einmal oder gib das Rezept selbst ein.']);
        } finally {
            if ($photo !== null) {
                @unlink($photo);
            }
        }
    }

    /**
     * The job for its owner; runs a forgotten queued job right here and fails a stale one.
     *
     * @return array<string, mixed>
     */
    public function poll(Principal $p, string $id): array
    {
        $job = $this->row($p->userId, $id);
        $age = $this->clock->now()->getTimestamp() - strtotime($job['created_at'] . ' UTC');
        if ($job['status'] === 'queued' && $age >= self::PICKUP_AFTER) {
            $this->run($id);
            $job = $this->row($p->userId, $id);
        } elseif ($job['status'] === 'running' && $age >= self::STALE_AFTER) {
            $this->finish($id, 'failed', null, ['code' => 'import_timeout', 'message' => 'Das Lesen hat zu lange gedauert. Versuch es noch einmal oder gib das Rezept selbst ein.']);
            $job = $this->row($p->userId, $id);
        }
        return $job;
    }

    /** Cron / bin/console jobs:run: queued jobs older than a few seconds, stale running ones failed. */
    public function runPending(int $limit = 5): int
    {
        $this->db->exec(
            "UPDATE ai_jobs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'running' AND created_at < ?",
            [$this->clock->db(), Util::json(['code' => 'import_timeout', 'message' => 'Das Lesen hat zu lange gedauert. Versuch es noch einmal oder gib das Rezept selbst ein.']), $this->clock->db('-' . self::STALE_AFTER . ' seconds')],
        );
        $ids = $this->db->column("SELECT id FROM ai_jobs WHERE status = 'queued' AND created_at < ? ORDER BY created_at LIMIT " . max(1, min(50, $limit)), [$this->clock->db('-5 seconds')]);
        foreach ($ids as $id) {
            $this->run((string) $id);
        }
        return count($ids);
    }

    /** Jobs older than a day, and photos left behind. */
    public function purge(): int
    {
        $n = $this->db->exec('DELETE FROM ai_jobs WHERE created_at < ?', [$this->clock->db('-1 day')]);
        foreach (glob($this->inputDir() . '/*.jpg') ?: [] as $f) {
            if (filemtime($f) < time() - 86400) {
                @unlink($f);
            }
        }
        return $n;
    }

    /** @return array<string, mixed> */
    private function row(string $userId, string $id): array
    {
        return $this->db->one('SELECT * FROM ai_jobs WHERE user_id = ? AND id = ? AND type = ?', [$userId, $id, self::TYPE])
            ?? throw ApiError::notFound('Diesen Import gibt es nicht (mehr).');
    }

    /** @return array<string, mixed> */
    public static function json(array $job): array
    {
        $result = Util::decode($job['result'] ?? null);
        $error = Util::decode($job['error'] ?? null);
        return array_filter([
            'id' => $job['id'],
            'status' => $job['status'],
            'step' => (int) $job['progress'],
            'source' => Util::decode($job['input'])['kind'] ?? null,
            'draft' => $result['draft'] ?? null,
            'error' => $error ?: null,
            'createdAt' => Util::iso($job['created_at']),
        ], fn ($v) => $v !== null);
    }

    private function finish(string $id, string $status, ?array $result, ?array $error): void
    {
        $this->db->exec('UPDATE ai_jobs SET status = ?, progress = ?, result = ?, error = ?, finished_at = ? WHERE id = ?', [
            $status,
            $status === 'done' ? RecipeImporter::STEP_DONE : 0,
            $result === null ? null : Util::json($result),
            $error === null ? null : mb_substr(Util::json($error), 0, 500),
            $this->clock->db(),
            $id,
        ]);
    }

    private function inputDir(): string
    {
        $dir = $this->config->get('AI_INPUT_DIR', App::root() . '/storage/ai-input');
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Cannot create $dir");
        }
        return $dir;
    }

    /** Validates and re-encodes the upload to a JPEG of at most 1600 px (what the models read best). */
    private static function writePhoto(string $file, string $bytes): void
    {
        if ($bytes === '') {
            throw ApiError::field('photo', 'Das Foto ist leer.');
        }
        if (strlen($bytes) > 15 * 1024 * 1024) {
            throw new ApiError(413, 'too_large', 'Das Foto ist zu groß (höchstens 15 MB).');
        }
        $info = @getimagesizefromstring($bytes);
        if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true) || $info[0] * $info[1] > 40_000_000) {
            throw new ApiError(415, 'unsupported_image', 'Das ist kein Foto, das wir lesen können (JPEG, PNG, WebP oder GIF).');
        }
        $src = @imagecreatefromstring($bytes) ?: throw new ApiError(415, 'unsupported_image', 'Das Foto ist beschädigt.');
        if ($info[2] === IMAGETYPE_JPEG) {
            $src = MediaStore::orient($src, $bytes);
            [$info[0], $info[1]] = [imagesx($src), imagesy($src)];
        }
        $scale = min(1, 1600 / max($info[0], $info[1]));
        $w = max(1, (int) round($info[0] * $scale));
        $h = max(1, (int) round($info[1] * $scale));
        $dst = imagecreatetruecolor($w, $h);
        imagefill($dst, 0, 0, (int) imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $w, $h, $info[0], $info[1]);
        if (!imagejpeg($dst, $file, 85)) {
            throw new \RuntimeException("Cannot write $file");
        }
    }
}
