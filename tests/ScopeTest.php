<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** API keys may do exactly what their scopes say; write implies read (D18). */
final class ScopeTest extends TestCase
{
    private Actor $owner;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user();
        $this->owner = $this->login();
    }

    public function testReadKeyCannotWrite(): void
    {
        $recipe = $this->recipe($this->owner);
        $read = $this->key($this->owner, ['recipes:read']);
        $this->ok(200, 'GET', '/api/v1/recipes', null, $read);
        $this->ok(200, 'GET', "/api/v1/recipes/{$recipe['id']}", null, $read);
        $err = $this->fails(403, 'forbidden_scope', 'POST', '/api/v1/recipes', ['title' => 'X', 'category' => 'Salat'], $read);
        $this->assertSame('Diesem Schlüssel fehlt das Recht recipes:write.', $err['message']);
        $this->fails(403, 'forbidden_scope', 'DELETE', "/api/v1/recipes/{$recipe['id']}", null, $read);
        $this->fails(403, 'forbidden_scope', 'GET', '/api/v1/meal-plan?from=2026-11-09&to=2026-11-15', null, $read);
        $this->fails(403, 'forbidden_scope', 'GET', '/api/v1/shopping/current', null, $read);
    }

    public function testWriteImpliesRead(): void
    {
        $key = $this->key($this->owner, ['mealplan:write', 'shopping:write']);
        $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-09&to=2026-11-15', null, $key);
        $this->ok(201, 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'note' => 'Reste'], $key);
        $this->ok(200, 'GET', '/api/v1/shopping/current', null, $key);
        $this->fails(403, 'forbidden_scope', 'GET', '/api/v1/recipes', null, $key);
        $delete = $this->key($this->owner, ['recipes:delete']);
        $this->ok(200, 'GET', '/api/v1/recipes', null, $delete);
        $this->fails(403, 'forbidden_scope', 'POST', '/api/v1/recipes', ['title' => 'X', 'category' => 'Salat'], $delete);
    }

    public function testProfileIsImplicitAndSessionRoutesRefuseKeys(): void
    {
        $key = $this->key($this->owner, ['shopping:read']);
        $me = $this->ok(200, 'GET', '/api/v1/me', null, $key);
        $this->assertArrayNotHasKey('csrfToken', $me);
        foreach ([
            ['GET', '/api/v1/api-keys'], ['POST', '/api/v1/api-keys'], ['GET', '/api/v1/agent-activity'],
            ['GET', '/api/v1/auth/sessions'], ['POST', '/api/v1/auth/device-links'], ['PATCH', '/api/v1/me'],
            ['POST', '/api/v1/auth/login'], ['POST', '/api/v1/meal-plan/seen'],
        ] as [$m, $path]) {
            $this->fails(403, 'session_required', $m, $path, ['x' => 1], $key);
        }
    }

    public function testRevokedExpiredAndUnknownKeys(): void
    {
        $key = $this->key($this->owner, ['recipes:read']);
        $this->ok(200, 'DELETE', "/api/v1/api-keys/{$key->keyId}", null, $this->owner);
        $this->fails(401, 'invalid_key', 'GET', '/api/v1/recipes', null, $key);
        // Undo toast: within 10 minutes the key works again.
        $this->ok(200, 'POST', "/api/v1/api-keys/{$key->keyId}/unrevoke", null, $this->owner);
        $this->ok(200, 'GET', '/api/v1/recipes', null, $key);
        $this->ok(200, 'DELETE', "/api/v1/api-keys/{$key->keyId}", null, $this->owner);
        $this->clock->set('2026-11-12T09:11:00Z');
        $this->fails(409, 'conflict', 'POST', "/api/v1/api-keys/{$key->keyId}/unrevoke", null, $this->owner);

        $r = $this->ok(201, 'POST', '/api/v1/api-keys', ['scopes' => ['recipes:read'], 'validDays' => 30], $this->owner);
        $this->assertSame('Schlüssel vom 12. Nov.', $r['key']['name']);
        $this->assertSame(substr($r['secret'], 0, 12), $r['key']['prefix']);
        $this->assertMatchesRegularExpression('/^esp_[0-9A-Za-z]{40}$/', $r['secret']);
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM api_keys WHERE key_hash = ?', [$r['secret']]), 'only the hash is stored');
        $this->clock->set('2026-12-13T09:00:00Z');
        $this->fails(401, 'invalid_key', 'GET', '/api/v1/recipes', null, new Actor(key: $r['secret']));

        $this->fails(401, 'invalid_key', 'GET', '/api/v1/recipes', null, new Actor(key: 'esp_' . str_repeat('x', 40)));
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/recipes');
    }

    public function testKeyWritesAreLoggedWithCreatedVia(): void
    {
        $key = $this->key($this->owner, ['recipes:write', 'mealplan:write']);
        $recipe = $this->recipe($key, ['title' => 'Gnocchi-Pfanne']);
        $this->assertSame('api', $recipe['createdVia']);
        $this->clock->set('2026-11-12T09:01:00Z');
        $entry = $this->plan($key, self::TODAY, $recipe['id']);
        $this->assertSame('api', $entry['createdVia']);
        $items = $this->ok(200, 'GET', '/api/v1/agent-activity', null, $this->owner)['items'];
        $this->assertSame(['hat Do 12. Mittag: Gnocchi-Pfanne geplant', 'hat „Gnocchi-Pfanne“ gespeichert'], array_column($items, 'summary'));
        $this->assertSame('Claude Code Laptop', $items[0]['keyName']);
        $this->assertSame('rest', $items[0]['channel']);
        // App writes are not logged.
        $this->recipe($this->owner);
        $this->assertCount(2, $this->ok(200, 'GET', '/api/v1/agent-activity', null, $this->owner)['items']);
        $this->assertSame(2, $this->ok(200, 'GET', '/api/v1/agent-activity/unseen-count', null, $this->owner)['count']);
    }
}
