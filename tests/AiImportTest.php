<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Ai\Ai;
use Essensplan\Ai\AiProvider;
use Essensplan\Ai\AiResult;
use Essensplan\Ai\ImportJobs;
use Essensplan\Ai\PageFetcher;
use Essensplan\Ai\RecipeImporter;
use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Http\ApiError;

/** A provider that answers from a queue and records what it was asked. */
final class FakeProvider implements AiProvider
{
    /** @var list<array|\Throwable> */
    public array $replies = [];
    /** @var list<array{system: string, user: string, image: ?array}> */
    public array $calls = [];

    public function name(): string
    {
        return 'fake';
    }

    public function model(bool $vision): string
    {
        return $vision ? 'fake-vision' : 'fake-text';
    }

    public function endpoint(): string
    {
        return '';
    }

    public function json(string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $this->calls[] = ['system' => $system, 'user' => $user, 'image' => $image];
        $r = array_shift($this->replies) ?? throw new \LogicException('no reply queued');
        if ($r instanceof \Throwable) {
            throw $r;
        }
        return new AiResult($r, $this->model($image !== null), 1200, 300);
    }
}

/** Serves canned pages and photos instead of the network (check() still runs). */
final class FakeFetcher extends PageFetcher
{
    /** @var array<string, array{type: string, body: string}> */
    public array $pages = [];

    public function __construct()
    {
        parent::__construct('test', fn (string $host) => ['93.184.215.14']);
    }

    public function fetch(string $url, int $maxBytes, array $types, int $timeout = 20): array
    {
        $this->check($url);
        $page = $this->pages[$url] ?? throw new ApiError(422, 'fetch_failed', 'Die Seite ließ sich nicht laden (HTTP 404). Prüf den Link.');
        return ['url' => $url, 'type' => $page['type'], 'body' => $page['body']];
    }
}

final class AiImportTest extends TestCase
{
    private const URL = 'https://kochen.example/rezepte/linsen-dal';
    private const IMG = 'https://cdn.kochen.example/dal.jpg';

    private FakeProvider $ai;
    private FakeFetcher $web;
    private string $dir;

    protected function setUp(): void
    {
        $this->bootWith();
    }

    private function bootWith(array $config = [], bool $enabled = true): void
    {
        $this->ai = new FakeProvider();
        $this->web = new FakeFetcher();
        $this->dir = sys_get_temp_dir() . '/esp-ai-' . bin2hex(random_bytes(4));
        $ai = $this->ai;
        $this->boot(['MEDIA_DIR' => "$this->dir/media", 'AI_INPUT_DIR' => "$this->dir/input", ...$config], [
            Ai::class => fn (Db $db, Clock $clock) => new Ai($db, $clock, $enabled ? $ai : null, 'OPENCODE_API_KEY'),
            PageFetcher::class => $this->web,
        ]);
    }

    protected function tearDown(): void
    {
        foreach (array_merge(glob("$this->dir/*/*/*") ?: [], glob("$this->dir/*/*") ?: []) as $f) {
            is_dir($f) ? @rmdir($f) : @unlink($f);
        }
        foreach (glob("$this->dir/*") ?: [] as $d) {
            @rmdir($d);
        }
        @rmdir($this->dir);
    }

    private static function page(): string
    {
        $ld = json_encode(['@context' => 'https://schema.org', '@graph' => [
            ['@type' => 'WebPage', 'name' => 'Linsen-Dal'],
            [
                '@type' => ['Recipe'],
                'name' => 'Linsen-Dal &amp; Reis',
                'image' => [['@type' => 'ImageObject', 'url' => self::IMG]],
                'recipeYield' => '4 Portionen',
                'totalTime' => 'PT35M',
                'recipeIngredient' => ['250 g rote Linsen', '1 Zwiebel', '400 ml Kokosmilch', 'Salz'],
                'recipeInstructions' => [
                    ['@type' => 'HowToSection', 'name' => 'Dal', 'itemListElement' => [
                        ['@type' => 'HowToStep', 'text' => 'Zwiebel würfeln und anschwitzen.'],
                        ['@type' => 'HowToStep', 'text' => 'Linsen und Kokosmilch dazu, 20 Minuten köcheln.'],
                    ]],
                ],
            ],
        ]], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return "<!doctype html><html><head><title>Linsen-Dal | Kochen</title><script type=\"application/ld+json\">$ld</script></head><body><p>Werbung</p></body></html>";
    }

    private static function jpeg(int $w = 800, int $h = 600): string
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, (int) imagecolorallocate($img, 220, 140, 40));
        ob_start();
        imagejpeg($img);
        return (string) ob_get_clean();
    }

    private static function reply(array $over = []): array
    {
        return [
            'found' => true,
            'title' => '  Linsen-Dal mit Reis ',
            'description' => 'Cremiges Dal aus roten Linsen.',
            'category' => 'Hauptgericht', // not ours → Hauptspeise
            'tags' => ['Vegan', 'Vegan', 'Würzig', 'Lecker'],
            'cookingTime' => 35,
            'servings' => 4,
            'difficulty' => 'Einfach',
            'ingredients' => [
                ['name' => 'rote Linsen', 'amount' => 250, 'unit' => 'g', 'notes' => null, 'component' => null],
                ['name' => ' ', 'amount' => 1, 'unit' => null, 'notes' => null, 'component' => null],
                ['name' => 'Zwiebel', 'amount' => 1, 'unit' => null, 'notes' => 'fein gewürfelt', 'component' => null],
                ['name' => 'Kokosmilch', 'amount' => 400, 'unit' => 'ml', 'notes' => null, 'component' => null],
                ['name' => 'Salz', 'amount' => 0, 'unit' => null, 'notes' => 'nach Geschmack', 'component' => null],
            ],
            'instructions' => [
                ['description' => '1. Zwiebel würfeln und anschwitzen.', 'ingredients' => [2, 2, 9]],
                ['description' => 'Linsen und Kokosmilch dazu, 20 Minuten köcheln.', 'ingredients' => [0, 3]],
            ],
            ...$over,
        ];
    }

    public function testLinkBecomesADraftWithItsPhoto(): void
    {
        $uid = $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html; charset=utf-8', 'body' => self::page()];
        $this->web->pages[self::IMG] = ['type' => 'image/jpeg', 'body' => self::jpeg()];
        $this->ai->replies[] = self::reply();

        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);
        $this->assertSame(['done', 3, 'url'], [$job['status'], $job['step'], $job['source']], json_encode($job['error'] ?? null, JSON_UNESCAPED_UNICODE));
        $d = $job['draft'];
        $this->assertSame('Linsen-Dal mit Reis', $d['title']);
        $this->assertSame('Hauptspeise', $d['category']);
        $this->assertSame(['Vegan', 'Würzig'], $d['tags']);
        $this->assertSame(self::URL, $d['sourceUrl']);
        $this->assertSame(['n1', 'n2', 'n3', 'n4'], array_column($d['ingredients'], 'id'));
        $this->assertNull($d['ingredients'][3]['amount'], 'amount 0 means unknown');
        $this->assertSame('Zwiebel würfeln und anschwitzen.', $d['instructions'][0]['description']);
        $this->assertSame([['n2'], ['n1', 'n3']], array_column($d['instructions'], 'ingredientIds'));
        // The page photo is copied into our storage, readable for this family only.
        $this->assertMatchesRegularExpression("~^/media/$uid/[0-9a-f]{24}\\.jpg$~", $d['imageUrl']);
        $this->assertSame(200, $this->call('GET', $d['imageUrl'], null, $me)['status']);

        // The model got the reduced JSON-LD, not the page.
        $sent = $this->ai->calls[0]['user'];
        $this->assertStringContainsString('schema.org/Recipe', $sent);
        $this->assertStringContainsString('[Dal] Linsen und Kokosmilch dazu', $sent);
        $this->assertStringNotContainsString('Werbung', $sent);

        // The draft saves as is.
        $saved = $this->ok(201, 'POST', '/api/v1/recipes', $d, $me);
        $this->assertCount(4, $saved['ingredients']);
        $usage = $this->db->one('SELECT * FROM ai_usage');
        $this->assertSame(['import-url', 'fake', 'fake-text', 1200, 1], [$usage['feature'], $usage['provider'], $usage['model'], (int) $usage['input_tokens'], (int) $usage['success']]);
    }

    public function testNoRecipeAndUnreachablePagesFailWithAReason(): void
    {
        $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->ai->replies[] = self::reply(['found' => false, 'title' => '']);
        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);
        $this->assertSame('failed', $job['status']);
        $this->assertSame(['code' => 'no_recipe', 'message' => 'Auf dieser Seite wurde kein Rezept gefunden.'], $job['error']);

        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => 'https://kochen.example/weg'], $me);
        $this->assertSame('fetch_failed', $job['error']['code']);

        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => 'http://127.0.0.1/admin'], $me);
        $this->assertSame('url_blocked', $job['error']['code']);
        $this->assertCount(1, $this->ai->calls, 'no model call for pages that never loaded');

        $this->fails(422, 'validation_failed', 'POST', '/api/v1/ai/import', ['url' => 'kochen.example'], $me);
    }

    public function testInvalidModelOutputIsRetriedOnceWithTheErrors(): void
    {
        $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->ai->replies[] = ['title' => 'Dal', 'ingredients' => 'Linsen'];
        $this->ai->replies[] = self::reply();
        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);
        $this->assertSame('done', $job['status']);
        $this->assertCount(2, $this->ai->calls);
        $this->assertStringContainsString('passte nicht zum Schema', $this->ai->calls[1]['user']);

        $this->ai->replies[] = ['broken' => true];
        $this->ai->replies[] = ['still' => 'broken'];
        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);
        $this->assertSame('ai_failed', $job['error']['code']);
        $this->assertSame(4, (int) $this->db->value('SELECT COUNT(*) FROM ai_usage'));
    }

    public function testPhotoImportReadsTheImageAndCleansUp(): void
    {
        $this->user();
        $me = $this->login();
        $this->ai->replies[] = self::reply(['instructions' => [['description' => 'Alles kochen.', 'ingredients' => []]]]);
        $r = $this->call('POST', '/api/v1/ai/import', self::jpeg(3200, 2400), $me, ['Content-Type' => 'image/jpeg']);
        $this->assertSame(200, $r['status'], json_encode($r['body']));
        $job = $r['body'];
        $this->assertSame(['done', 'photo'], [$job['status'], $job['source']]);
        $this->assertNull($job['draft']['imageUrl'], 'the SPA keeps the photo it has');
        $this->assertNull($job['draft']['sourceUrl']);
        $this->assertNull($job['draft']['instructions'][0]['ingredientIds'], 'no links at all → name matching in Kochmodus');

        $image = $this->ai->calls[0]['image'];
        $this->assertSame('image/jpeg', $image['mime']);
        $this->assertSame([1600, 1200], array_slice(getimagesizefromstring(base64_decode($image['data'])), 0, 2), 'downscaled for the model');
        $this->assertSame([], glob("$this->dir/input/*") ?: [], 'the photo is gone after the run');

        $r = $this->call('POST', '/api/v1/ai/import', 'kein bild', $me, ['Content-Type' => 'image/png']);
        $this->assertSame('unsupported_image', $r['body']['error']['code']);
    }

    public function testScopesIsolationLimitsAndSwitch(): void
    {
        $this->user('a@example.org');
        $this->user('b@example.org');
        $a = $this->login('a@example.org');
        $b = $this->login('b@example.org');
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->ai->replies[] = self::reply();
        $this->ai->replies[] = self::reply();

        $this->fails(403, 'forbidden_scope', 'POST', '/api/v1/ai/import', ['url' => self::URL], $this->key($a, ['recipes:write']));
        $agent = $this->key($a, ['ai:use'], 'Agent');
        $job = $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $agent);
        $this->assertSame('done', $job['status']);
        $this->assertNotNull($this->db->value('SELECT api_key_id FROM ai_usage'));

        $this->ok(200, 'GET', "/api/v1/ai/jobs/{$job['id']}", null, $a);
        $this->fails(404, 'not_found', 'GET', "/api/v1/ai/jobs/{$job['id']}", null, $b);

        $this->bootWith(['AI_IMPORTS_PER_HOUR' => '1']);
        $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->ai->replies[] = self::reply();
        $this->ok(200, 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);
        $this->fails(429, 'rate_limited', 'POST', '/api/v1/ai/import', ['url' => self::URL], $me);

        $this->bootWith([], false);
        $this->user();
        $error = $this->fails(503, 'ai_unavailable', 'POST', '/api/v1/ai/import', ['url' => self::URL], $this->login());
        $this->assertStringContainsString('selbst eingeben', $error['message']);
        $this->assertFalse($this->ok(200, 'GET', '/api/v1/config')['ai']['import']);
    }

    public function testAForgottenJobIsPickedUpByThePoll(): void
    {
        $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->ai->replies[] = self::reply();
        $jobs = $this->c->get(ImportJobs::class);
        $session = $this->db->one('SELECT * FROM sessions WHERE id = ?', [$me->sessionId]);
        $job = $jobs->create(\Essensplan\Http\Principal::forSession($session), ['url' => self::URL]);

        $this->assertSame('queued', $this->ok(200, 'GET', "/api/v1/ai/jobs/{$job['id']}", null, $me)['status'], 'still in time for its own process');
        $this->clock->set('2026-11-12T09:00:30Z');
        $this->assertSame('done', $this->ok(200, 'GET', "/api/v1/ai/jobs/{$job['id']}", null, $me)['status']);

        // A job stuck in running is failed after 10 minutes, by the poll or the cron.
        $this->db->exec("UPDATE ai_jobs SET status = 'running' WHERE id = ?", [$job['id']]);
        $this->clock->set('2026-11-12T09:11:00Z');
        $this->assertSame('import_timeout', $this->ok(200, 'GET', "/api/v1/ai/jobs/{$job['id']}", null, $me)['error']['code']);
    }

    public function testMcpImportSavesTheRecipe(): void
    {
        $this->user();
        $me = $this->login();
        $this->web->pages[self::URL] = ['type' => 'text/html', 'body' => self::page()];
        $this->web->pages[self::IMG] = ['type' => 'image/jpeg', 'body' => self::jpeg()];
        $rpc = fn (Actor $key, array $args) => $this->call('POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'tools/call', 'params' => ['name' => 'import_recipe_from_url', 'arguments' => $args]], $key)['body']['result'];

        $reader = $this->key($me, ['ai:use']);
        $res = $rpc($reader, ['url' => self::URL]);
        $this->assertTrue($res['isError']);
        $this->assertStringContainsString('recipes:write', $res['content'][0]['text']);
        $this->ai->replies[] = self::reply();
        $res = $rpc($reader, ['url' => self::URL, 'save' => false]);
        $this->assertFalse($res['structuredContent']['saved']);
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM recipes'));

        $this->ai->replies[] = self::reply();
        $res = $rpc($this->key($me, ['ai:use', 'recipes:write'], 'Importer'), ['url' => self::URL]);
        $this->assertTrue($res['structuredContent']['saved']);
        $this->assertSame('mcp', $res['structuredContent']['recipe']['createdVia']);
        $this->assertSame(self::URL, $res['structuredContent']['recipe']['sourceUrl']);
    }

    public function testDraftClampsWhatTheModelSends(): void
    {
        $d = RecipeImporter::draft(self::reply([
            'cookingTime' => 99999, 'servings' => 0, 'difficulty' => 'leicht',
            'title' => str_repeat('Ä', 300),
            'ingredients' => [['name' => 'Mehl', 'amount' => '2.5', 'unit' => str_repeat('g', 50), 'notes' => null, 'component' => 'Teig']],
            'instructions' => [['description' => 'Schritt 3: Kneten.', 'ingredients' => [0, 0]]],
        ]), false);
        $this->assertSame([1440, null, null], [$d['cookingTime'], $d['servings'], $d['difficulty']]);
        $this->assertSame(200, mb_strlen($d['title']));
        $this->assertSame([2.5, 30, 'Teig'], [$d['ingredients'][0]['amount'], strlen($d['ingredients'][0]['unit']), $d['ingredients'][0]['component']]);
        $this->assertSame(['description' => 'Kneten.', 'ingredientIds' => ['n1']], $d['instructions'][0]);

        $this->expectExceptionMessage('kein Rezept');
        RecipeImporter::draft(self::reply(['ingredients' => [], 'instructions' => []]), true);
    }

    public function testDecodeToleratesFencesAndWrappers(): void
    {
        $this->assertSame(['a' => 1], AiResult::decode("```json\n{\"a\":1}\n```"));
        $this->assertSame(['title' => 'X'], AiResult::decode('Hier: {"recipe": {"title": "X"}} fertig', 'recipe'));
        $this->assertNull(AiResult::decode('[1,2]'));
        $this->assertNull(AiResult::decode('nichts'));
    }
}
