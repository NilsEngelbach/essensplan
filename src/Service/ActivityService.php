<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Util;

/**
 * The agent activity log in Konto: list, seen marks, and per-action undo,
 * refused when the target changed since (the undo-blocked strings of api.ts).
 */
final class ActivityService
{
    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly RecipeService $recipes,
        private readonly PlanService $plan,
        private readonly ShoppingService $shopping,
    ) {
    }

    public function list(Principal $p, int $limit = 100): array
    {
        $rows = $this->db->all(
            'SELECT * FROM agent_activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ' . max(1, min(500, $limit)),
            [$p->userId],
        );
        return array_map(fn ($a) => $this->json($p, $a), $rows);
    }

    /** @return array{count: int, recipeIds: list<string>} */
    public function unseen(Principal $p): array
    {
        $count = (int) $this->db->value('SELECT COUNT(*) FROM agent_activity WHERE user_id = ? AND seen_at IS NULL', [$p->userId]);
        return ['count' => $count, 'recipeIds' => array_keys($this->recipes->agentMarks($p->userId))];
    }

    /** All, the given ids, or everything about one recipe (opening it counts as seeing it). */
    public function markSeen(Principal $p, ?array $ids, ?string $recipeId): int
    {
        $sql = 'UPDATE agent_activity SET seen_at = ? WHERE user_id = ? AND seen_at IS NULL';
        $params = [$this->clock->db(), $p->userId];
        if ($recipeId !== null) {
            $sql .= " AND target_type = 'recipe' AND target_id = ?";
            $params[] = $recipeId;
        } elseif ($ids !== null) {
            if (!$ids) {
                return 0;
            }
            $sql .= ' AND id IN (' . Db::marks($ids) . ')';
            array_push($params, ...$ids);
        }
        return $this->db->exec($sql, $params);
    }

    /** Why an agent action can no longer be undone, or null while it still can. */
    public function blockedReason(Principal $p, array $a): ?string
    {
        $u = $a['undo_payload'] === null ? null : Util::decode($a['undo_payload']);
        if ($a['undone_at'] !== null || !$u) {
            return 'Das lässt sich nicht rückgängig machen.';
        }
        $entry = fn (string $id, bool $deleted = false) => $this->db->one(
            'SELECT * FROM meal_plan_entries WHERE id = ? AND user_id = ?' . ($deleted ? '' : ' AND deleted_at IS NULL'),
            [$id, $p->userId],
        );
        $recipe = fn (string $id) => $this->db->one('SELECT * FROM recipes WHERE id = ? AND user_id = ?', [$id, $p->userId]);
        switch ($u['kind']) {
            case 'plan.remove':
                return $entry($u['entryId']) ? null : 'Nicht mehr rückgängig: Der Eintrag ist schon weg.';
            case 'plan.restore':
                $e = $entry($u['entryId'], true);
                return $e && $e['deleted_at'] !== null ? null : 'Nicht mehr rückgängig: Der Eintrag ist schon wieder da oder gelöscht.';
            case 'plan.move':
                $e = $entry($u['entryId']);
                if (!$e) {
                    return 'Nicht mehr rückgängig: Der Eintrag ist schon weg.';
                }
                return $e['updated_at'] === $u['afterUpdatedAt'] ? null : 'Nicht mehr rückgängig: Der Eintrag wurde inzwischen geändert.';
            case 'shopping.remove':
                return $this->shopping->liveManualItem($p->userId, $u['itemId']) ? null : 'Nicht mehr rückgängig: Der Artikel ist schon von der Liste.';
            case 'recipe.restore':
            case 'recipe.remove':
                $id = $u['kind'] === 'recipe.restore' ? $u['before']['id'] : $u['recipeId'];
                $r = $recipe($id);
                if (!$r || $r['deleted_at'] !== null) {
                    return 'Nicht mehr rückgängig: Das Rezept gibt es nicht mehr.';
                }
                return $r['updated_at'] === $u['afterUpdatedAt'] ? null : "Nicht mehr rückgängig: „{$r['title']}“ wurde inzwischen geändert.";
            case 'recipe.undelete':
                $r = $recipe($u['recipeId']);
                if (!$r) {
                    return 'Nicht mehr rückgängig: Das Rezept gibt es nicht mehr.';
                }
                return $r['deleted_at'] !== null ? null : 'Nicht mehr rückgängig: Das Rezept ist schon wieder da.';
        }
        return 'Das lässt sich nicht rückgängig machen.';
    }

    /** Reverses one agent action, only while that is still safe. */
    public function undo(Principal $p, string $id): array
    {
        return $this->db->transaction(function () use ($p, $id) {
            $a = $this->db->one('SELECT * FROM agent_activity WHERE id = ? AND user_id = ? FOR UPDATE', [$id, $p->userId])
                ?? throw ApiError::notFound('Diesen Eintrag im Protokoll gibt es nicht.');
            $blocked = $this->blockedReason($p, $a);
            if ($blocked !== null) {
                throw ApiError::conflict($blocked, 'undo_blocked');
            }
            $u = Util::decode($a['undo_payload']);
            match ($u['kind']) {
                'plan.remove' => $this->plan->remove($p, $u['entryId']),
                'plan.restore' => $this->plan->restore($p, $u['entryId']),
                'plan.move' => $this->plan->move($p, $u['entryId'], $u['from']),
                'shopping.remove' => $this->shopping->removeManual($p, $u['itemId']),
                'recipe.restore' => $this->recipes->restoreVersion($p, $u['before']),
                'recipe.remove' => $this->recipes->delete($p, $u['recipeId']),
                'recipe.undelete' => $this->recipes->restore($p, $u['recipeId']),
                default => throw ApiError::conflict('Das lässt sich nicht rückgängig machen.', 'undo_blocked'),
            };
            $now = $this->clock->db();
            $this->db->exec('UPDATE agent_activity SET undone_at = ?, seen_at = COALESCE(seen_at, ?) WHERE id = ?', [$now, $now, $id]);
            return $this->json($p, $this->db->one('SELECT * FROM agent_activity WHERE id = ?', [$id]));
        });
    }

    private function json(Principal $p, array $a): array
    {
        $undo = $a['undo_payload'] === null ? null : Util::decode($a['undo_payload']);
        return [
            'id' => $a['id'],
            'keyId' => $a['api_key_id'],
            'keyName' => $a['key_name'],
            'channel' => $a['channel'],
            'action' => $a['action'],
            'at' => Util::iso(substr((string) $a['created_at'], 0, 19)),
            'summary' => $a['summary'],
            'target' => ['type' => $a['target_type'], 'id' => $a['target_id'], 'href' => $a['target_href'], 'label' => $a['target_label']],
            'undo' => $undo === null ? null : ['kind' => $undo['kind']],
            'undoBlocked' => $undo === null ? null : $this->blockedReason($p, $a),
            'undoneAt' => Util::iso($a['undone_at']),
            'seenAt' => Util::iso($a['seen_at']),
        ];
    }

    public function purge(): int
    {
        return $this->db->exec('DELETE FROM agent_activity WHERE created_at < ?', [$this->clock->db('-' . ActivityLog::RETENTION_DAYS . ' days')]);
    }
}
