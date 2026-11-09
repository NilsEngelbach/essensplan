<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Domain\Shopping;

/** Grocery aggregation (parity with shopping.ts) and the trip lifecycle (D16). */
final class ShoppingTest extends TestCase
{
    public function testAggregationMatchesThePrototype(): void
    {
        $f = json_decode((string) file_get_contents(__DIR__ . '/fixtures/shopping-parity.json'), true);
        $php = array_map(fn ($a) => ['key' => $a['key'], 'name' => $a['name'], 'qty' => $a['qty'], 'section' => Shopping::classify($a['name'])], Shopping::aggregate($f['ingredients']));
        $this->assertSame($f['aggregate'], $php);
        foreach ($f['amounts'] as $a) {
            $this->assertSame($a['formatted'], Shopping::formatAmount((float) $a['amount'], $a['unit']), json_encode($a));
        }
    }

    public function testTripFollowsThePlanUntilTouched(): void
    {
        $this->user();
        $me = $this->login();
        $soup = $this->recipe($me);
        $pasta = $this->recipe($me, ['title' => 'Pasta', 'category' => 'Hauptspeise', 'ingredients' => [
            ['name' => 'Zwiebeln', 'amount' => 2, 'unit' => null], ['name' => 'Spaghetti', 'amount' => 500, 'unit' => 'g'], ['name' => 'Wasser', 'amount' => 2, 'unit' => 'l'],
        ], 'instructions' => []]);
        $this->plan($me, '2026-11-12', $soup['id']);
        $this->plan($me, '2026-11-13', $pasta['id']);
        $this->plan($me, '2026-11-14', null, 'lunch', 'Essen gehen');
        $this->plan($me, '2026-11-11', $pasta['id']); // yesterday: not on the list
        $this->plan($me, '2026-11-26', $soup['id']); // day 15: outside the two weeks

        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $this->assertSame(['2026-11-12', '2026-11-13'], $list['trip']['days']);
        $this->assertFalse($list['trip']['daysChosen']);
        $lines = $this->lines($list);
        $this->assertSame('3', $lines['Zwiebeln']['qty'], 'Zwiebel + Zwiebeln fold into one line');
        $this->assertSame('Obst & Gemüse', $lines['Zwiebeln']['section']);
        $this->assertArrayNotHasKey('Wasser', $lines);
        $this->assertFalse($lines['Spaghetti']['isNew'], 'a fresh list has nothing new');
        $this->assertSame(['2026-11-12', '2026-11-13'], array_column($list['planDays'], 'date'));
        $this->assertSame(['Linsensuppe'], $list['planDays'][0]['dishes']);

        // Untouched: a newly planned day joins, its lines print as "neu".
        $this->plan($me, '2026-11-15', $soup['id']);
        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $this->assertSame(['2026-11-12', '2026-11-13', '2026-11-15'], $list['trip']['days']);
        $this->assertSame('500 g', $this->lines($list)['Rote Linsen']['qty']);

        // Touched: days stay.
        $this->ok(200, 'PATCH', '/api/v1/shopping/items/spaghetti', ['checked' => true], $me);
        $this->plan($me, '2026-11-16', $pasta['id']);
        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $this->assertSame(['2026-11-12', '2026-11-13', '2026-11-15'], $list['trip']['days']);
        $this->assertTrue($this->lines($list)['Spaghetti']['checked']);
        $this->assertSame(['spaghetti' => ['checked' => true, 'atHome' => false]], $list['trip']['state']);
    }

    /** Entry servings scale that entry's ingredients (D24); a recipe without servings counts as 4. */
    public function testEntryServingsScaleTheList(): void
    {
        $this->user();
        $me = $this->login();
        $soup = $this->recipe($me); // 4 servings: 250 g Linsen, 1 Zwiebel, 400 ml Kokosmilch
        $pasta = $this->recipe($me, ['title' => 'Pasta', 'category' => 'Hauptspeise', 'servings' => null, 'ingredients' => [
            ['name' => 'Spaghetti', 'amount' => 500, 'unit' => 'g'], ['name' => 'Salz', 'amount' => null, 'unit' => null],
        ], 'instructions' => []]);
        $entry = $this->plan($me, '2026-11-12', $soup['id']);
        $this->ok(201, 'POST', '/api/v1/meal-plan/entries', ['date' => '2026-11-13', 'slot' => 'lunch', 'recipeId' => $pasta['id'], 'servings' => 2], $me);

        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $lines = $this->lines($list);
        $this->assertSame(['250 g', '1', '400 ml', '250 g', ''], [$lines['Rote Linsen']['qty'], $lines['Zwiebel']['qty'], $lines['Kokosmilch']['qty'], $lines['Spaghetti']['qty'], $lines['Salz']['qty']]);
        $this->assertSame(['Linsensuppe'], $list['planDays'][0]['dishes']);
        $this->assertSame(['Pasta (2 Port.)'], $list['planDays'][1]['dishes']);

        // The list follows a change of servings live.
        $this->ok(200, 'PATCH', "/api/v1/meal-plan/entries/{$entry['id']}", ['servings' => 6], $me);
        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $lines = $this->lines($list);
        $this->assertSame(['375 g', '1½', '600 ml'], [$lines['Rote Linsen']['qty'], $lines['Zwiebel']['qty'], $lines['Kokosmilch']['qty']]);
        $this->assertSame(['Linsensuppe (6 Port.)'], $list['planDays'][0]['dishes']);

        // Servings equal to the recipe's own read as unscaled.
        $this->ok(200, 'PATCH', "/api/v1/meal-plan/entries/{$entry['id']}", ['servings' => 4], $me);
        $this->assertSame(['Linsensuppe'], $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me)['planDays'][0]['dishes']);
    }

    public function testNewLinesAtHomeSectionsAndOwnItems(): void
    {
        $this->user();
        $me = $this->login();
        $soup = $this->recipe($me);
        $this->plan($me, self::TODAY, $soup['id']);
        $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);

        // Plan changes print as "neu" until seen.
        $this->ok(200, 'PATCH', "/api/v1/recipes/{$soup['id']}", ['ingredients' => [...$soup['ingredients'], ['name' => 'Möhre', 'amount' => 2, 'unit' => null]]], $me);
        $lines = $this->lines($this->ok(200, 'GET', '/api/v1/shopping/current', null, $me));
        $this->assertTrue($lines['Möhre']['isNew']);
        $this->assertFalse($lines['Kokosmilch']['isNew']);
        $this->ok(204, 'POST', '/api/v1/shopping/seen', ['keys' => ['möhre']], $me);
        $this->assertFalse($this->lines($this->ok(200, 'GET', '/api/v1/shopping/current', null, $me))['Möhre']['isNew']);

        // "Abschnitt ändern" is remembered for the name; an umlaut key in the path works.
        $line = $this->ok(200, 'PATCH', '/api/v1/shopping/items/' . rawurlencode('möhre'), ['section' => 'Tiefkühl'], $me);
        $this->assertSame('Tiefkühl', $line['section']);

        // Own items: classified, agent flag, stay until bought.
        $item = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => '  Klopapier  '], $me);
        $this->assertSame(['Klopapier', 'Drogerie & Haushalt', 'app'], [$item['name'], $item['section'], $item['createdVia']]);
        $this->assertFalse($this->lines($this->ok(200, 'GET', '/api/v1/shopping/current', null, $me))['Klopapier']['isNew']);

        // "da" twice teaches "meist da" for the next trip.
        $this->ok(200, 'PATCH', '/api/v1/shopping/items/kokosmilch', ['atHome' => true], $me);
        $this->assertSame(1, (int) $this->db->value("SELECT count FROM shopping_home_counts WHERE name_key = 'kokosmilch'"));
        $this->ok(200, 'PATCH', '/api/v1/shopping/items/kokosmilch', ['atHome' => true], $me); // no change, no count
        $this->assertSame(1, (int) $this->db->value("SELECT count FROM shopping_home_counts WHERE name_key = 'kokosmilch'"));
        $this->db->exec("UPDATE shopping_home_counts SET count = 2 WHERE name_key = 'kokosmilch'");
        $this->ok(200, 'PATCH', '/api/v1/shopping/items/kokosmilch', ['atHome' => false], $me);
        $this->assertSame(1, (int) $this->db->value("SELECT count FROM shopping_home_counts WHERE name_key = 'kokosmilch'"));
        $this->db->exec("UPDATE shopping_home_counts SET count = 2 WHERE name_key = 'kokosmilch'");
        $this->assertTrue($this->lines($this->ok(200, 'GET', '/api/v1/shopping/current', null, $me))['Kokosmilch']['likelyHome']);
    }

    public function testCompleteAndReopen(): void
    {
        $this->user();
        $me = $this->login();
        $soup = $this->recipe($me);
        $this->plan($me, self::TODAY, $soup['id']);
        $this->plan($me, '2026-11-14', $soup['id']);
        $kaffee = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Kaffee'], $me);
        $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Brot'], $me);
        $list = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $trip = $list['trip']['id'];
        $this->ok(200, 'POST', '/api/v1/shopping/trips', ['days' => [self::TODAY]], $me);
        $this->ok(200, 'PATCH', '/api/v1/shopping/items/' . rawurlencode($kaffee['key']), ['checked' => true], $me);
        $done = $this->ok(200, 'POST', "/api/v1/shopping/trips/$trip/complete", null, $me);
        $this->assertNotNull($done['completedAt']);
        $this->fails(409, 'conflict', 'POST', "/api/v1/shopping/trips/$trip/complete", null, $me);

        // Next trip: today is shopped, the 14th is still open; Kaffee was bought, Brot stays.
        $next = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $this->assertNotSame($trip, $next['trip']['id']);
        $this->assertSame(['2026-11-14'], $next['trip']['days']);
        $this->assertSame([true, false], array_column($next['planDays'], 'shopped'));
        $own = array_keys(array_filter($this->lines($next), fn ($l) => $l['manualId'] !== null));
        $this->assertSame(['Brot'], $own);
        $this->assertSame(['Kaffee'], $next['recentManualNames']);

        // Undo: the old trip is open again with Kaffee, the untouched follow-up is gone.
        $this->ok(200, 'POST', "/api/v1/shopping/trips/$trip/reopen", null, $me);
        $again = $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me);
        $this->assertSame($trip, $again['trip']['id']);
        $this->assertTrue($this->lines($again)['Kaffee']['checked']);
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM shopping_trips'));
    }

    public function testSectionOrderAndRemoveRestore(): void
    {
        $this->user();
        $me = $this->login();
        $this->assertSame(Shopping::SECTIONS, $this->ok(200, 'GET', '/api/v1/shopping/section-order', null, $me)['sections']);
        $order = array_reverse(Shopping::SECTIONS);
        $this->assertSame($order, $this->ok(200, 'PUT', '/api/v1/shopping/section-order', ['sections' => $order], $me)['sections']);
        $this->fails(422, 'validation_failed', 'PUT', '/api/v1/shopping/section-order', ['sections' => ['Kühlung']], $me);

        $item = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Milch'], $me);
        $this->ok(200, 'DELETE', "/api/v1/shopping/manual-items/{$item['id']}", null, $me);
        $this->assertSame([], $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me)['sections']);
        $this->ok(200, 'POST', "/api/v1/shopping/manual-items/{$item['id']}/restore", null, $me);
        $this->assertSame('Kühlung', $this->ok(200, 'GET', '/api/v1/shopping/current', null, $me)['sections'][0]['section']);
    }

    /** @return array<string, array<string, mixed>> lines by name */
    private function lines(array $list): array
    {
        $out = [];
        foreach ($list['sections'] as $s) {
            foreach ($s['lines'] as $l) {
                $out[$l['name']] = $l;
            }
        }
        return $out;
    }
}
