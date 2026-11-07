<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Service\FamilyAdmin;
use Essensplan\Service\MediaStore;

final class ImagesTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        $this->dir = sys_get_temp_dir() . '/esp-media-' . bin2hex(random_bytes(4));
        $this->boot(['MEDIA_DIR' => $this->dir]);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir . '/*/*') ?: [] as $f) {
            unlink($f);
        }
        foreach (glob($this->dir . '/*') ?: [] as $d) {
            rmdir($d);
        }
        @rmdir($this->dir);
    }

    private static function png(int $w, int $h): string
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, (int) imagecolorallocate($img, 200, 80, 40));
        ob_start();
        imagepng($img);
        return (string) ob_get_clean();
    }

    private function upload(Actor $as, string $bytes, string $type = 'image/png'): array
    {
        return $this->call('POST', '/api/v1/images', $bytes, $as, ['Content-Type' => $type]);
    }

    public function testUploadReencodesIntoPhotoAndThumbnail(): void
    {
        $uid = $this->user();
        $me = $this->login();
        $r = $this->upload($me, self::png(2000, 1500));
        $this->assertSame(201, $r['status'], json_encode($r['body']));
        $img = $r['body'];
        $this->assertMatchesRegularExpression("~^/media/$uid/[0-9a-f]{24}\\.jpg$~", $img['url']);
        $this->assertSame(substr($img['url'], 0, -4) . '-thumb.jpg', $img['thumbUrl']);
        $this->assertSame([1000, 750], [$img['width'], $img['height']]);

        $file = fn (string $url) => $this->dir . substr($url, strlen('/media'));
        $this->assertSame([1000, 750, IMAGETYPE_JPEG], array_slice(getimagesize($file($img['url'])), 0, 3));
        $this->assertSame([400, 300], array_slice(getimagesize($file($img['thumbUrl'])), 0, 2));

        // Saved on a recipe, lists and the week get the thumbnail next to the photo.
        $recipe = $this->recipe($me, ['imageUrl' => $img['url']]);
        $this->assertSame($img['thumbUrl'], $recipe['thumbUrl']);
        $list = $this->ok(200, 'GET', '/api/v1/recipes', null, $me);
        $this->assertSame($img['thumbUrl'], $list['items'][0]['recipe']['thumbUrl']);
        $this->plan($me, self::TODAY, $recipe['id']);
        $week = $this->ok(200, 'GET', '/api/v1/meal-plan?from=' . self::TODAY . '&to=' . self::TODAY, null, $me);
        $this->assertSame($img['thumbUrl'], $week['entries'][0]['recipe']['thumbUrl']);

        // A linked photo is its own thumbnail.
        $linked = $this->recipe($me, ['title' => 'Verlinkt', 'imageUrl' => 'https://example.org/a.jpg']);
        $this->assertSame('https://example.org/a.jpg', $linked['thumbUrl']);
    }

    public function testRejectsWhatIsNotAnImageAndNeedsWriteScope(): void
    {
        $this->user();
        $me = $this->login();
        $r = $this->upload($me, "<?php echo 'hallo';", 'image/jpeg');
        $this->assertSame(415, $r['status']);
        $this->assertSame('unsupported_image', $r['body']['error']['code']);

        $r = $this->call('POST', '/api/v1/images', ['file' => 'x'], $me);
        $this->assertSame(415, $r['status']);
        $this->assertSame('unsupported_media_type', $r['body']['error']['code']);

        $read = $this->key($me, ['recipes:read']);
        $r = $this->upload($read, self::png(10, 10));
        $this->assertSame(403, $r['status']);
        $this->assertSame('forbidden_scope', $r['body']['error']['code']);

        $write = $this->key($me, ['recipes:write'], 'Agent');
        $this->assertSame(201, $this->upload($write, self::png(10, 10))['status']);
    }

    public function testGarbageCollectionKeepsPhotosInUse(): void
    {
        $this->user();
        $me = $this->login();
        $used = $this->upload($me, self::png(50, 50))['body'];
        $orphan = $this->upload($me, self::png(50, 50))['body'];
        $fresh = $this->upload($me, self::png(50, 50))['body'];
        $this->recipe($me, ['imageUrl' => $used['url']]);
        $old = time() - 2 * 86400;
        foreach ([$used, $orphan] as $img) {
            foreach ([$img['url'], $img['thumbUrl']] as $u) {
                touch($this->dir . substr($u, 6), $old);
            }
        }

        $this->assertSame(2, $this->c->get(MediaStore::class)->collectGarbage());
        $this->assertFileExists($this->dir . substr($used['thumbUrl'], 6));
        $this->assertFileDoesNotExist($this->dir . substr($orphan['url'], 6));
        $this->assertFileExists($this->dir . substr($fresh['url'], 6));
    }

    public function testDeletingAFamilyRemovesItsPhotos(): void
    {
        $a = $this->user('a@example.org');
        $b = $this->user('b@example.org');
        $this->upload($this->login('a@example.org'), self::png(20, 20));
        $this->upload($this->login('b@example.org'), self::png(20, 20));

        $this->c->get(FamilyAdmin::class)->delete('a@example.org');
        $this->assertDirectoryDoesNotExist("$this->dir/$a");
        $this->assertCount(2, glob("$this->dir/$b/*.jpg"));
    }
}
