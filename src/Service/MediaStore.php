<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Db;
use Essensplan\Http\ApiError;

/**
 * Recipe photos on disk under public/media/{userId}/. Every image is decoded
 * and re-encoded (strips EXIF and anything that isn't pixels) into two JPEGs:
 * the photo (1000 px) and a thumbnail (400 px) for lists and tiles.
 * Names are random, so a path is only known to whoever saved it.
 */
final class MediaStore
{
    public const MAX_BYTES = 15 * 1024 * 1024;
    private const MAX_PIXELS = 30_000_000;
    private const SIZES = ['' => 1000, '-thumb' => 400];
    private const NAME = '~^/media/([0-9a-f-]{36})/([0-9a-f]{24})\.jpg$~';

    public function __construct(private readonly string $dir, private readonly Db $db)
    {
    }

    /**
     * @return array{url: string, thumbUrl: string, width: int, height: int}
     */
    public function store(string $userId, string $bytes): array
    {
        if ($bytes === '') {
            throw ApiError::field('file', 'Das Bild ist leer.');
        }
        if (strlen($bytes) > self::MAX_BYTES) {
            throw new ApiError(413, 'too_large', 'Das Bild ist zu groß (höchstens 15 MB).');
        }
        $info = @getimagesizefromstring($bytes);
        if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP, IMAGETYPE_GIF], true)) {
            throw new ApiError(415, 'unsupported_image', 'Das ist kein Bild, das wir lesen können (JPEG, PNG, WebP oder GIF).');
        }
        if ($info[0] * $info[1] > self::MAX_PIXELS) {
            throw new ApiError(413, 'too_large', 'Das Bild hat zu viele Pixel.');
        }
        $src = @imagecreatefromstring($bytes);
        if ($src === false) {
            throw new ApiError(415, 'unsupported_image', 'Das Bild ist beschädigt.');
        }
        if ($info[2] === IMAGETYPE_JPEG) {
            $src = self::orient($src, $bytes);
        }

        $dir = $this->dir . '/' . $userId;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Cannot create $dir");
        }
        $name = bin2hex(random_bytes(12));
        $w = $h = 0;
        foreach (self::SIZES as $suffix => $max) {
            $img = self::fit($src, $max);
            if ($suffix === '') {
                [$w, $h] = [imagesx($img), imagesy($img)];
            }
            imageinterlace($img, true);
            if (!imagejpeg($img, "$dir/$name$suffix.jpg", 82)) {
                throw new \RuntimeException("Cannot write $dir/$name$suffix.jpg");
            }
        }
        return ['url' => "/media/$userId/$name.jpg", 'thumbUrl' => "/media/$userId/$name-thumb.jpg", 'width' => $w, 'height' => $h];
    }

    /** The list-size variant of a stored photo; other URLs (links, old demo files) are their own thumbnail. */
    public static function thumbOf(?string $url): ?string
    {
        return $url !== null && preg_match(self::NAME, $url) ? substr($url, 0, -4) . '-thumb.jpg' : $url;
    }

    /**
     * Deletes stored photos that no recipe or step refers to any more (deleted
     * recipes keep theirs until purged), older than $minAgeSeconds so an upload
     * whose recipe isn't saved yet survives.
     *
     * @return int files removed
     */
    public function collectGarbage(int $minAgeSeconds = 86400): int
    {
        $used = [];
        foreach ($this->db->column("SELECT image_path FROM recipes WHERE image_path LIKE '/media/%' UNION SELECT i.image_path FROM instructions i WHERE i.image_path LIKE '/media/%'") as $p) {
            $used[(string) $p] = true;
        }
        $n = 0;
        foreach (glob($this->dir . '/*/*.jpg') ?: [] as $file) {
            $rel = '/media/' . basename(dirname($file)) . '/' . basename($file);
            $main = str_ends_with($rel, '-thumb.jpg') ? substr($rel, 0, -10) . '.jpg' : $rel;
            if (!preg_match(self::NAME, $main) || isset($used[$main]) || filemtime($file) > time() - $minAgeSeconds) {
                continue;
            }
            if (@unlink($file)) {
                $n++;
            }
        }
        return $n;
    }

    /** All of a family's photos (user:delete). */
    public function deleteAll(string $userId): void
    {
        $dir = $this->dir . '/' . $userId;
        if (!preg_match('/^[0-9a-f-]{36}$/', $userId) || !is_dir($dir)) {
            return;
        }
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    }

    private static function fit(\GdImage $src, int $max): \GdImage
    {
        $w = imagesx($src);
        $h = imagesy($src);
        $scale = min(1, $max / max($w, $h));
        $nw = max(1, (int) round($w * $scale));
        $nh = max(1, (int) round($h * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        // Transparent PNG/WebP/GIF areas become white, not black.
        imagefill($dst, 0, 0, (int) imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
        return $dst;
    }

    /** Phones store portrait photos sideways plus an EXIF hint; re-encoding drops the hint, so apply it. */
    private static function orient(\GdImage $img, string $bytes): \GdImage
    {
        if (!function_exists('exif_read_data')) {
            return $img;
        }
        $exif = @exif_read_data('data://image/jpeg;base64,' . base64_encode($bytes));
        $o = is_array($exif) ? (int) ($exif['Orientation'] ?? 1) : 1;
        if (in_array($o, [2, 4, 5, 7], true)) {
            imageflip($img, IMG_FLIP_HORIZONTAL);
        }
        $angle = match ($o) {
            3, 4 => 180,
            5, 6 => 270,
            7, 8 => 90,
            default => 0,
        };
        return $angle === 0 ? $img : (imagerotate($img, $angle, 0) ?: $img);
    }
}
