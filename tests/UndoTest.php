<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** Per-action undo of agent writes: only while the target is unchanged (D18). */
final class UndoTest extends TestCase
{
    private Actor $me;
    private Actor $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user();
        $this->me = $this->login();
        $this->agent = $this->key($this->me, ['recipes:write', 'recipes:delete', 'mealplan:write', 'shopping:write']);
    }

    private function lastActivity(): array
    {
        return $this->ok(200, 'GET', '/api/v1/agent-activity', null, $this->me)['items'][0];
    }

    private function tick(string $time): void
    {
        $this->clock->set("2026-11-12T$time" . 'Z');
    }

    public function testUndoPlannedEntryAndShoppingItem(): void
    {
        $entry = $this->plan($this->agent, self::TODAY, null, 'lunch', 'Reste');
        $act = $this->lastActivity();
        $this->assertNull($act['undoBlocked']);
        $this->assertSame('plan.remove', $act['undo']['kind']);
        $this->ok(200, 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries']);
        $err = $this->fails(409, 'undo_blocked', 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $this->assertSame('Das lässt sich nicht rückgängig machen.', $err['message']);
        unset($entry);

        $this->tick('09:01:00');
        $item = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Backpapier'], $this->agent);
        $act = $this->lastActivity();
        $this->assertSame('hat „Backpapier“ auf die Einkaufsliste gesetzt', $act['summary']);
        $this->assertTrue($this->lines()['Backpapier']['agent']);
        // Removed in the app meanwhile: undo is blocked with the prototype's reason.
        $this->ok(200, 'DELETE', "/api/v1/shopping/manual-items/{$item['id']}", null, $this->me);
        $err = $this->fails(409, 'undo_blocked', 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $this->assertSame('Nicht mehr rückgängig: Der Artikel ist schon von der Liste.', $err['message']);
    }

    public function testRecipeUpdateUndoIsBlockedAfterAnotherChange(): void
    {
        $r = $this->recipe($this->me);
        $this->tick('09:01:00');
        $this->ok(200, 'PATCH', "/api/v1/recipes/{$r['id']}", ['tags' => ['Vegan', 'Gesund']], $this->agent);
        $act = $this->lastActivity();
        $this->assertSame('hat „Linsensuppe“ geändert', $act['summary']);
        $this->assertSame([$r['id']], $this->ok(200, 'GET', '/api/v1/agent-activity/unseen-count', null, $this->me)['recipeIds']);
        $this->assertTrue($this->ok(200, 'GET', "/api/v1/recipes/{$r['id']}", null, $this->me)['agentChanged']);

        // Undo restores the previous version, ingredients included.
        $this->tick('09:02:00');
        $this->ok(200, 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $back = $this->ok(200, 'GET', "/api/v1/recipes/{$r['id']}", null, $this->me);
        $this->assertSame(['Vegan'], $back['tags']);
        $this->assertSame(array_column($r['ingredients'], 'name'), array_column($back['ingredients'], 'name'));
        $this->assertFalse($back['agentChanged']);

        // A second agent change, then the family edits: undo is refused.
        $this->tick('09:03:00');
        $this->ok(200, 'PATCH', "/api/v1/recipes/{$r['id']}", ['rating' => 5], $this->agent);
        $act = $this->lastActivity();
        $this->tick('09:04:00');
        $this->ok(200, 'PATCH', "/api/v1/recipes/{$r['id']}", ['rating' => 3], $this->me);
        $this->assertSame('Nicht mehr rückgängig: „Linsensuppe“ wurde inzwischen geändert.', $this->lastActivity()['undoBlocked']);
        $this->fails(409, 'undo_blocked', 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $this->assertSame(3, $this->ok(200, 'GET', "/api/v1/recipes/{$r['id']}", null, $this->me)['rating']);

        // Opening the recipe marks it seen.
        $this->ok(200, 'POST', '/api/v1/agent-activity/seen', ['recipeId' => $r['id']], $this->me);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/agent-activity/unseen-count', null, $this->me)['recipeIds']);
    }

    public function testServingsUndo(): void
    {
        $r = $this->recipe($this->me);
        $entry = $this->plan($this->me, self::TODAY, $r['id']);
        $path = "/api/v1/meal-plan/entries/{$entry['id']}";
        $this->ok(200, 'PATCH', $path, ['servings' => 6], $this->agent);
        $act = $this->lastActivity();
        $this->assertSame(['plan.servings', 'hat Do 12. Mittag: Linsensuppe auf 6 Portionen gesetzt'], [$act['undo']['kind'], $act['summary']]);
        $this->ok(200, 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
        $this->assertNull($this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries'][0]['servings']);

        // Blocked once the family changed the entry again.
        $this->tick('09:01:00');
        $this->ok(200, 'PATCH', $path, ['servings' => 8], $this->agent);
        $act = $this->lastActivity();
        $this->tick('09:02:00');
        $this->ok(200, 'PATCH', $path, ['servings' => 2], $this->me);
        $this->fails(409, 'undo_blocked', 'POST', "/api/v1/agent-activity/{$act['id']}/undo", null, $this->me);
    }

    public function testMoveAndDeleteUndo(): void
    {
        $r = $this->recipe($this->me);
        $entry = $this->plan($this->me, self::TODAY, $r['id']);
        $this->ok(200, 'PATCH', "/api/v1/meal-plan/entries/{$entry['id']}", ['date' => '2026-11-14'], $this->agent);
        $move = $this->lastActivity();
        $this->assertSame('hat Linsensuppe auf Sa 14. Mittag verschoben', $move['summary']);
        $this->ok(200, 'POST', "/api/v1/agent-activity/{$move['id']}/undo", null, $this->me);
        $this->assertSame(self::TODAY, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-14', null, $this->me)['entries'][0]['date']);

        $this->tick('09:01:00');
        $this->ok(200, 'DELETE', "/api/v1/recipes/{$r['id']}", null, $this->agent);
        $del = $this->lastActivity();
        $this->assertSame('recipe.undelete', $del['undo']['kind']);
        $this->ok(200, 'POST', "/api/v1/agent-activity/{$del['id']}/undo", null, $this->me);
        $this->assertSame($r['id'], $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-14', null, $this->me)['entries'][0]['recipeId']);
    }

    /** @return array<string, array<string, mixed>> */
    private function lines(): array
    {
        $out = [];
        foreach ($this->ok(200, 'GET', '/api/v1/shopping/current', null, $this->me)['sections'] as $s) {
            foreach ($s['lines'] as $l) {
                $out[$l['name']] = $l;
            }
        }
        return $out;
    }
}
