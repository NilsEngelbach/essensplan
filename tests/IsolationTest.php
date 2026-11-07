<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/**
 * Replaces Supabase RLS: nothing of family A is visible to or changeable by
 * family B, neither with B's session nor with B's API key (all scopes).
 */
final class IsolationTest extends TestCase
{
    private const ALL = ['recipes:read', 'recipes:write', 'recipes:delete', 'mealplan:read', 'mealplan:write', 'shopping:read', 'shopping:write'];

    /** @return array{a: Actor, recipe: array, entry: array, item: array, keyId: string, link: array, activityId: string} */
    private function familyA(): array
    {
        $this->user('a@familie.de', 'A');
        $a = $this->login('a@familie.de');
        $recipe = $this->recipe($a);
        $entry = $this->plan($a, self::TODAY, $recipe['id']);
        $item = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Kaffee'], $a);
        $key = $this->key($a, self::ALL);
        $this->ok(201, 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'dinner', 'note' => 'Reste'], $key);
        $link = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $a);
        $activityId = $this->ok(200, 'GET', '/api/v1/agent-activity', null, $a)['items'][0]['id'];
        return ['a' => $a, 'recipe' => $recipe, 'entry' => $entry, 'item' => $item, 'keyId' => $key->keyId, 'link' => $link, 'activityId' => $activityId];
    }

    /** @return array{session: Actor, key: Actor} */
    private function familyB(): array
    {
        $this->user('b@familie.de', 'B');
        $b = $this->login('b@familie.de');
        return ['session' => $b, 'key' => $this->key($b, self::ALL, 'B-Agent')];
    }

    public function testSessionOfAnotherUserSeesNothing(): void
    {
        $a = $this->familyA();
        $b = $this->familyB()['session'];
        $this->assertBlind($a, $b);

        // Session-only resources.
        $this->fails(404, 'not_found', 'DELETE', "/api/v1/api-keys/{$a['keyId']}", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/api-keys/{$a['keyId']}/unrevoke", null, $b);
        $this->assertSame([], array_filter($this->ok(200, 'GET', '/api/v1/api-keys', null, $b)['items'], fn ($k) => $k['id'] === $a['keyId']));
        $this->fails(404, 'not_found', 'GET', "/api/v1/auth/device-links/{$a['link']['id']}", null, $b);
        $this->fails(404, 'not_found', 'DELETE', "/api/v1/auth/sessions/{$a['a']->sessionId}", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/agent-activity/{$a['activityId']}/undo", null, $b);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/agent-activity', null, $b)['items']);
        $sessions = $this->ok(200, 'GET', '/api/v1/auth/sessions', null, $b)['items'];
        $this->assertCount(1, $sessions);
        $this->assertTrue($sessions[0]['current']);
        $this->ok(200, 'POST', '/api/v1/meal-plan/seen', ['ids' => [$a['entry']['id']]], $b);
        $this->ok(200, 'POST', '/api/v1/agent-activity/seen', new \stdClass(), $b);
        $this->assertSame(1, $this->ok(200, 'GET', '/api/v1/agent-activity/unseen-count', null, $a['a'])['count']);

        // B revoking "all others" leaves A logged in.
        $this->ok(200, 'POST', '/api/v1/auth/sessions/revoke-others', null, $b);
        $this->ok(200, 'GET', '/api/v1/me', null, $a['a']);
        $this->assertSame('a@familie.de', $this->ok(200, 'GET', '/api/v1/me', null, $a['a'])['email']);
    }

    public function testKeyOfAnotherUserSeesNothing(): void
    {
        $a = $this->familyA();
        $this->assertBlind($a, $this->familyB()['key']);
    }

    /** What both doors must not reach. */
    private function assertBlind(array $a, Actor $b): void
    {
        $rid = $a['recipe']['id'];
        $this->fails(404, 'not_found', 'GET', "/api/v1/recipes/$rid", null, $b);
        $this->fails(404, 'not_found', 'PATCH', "/api/v1/recipes/$rid", ['title' => 'Gekapert'], $b);
        $this->fails(404, 'not_found', 'PUT', "/api/v1/recipes/$rid", ['title' => 'Gekapert', 'category' => 'Suppe'], $b);
        $this->fails(404, 'not_found', 'DELETE', "/api/v1/recipes/$rid", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/recipes/$rid/restore", null, $b);
        $this->assertSame(0, $this->ok(200, 'GET', '/api/v1/recipes', null, $b)['total']);
        $this->assertSame(0, $this->ok(200, 'GET', '/api/v1/recipes?q=linsen', null, $b)['total']);

        // Planning A's recipe into B's week is refused, and A's entries are invisible.
        $this->fails(404, 'not_found', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'recipeId' => $rid], $b);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-01&to=2026-11-30', null, $b)['entries']);
        $eid = $a['entry']['id'];
        $this->fails(404, 'not_found', 'PATCH', "/api/v1/meal-plan/entries/$eid", ['date' => '2026-11-13'], $b);
        $this->fails(404, 'not_found', 'DELETE', "/api/v1/meal-plan/entries/$eid", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/meal-plan/entries/$eid/restore", null, $b);
        $this->assertSame(['Reste', 'Essen gehen', 'Auswärts', 'Bestellen'], $this->ok(200, 'GET', '/api/v1/meal-plan/presets', null, $b)['items']);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/suggestions?weekStart=2026-11-09&slot=lunch', null, $b)['shelves']);

        // Shopping: A's items and lines never show up, and their keys can't be touched.
        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $b);
        $this->assertSame([], $list['sections']);
        $this->fails(404, 'not_found', 'PATCH', '/api/v1/shopping/items/' . rawurlencode($a['item']['key']), ['checked' => true], $b);
        $this->fails(404, 'not_found', 'PATCH', '/api/v1/shopping/items/rote%20linsen', ['checked' => true], $b);
        $this->fails(404, 'not_found', 'DELETE', "/api/v1/shopping/manual-items/{$a['item']['id']}", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/shopping/manual-items/{$a['item']['id']}/restore", null, $b);
        $aTrip = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $a['a'])['trip']['id'];
        $this->fails(404, 'not_found', 'POST', "/api/v1/shopping/trips/$aTrip/complete", null, $b);
        $this->fails(404, 'not_found', 'POST', "/api/v1/shopping/trips/$aTrip/reopen", null, $b);

        // A's data is untouched.
        $this->assertSame('Linsensuppe', $this->ok(200, 'GET', "/api/v1/recipes/$rid", null, $a['a'])['title']);
        $this->assertCount(2, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-01&to=2026-11-30', null, $a['a'])['entries']);
    }
}
