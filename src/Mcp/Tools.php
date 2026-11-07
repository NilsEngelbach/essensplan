<?php

declare(strict_types=1);

namespace Essensplan\Mcp;

use Essensplan\Clock;
use Essensplan\Domain\Catalog;
use Essensplan\Http\Controller\RecipeController;
use Essensplan\Http\Principal;
use Essensplan\Schema\Schemas;
use Essensplan\Service\AuthService;
use Essensplan\Service\PlanService;
use Essensplan\Service\RecipeService;
use Essensplan\Service\ShoppingService;
use Essensplan\Util;

/**
 * The MCP tools (MIGRATION_PLAN §7 + the shopping tools of HANDOFF §4). Each
 * one calls the same service as its REST route, so scopes, validation and
 * agent_activity logging are identical.
 */
final class Tools
{
    public function __construct(
        private readonly Clock $clock,
        private readonly AuthService $auth,
        private readonly RecipeService $recipes,
        private readonly PlanService $plan,
        private readonly ShoppingService $shopping,
    ) {
    }

    /** @return array<string, array{scope: string, description: string, annotations: array, inputSchema: array, run: callable(Principal, array): mixed}> */
    public function all(): array
    {
        $empty = ['type' => 'object', 'properties' => new \stdClass(), 'additionalProperties' => false];
        $id = ['type' => 'object', 'properties' => ['id' => ['type' => 'string']], 'required' => ['id'], 'additionalProperties' => false];
        $date = ['type' => 'string', 'format' => 'date', 'description' => 'YYYY-MM-DD (Europe/Berlin)'];
        $slot = ['enum' => array_keys(Catalog::SLOTS), 'description' => 'breakfast = Frühstück, lunch = Mittagessen, dinner = Abendessen, snack = Snack'];
        $ro = ['readOnlyHint' => true, 'destructiveHint' => false, 'openWorldHint' => false];
        $patch = Schemas::get('recipe-patch');
        unset($patch['minProperties']);
        $patch['properties'] = ['id' => ['type' => 'string', 'description' => 'Recipe id'], ...$patch['properties']];
        $patch['required'] = ['id'];

        return [
            'get_profile' => [
                'scope' => 'profile:read',
                'description' => 'Today\'s date, the family\'s week start and planning day (0 = Sunday … 6 = Saturday) and the week the app opens on. Call this before planning.',
                'annotations' => ['title' => 'Profil und Woche', ...$ro],
                'inputSchema' => $empty,
                'run' => function (Principal $p) {
                    $me = $this->auth->me($p);
                    return ['today' => $me['today'], 'weekStart' => $me['settings']['weekStart'], 'planningWeekday' => $me['settings']['planningWeekday'], 'defaultWeekStart' => $me['defaultWeekStart']];
                },
            ],
            'search_recipes' => [
                'scope' => 'recipes:read',
                'description' => 'Search the family\'s recipes by title or ingredient, with filters. Returns compact recipes with cooking stats (timesCooked, lastCooked).',
                'annotations' => ['title' => 'Rezepte suchen', ...$ro],
                'inputSchema' => ['type' => 'object', 'additionalProperties' => false, 'properties' => [
                    'q' => ['type' => 'string', 'description' => 'Words in the title or an ingredient'],
                    'category' => ['enum' => Catalog::CATEGORIES],
                    'tags' => ['type' => 'array', 'items' => ['enum' => Catalog::TAGS], 'description' => 'All must match'],
                    'maxTime' => ['type' => 'integer', 'minimum' => 1, 'description' => 'Minutes'],
                    'minRating' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 5],
                    'notCookedSince' => $date,
                    'sort' => ['enum' => ['loved', 'title', 'lastCooked', 'newest', 'time']],
                    'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 100],
                ]],
                'run' => function (Principal $p, array $a) {
                    $r = $this->recipes->list($p, RecipeController::query($a + ['limit' => 30]));
                    return [
                        'total' => $r['total'],
                        'recipes' => array_map(fn ($i) => array_filter([
                            'id' => $i['recipe']['id'],
                            'title' => $i['recipe']['title'],
                            'category' => $i['recipe']['category'],
                            'tags' => $i['recipe']['tags'],
                            'cookingTime' => $i['recipe']['cookingTime'],
                            'rating' => $i['recipe']['rating'],
                            'timesCooked' => $i['recipe']['cookingStats']['timesCooked'],
                            'lastCooked' => $i['recipe']['cookingStats']['lastCooked'],
                            'matchedIngredient' => $i['matchedIngredient'],
                        ], fn ($v) => $v !== null && $v !== []), $r['items']),
                    ];
                },
            ],
            'get_recipe' => [
                'scope' => 'recipes:read',
                'description' => 'One recipe with ingredients (for the base servings) and steps.',
                'annotations' => ['title' => 'Rezept lesen', ...$ro],
                'inputSchema' => $id,
                'run' => fn (Principal $p, array $a) => $this->recipes->get($p, $a['id']),
            ],
            'create_recipe' => [
                'scope' => 'recipes:write',
                'description' => 'Save a recipe you extracted or wrote. Use only the given categories and tags. Ingredient amounts are numbers; units like g, kg, ml, l, EL, TL, Stück, Prise, Zehen.',
                'annotations' => ['title' => 'Rezept speichern', 'readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => false, 'openWorldHint' => false],
                'inputSchema' => Schemas::get('recipe'),
                'run' => fn (Principal $p, array $a) => $this->recipes->create($p, $a),
            ],
            'update_recipe' => [
                'scope' => 'recipes:write',
                'description' => 'Change some fields of a recipe. If ingredients or instructions are given, they replace the whole list.',
                'annotations' => ['title' => 'Rezept ändern', 'readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false],
                'inputSchema' => $patch,
                'run' => function (Principal $p, array $a) {
                    $id = $a['id'];
                    unset($a['id']);
                    return $this->recipes->update($p, $id, $a, true);
                },
            ],
            'delete_recipe' => [
                'scope' => 'recipes:delete',
                'description' => 'Delete a recipe. Planned days keep its title as text. The family can undo this in the app.',
                'annotations' => ['title' => 'Rezept löschen', 'readOnlyHint' => false, 'destructiveHint' => true, 'idempotentHint' => false, 'openWorldHint' => false],
                'inputSchema' => $id,
                'run' => fn (Principal $p, array $a) => ['deleted' => $a['id'], 'detachedEntries' => $this->recipes->delete($p, $a['id'])['detachedEntries']],
            ],
            'list_meal_slots' => [
                'scope' => 'mealplan:read',
                'description' => 'The four fixed meal slots.',
                'annotations' => ['title' => 'Mahlzeiten', ...$ro],
                'inputSchema' => $empty,
                'run' => fn () => ['slots' => $this->plan->slots()],
            ],
            'get_meal_plan' => [
                'scope' => 'mealplan:read',
                'description' => 'The plan from..to (at most 62 days), grouped by day and slot. An entry is a recipe or a free text such as "Reste".',
                'annotations' => ['title' => 'Wochenplan lesen', ...$ro],
                'inputSchema' => ['type' => 'object', 'required' => ['from', 'to'], 'additionalProperties' => false, 'properties' => ['from' => $date, 'to' => $date]],
                'run' => fn (Principal $p, array $a) => $this->grouped($this->plan->list($p, $a['from'], $a['to'])),
            ],
            'add_meal' => [
                'scope' => 'mealplan:write',
                'description' => 'Plan a recipe (recipeId) or a free text (note), not both, for a day and slot. Several entries per slot are fine.',
                'annotations' => ['title' => 'Mahlzeit planen', 'readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => false, 'openWorldHint' => false],
                'inputSchema' => Schemas::get('plan-entry'),
                'run' => fn (Principal $p, array $a) => $this->plan->add($p, $a),
            ],
            'move_meal' => [
                'scope' => 'mealplan:write',
                'description' => 'Move an entry to another day and/or slot (and optionally a position within the slot).',
                'annotations' => ['title' => 'Mahlzeit verschieben', 'readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => true, 'openWorldHint' => false],
                'inputSchema' => ['type' => 'object', 'required' => ['id'], 'additionalProperties' => false, 'properties' => [
                    'id' => ['type' => 'string'], 'date' => $date, 'slot' => $slot, 'position' => ['type' => 'integer', 'minimum' => 0],
                ]],
                'run' => function (Principal $p, array $a) {
                    $id = $a['id'];
                    unset($a['id']);
                    return $this->plan->move($p, $id, $a);
                },
            ],
            'remove_meal' => [
                'scope' => 'mealplan:write',
                'description' => 'Remove an entry from the plan.',
                'annotations' => ['title' => 'Mahlzeit entfernen', 'readOnlyHint' => false, 'destructiveHint' => true, 'idempotentHint' => true, 'openWorldHint' => false],
                'inputSchema' => $id,
                'run' => fn (Principal $p, array $a) => ['removed' => $this->plan->remove($p, $a['id'])['id']],
            ],
            'suggest_meals' => [
                'scope' => 'recipes:read',
                'description' => 'Suggestion shelves for a week and slot: long not eaten, favourites, quick. Recipes planned within 14 days of that week are left out.',
                'annotations' => ['title' => 'Vorschläge', ...$ro],
                'inputSchema' => ['type' => 'object', 'additionalProperties' => false, 'properties' => [
                    'weekStart' => [...$date, 'description' => 'First day of the week; default: the week the app opens on'], 'slot' => $slot,
                ]],
                'run' => function (Principal $p, array $a) {
                    $week = $a['weekStart'] ?? $this->auth->me($p)['defaultWeekStart'];
                    $shelves = $this->plan->suggestions($p, $week, $a['slot'] ?? 'lunch');
                    return ['weekStart' => $week, 'shelves' => array_map(fn ($s) => [
                        'key' => $s['key'], 'title' => $s['title'], 'reason' => $s['reason'],
                        'recipes' => array_map(fn ($r) => ['id' => $r['id'], 'title' => $r['title'], 'cookingTime' => $r['cookingTime'], 'rating' => $r['rating'], 'lastCooked' => $r['cookingStats']['lastCooked']], $s['recipes']),
                    ], $shelves)];
                },
            ],
            'get_grocery_list' => [
                'scope' => 'shopping:read',
                'description' => 'The current shopping list: the trip\'s days, lines by store section (added up from the planned recipes) and own items.',
                'annotations' => ['title' => 'Einkaufsliste lesen', ...$ro],
                'inputSchema' => $empty,
                'run' => fn (Principal $p) => $this->shopping->forAgent($p),
            ],
            'add_grocery_item' => [
                'scope' => 'shopping:write',
                'description' => 'Put an extra item on the shopping list (stays until bought).',
                'annotations' => ['title' => 'Auf die Einkaufsliste', 'readOnlyHint' => false, 'destructiveHint' => false, 'idempotentHint' => false, 'openWorldHint' => false],
                'inputSchema' => Schemas::get('manual-item'),
                'run' => fn (Principal $p, array $a) => $this->shopping->addManual($p, $a['name']),
            ],
        ];
    }

    /** Entries → days → slots, easier for a model to read than a flat list. */
    private function grouped(array $entries): array
    {
        $days = [];
        foreach ($entries as $e) {
            $days[$e['date']]['date'] = $e['date'];
            $days[$e['date']]['weekday'] = Util::WEEKDAY[Util::weekday($e['date'])];
            $days[$e['date']]['slots'][$e['slot']][] = array_filter([
                'id' => $e['id'],
                'recipeId' => $e['recipeId'],
                'title' => $e['recipe']['title'] ?? null,
                'note' => $e['note'],
                'createdVia' => $e['createdVia'],
            ], fn ($v) => $v !== null);
        }
        return ['today' => $this->clock->today(), 'days' => array_values($days)];
    }

    /** @return array<string, array{description: string, arguments: list<array>}> */
    public static function prompts(): array
    {
        return [
            'plan_week' => [
                'description' => 'Plan a week of meals for the family, respecting their week start and planning day.',
                'arguments' => [
                    ['name' => 'week', 'description' => 'First day of the week (YYYY-MM-DD); default: the week the app opens on', 'required' => false],
                    ['name' => 'wishes', 'description' => 'e.g. "vegetarisch mittags, Mittwoch schnell"', 'required' => false],
                ],
            ],
            'shopping_for_week' => [
                'description' => 'Check the shopping list for the planned days and add what is missing.',
                'arguments' => [],
            ],
        ];
    }

    public function prompt(Principal $p, string $name, array $args): array
    {
        $me = $this->auth->me($p);
        $week = (isset($args['week']) && Util::isDate($args['week'])) ? $args['week'] : $me['defaultWeekStart'];
        $end = Util::addDays($week, 6);
        $days = implode(', ', array_map(fn ($i) => Util::dayShort(Util::addDays($week, $i)), range(0, 6)));
        $text = match ($name) {
            'plan_week' => "Plane die Woche vom $week bis $end ($days) für unsere Familie. Heute ist {$me['today']}.\n"
                . "1. Lies den bestehenden Plan mit get_meal_plan (from $week, to $end) und lass belegte Mahlzeiten stehen.\n"
                . "2. Hol dir Ideen mit suggest_meals (weekStart $week) und search_recipes. Keine Wiederholungen aus den letzten 14 Tagen.\n"
                . "3. Plane vor allem Mittagessen (lunch); Freitext wie \"Reste\" oder \"Essen gehen\" ist erlaubt.\n"
                . "4. Trag die Mahlzeiten mit add_meal ein und fasse am Ende kurz zusammen, was du geplant hast."
                . (isset($args['wishes']) && $args['wishes'] !== '' ? "\nWünsche: {$args['wishes']}" : ''),
            'shopping_for_week' => "Prüfe die Einkaufsliste mit get_grocery_list. Heute ist {$me['today']}.\n"
                . "Wenn für geplante Rezepte etwas fehlt, das nicht aus dem Plan kommt (z. B. Getränke, Haushalt), setz es mit add_grocery_item drauf. Fasse zusammen, was du ergänzt hast.",
            default => throw new \InvalidArgumentException('unknown prompt'),
        };
        return [
            'description' => self::prompts()[$name]['description'],
            'messages' => [['role' => 'user', 'content' => ['type' => 'text', 'text' => $text]]],
        ];
    }
}
