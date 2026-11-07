<?php

declare(strict_types=1);

namespace Essensplan\Repository;

use Essensplan\Db;

/**
 * Recipes with their ingredients and steps. Every method takes $userId;
 * child rows are only read for recipe ids that came out of a scoped query.
 */
final class RecipeRepository
{
    public function __construct(private readonly Db $db)
    {
    }

    /** Cooking stats: non-deleted entries with this recipe, today or earlier (D17). */
    private function statsJoin(): string
    {
        return 'LEFT JOIN (
            SELECT recipe_id, COUNT(*) AS times_cooked, MAX(date) AS last_cooked
            FROM meal_plan_entries
            WHERE user_id = ? AND deleted_at IS NULL AND recipe_id IS NOT NULL AND date <= ?
            GROUP BY recipe_id
        ) s ON s.recipe_id = r.id';
    }

    public static function like(string $q): string
    {
        return '%' . addcslashes($q, '%_\\') . '%';
    }

    /**
     * @param array{q?: ?string, category?: ?string, tags?: list<string>, maxTime?: ?int, minRating?: ?int,
     *              notCookedSince?: ?string, categories?: list<string>, ids?: list<string>} $f
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function search(string $userId, array $f, string $today, string $sort = 'loved', int $limit = 50, int $offset = 0): array
    {
        $select = 'r.*, COALESCE(s.times_cooked, 0) AS times_cooked, s.last_cooked,
            (SELECT COUNT(*) FROM ingredients ic WHERE ic.recipe_id = r.id) AS ingredient_count';
        $selectParams = [];
        $where = ['r.user_id = ?', 'r.deleted_at IS NULL'];
        $params = [$userId];

        $q = trim((string) ($f['q'] ?? ''));
        if ($q !== '') {
            $like = self::like($q);
            $select .= ', CASE WHEN r.title LIKE ? THEN NULL ELSE
                (SELECT i.name FROM ingredients i WHERE i.recipe_id = r.id AND i.name LIKE ? ORDER BY i.position LIMIT 1) END AS matched_ingredient';
            $selectParams = [$like, $like];
            $where[] = '(r.title LIKE ? OR EXISTS (SELECT 1 FROM ingredients i2 WHERE i2.recipe_id = r.id AND i2.name LIKE ?))';
            array_push($params, $like, $like);
        } else {
            $select .= ', NULL AS matched_ingredient';
        }
        if (!empty($f['category'])) {
            $where[] = 'r.category = ?';
            $params[] = $f['category'];
        }
        if (!empty($f['categories'])) {
            $where[] = 'r.category IN (' . Db::marks($f['categories']) . ')';
            array_push($params, ...$f['categories']);
        }
        foreach ($f['tags'] ?? [] as $tag) {
            $where[] = 'JSON_CONTAINS(r.tags, JSON_QUOTE(?))';
            $params[] = $tag;
        }
        if (isset($f['maxTime'])) {
            $where[] = 'COALESCE(r.cooking_time, 999) <= ?';
            $params[] = $f['maxTime'];
        }
        if (isset($f['minRating'])) {
            $where[] = 'COALESCE(r.rating, 0) >= ?';
            $params[] = $f['minRating'];
        }
        if (!empty($f['notCookedSince'])) {
            $where[] = '(s.last_cooked IS NULL OR s.last_cooked <= ?)';
            $params[] = $f['notCookedSince'];
        }
        if (isset($f['ids'])) {
            $where[] = 'r.id IN (' . Db::marks($f['ids']) . ')';
            array_push($params, ...($f['ids'] ?: ['']));
        }
        $order = match ($sort) {
            'title' => 'r.title ASC',
            'newest' => 'r.created_at DESC',
            'time' => 'COALESCE(r.cooking_time, 999) ASC, r.title ASC',
            // longest ago (or never) first: the "what haven't we had" order
            'lastCooked' => "COALESCE(s.last_cooked, '0000-01-01') ASC, r.title ASC",
            default => '(COALESCE(r.rating, 0) * 100 + LEAST(COALESCE(s.times_cooked, 0), 99)) DESC, r.title ASC',
        };
        $from = 'FROM recipes r ' . $this->statsJoin() . ' WHERE ' . implode(' AND ', $where);
        $joinParams = [$userId, $today];
        $total = (int) $this->db->value("SELECT COUNT(*) $from", [...$joinParams, ...$params]);
        $rows = $this->db->all(
            "SELECT $select $from ORDER BY $order, r.id LIMIT " . max(1, $limit) . ' OFFSET ' . max(0, $offset),
            [...$selectParams, ...$joinParams, ...$params],
        );
        return ['rows' => $rows, 'total' => $total];
    }

    /** @return array<string, mixed>|null */
    public function find(string $userId, string $id, string $today, bool $withDeleted = false): ?array
    {
        return $this->db->one(
            'SELECT r.*, COALESCE(s.times_cooked, 0) AS times_cooked, s.last_cooked FROM recipes r ' . $this->statsJoin()
            . ' WHERE r.id = ? AND r.user_id = ?' . ($withDeleted ? '' : ' AND r.deleted_at IS NULL'),
            [$userId, $today, $id, $userId],
        );
    }

    public function exists(string $userId, string $id): bool
    {
        return (bool) $this->db->value('SELECT 1 FROM recipes WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [$id, $userId]);
    }

    /**
     * @param list<string> $recipeIds ids from a scoped query
     * @return array{ingredients: array<string, list<array<string, mixed>>>, instructions: array<string, list<array<string, mixed>>>}
     */
    public function children(array $recipeIds): array
    {
        $out = ['ingredients' => [], 'instructions' => []];
        if (!$recipeIds) {
            return $out;
        }
        $in = Db::marks($recipeIds);
        foreach ($this->db->all("SELECT * FROM ingredients WHERE recipe_id IN ($in) ORDER BY position", $recipeIds) as $row) {
            $out['ingredients'][$row['recipe_id']][] = $row;
        }
        foreach ($this->db->all("SELECT * FROM instructions WHERE recipe_id IN ($in) ORDER BY step_number", $recipeIds) as $row) {
            $out['instructions'][$row['recipe_id']][] = $row;
        }
        return $out;
    }

    /** @param array<string, mixed> $row */
    public function insert(array $row): void
    {
        $this->db->insert('recipes', $row);
    }

    /** @param array<string, mixed> $fields */
    public function update(string $userId, string $id, array $fields): void
    {
        $sets = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($fields)));
        $this->db->exec("UPDATE recipes SET $sets WHERE id = ? AND user_id = ?", [...array_map(Db::param(...), array_values($fields)), $id, $userId]);
    }

    /**
     * Replaces ingredients and steps of a recipe the caller already loaded for $userId.
     *
     * @param list<array<string, mixed>> $ingredients
     * @param list<array<string, mixed>> $instructions
     */
    public function replaceChildren(string $userId, string $recipeId, ?array $ingredients, ?array $instructions): void
    {
        if (!$this->exists($userId, $recipeId)) {
            throw new \LogicException('replaceChildren on a recipe outside the user');
        }
        if ($ingredients !== null) {
            $this->db->exec('DELETE FROM ingredients WHERE recipe_id = ?', [$recipeId]);
            foreach ($ingredients as $row) {
                $this->db->insert('ingredients', ['recipe_id' => $recipeId, ...$row]);
            }
        }
        if ($instructions !== null) {
            $this->db->exec('DELETE FROM instructions WHERE recipe_id = ?', [$recipeId]);
            foreach ($instructions as $row) {
                $this->db->insert('instructions', ['recipe_id' => $recipeId, ...$row]);
            }
        }
    }

    /** @return list<string> live recipe titles (presets leave these out) */
    public function titles(string $userId): array
    {
        return $this->db->column('SELECT title FROM recipes WHERE user_id = ? AND deleted_at IS NULL', [$userId]);
    }
}
