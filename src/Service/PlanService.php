<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Domain\Catalog;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Repository\RecipeRepository;
use Essensplan\Repository\UserRepository;
use Essensplan\Util;

/**
 * Meal plan entries (D3, D7, D15): a recipe or free text per entry, several
 * per slot, ordered by position. Plus presets and suggestion shelves.
 */
final class PlanService
{
    public const MAX_RANGE_DAYS = 62;

    private const SLOT_CATEGORIES = [
        'breakfast' => ['Frühstück'],
        'lunch' => ['Hauptspeise', 'Suppe', 'Salat'],
        'dinner' => ['Hauptspeise', 'Suppe', 'Salat'],
        'snack' => ['Snack', 'Dessert'],
    ];

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly RecipeRepository $recipeRepo,
        private readonly RecipeService $recipes,
        private readonly UserRepository $users,
        private readonly ActivityLog $log,
    ) {
    }

    public function slots(): array
    {
        $out = [];
        foreach (Catalog::SLOTS as $key => $s) {
            $out[] = ['key' => $key, 'name' => $s['name'], 'short' => $s['short'], 'position' => $s['id']];
        }
        return $out;
    }

    /** @return list<array<string, mixed>> entries with an embedded recipe summary, by date, slot, position */
    public function list(Principal $p, string $from, string $to): array
    {
        if (!Util::isDate($from) || !Util::isDate($to) || $to < $from) {
            throw ApiError::field('from', 'Gib einen gültigen Zeitraum an (from ≤ to, YYYY-MM-DD).');
        }
        if (Util::daysBetween($from, $to) > self::MAX_RANGE_DAYS) {
            throw ApiError::field('to', 'Höchstens ' . self::MAX_RANGE_DAYS . ' Tage auf einmal.');
        }
        $rows = $this->db->all(
            'SELECT e.*, r.title AS recipe_title, r.image_path AS recipe_image, r.cooking_time AS recipe_time, r.category AS recipe_category
             FROM meal_plan_entries e
             LEFT JOIN recipes r ON r.id = e.recipe_id AND r.user_id = e.user_id
             WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.date BETWEEN ? AND ?
             ORDER BY e.date, e.meal_slot_id, e.position, e.created_at',
            [$p->userId, $from, $to],
        );
        return array_map($this->json(...), $rows);
    }

    /** @return array<string, mixed>|null */
    private function row(string $userId, string $id, bool $withDeleted = false): ?array
    {
        return $this->db->one(
            'SELECT e.*, r.title AS recipe_title, r.image_path AS recipe_image, r.cooking_time AS recipe_time, r.category AS recipe_category
             FROM meal_plan_entries e
             LEFT JOIN recipes r ON r.id = e.recipe_id AND r.user_id = e.user_id
             WHERE e.id = ? AND e.user_id = ?' . ($withDeleted ? '' : ' AND e.deleted_at IS NULL'),
            [$id, $userId],
        );
    }

    public function get(Principal $p, string $id): array
    {
        return $this->json($this->row($p->userId, $id) ?? throw ApiError::notFound('Diesen Eintrag gibt es nicht mehr.'));
    }

    /** Adds a recipe or a free-text entry at the end of that day's slot. */
    public function add(Principal $p, array $in): array
    {
        $date = $in['date'];
        $slot = $in['slot'];
        $note = isset($in['note']) ? mb_substr(trim((string) $in['note']), 0, 80) : '';
        $recipeId = $in['recipeId'] ?? null;
        if (($note === '') === ($recipeId === null)) {
            throw ApiError::field('recipeId', 'Ein Eintrag braucht ein Rezept oder einen Text, nicht beides.');
        }
        return $this->db->transaction(function () use ($p, $date, $slot, $note, $recipeId) {
            if ($recipeId !== null && !$this->recipeRepo->exists($p->userId, $recipeId)) {
                throw ApiError::notFound('Rezept nicht gefunden.');
            }
            $id = Util::uuid();
            $now = $this->clock->dbMicro();
            $this->db->insert('meal_plan_entries', [
                'id' => $id,
                'user_id' => $p->userId,
                'date' => $date,
                'meal_slot_id' => Catalog::slotId($slot),
                'recipe_id' => $recipeId,
                'note' => $recipeId === null ? $note : null,
                'position' => $this->nextPosition($p->userId, $date, $slot),
                'created_via' => $p->via(),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $entry = $this->get($p, $id);
            $this->log->record($p, 'plan.add', $this->target($entry), 'hat ' . $this->where($entry) . ': ' . $this->label($entry) . ' geplant', [
                'kind' => 'plan.remove', 'entryId' => $id,
            ]);
            return $entry;
        });
    }

    /**
     * Moves and/or reorders. A move without a position goes to the end of the
     * target slot; positions in both slots are renumbered.
     */
    public function move(Principal $p, string $id, array $in): array
    {
        return $this->db->transaction(function () use ($p, $id, $in) {
            $before = $this->row($p->userId, $id) ?? throw ApiError::notFound('Diesen Eintrag gibt es nicht mehr.');
            $fromSlot = Catalog::slotKey((int) $before['meal_slot_id']);
            $date = $in['date'] ?? $before['date'];
            $slot = $in['slot'] ?? $fromSlot;
            $samePlace = $date === $before['date'] && $slot === $fromSlot;
            if ($samePlace && !isset($in['position'])) {
                return $this->json($before);
            }
            $siblings = $this->db->column(
                'SELECT id FROM meal_plan_entries WHERE user_id = ? AND date = ? AND meal_slot_id = ? AND deleted_at IS NULL AND id <> ?
                 ORDER BY position, created_at',
                [$p->userId, $date, Catalog::slotId($slot), $id],
            );
            $index = isset($in['position']) ? max(0, min(count($siblings), (int) $in['position'])) : count($siblings);
            array_splice($siblings, $index, 0, [$id]);
            $now = $this->clock->dbMicro();
            $this->db->exec(
                'UPDATE meal_plan_entries SET date = ?, meal_slot_id = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                [$date, Catalog::slotId($slot), $now, $id, $p->userId],
            );
            $this->renumber($p->userId, $siblings);
            if (!$samePlace) {
                $this->renumber($p->userId, $this->db->column(
                    'SELECT id FROM meal_plan_entries WHERE user_id = ? AND date = ? AND meal_slot_id = ? AND deleted_at IS NULL ORDER BY position, created_at',
                    [$p->userId, $before['date'], $before['meal_slot_id']],
                ));
            }
            $entry = $this->get($p, $id);
            if (!$samePlace) {
                $this->log->record($p, 'plan.move', $this->target($entry), 'hat ' . $this->label($entry) . ' auf ' . $this->where($entry) . ' verschoben', [
                    'kind' => 'plan.move', 'entryId' => $id,
                    'from' => ['date' => $before['date'], 'slot' => $fromSlot, 'position' => (int) $before['position']],
                    'afterUpdatedAt' => $now,
                ]);
            }
            return $entry;
        });
    }

    /** Soft delete; returns the removed entry (for the undo toast). */
    public function remove(Principal $p, string $id): array
    {
        return $this->db->transaction(function () use ($p, $id) {
            $entry = $this->get($p, $id);
            $this->db->exec('UPDATE meal_plan_entries SET deleted_at = ? WHERE id = ? AND user_id = ?', [$this->clock->db(), $id, $p->userId]);
            $this->log->record($p, 'plan.remove', $this->target($entry), 'hat ' . $this->where($entry) . ': ' . $this->label($entry) . ' aus dem Plan genommen', [
                'kind' => 'plan.restore', 'entryId' => $id,
            ]);
            return $entry;
        });
    }

    public function restore(Principal $p, string $id): array
    {
        $row = $this->row($p->userId, $id, true) ?? throw ApiError::notFound('Diesen Eintrag gibt es nicht mehr.');
        if ($row['recipe_id'] !== null && !$this->recipeRepo->exists($p->userId, $row['recipe_id'])) {
            throw ApiError::conflict('Das Rezept zu diesem Eintrag gibt es nicht mehr.');
        }
        $this->db->exec('UPDATE meal_plan_entries SET deleted_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?', [$this->clock->dbMicro(), $id, $p->userId]);
        return $this->get($p, $id);
    }

    /** Agent-created entries were seen in the app: their LED goes out. */
    public function markSeen(Principal $p, array $ids): int
    {
        if (!$ids) {
            return 0;
        }
        return $this->db->exec(
            'UPDATE meal_plan_entries SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL AND id IN (' . Db::marks($ids) . ')',
            [$this->clock->db(), $p->userId, ...$ids],
        );
    }

    /** Fixed presets plus the four most recent own free texts. */
    public function presets(Principal $p): array
    {
        $exclude = array_map(fn ($s) => mb_strtolower($s), [...Catalog::PRESETS, ...$this->recipeRepo->titles($p->userId)]);
        $rows = $this->db->column(
            "SELECT note FROM meal_plan_entries WHERE user_id = ? AND note IS NOT NULL AND created_via = 'app' AND detached_recipe_id IS NULL
             GROUP BY note ORDER BY MAX(created_at) DESC LIMIT 40",
            [$p->userId],
        );
        $recent = [];
        foreach ($rows as $note) {
            if (!in_array(mb_strtolower($note), $exclude, true)) {
                $recent[] = $note;
            }
            if (count($recent) === 4) {
                break;
            }
        }
        return [...Catalog::PRESETS, ...$recent];
    }

    /**
     * Suggestion shelves for a slot in the week starting at $weekStart. Every
     * shelf states its reason; recipes planned within 14 days of the week are left out.
     */
    public function suggestions(Principal $p, string $weekStart, string $slot): array
    {
        $today = $this->clock->today();
        $planned = array_fill_keys($this->db->column(
            'SELECT DISTINCT recipe_id FROM meal_plan_entries WHERE user_id = ? AND deleted_at IS NULL AND recipe_id IS NOT NULL AND date BETWEEN ? AND ?',
            [$p->userId, Util::addDays($weekStart, -14), Util::addDays($weekStart, 6 + 14)],
        ), true);
        $fits = array_values(array_filter(
            $this->recipes->candidates($p->userId, self::SLOT_CATEGORIES[$slot]),
            fn ($r) => !isset($planned[$r['id']]),
        ));
        $used = [];
        $take = function (array $list) use (&$used) {
            $out = [];
            foreach ($list as $r) {
                if (count($out) === 8) {
                    break;
                }
                if (!isset($used[$r['id']])) {
                    $out[] = $r;
                    $used[$r['id']] = true;
                }
            }
            return $out;
        };
        $byLoved = fn ($a, $b) => self::lovedScore($b) <=> self::lovedScore($a);
        $good = array_values(array_filter($fits, fn ($r) => ($r['rating'] ?? 0) >= 4));
        $longAgo = array_values(array_filter($good, fn ($r) => $r['cookingStats']['lastCooked'] !== null
            && Util::daysBetween($r['cookingStats']['lastCooked'], $today) >= RecipeService::NOT_COOKED_DAYS));
        usort($longAgo, fn ($a, $b) => strcmp($a['cookingStats']['lastCooked'], $b['cookingStats']['lastCooked']));
        $loved = $good;
        usort($loved, $byLoved);
        $quick = array_values(array_filter($fits, fn ($r) => ($r['cookingTime'] ?? 999) <= 30));
        usort($quick, $byLoved);
        $shelves = [
            ['key' => 'langeher', 'title' => 'Lange nicht gegessen', 'reason' => 'Gut bewertet, seit 6 Wochen nicht gekocht', 'recipes' => $take($longAgo)],
            ['key' => 'lieblinge', 'title' => 'Lieblinge', 'reason' => 'Am besten bewertet und oft gekocht', 'recipes' => $take($loved)],
            ['key' => 'schnell', 'title' => 'Schnell', 'reason' => 'Bis 30 Minuten', 'recipes' => $take($quick)],
        ];
        return array_values(array_filter($shelves, fn ($s) => $s['recipes'] !== []));
    }

    /** "How loved": rating first, times cooked as tie-breaker. One scale everywhere. */
    public static function lovedScore(array $r): int
    {
        return ($r['rating'] ?? 0) * 100 + min($r['cookingStats']['timesCooked'], 99);
    }

    /* ── Helpers ──────────────────────────────────────────────────────────── */

    private function nextPosition(string $userId, string $date, string $slot): int
    {
        return (int) $this->db->value(
            'SELECT COALESCE(MAX(position) + 1, 0) FROM meal_plan_entries WHERE user_id = ? AND date = ? AND meal_slot_id = ? AND deleted_at IS NULL',
            [$userId, $date, Catalog::slotId($slot)],
        );
    }

    /** @param list<string> $ids in the wanted order */
    private function renumber(string $userId, array $ids): void
    {
        foreach ($ids as $i => $id) {
            $this->db->exec('UPDATE meal_plan_entries SET position = ? WHERE id = ? AND user_id = ?', [$i, $id, $userId]);
        }
    }

    /** "Do 12. Mittag" */
    public function where(array $entry): string
    {
        return Util::dayShort($entry['date']) . ' ' . Catalog::SLOTS[$entry['slot']]['short'];
    }

    public function label(array $entry): string
    {
        return $entry['recipe']['title'] ?? $entry['note'] ?? 'Eintrag';
    }

    /** @return array{type: string, id: string, label: string, href: string} */
    public function target(array $entry): array
    {
        return ['type' => 'plan', 'id' => $entry['id'], 'label' => 'Wochenplan', 'href' => '/woche/' . $entry['date']];
    }

    public function json(array $e): array
    {
        return [
            'id' => $e['id'],
            'date' => $e['date'],
            'slot' => Catalog::slotKey((int) $e['meal_slot_id']),
            'recipeId' => $e['recipe_id'],
            'note' => $e['note'],
            'position' => (int) $e['position'],
            'createdVia' => $e['created_via'],
            'seenAt' => Util::iso($e['seen_at']),
            'updatedAt' => Util::iso(substr((string) $e['updated_at'], 0, 19)),
            'recipe' => $e['recipe_id'] === null ? null : [
                'id' => $e['recipe_id'],
                'title' => $e['recipe_title'],
                'imageUrl' => $e['recipe_image'],
                'thumbUrl' => MediaStore::thumbOf($e['recipe_image']),
                'cookingTime' => $e['recipe_time'] === null ? null : (int) $e['recipe_time'],
                'category' => $e['recipe_category'],
            ],
        ];
    }

    /** The user's settings, for the MCP prompt and get_profile. */
    public function settings(Principal $p): array
    {
        $u = $this->users->find($p->userId);
        return ['weekStart' => (int) $u['week_start'], 'planningWeekday' => (int) $u['planning_weekday']];
    }
}
