<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Domain\Shopping;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Repository\RecipeRepository;
use Essensplan\Util;

/** Recipes: search, CRUD, soft delete with plan-entry detaching. Shared by REST and MCP. */
final class RecipeService
{
    public const NOT_COOKED_DAYS = 42;

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly RecipeRepository $recipes,
        private readonly ActivityLog $log,
    ) {
    }

    /**
     * @param array<string, mixed> $query validated filters (see recipe-query in BACKEND_REQUIREMENTS §4.3)
     * @return array{items: list<array{recipe: array, matchedIngredient: ?string}>, nextCursor: ?string, total: int}
     */
    public function list(Principal $p, array $query): array
    {
        $limit = min(200, max(1, (int) ($query['limit'] ?? 50)));
        $offset = isset($query['cursor']) ? max(0, (int) base64_decode((string) $query['cursor'], true)) : 0;
        $f = [
            'q' => $query['q'] ?? null,
            'category' => $query['category'] ?? null,
            'tags' => $query['tags'] ?? [],
            'maxTime' => isset($query['maxTime']) ? (int) $query['maxTime'] : (!empty($query['quick']) ? 30 : null),
            'minRating' => isset($query['minRating']) ? (int) $query['minRating'] : (!empty($query['favourites']) ? 4 : null),
            'notCookedSince' => $query['notCookedSince'] ?? null,
        ];
        $result = $this->recipes->search($p->userId, $f, $this->clock->today(), (string) ($query['sort'] ?? 'loved'), $limit, $offset);
        $marks = $this->agentMarks($p->userId);
        $items = array_map(fn ($r) => [
            'recipe' => $this->summaryJson($r, $marks),
            'matchedIngredient' => $r['matched_ingredient'],
        ], $result['rows']);
        $next = $offset + count($items) < $result['total'] ? base64_encode((string) ($offset + $limit)) : null;
        return ['items' => $items, 'nextCursor' => $next, 'total' => $result['total']];
    }

    /** @return array<string, mixed> */
    public function get(Principal $p, string $id): array
    {
        return $this->full($p->userId, $this->row($p->userId, $id));
    }

    /** @return array<string, mixed> */
    private function row(string $userId, string $id, bool $withDeleted = false): array
    {
        return $this->recipes->find($userId, $id, $this->clock->today(), $withDeleted) ?? throw ApiError::notFound('Rezept nicht gefunden.');
    }

    /**
     * @param list<string> $ids
     * @return list<array<string, mixed>> summaries in the order given
     */
    public function summaries(string $userId, array $ids): array
    {
        if (!$ids) {
            return [];
        }
        $rows = $this->recipes->search($userId, ['ids' => $ids], $this->clock->today(), 'title', 500)['rows'];
        $byId = array_column($rows, null, 'id');
        $marks = $this->agentMarks($userId);
        return array_values(array_filter(array_map(fn ($id) => isset($byId[$id]) ? $this->summaryJson($byId[$id], $marks) : null, $ids)));
    }

    /**
     * Rows with stats for the suggestion shelves.
     *
     * @param list<string> $categories
     * @return list<array<string, mixed>>
     */
    public function candidates(string $userId, array $categories): array
    {
        $rows = $this->recipes->search($userId, ['categories' => $categories], $this->clock->today(), 'title', 2000)['rows'];
        $marks = $this->agentMarks($userId);
        return array_map(fn ($r) => $this->summaryJson($r, $marks), $rows);
    }

    /** @param array<string, mixed> $draft validated RecipeDraft */
    public function create(Principal $p, array $draft): array
    {
        return $this->db->transaction(function () use ($p, $draft) {
            $id = Util::uuid();
            $now = $this->clock->dbMicro();
            $this->recipes->insert([
                'id' => $id,
                'user_id' => $p->userId,
                ...$this->columns($draft, true),
                'created_via' => $p->via() === 'app' ? 'app' : $p->via(),
                'created_at' => $this->clock->db(),
                'updated_at' => $now,
            ]);
            $this->writeChildren($p->userId, $id, $draft);
            $recipe = $this->get($p, $id);
            $this->log->record($p, 'recipe.create', $this->target($recipe), "hat „{$recipe['title']}“ gespeichert", [
                'kind' => 'recipe.remove', 'recipeId' => $id, 'afterUpdatedAt' => $now,
            ]);
            return $recipe;
        });
    }

    /**
     * PUT (full draft) or PATCH (any subset). Ingredients and steps are
     * replaced when present.
     */
    public function update(Principal $p, string $id, array $draft, bool $partial): array
    {
        return $this->db->transaction(function () use ($p, $id, $draft, $partial) {
            $before = $this->get($p, $id);
            $now = $this->clock->dbMicro();
            $this->recipes->update($p->userId, $id, [...$this->columns($draft, !$partial), 'updated_at' => $now]);
            $this->writeChildren($p->userId, $id, $draft);
            $after = $this->get($p, $id);
            $this->log->record($p, 'recipe.update', $this->target($after), "hat „{$after['title']}“ geändert", [
                'kind' => 'recipe.restore', 'before' => $before, 'afterUpdatedAt' => $now,
            ]);
            return $after;
        });
    }

    /**
     * Soft delete. Its plan entries stay and keep the title as free text, so
     * the week does not silently lose a day.
     *
     * @return array{recipe: array, detachedEntries: int}
     */
    public function delete(Principal $p, string $id): array
    {
        return $this->db->transaction(function () use ($p, $id) {
            $recipe = $this->get($p, $id);
            $detached = $this->db->exec(
                'UPDATE meal_plan_entries SET note = ?, recipe_id = NULL, detached_recipe_id = ?, updated_at = ?
                 WHERE user_id = ? AND recipe_id = ?',
                [mb_substr($recipe['title'], 0, 80), $id, $this->clock->dbMicro(), $p->userId, $id],
            );
            $this->recipes->update($p->userId, $id, ['deleted_at' => $this->clock->db()]);
            $this->log->record($p, 'recipe.delete', $this->target($recipe), "hat „{$recipe['title']}“ gelöscht", [
                'kind' => 'recipe.undelete', 'recipeId' => $id,
            ]);
            return ['recipe' => $recipe, 'detachedEntries' => $detached];
        });
    }

    /** Undo of delete: the recipe and the entries that still carry its title come back. */
    public function restore(Principal $p, string $id): array
    {
        return $this->db->transaction(function () use ($p, $id) {
            $row = $this->row($p->userId, $id, true);
            if ($row['deleted_at'] === null) {
                return $this->get($p, $id);
            }
            $this->recipes->update($p->userId, $id, ['deleted_at' => null, 'updated_at' => $this->clock->dbMicro()]);
            $this->db->exec(
                'UPDATE meal_plan_entries SET recipe_id = detached_recipe_id, note = NULL, detached_recipe_id = NULL, updated_at = ?
                 WHERE user_id = ? AND detached_recipe_id = ? AND note = ?',
                [$this->clock->dbMicro(), $p->userId, $id, mb_substr($row['title'], 0, 80)],
            );
            return $this->get($p, $id);
        });
    }

    /** Writes a stored version back (undo of an agent's change). */
    public function restoreVersion(Principal $p, array $before): array
    {
        $draft = $before;
        $draft['instructions'] = array_map(fn ($s) => [...$s, 'ingredientIds' => $s['ingredientIds'] ?? null], $before['instructions']);
        return $this->update($p, $before['id'], $draft, false);
    }

    /** @return array{type: string, id: string, label: string, href: string} */
    public function target(array $recipe): array
    {
        return ['type' => 'recipe', 'id' => $recipe['id'], 'label' => $recipe['title'], 'href' => '/rezepte/' . $recipe['id']];
    }

    /* ── Mapping ──────────────────────────────────────────────────────────── */

    /** @return array<string, mixed> recipe columns from a draft; $full fills absent fields with null */
    private function columns(array $d, bool $full): array
    {
        $map = [
            'title' => fn ($v) => trim((string) $v),
            'description' => fn ($v) => $v === null || trim((string) $v) === '' ? null : trim((string) $v),
            'imageUrl' => fn ($v) => $v ?: null,
            'category' => fn ($v) => $v,
            'tags' => fn ($v) => array_values(array_unique($v ?? [])),
            'cookingTime' => fn ($v) => $v,
            'servings' => fn ($v) => $v,
            'difficulty' => fn ($v) => $v,
            'rating' => fn ($v) => $v,
            'sourceUrl' => fn ($v) => $v ?: null,
        ];
        $cols = [
            'title' => 'title', 'description' => 'description', 'imageUrl' => 'image_path', 'category' => 'category',
            'tags' => 'tags', 'cookingTime' => 'cooking_time', 'servings' => 'servings', 'difficulty' => 'difficulty',
            'rating' => 'rating', 'sourceUrl' => 'source_url',
        ];
        $out = [];
        foreach ($cols as $key => $col) {
            if (array_key_exists($key, $d)) {
                $out[$col] = $map[$key]($d[$key]);
            } elseif ($full) {
                $out[$col] = $key === 'tags' ? [] : null;
            }
        }
        return $out;
    }

    /**
     * New ids for every ingredient (never trust client ids across users);
     * steps' ingredientIds are mapped from the draft's ids to the new ones.
     */
    private function writeChildren(string $userId, string $recipeId, array $draft): void
    {
        $idMap = [];
        $ingredients = null;
        if (array_key_exists('ingredients', $draft)) {
            $ingredients = [];
            foreach (array_values($draft['ingredients'] ?? []) as $i => $ing) {
                $newId = Util::uuid();
                if (!empty($ing['id'])) {
                    $idMap[$ing['id']] = $newId;
                }
                $name = trim((string) $ing['name']);
                $ingredients[] = [
                    'id' => $newId,
                    'position' => $i,
                    'name' => $name,
                    'amount' => $ing['amount'] ?? null,
                    'unit' => ($ing['unit'] ?? '') === '' ? null : trim((string) $ing['unit']),
                    'notes' => ($ing['notes'] ?? '') === '' ? null : trim((string) $ing['notes']),
                    'component' => ($ing['component'] ?? '') === '' ? null : trim((string) $ing['component']),
                    'section' => Shopping::classify($name),
                ];
            }
        }
        $instructions = null;
        if (array_key_exists('instructions', $draft)) {
            if ($ingredients === null) {
                // Steps changed alone: keep links to the ingredients that stay.
                foreach ($this->recipes->children([$recipeId])['ingredients'][$recipeId] ?? [] as $row) {
                    $idMap[$row['id']] = $row['id'];
                }
            }
            $instructions = [];
            foreach (array_values($draft['instructions'] ?? []) as $i => $step) {
                $ids = $step['ingredientIds'] ?? null;
                $instructions[] = [
                    'id' => Util::uuid(),
                    'step_number' => $i + 1,
                    'description' => trim((string) $step['description']),
                    'ingredient_ids' => $ids === null ? null : array_values(array_filter(array_map(fn ($x) => $idMap[$x] ?? null, $ids))),
                ];
            }
        }
        $this->recipes->replaceChildren($userId, $recipeId, $ingredients, $instructions);
    }

    /** @return array<string, true> recipe ids with unseen, not undone agent activity */
    public function agentMarks(string $userId): array
    {
        $ids = $this->db->column(
            "SELECT DISTINCT target_id FROM agent_activity WHERE user_id = ? AND target_type = 'recipe' AND seen_at IS NULL AND undone_at IS NULL",
            [$userId],
        );
        return array_fill_keys(array_map('strval', $ids), true);
    }

    /** @param array<string, true> $marks */
    public function summaryJson(array $r, array $marks = []): array
    {
        return [
            'id' => $r['id'],
            'title' => $r['title'],
            'description' => $r['description'],
            'imageUrl' => $r['image_path'],
            'thumbUrl' => MediaStore::thumbOf($r['image_path']),
            'category' => $r['category'],
            'tags' => Util::decode($r['tags']),
            'cookingTime' => $r['cooking_time'] === null ? null : (int) $r['cooking_time'],
            'servings' => $r['servings'] === null ? null : (int) $r['servings'],
            'difficulty' => $r['difficulty'],
            'rating' => $r['rating'] === null ? null : (int) $r['rating'],
            'sourceUrl' => $r['source_url'],
            'createdVia' => $r['created_via'],
            'createdAt' => Util::iso($r['created_at']),
            'updatedAt' => Util::iso($r['updated_at']),
            'cookingStats' => ['timesCooked' => (int) $r['times_cooked'], 'lastCooked' => $r['last_cooked']],
            'ingredientCount' => isset($r['ingredient_count']) ? (int) $r['ingredient_count'] : null,
            'agentChanged' => isset($marks[$r['id']]),
        ];
    }

    private function full(string $userId, array $r): array
    {
        $children = $this->recipes->children([$r['id']]);
        $ingredients = $children['ingredients'][$r['id']] ?? [];
        $recipe = $this->summaryJson($r, $this->agentMarks($userId));
        unset($recipe['ingredientCount']);
        $recipe['ingredients'] = array_map(fn ($i) => [
            'id' => $i['id'],
            'name' => $i['name'],
            'amount' => $i['amount'] === null ? null : (float) $i['amount'],
            'unit' => $i['unit'],
            'notes' => $i['notes'],
            'component' => $i['component'],
            'section' => $i['section'],
        ], $ingredients);
        $recipe['instructions'] = array_map(fn ($s) => [
            'id' => $s['id'],
            'stepNumber' => (int) $s['step_number'],
            'description' => $s['description'],
            'ingredientIds' => $s['ingredient_ids'] === null ? null : Util::decode($s['ingredient_ids']),
        ], $children['instructions'][$r['id']] ?? []);
        return $recipe;
    }
}
