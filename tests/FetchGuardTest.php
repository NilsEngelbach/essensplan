<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Ai\PageFetcher;
use Essensplan\Ai\RecipePage;
use Essensplan\Http\ApiError;
use PHPUnit\Framework\TestCase as Base;

/** The import fetcher never reaches private addresses; the page parser finds the recipe. No network. */
final class FetchGuardTest extends Base
{
    private function blocked(string $url, array $dns = []): string
    {
        $f = new PageFetcher('test', fn (string $host) => $dns[$host] ?? []);
        try {
            $f->check($url);
            return 'allowed';
        } catch (ApiError $e) {
            return $e->errorCode;
        }
    }

    public function testOnlyPublicHttpOnDefaultPorts(): void
    {
        $dns = ['rezept.example' => ['93.184.215.14'], 'intern.example' => ['93.184.215.14', '10.0.0.5'], 'v6.example' => ['2606:4700::1111']];
        $this->assertSame('allowed', $this->blocked('https://rezept.example/dal', $dns));
        $this->assertSame('allowed', $this->blocked('http://rezept.example/dal', $dns));
        $this->assertSame('allowed', $this->blocked('https://v6.example/', $dns));
        foreach ([
            'http://127.0.0.1/', 'http://localhost/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.16.5.5/',
            'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://100.64.0.1/',
            'http://0.0.0.0/', 'https://intern.example/', 'https://rezept.example:8443/', 'http://rezept.example:443/',
            'https://user:pw@rezept.example/', 'file:///etc/passwd', 'gopher://rezept.example/', 'ftp://rezept.example/',
        ] as $url) {
            $this->assertContains($this->blocked($url, $dns + ['localhost' => ['127.0.0.1']]), ['url_blocked', 'fetch_failed'], $url);
        }
        $this->assertSame('fetch_failed', $this->blocked('https://gibtsnicht.example/', $dns), 'unknown hosts say so');
    }

    public function testRelativeLinks(): void
    {
        $base = 'https://kochen.example/rezepte/dal?x=1';
        $this->assertSame('https://kochen.example/bilder/a.jpg', PageFetcher::absolute('/bilder/a.jpg', $base));
        $this->assertSame('https://kochen.example/rezepte/a.jpg', PageFetcher::absolute('a.jpg', $base));
        $this->assertSame('https://cdn.example/a.jpg', PageFetcher::absolute('//cdn.example/a.jpg', $base));
        $this->assertSame('https://x.example/a.jpg', PageFetcher::absolute('https://x.example/a.jpg', $base));
    }

    public function testTextFallbackAndOgImage(): void
    {
        $html = '<html><head><meta charset="iso-8859-1"><meta property="og:image" content="/img/kuchen.jpg"><title>Kuchen</title>'
            . '<style>.x{}</style><script>var a = 1;</script></head><body><nav>Menü</nav><article><h1>Apfelkuchen</h1>'
            . '<ul><li>200 g Mehl</li><li>3 ' . mb_convert_encoding('Äpfel', 'ISO-8859-1', 'UTF-8') . '</li></ul><p>' . str_repeat('Backen. ', 80) . '</p></article></body></html>';
        $page = RecipePage::parse($html, 'https://kochen.example/kuchen');
        $this->assertNull($page->recipe);
        $this->assertSame('https://kochen.example/img/kuchen.jpg', $page->imageUrl);
        $this->assertStringContainsString("200 g Mehl\n3 Äpfel", $page->text);
        $this->assertStringNotContainsString('var a', $page->text);
        $this->assertStringNotContainsString('Menü', $page->text, 'the article is enough');
        $this->assertStringContainsString('Seitentext:', $page->forModel());
    }

    public function testJsonLdWithNewlinesInsideStrings(): void
    {
        $html = "<script type='application/ld+json'>{\"@type\":\"Recipe\",\"name\":\"Suppe\",\"recipeInstructions\":\"Alles schneiden.\nKochen.\",\"image\":\"https://kochen.example/s.jpg\"}</script>";
        $page = RecipePage::parse($html, 'https://kochen.example/suppe');
        $this->assertSame('Suppe', $page->recipe['name']);
        $this->assertSame('https://kochen.example/s.jpg', $page->imageUrl);
        $this->assertArrayNotHasKey('image', $page->recipe);
    }
}
