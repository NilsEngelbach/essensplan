<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Util;

/** Week logic, plan entries, presets, suggestions and recipe search. */
final class PlanTest extends TestCase
{
    private Actor $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user();
        $this->me = $this->login();
    }

    /** The home week flips to next week from the planning day on (defaultWeekStart in api.ts). */
    public function testDefaultWeekStart(): void
    {
        // Mo start, Fr planning: Mon 9 – Thu 12 Nov stay, Fri 13 – Sun 15 flip to Mon 16.
        $this->assertSame('2026-11-09', Util::defaultWeekStart('2026-11-09', 1, 5));
        $this->assertSame('2026-11-09', Util::defaultWeekStart('2026-11-12', 1, 5));
        $this->assertSame('2026-11-16', Util::defaultWeekStart('2026-11-13', 1, 5));
        $this->assertSame('2026-11-16', Util::defaultWeekStart('2026-11-15', 1, 5));
        // Sunday start, Thursday planning.
        $this->assertSame('2026-11-08', Util::defaultWeekStart('2026-11-11', 0, 4));
        $this->assertSame('2026-11-15', Util::defaultWeekStart('2026-11-12', 0, 4));
        $this->assertSame('2026-11-15', Util::defaultWeekStart('2026-11-14', 0, 4));
        // A planning day equal to the week start never flips.
        $this->assertSame('2026-11-09', Util::defaultWeekStart('2026-11-15', 1, 1));
        // Through /me with the user's settings (today = Thu 12 Nov, Berlin).
        $this->assertSame('2026-11-09', $this->ok(200, 'GET', '/api/v1/me', null, $this->me)['defaultWeekStart']);
        $this->ok(200, 'PATCH', '/api/v1/me', ['settings' => ['planningWeekday' => 4]], $this->me);
        $this->assertSame('2026-11-16', $this->ok(200, 'GET', '/api/v1/me', null, $this->me)['defaultWeekStart']);
        // Berlin, not UTC: 23:30 UTC on Thursday is already Friday in Berlin.
        $this->ok(200, 'PATCH', '/api/v1/me', ['settings' => ['planningWeekday' => 5]], $this->me);
        $this->clock->set('2026-11-12T23:30:00Z');
        $me = $this->ok(200, 'GET', '/api/v1/me', null, $this->me);
        $this->assertSame(['2026-11-13', '2026-11-16'], [$me['today'], $me['defaultWeekStart']]);
    }

    public function testEntriesRecipeXorNoteMoveAndPositions(): void
    {
        $r = $this->recipe($this->me);
        $a = $this->plan($this->me, self::TODAY, $r['id']);
        $b = $this->plan($this->me, self::TODAY, null, 'lunch', 'Salat dazu');
        $this->assertSame([0, 1], [$a['position'], $b['position']]);
        $this->assertSame('Linsensuppe', $a['recipe']['title']);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'recipeId' => $r['id'], 'note' => 'x'], $this->me);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch'], $this->me);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => '2026-13-01', 'slot' => 'lunch', 'note' => 'x'], $this->me);

        // Reorder within the slot, then move to another day (end of that slot).
        $this->ok(200, 'PATCH', "/api/v1/meal-plan/entries/{$b['id']}", ['position' => 0], $this->me);
        $day = $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries'];
        $this->assertSame([$b['id'], $a['id']], array_column($day, 'id'));
        $this->plan($this->me, '2026-11-13', null, 'dinner', 'Reste');
        $moved = $this->ok(200, 'PATCH', "/api/v1/meal-plan/entries/{$b['id']}", ['date' => '2026-11-13', 'slot' => 'dinner'], $this->me);
        $this->assertSame(['2026-11-13', 'dinner', 1], [$moved['date'], $moved['slot'], $moved['position']]);
        $this->assertSame(0, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries'][0]['position']);

        // Remove and restore (undo toast).
        $this->ok(200, 'DELETE', "/api/v1/meal-plan/entries/{$a['id']}", null, $this->me);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries']);
        $this->ok(200, 'POST', "/api/v1/meal-plan/entries/{$a['id']}/restore", null, $this->me);
        $this->assertCount(1, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-12', null, $this->me)['entries']);
        $this->fails(422, 'validation_failed', 'GET', '/api/v1/meal-plan?from=2026-01-01&to=2026-12-31', null, $this->me);
    }

    /** Per-entry servings (D24): recipe entries only, 1–12, null = the recipe's own. */
    public function testEntryServings(): void
    {
        $r = $this->recipe($this->me);
        $plain = $this->plan($this->me, self::TODAY, $r['id']);
        $this->assertNull($plain['servings']);
        $this->assertSame(4, $plain['recipe']['servings']);

        $six = $this->ok(201, 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'dinner', 'recipeId' => $r['id'], 'servings' => 6], $this->me);
        $this->assertSame(6, $six['servings']);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'note' => 'Reste', 'servings' => 2], $this->me);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'recipeId' => $r['id'], 'servings' => 13], $this->me);
        $this->fails(422, 'validation_failed', 'POST', '/api/v1/meal-plan/entries', ['date' => self::TODAY, 'slot' => 'lunch', 'recipeId' => $r['id'], 'servings' => 0], $this->me);

        // PATCH sets, resets and combines with a move.
        $path = "/api/v1/meal-plan/entries/{$plain['id']}";
        $this->assertSame(2, $this->ok(200, 'PATCH', $path, ['servings' => 2], $this->me)['servings']);
        $this->assertNull($this->ok(200, 'PATCH', $path, ['servings' => null], $this->me)['servings']);
        $both = $this->ok(200, 'PATCH', $path, ['servings' => 8, 'date' => '2026-11-13'], $this->me);
        $this->assertSame([8, '2026-11-13'], [$both['servings'], $both['date']]);
        $note = $this->plan($this->me, self::TODAY, null, 'lunch', 'Reste');
        $this->fails(422, 'validation_failed', 'PATCH', "/api/v1/meal-plan/entries/{$note['id']}", ['servings' => 3], $this->me);
        $this->assertSame(8, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-13&to=2026-11-13', null, $this->me)['entries'][0]['servings']);

        // A detached entry has no servings; restoring the recipe brings them back.
        $this->ok(200, 'DELETE', "/api/v1/recipes/{$r['id']}", null, $this->me);
        $this->assertNull($this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-13&to=2026-11-13', null, $this->me)['entries'][0]['servings']);
        $this->ok(200, 'POST', "/api/v1/recipes/{$r['id']}/restore", null, $this->me);
        $this->assertSame(8, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-13&to=2026-11-13', null, $this->me)['entries'][0]['servings']);
    }

    public function testRecipeDeleteKeepsTheDayAndRestoreRelinks(): void
    {
        $r = $this->recipe($this->me);
        $past = $this->plan($this->me, '2026-11-01', $r['id']);
        $this->plan($this->me, '2026-11-14', $r['id']);
        $this->assertSame(['timesCooked' => 1, 'lastCooked' => '2026-11-01'], $this->ok(200, 'GET', "/api/v1/recipes/{$r['id']}", null, $this->me)['cookingStats']);

        $this->assertSame(2, $this->ok(200, 'DELETE', "/api/v1/recipes/{$r['id']}", null, $this->me)['detachedEntries']);
        $entries = $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-01&to=2026-11-30', null, $this->me)['entries'];
        $this->assertSame([[null, 'Linsensuppe'], [null, 'Linsensuppe']], array_map(fn ($e) => [$e['recipeId'], $e['note']], $entries));
        $this->fails(404, 'not_found', 'GET', "/api/v1/recipes/{$r['id']}", null, $this->me);
        $this->assertSame(['Reste', 'Essen gehen', 'Auswärts', 'Bestellen'], $this->ok(200, 'GET', '/api/v1/meal-plan/presets', null, $this->me)['items'], 'a deleted title is no preset');

        $this->ok(200, 'POST', "/api/v1/recipes/{$r['id']}/restore", null, $this->me);
        $entries = $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-01&to=2026-11-30', null, $this->me)['entries'];
        $this->assertSame([$r['id'], $r['id']], array_column($entries, 'recipeId'));
        $this->assertSame($past['id'], $entries[0]['id']);
    }

    public function testPresets(): void
    {
        $r = $this->recipe($this->me);
        foreach (['Pizza bestellen', 'Reste', 'Oma', 'Linsensuppe', 'Grillen', 'Pizza bestellen', 'Brotzeit', 'Picknick'] as $i => $note) {
            $this->clock->set(sprintf('2026-11-12T09:%02d:00Z', $i));
            $this->plan($this->me, '2026-11-1' . ($i % 7 + 2), null, 'dinner', $note);
        }
        $this->assertSame(['Reste', 'Essen gehen', 'Auswärts', 'Bestellen', 'Picknick', 'Brotzeit', 'Pizza bestellen', 'Grillen'],
            $this->ok(200, 'GET', '/api/v1/meal-plan/presets', null, $this->me)['items']);
        unset($r);
    }

    public function testSuggestionShelves(): void
    {
        $mk = fn (string $title, int $rating, ?int $time, string $cat = 'Hauptspeise') => $this->recipe($this->me, ['title' => $title, 'rating' => $rating, 'cookingTime' => $time, 'category' => $cat]);
        $old = $mk('Lasagne', 5, 90);
        $fav = $mk('Gnocchi', 5, 20);
        $quick = $mk('Rührei', 2, 10);
        $planned = $mk('Chili', 5, 30);
        $mk('Müsli', 5, 5, 'Frühstück');
        $mk('Brownies', 5, 30, 'Dessert');
        $this->plan($this->me, '2026-09-01', $old['id']);        // > 6 weeks ago
        $this->plan($this->me, '2026-11-05', $fav['id']);        // cooked recently, 4 days before the week: excluded? no, -14 window
        $this->plan($this->me, '2026-11-25', $planned['id']);    // within week + 14: excluded
        $this->plan($this->me, '2026-10-20', $fav['id']);

        $shelves = $this->ok(200, 'GET', '/api/v1/suggestions?weekStart=2026-11-23&slot=lunch', null, $this->me)['shelves'];
        $titles = array_combine(array_column($shelves, 'key'), array_map(fn ($s) => array_column($s['recipes'], 'title'), $shelves));
        $this->assertSame(['langeher' => ['Lasagne'], 'lieblinge' => ['Gnocchi'], 'schnell' => ['Rührei']], $titles);
        $this->assertSame('Gut bewertet, seit 6 Wochen nicht gekocht', $shelves[0]['reason']);

        $breakfast = $this->ok(200, 'GET', '/api/v1/suggestions?weekStart=2026-11-23&slot=breakfast', null, $this->me)['shelves'];
        $this->assertSame(['Müsli'], $breakfast[0]['recipes'] ? array_column($breakfast[0]['recipes'], 'title') : []);
        $this->assertSame('lieblinge', $breakfast[0]['key']);
        // Gnocchi was planned on 5 Nov: inside weekStart − 14 for the week of 16 Nov.
        $week16 = $this->ok(200, 'GET', '/api/v1/suggestions?weekStart=2026-11-16&slot=dinner', null, $this->me)['shelves'];
        $this->assertNotContains('Gnocchi', array_merge(...array_map(fn ($s) => array_column($s['recipes'], 'title'), $week16)));
    }

    public function testRecipeSearchFiltersAndSort(): void
    {
        $this->recipe($this->me, ['title' => 'Käsespätzle', 'category' => 'Hauptspeise', 'rating' => 5, 'cookingTime' => 45, 'tags' => ['Vegetarisch'],
            'ingredients' => [['name' => 'Bergkäse', 'amount' => 200, 'unit' => 'g'], ['name' => 'Zwiebeln', 'amount' => 3, 'unit' => null]]]);
        $this->recipe($this->me, ['title' => 'Linsensuppe', 'rating' => 3]);
        $this->recipe($this->me, ['title' => 'Salat 100% grün', 'category' => 'Salat', 'rating' => null, 'cookingTime' => 10, 'tags' => [], 'ingredients' => []]);

        $hits = $this->ok(200, 'GET', '/api/v1/recipes?q=kase', null, $this->me)['items'];
        $this->assertSame(['Käsespätzle'], array_map(fn ($h) => $h['recipe']['title'], $hits), 'accent-insensitive');
        $this->assertNull($hits[0]['matchedIngredient'], 'matched by title');
        $hits = $this->ok(200, 'GET', '/api/v1/recipes?q=zwiebel', null, $this->me)['items'];
        $this->assertSame([['Käsespätzle', 'Zwiebeln'], ['Linsensuppe', 'Zwiebel']], array_map(fn ($h) => [$h['recipe']['title'], $h['matchedIngredient']], $hits));
        $this->assertSame(1, $this->ok(200, 'GET', '/api/v1/recipes?q=100%25', null, $this->me)['total'], '% is literal');

        $titles = fn (string $qs) => array_map(fn ($h) => $h['recipe']['title'], $this->ok(200, 'GET', "/api/v1/recipes?$qs", null, $this->me)['items']);
        $this->assertSame(['Käsespätzle', 'Linsensuppe', 'Salat 100% grün'], $titles(''));
        $this->assertSame(['Käsespätzle'], $titles('favourites=1'));
        $this->assertSame(['Salat 100% grün'], $titles('quick=1'));
        $this->assertSame(['Käsespätzle'], $titles('tags[]=Vegetarisch'));
        $this->assertSame(['Salat 100% grün'], $titles('category=Salat'));
        $this->assertSame(['Salat 100% grün', 'Linsensuppe', 'Käsespätzle'], $titles('sort=time'));
        $this->assertSame(['Käsespätzle', 'Linsensuppe', 'Salat 100% grün'], $titles('sort=title'));
        $page = $this->ok(200, 'GET', '/api/v1/recipes?limit=2', null, $this->me);
        $this->assertCount(2, $page['items']);
        $rest = $this->ok(200, 'GET', '/api/v1/recipes?limit=2&cursor=' . $page['nextCursor'], null, $this->me);
        $this->assertSame(['Salat 100% grün'], array_map(fn ($h) => $h['recipe']['title'], $rest['items']));
        $this->assertNull($rest['nextCursor']);
        $this->fails(422, 'validation_failed', 'GET', '/api/v1/recipes?category=Pizza', null, $this->me);
    }

    public function testRecipeValidationAndStepLinks(): void
    {
        $r = $this->recipe($this->me);
        $this->assertSame([$r['ingredients'][1]['id']], $r['instructions'][0]['ingredientIds'], 'draft ids map to the new ingredient ids');
        $this->assertSame('Trockenware', $r['ingredients'][0]['section']);
        $err = $this->fails(422, 'validation_failed', 'POST', '/api/v1/recipes', ['title' => 'X', 'category' => 'Pizza', 'rating' => 9], $this->me);
        $this->assertNotEmpty($err['details']);
        // Steps alone keep their links to the ingredients that stay.
        $p = $this->ok(200, 'PATCH', "/api/v1/recipes/{$r['id']}", ['instructions' => [['description' => 'Alles kochen.', 'ingredientIds' => [$r['ingredients'][0]['id']]]]], $this->me);
        $this->assertSame([$r['ingredients'][0]['id']], $p['instructions'][0]['ingredientIds']);
        $this->assertCount(3, $p['ingredients']);
        $put = $this->ok(200, 'PUT', "/api/v1/recipes/{$r['id']}", ['title' => 'Neu', 'category' => 'Suppe'], $this->me);
        $this->assertSame([[], [], null, []], [$put['ingredients'], $put['instructions'], $put['rating'], $put['tags']]);
    }
}
