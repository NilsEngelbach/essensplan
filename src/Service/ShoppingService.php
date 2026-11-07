<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Domain\Shopping;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Repository\UserRepository;
use Essensplan\Util;

/**
 * Einkauf (D16), ported from openTrip / buildLines / completeTrip / reopenTrip
 * in frontend/src/lib/api.ts. Plan-derived lines are computed live, never stored.
 */
final class ShoppingService
{
    public const HORIZON = 14;

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly ActivityLog $log,
    ) {
    }

    /* ── Reading ──────────────────────────────────────────────────────────── */

    public function current(Principal $p): array
    {
        $trip = $this->openTrip($p->userId);
        $lines = $this->buildLines($p->userId, $trip);
        $collator = new \Collator('de_DE');
        usort($lines, fn ($a, $b) => $collator->compare($a['name'], $b['name']));
        $sections = [];
        foreach ($this->sectionOrder($p->userId) as $section) {
            $in = array_values(array_filter($lines, fn ($l) => $l['section'] === $section));
            if ($in) {
                $sections[] = ['section' => $section, 'lines' => $in];
            }
        }
        $done = $this->shoppedDays($p->userId);
        $planned = $this->plannedDishes($p->userId);
        $onList = array_map(fn ($l) => Shopping::nameKey($l['name']), array_filter($lines, fn ($l) => $l['manualId'] !== null));
        return [
            'trip' => $this->tripJson($trip),
            'sections' => $sections,
            'planDays' => array_map(fn ($d) => ['date' => $d, 'dishes' => $planned[$d], 'shopped' => isset($done[$d])], array_keys($planned)),
            'allShopped' => $done !== [] && array_diff(array_keys($planned), array_keys($done)) === [],
            'recentManualNames' => $this->recentManualNames($p->userId, $onList),
        ];
    }

    /** @return list<string> */
    public function sectionOrder(string $userId): array
    {
        $order = Util::decode($this->users->find($userId)['section_order'] ?? null);
        $order = array_values(array_intersect($order, Shopping::SECTIONS));
        // Sections added later (or missing in a stored order) go to the end.
        return [...$order, ...array_values(array_diff(Shopping::SECTIONS, $order))];
    }

    public function saveSectionOrder(Principal $p, array $sections): array
    {
        $sorted = $sections;
        $expected = Shopping::SECTIONS;
        sort($sorted);
        sort($expected);
        if ($sorted !== $expected) {
            throw ApiError::field('sections', 'Die Reihenfolge muss jeden Abschnitt genau einmal enthalten.');
        }
        $this->users->update($p->userId, ['section_order' => array_values($sections)]);
        return $this->sectionOrder($p->userId);
    }

    /* ── Trip ─────────────────────────────────────────────────────────────── */

    /** @return array<string, true> days a finished trip already covered */
    private function shoppedDays(string $userId): array
    {
        $out = [];
        $rows = $this->db->column(
            'SELECT days FROM shopping_trips WHERE user_id = ? AND completed_at IS NOT NULL AND completed_at > ?',
            [$userId, $this->clock->db('-60 days')],
        );
        foreach ($rows as $json) {
            foreach (Util::decode($json) as $d) {
                $out[$d] = true;
            }
        }
        return $out;
    }

    /** @return array<string, list<string>> date → recipe titles in meal order, for the next two weeks */
    private function plannedDishes(string $userId): array
    {
        $today = $this->clock->today();
        $rows = $this->db->all(
            'SELECT e.date, r.title FROM meal_plan_entries e
             JOIN recipes r ON r.id = e.recipe_id AND r.user_id = e.user_id AND r.deleted_at IS NULL
             WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.date BETWEEN ? AND ?
             ORDER BY e.date, e.meal_slot_id, e.position',
            [$userId, $today, Util::addDays($today, self::HORIZON - 1)],
        );
        $out = [];
        foreach ($rows as $r) {
            $out[$r['date']][] = $r['title'];
        }
        return $out;
    }

    /** @return list<string> */
    private function defaultTripDays(string $userId): array
    {
        $done = $this->shoppedDays($userId);
        return array_values(array_filter(array_keys($this->plannedDishes($userId)), fn ($d) => !isset($done[$d])));
    }

    /** The open trip, created with the pre-ticked days when there is none. */
    private function openTrip(string $userId): array
    {
        return $this->db->transaction(function () use ($userId) {
            $trip = $this->db->one(
                'SELECT * FROM shopping_trips WHERE user_id = ? AND completed_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
                [$userId],
            );
            if ($trip === null) {
                $trip = [
                    'id' => Util::uuid(),
                    'user_id' => $userId,
                    'days' => Util::json($this->defaultTripDays($userId)),
                    'days_chosen' => 0,
                    'created_at' => $this->clock->dbMicro(),
                    'completed_at' => null,
                ];
                $this->db->insert('shopping_trips', $trip);
                // Everything on a fresh list counts as seen: nothing is "neu" yet.
                $this->markSeenKeys($trip['id'], array_column($this->buildLines($userId, $trip), 'key'));
                return $trip;
            }
            // Untouched trips follow the plan: days planned since then are pre-ticked too.
            if (!$trip['days_chosen'] && !$this->touched($trip['id'])) {
                $days = Util::json($this->defaultTripDays($userId));
                if ($days !== Util::json(Util::decode($trip['days']))) {
                    $this->db->exec('UPDATE shopping_trips SET days = ? WHERE id = ?', [$days, $trip['id']]);
                    $trip['days'] = $days;
                }
            }
            return $trip;
        });
    }

    private function touched(string $tripId): bool
    {
        return (bool) $this->db->value(
            'SELECT 1 FROM shopping_item_state WHERE trip_id = ? AND (checked IS NOT NULL OR at_home IS NOT NULL) LIMIT 1',
            [$tripId],
        );
    }

    /** @return array<string, mixed> a trip of this user */
    private function trip(string $userId, string $id): array
    {
        return $this->db->one('SELECT * FROM shopping_trips WHERE id = ? AND user_id = ?', [$id, $userId])
            ?? throw ApiError::notFound('Diesen Einkauf gibt es nicht.');
    }

    public function setDays(Principal $p, array $days): array
    {
        foreach ($days as $d) {
            if (!Util::isDate($d)) {
                throw ApiError::field('days', 'Tage als YYYY-MM-DD.');
            }
        }
        $days = array_values(array_unique($days));
        sort($days);
        $trip = $this->openTrip($p->userId);
        $this->db->exec('UPDATE shopping_trips SET days = ?, days_chosen = 1 WHERE id = ? AND user_id = ?', [Util::json($days), $trip['id'], $p->userId]);
        $this->log->record($p, 'shopping.days', $this->target($trip['id'], 'Einkauf'), 'hat die Tage für den Einkauf gewählt');
        return $this->current($p);
    }

    /* ── Lines ────────────────────────────────────────────────────────────── */

    /** @return list<array<string, mixed>> */
    private function buildLines(string $userId, array $trip): array
    {
        $days = Util::decode($trip['days']);
        $ingredients = $days === [] ? [] : $this->db->all(
            'SELECT i.name, i.amount, i.unit, i.section FROM meal_plan_entries e
             JOIN recipes r ON r.id = e.recipe_id AND r.user_id = e.user_id AND r.deleted_at IS NULL
             JOIN ingredients i ON i.recipe_id = r.id
             WHERE e.user_id = ? AND e.deleted_at IS NULL AND e.date IN (' . Db::marks($days) . ')
             ORDER BY e.date, e.meal_slot_id, e.position, i.position',
            [$userId, ...$days],
        );
        $state = [];
        $seen = [];
        foreach ($this->db->all('SELECT * FROM shopping_item_state WHERE trip_id = ?', [$trip['id']]) as $s) {
            $state[$s['line_key']] = $s;
            if ($s['seen_at'] !== null) {
                $seen[$s['line_key']] = true;
            }
        }
        $overrides = $this->pairs('SELECT name_key, section FROM section_overrides WHERE user_id = ?', $userId);
        $homeCounts = $this->pairs('SELECT name_key, count FROM shopping_home_counts WHERE user_id = ?', $userId);
        $line = function (string $key, string $name, string $qty, string $section, ?string $manualId, bool $agent) use ($state, $seen, $homeCounts) {
            $checked = (bool) ($state[$key]['checked'] ?? false);
            $atHome = (bool) ($state[$key]['at_home'] ?? false);
            return [
                'key' => $key,
                'name' => $name,
                'qty' => $qty,
                'section' => $section,
                'checked' => $checked,
                'atHome' => $atHome,
                'likelyHome' => !$checked && !$atHome && (int) ($homeCounts[$key] ?? 0) >= 2,
                'isNew' => !isset($seen[$key]),
                'manualId' => $manualId,
                'agent' => $agent,
            ];
        };
        $lines = [];
        foreach (Shopping::aggregate($ingredients) as $a) {
            $lines[] = $line($a['key'], $a['name'], $a['qty'], $overrides[$a['key']] ?? $a['section'] ?? Shopping::classify($a['name']), null, false);
        }
        foreach ($this->liveManual($userId) as $m) {
            $lines[] = $line('m:' . $m['id'], $m['name'], '', $overrides[Shopping::nameKey($m['name'])] ?? $m['section'], $m['id'], $m['created_via'] !== 'app');
        }
        return $lines;
    }

    /** @return array<string, string> */
    private function pairs(string $sql, string $userId): array
    {
        $out = [];
        foreach ($this->db->all($sql, [$userId]) as $row) {
            $v = array_values($row);
            $out[(string) $v[0]] = (string) $v[1];
        }
        return $out;
    }

    /** @return list<array<string, mixed>> own items still to buy */
    private function liveManual(string $userId): array
    {
        return $this->db->all(
            'SELECT * FROM shopping_manual_items WHERE user_id = ? AND bought_at IS NULL AND deleted_at IS NULL ORDER BY created_at',
            [$userId],
        );
    }

    /** @param list<string> $keys */
    private function markSeenKeys(string $tripId, array $keys): void
    {
        $now = $this->clock->db();
        foreach (array_unique($keys) as $key) {
            $this->db->exec(
                'INSERT INTO shopping_item_state (trip_id, line_key, seen_at, updated_at) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE seen_at = COALESCE(seen_at, VALUES(seen_at))',
                [$tripId, mb_substr($key, 0, 190), $now, $now],
            );
        }
    }

    public function markSeen(Principal $p, array $keys): void
    {
        $trip = $this->openTrip($p->userId);
        $this->markSeenKeys($trip['id'], array_map('strval', $keys));
    }

    /** checked, "haben wir da" (teaches "meist da"), or "Abschnitt ändern". */
    public function setItem(Principal $p, string $key, array $in): array
    {
        return $this->db->transaction(function () use ($p, $key, $in) {
            $trip = $this->openTrip($p->userId);
            $lines = array_column($this->buildLines($p->userId, $trip), null, 'key');
            $line = $lines[$key] ?? throw ApiError::notFound('Diesen Eintrag gibt es auf der Liste nicht.');
            $now = $this->clock->db();
            if (array_key_exists('atHome', $in) && $line['manualId'] === null && (bool) $in['atHome'] !== $line['atHome']) {
                $this->db->exec(
                    'INSERT INTO shopping_home_counts (user_id, name_key, count) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE count = GREATEST(0, count + VALUES(count))',
                    [$p->userId, $key, $in['atHome'] ? 1 : -1],
                );
            }
            if (array_key_exists('checked', $in) || array_key_exists('atHome', $in)) {
                $checked = array_key_exists('checked', $in) ? (int) (bool) $in['checked'] : (int) $line['checked'];
                $atHome = array_key_exists('atHome', $in) ? (int) (bool) $in['atHome'] : (int) $line['atHome'];
                $this->db->exec(
                    'INSERT INTO shopping_item_state (trip_id, line_key, checked, at_home, updated_at) VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE checked = VALUES(checked), at_home = VALUES(at_home), updated_at = VALUES(updated_at)',
                    [$trip['id'], $key, $checked, $atHome, $now],
                );
            }
            if (isset($in['section'])) {
                if (!in_array($in['section'], Shopping::SECTIONS, true)) {
                    throw ApiError::field('section', 'Diesen Abschnitt gibt es nicht.');
                }
                $nameKey = $line['manualId'] !== null ? Shopping::nameKey($line['name']) : $key;
                $this->db->exec(
                    'INSERT INTO section_overrides (user_id, name_key, section) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE section = VALUES(section)',
                    [$p->userId, $nameKey, $in['section']],
                );
            }
            $after = array_column($this->buildLines($p->userId, $trip), null, 'key')[$key];
            $what = match (true) {
                isset($in['section']) => "„{$line['name']}“ nach {$in['section']} verschoben",
                array_key_exists('atHome', $in) => "„{$line['name']}“ als " . ($in['atHome'] ? 'da' : 'nicht da') . ' markiert',
                default => "„{$line['name']}“ " . (!empty($in['checked']) ? 'abgehakt' : 'wieder offen gesetzt'),
            };
            $this->log->record($p, 'shopping.item', $this->target($key, $line['name']), "hat $what");
            return $after;
        });
    }

    /* ── Own items ────────────────────────────────────────────────────────── */

    /** Own items stay until bought. */
    public function addManual(Principal $p, string $name): array
    {
        $clean = mb_substr(trim($name), 0, 60);
        if ($clean === '') {
            throw ApiError::field('name', 'Gib einen Namen ein.');
        }
        return $this->db->transaction(function () use ($p, $clean) {
            $override = $this->db->value('SELECT section FROM section_overrides WHERE user_id = ? AND name_key = ?', [$p->userId, Shopping::nameKey($clean)]);
            $row = [
                'id' => Util::uuid(),
                'user_id' => $p->userId,
                'name' => $clean,
                'section' => $override ?? Shopping::classify($clean),
                'created_via' => $p->via(),
                'created_at' => $this->clock->dbMicro(),
            ];
            $this->db->insert('shopping_manual_items', $row);
            $trip = $this->openTrip($p->userId);
            $this->markSeenKeys($trip['id'], ['m:' . $row['id']]);
            $this->log->record($p, 'shopping.add', $this->target($row['id'], $clean), "hat „{$clean}“ auf die Einkaufsliste gesetzt", [
                'kind' => 'shopping.remove', 'itemId' => $row['id'],
            ]);
            return $this->manualJson($row);
        });
    }

    /** @return array<string, mixed>|null a live (unbought, not deleted) own item of this user */
    public function liveManualItem(string $userId, string $id): ?array
    {
        return $this->db->one(
            'SELECT * FROM shopping_manual_items WHERE id = ? AND user_id = ? AND bought_at IS NULL AND deleted_at IS NULL',
            [$id, $userId],
        );
    }

    public function removeManual(Principal $p, string $id): array
    {
        $row = $this->liveManualItem($p->userId, $id) ?? throw ApiError::notFound('Diesen Artikel gibt es nicht mehr.');
        $this->db->transaction(function () use ($p, $row) {
            $this->db->exec('UPDATE shopping_manual_items SET deleted_at = ? WHERE id = ? AND user_id = ?', [$this->clock->db(), $row['id'], $p->userId]);
            $this->log->record($p, 'shopping.remove', $this->target($row['id'], $row['name']), "hat „{$row['name']}“ von der Einkaufsliste genommen");
        });
        return $this->manualJson($row);
    }

    public function restoreManual(Principal $p, string $id): array
    {
        $row = $this->db->one('SELECT * FROM shopping_manual_items WHERE id = ? AND user_id = ?', [$id, $p->userId])
            ?? throw ApiError::notFound('Diesen Artikel gibt es nicht mehr.');
        $this->db->exec('UPDATE shopping_manual_items SET deleted_at = NULL WHERE id = ? AND user_id = ?', [$id, $p->userId]);
        return $this->manualJson([...$row, 'deleted_at' => null]);
    }

    /** @param list<string> $onList name keys already on the list */
    private function recentManualNames(string $userId, array $onList): array
    {
        $names = $this->db->column(
            'SELECT name FROM shopping_manual_items WHERE user_id = ? AND bought_at IS NOT NULL
             GROUP BY name ORDER BY MAX(bought_at) DESC LIMIT 30',
            [$userId],
        );
        $out = [];
        foreach ($names as $n) {
            $k = Shopping::nameKey($n);
            if (!in_array($k, $onList, true) && !in_array($k, array_map(Shopping::nameKey(...), $out), true)) {
                $out[] = $n;
            }
        }
        return array_slice($out, 0, 8);
    }

    /* ── Complete and reopen ──────────────────────────────────────────────── */

    /** Closes the trip: its days count as shopped, bought own items are gone. */
    public function complete(Principal $p, string $tripId): array
    {
        return $this->db->transaction(function () use ($p, $tripId) {
            $trip = $this->trip($p->userId, $tripId);
            if ($trip['completed_at'] !== null) {
                throw ApiError::conflict('Dieser Einkauf ist schon abgeschlossen.');
            }
            $now = $this->clock->db();
            $bought = $this->db->column(
                "SELECT SUBSTRING(line_key, 3) FROM shopping_item_state WHERE trip_id = ? AND line_key LIKE 'm:%' AND (checked = 1 OR at_home = 1)",
                [$trip['id']],
            );
            if ($bought) {
                $this->db->exec(
                    'UPDATE shopping_manual_items SET bought_at = ?, bought_trip_id = ? WHERE user_id = ? AND bought_at IS NULL AND id IN (' . Db::marks($bought) . ')',
                    [$now, $trip['id'], $p->userId, ...$bought],
                );
            }
            $this->db->exec('UPDATE shopping_trips SET completed_at = ? WHERE id = ? AND user_id = ?', [$now, $trip['id'], $p->userId]);
            $this->log->record($p, 'shopping.complete', $this->target($trip['id'], 'Einkauf'), 'hat den Einkauf abgeschlossen');
            return $this->tripJson($this->trip($p->userId, $tripId));
        });
    }

    /** Undo for complete: the trip is open again, an untouched follow-up trip goes away. */
    public function reopen(Principal $p, string $tripId): array
    {
        return $this->db->transaction(function () use ($p, $tripId) {
            $trip = $this->trip($p->userId, $tripId);
            if ($trip['completed_at'] === null) {
                return $this->tripJson($trip);
            }
            $latest = $this->db->value(
                'SELECT id FROM shopping_trips WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC, created_at DESC LIMIT 1',
                [$p->userId],
            );
            if ($latest !== $tripId) {
                throw ApiError::conflict('Nur der letzte Einkauf lässt sich wieder öffnen.');
            }
            foreach ($this->db->column('SELECT id FROM shopping_trips WHERE user_id = ? AND completed_at IS NULL', [$p->userId]) as $openId) {
                if ($this->touched($openId)) {
                    throw ApiError::conflict('Es läuft schon ein neuer Einkauf.');
                }
                $this->db->exec('DELETE FROM shopping_trips WHERE id = ? AND user_id = ?', [$openId, $p->userId]);
            }
            $this->db->exec('UPDATE shopping_trips SET completed_at = NULL WHERE id = ? AND user_id = ?', [$tripId, $p->userId]);
            $this->db->exec(
                'UPDATE shopping_manual_items SET bought_at = NULL, bought_trip_id = NULL WHERE user_id = ? AND bought_trip_id = ?',
                [$p->userId, $tripId],
            );
            return $this->tripJson($this->trip($p->userId, $tripId));
        });
    }

    /* ── JSON ─────────────────────────────────────────────────────────────── */

    private function tripJson(array $t): array
    {
        $state = [];
        $seen = [];
        foreach ($this->db->all('SELECT * FROM shopping_item_state WHERE trip_id = ?', [$t['id']]) as $s) {
            if ($s['checked'] !== null || $s['at_home'] !== null) {
                $state[$s['line_key']] = ['checked' => (bool) $s['checked'], 'atHome' => (bool) $s['at_home']];
            }
            if ($s['seen_at'] !== null) {
                $seen[] = $s['line_key'];
            }
        }
        return [
            'id' => $t['id'],
            'days' => Util::decode($t['days']),
            'daysChosen' => (bool) $t['days_chosen'],
            'createdAt' => Util::iso(substr((string) $t['created_at'], 0, 19)),
            'completedAt' => Util::iso($t['completed_at']),
            'seen' => $seen,
            'state' => (object) $state,
        ];
    }

    public function manualJson(array $m): array
    {
        return [
            'id' => $m['id'],
            'key' => 'm:' . $m['id'],
            'name' => $m['name'],
            'section' => $m['section'],
            'createdAt' => Util::iso(substr((string) $m['created_at'], 0, 19)),
            'createdVia' => $m['created_via'],
        ];
    }

    /** @return array{type: string, id: string, label: string, href: string} */
    private function target(string $id, string $label): array
    {
        return ['type' => 'shopping', 'id' => $id, 'label' => $label, 'href' => '/einkauf'];
    }

    /** A compact list for agents (MCP get_grocery_list). */
    public function forAgent(Principal $p): array
    {
        $list = $this->current($p);
        return [
            'days' => $list['trip']['days'],
            'sections' => array_map(fn ($s) => [
                'section' => $s['section'],
                'items' => array_map(fn ($l) => array_filter([
                    'key' => $l['key'],
                    'name' => $l['name'],
                    'qty' => $l['qty'] ?: null,
                    'checked' => $l['checked'] ?: null,
                    'atHome' => $l['atHome'] ?: null,
                    'own' => $l['manualId'] !== null ?: null,
                ], fn ($v) => $v !== null), $s['lines']),
            ], $list['sections']),
        ];
    }
}
