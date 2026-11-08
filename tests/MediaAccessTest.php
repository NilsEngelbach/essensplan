<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** Photos live outside the docroot; /media/{user}/{file} serves them to their own family only. */
final class MediaAccessTest extends TestCase
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

    private function photo(Actor $as): array
    {
        $img = imagecreatetruecolor(60, 40);
        ob_start();
        imagepng($img);
        $r = $this->call('POST', '/api/v1/images', (string) ob_get_clean(), $as, ['Content-Type' => 'image/png']);
        $this->assertSame(201, $r['status']);
        return $r['body'];
    }

    public function testOnlyTheOwnFamilySeesItsPhotos(): void
    {
        $this->user('a@example.org');
        $this->user('b@example.org');
        $a = $this->login('a@example.org');
        $b = $this->login('b@example.org');
        $img = $this->photo($a);

        $r = $this->call('GET', $img['url'], null, $a);
        $this->assertSame(200, $r['status']);
        $this->assertSame('image/jpeg', $r['headers']['Content-Type'][0]);
        $this->assertStringStartsWith("\xFF\xD8", $r['body']);
        $this->assertStringContainsString('private', $r['headers']['Cache-Control'][0]);
        $this->assertSame(200, $this->call('GET', $img['thumbUrl'], null, $a)['status']);

        // Another family: the same 404 as a photo that doesn't exist.
        $this->assertSame('not_found', $this->call('GET', $img['url'], null, $b)['body']['error']['code']);
        $this->assertSame(404, $this->call('GET', $img['url'], null, $b)['status']);
        // Logged out.
        $this->assertSame(401, $this->call('GET', $img['url'])['status']);
        // Names that aren't ours, traversal.
        $user = explode('/', $img['url'])[2];
        $this->assertSame(404, $this->call('GET', "/media/$user/..%2F..%2F.env", null, $a)['status']);
        $this->assertSame(404, $this->call('GET', "/media/$user/abc.jpg", null, $a)['status']);
    }

    public function testKeysNeedRecipesReadAndBrowsersRevalidate(): void
    {
        $this->user();
        $me = $this->login();
        $img = $this->photo($me);

        $this->assertSame(403, $this->call('GET', $img['url'], null, $this->key($me, ['mealplan:read']))['status']);
        $r = $this->call('GET', $img['url'], null, $this->key($me, ['recipes:read'], 'Leser'));
        $this->assertSame(200, $r['status']);

        $etag = $r['headers']['ETag'][0];
        $again = $this->call('GET', $img['url'], null, $me, ['If-None-Match' => $etag]);
        $this->assertSame(304, $again['status']);
        $this->assertNull($again['body']);
    }

}
