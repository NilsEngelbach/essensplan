<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\App;
use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Service\Mailer;
use PHPUnit\Framework\TestCase as Base;
use Psr\Container\ContainerInterface;
use Slim\App as SlimApp;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

/**
 * Drives the real Slim app in-process against a real MySQL test database.
 * Every test starts with empty tables and a fixed clock.
 */
abstract class TestCase extends Base
{
    /** Thursday 12 Nov 2026, 10:00 in Berlin. */
    public const NOW = '2026-11-12T09:00:00Z';
    public const TODAY = '2026-11-12';
    public const PASSWORD = 'richtig-langes-passwort';

    protected ContainerInterface $c;
    protected SlimApp $app;
    protected Db $db;
    protected Clock $clock;

    private const TABLES = [
        'agent_activity', 'api_keys', 'shopping_home_counts', 'section_overrides', 'shopping_manual_items',
        'shopping_item_state', 'shopping_trips', 'meal_plan_entries', 'instructions', 'ingredients', 'recipes',
        'rate_limits', 'password_resets', 'device_links', 'sessions', 'ai_jobs', 'ai_usage', 'users',
    ];

    public static function config(array $extra = []): Config
    {
        $env = fn (string $k, string $d) => (getenv($k) !== false && getenv($k) !== '') ? (string) getenv($k) : $d;
        return Config::fromArray([
            'APP_ENV' => 'test',
            'APP_URL' => 'http://essen.test',
            'APP_SECRET' => 'test-secret',
            'DB_HOST' => $env('DB_HOST', '127.0.0.1'),
            'DB_PORT' => $env('DB_PORT', '10029'),
            'DB_USER' => $env('DB_USER', 'root'),
            'DB_PASS' => getenv('DB_PASS') !== false ? (string) getenv('DB_PASS') : 'root',
            'DB_NAME' => $env('TEST_DB_NAME', 'essensplan_test'),
            'MAIL_DRIVER' => 'array',
            ...$extra,
        ]);
    }

    protected function setUp(): void
    {
        $this->boot();
    }

    protected function boot(array $config = []): void
    {
        $cfg = self::config($config);
        $this->clock = new Clock();
        $this->clock->set(self::NOW);
        $db = Db::connect($cfg);
        $this->c = App::container($cfg, [
            Db::class => $db,
            Clock::class => $this->clock,
            Mailer::class => new Mailer($cfg, '/dev/null'),
        ]);
        $this->db = $db;
        $this->app = App::create($this->c);
        $db->pdo()->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (self::TABLES as $t) {
            $db->pdo()->exec("DELETE FROM $t");
        }
        $db->pdo()->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    /* ── HTTP ─────────────────────────────────────────────────────────────── */

    /**
     * @param array<string, string> $headers
     * @return array{status: int, body: mixed, headers: array<string, string[]>}
     */
    protected function call(string $method, string $path, mixed $body = null, ?Actor $as = null, array $headers = []): array
    {
        $req = (new ServerRequestFactory())->createServerRequest($method, 'http://essen.test' . $path, ['REMOTE_ADDR' => '203.0.113.7']);
        parse_str((string) parse_url($path, PHP_URL_QUERY), $query);
        $req = $req->withQueryParams($query)->withHeader('User-Agent', $headers['User-Agent'] ?? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
        if ($as !== null) {
            if ($as->key !== null) {
                $req = $req->withHeader('Authorization', 'Bearer ' . $as->key);
            } else {
                $req = $req->withCookieParams(['esp_session' => $as->cookie]);
                if (!in_array($method, ['GET', 'HEAD'], true)) {
                    $req = $req->withHeader('X-CSRF-Token', $as->csrf);
                }
            }
        }
        if ($body !== null) {
            $req = $req->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream(is_string($body) ? $body : json_encode($body, JSON_UNESCAPED_UNICODE)));
        }
        foreach ($headers as $k => $v) {
            $req = $req->withHeader($k, $v);
        }
        $res = $this->app->handle($req);
        $raw = (string) $res->getBody();
        return ['status' => $res->getStatusCode(), 'body' => $raw === '' ? null : (json_decode($raw, true) ?? $raw), 'headers' => $res->getHeaders()];
    }

    /** Asserts the status and returns the decoded body. */
    protected function ok(int $status, string $method, string $path, mixed $body = null, ?Actor $as = null, array $headers = []): mixed
    {
        $r = $this->call($method, $path, $body, $as, $headers);
        $this->assertSame($status, $r['status'], "$method $path → " . json_encode($r['body'], JSON_UNESCAPED_UNICODE));
        return $r['body'];
    }

    /** Asserts an error response with this status and code. */
    protected function fails(int $status, string $code, string $method, string $path, mixed $body = null, ?Actor $as = null): array
    {
        $r = $this->call($method, $path, $body, $as);
        $this->assertSame($status, $r['status'], "$method $path → " . json_encode($r['body'], JSON_UNESCAPED_UNICODE));
        $this->assertSame($code, $r['body']['error']['code'] ?? null, json_encode($r['body'], JSON_UNESCAPED_UNICODE));
        return $r['body']['error'];
    }

    /* ── Fixtures ─────────────────────────────────────────────────────────── */

    protected function user(string $email = 'nils@familie.de', string $name = 'Nils', ?string $hash = null): string
    {
        return $this->c->get(\Essensplan\Repository\UserRepository::class)->create($name, $email, $hash ?? password_hash(self::PASSWORD, PASSWORD_DEFAULT));
    }

    /** A logged-in device of that user. */
    protected function login(string $email = 'nils@familie.de', bool $remember = true): Actor
    {
        $r = $this->call('POST', '/api/v1/auth/login', ['email' => $email, 'password' => self::PASSWORD, 'remember' => $remember]);
        $this->assertSame(200, $r['status'], json_encode($r['body']));
        return new Actor(cookie: self::cookie($r), csrf: $r['body']['csrfToken'], sessionId: $r['body']['session']['id']);
    }

    /** @param list<string> $scopes */
    protected function key(Actor $owner, array $scopes, string $name = 'Claude Code Laptop'): Actor
    {
        $r = $this->ok(201, 'POST', '/api/v1/api-keys', ['name' => $name, 'scopes' => $scopes, 'client' => 'claude-code'], $owner);
        return new Actor(key: $r['secret'], keyId: $r['key']['id']);
    }

    protected static function cookie(array $response): string
    {
        foreach ($response['headers']['Set-Cookie'] ?? [] as $c) {
            if (preg_match('/^esp_session=([^;]*)/', $c, $m)) {
                return $m[1];
            }
        }
        return '';
    }

    protected function recipe(Actor $as, array $over = []): array
    {
        return $this->ok(201, 'POST', '/api/v1/recipes', [
            'title' => 'Linsensuppe',
            'category' => 'Suppe',
            'tags' => ['Vegan'],
            'cookingTime' => 40,
            'servings' => 4,
            'rating' => 4,
            'ingredients' => [
                ['id' => 'a', 'name' => 'Rote Linsen', 'amount' => 250, 'unit' => 'g'],
                ['id' => 'b', 'name' => 'Zwiebel', 'amount' => 1, 'unit' => null],
                ['id' => 'c', 'name' => 'Kokosmilch', 'amount' => 400, 'unit' => 'ml'],
            ],
            'instructions' => [
                ['description' => 'Zwiebel würfeln und anschwitzen.', 'ingredientIds' => ['b']],
                ['description' => 'Linsen und Kokosmilch dazu, 20 Minuten köcheln.', 'ingredientIds' => ['a', 'c']],
            ],
            ...$over,
        ], $as);
    }

    protected function plan(Actor $as, string $date, ?string $recipeId, string $slot = 'lunch', ?string $note = null): array
    {
        return $this->ok(201, 'POST', '/api/v1/meal-plan/entries', array_filter(['date' => $date, 'slot' => $slot, 'recipeId' => $recipeId, 'note' => $note]), $as);
    }
}
