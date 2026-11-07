<?php

declare(strict_types=1);

namespace Essensplan\Import;

use DateTimeImmutable;
use DateTimeZone;
use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Domain\Catalog;
use Essensplan\Domain\Shopping;
use Essensplan\Http\ApiError;
use Essensplan\Service\MediaStore;
use Essensplan\Util;

/**
 * Phase 8: copies families from the old app (MIGRATION_PLAN §10).
 *
 * - Accounts keep their Supabase id and bcrypt hash, so passwords keep working
 *   ($2a$ is accepted and rehashed on the first login).
 * - Recipes keep their ids; values outside the new sets are cleaned and reported.
 * - Photos are downloaded and stored like uploads (re-encoded + thumbnail).
 * - Old MealPlan rows become Mittagessen entries (D8) on their Europe/Berlin day.
 *
 * A family that already has data is skipped unless $replace, which first wipes
 * its recipes, plan, list and agent log (account, devices and keys stay).
 */
final class SupabaseImporter
{
    /** Imported content of a family, children first; the account rows stay on --replace. */
    private const CONTENT = [
        'agent_activity', 'shopping_home_counts', 'section_overrides', 'shopping_manual_items',
        'shopping_trips', 'meal_plan_entries', 'recipes',
    ];

    /** @var \Closure(string): ?string */
    private readonly \Closure $fetch;

    /** @param (\Closure(string): ?string)|null $fetch URL → bytes, null on failure (tests swap it) */
    public function __construct(
        private readonly Db $db,
        private readonly MediaStore $media,
        private readonly Clock $clock,
        ?\Closure $fetch = null,
    ) {
        $this->fetch = $fetch ?? self::download(...);
    }

    /**
     * @param array{email?: ?string, replace?: bool, images?: bool} $opt
     * @param callable(string): void $out
     * @return array<string, array<string, mixed>> report per e-mail
     */
    public function run(ImportSource $src, array $opt, callable $out): array
    {
        $only = isset($opt['email']) ? mb_strtolower(trim((string) $opt['email'])) : null;
        $report = [];
        $users = array_filter($src->users(), fn ($u) => $only === null || mb_strtolower($u['email']) === $only);
        if ($only !== null && !$users) {
            throw new \RuntimeException("$only is not in the old app.");
        }
        foreach ($users as $u) {
            $email = mb_strtolower(trim($u['email']));
            $r = $report[$email] = $this->family($src, $u, (bool) ($opt['replace'] ?? false), (bool) ($opt['images'] ?? true));
            $out(self::summary($email, $r));
        }
        return $report;
    }

    /** @return array<string, mixed> */
    private function family(ImportSource $src, array $u, bool $replace, bool $images): array
    {
        $r = ['status' => 'imported', 'recipes' => 0, 'ingredients' => 0, 'steps' => 0, 'entries' => 0,
            'photos' => 0, 'photoLinksKept' => 0, 'photoFailures' => [], 'skippedEntries' => 0, 'movedDays' => 0,
            'droppedTags' => [], 'fixedCategories' => [], 'noPassword' => false];
        $email = mb_strtolower(trim($u['email']));
        $other = $this->db->one('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $u['id']]);
        if ($other !== null) {
            return [...$r, 'status' => 'skipped: the e-mail belongs to another account here'];
        }
        $existing = $this->db->one('SELECT id FROM users WHERE id = ?', [$u['id']]);
        if ($existing !== null) {
            $has = (int) $this->db->value('SELECT (SELECT COUNT(*) FROM recipes WHERE user_id = ?) + (SELECT COUNT(*) FROM meal_plan_entries WHERE user_id = ?)', [$u['id'], $u['id']]);
            if ($has > 0 && !$replace) {
                return [...$r, 'status' => 'skipped: already has data (--replace imports again)'];
            }
        }

        // Photos first, outside the transaction: downloads are slow and leave nothing in the DB.
        $recipes = $src->recipes($u['id']);
        $photo = [];
        foreach ($recipes as $rec) {
            foreach ([$rec['imageUrl'] ?? null, ...array_column($rec['instructions'], 'imageUrl')] as $url) {
                if (is_string($url) && $url !== '' && !isset($photo[$url])) {
                    $photo[$url] = $this->photo($u['id'], $url, $images, $r);
                }
            }
        }

        $this->db->transaction(function () use ($src, $u, $email, $existing, $recipes, $photo, &$r) {
            if ($existing !== null) {
                foreach (self::CONTENT as $t) {
                    $this->db->exec("DELETE FROM $t WHERE user_id = ?", [$u['id']]);
                }
                $r['status'] = 'imported again (--replace)';
            } else {
                $hash = $u['password_hash'];
                if ($hash === null || !str_starts_with($hash, '$2')) {
                    // No password in the old app (magic link): log in after user:invite.
                    $hash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
                    $r['noPassword'] = true;
                }
                $this->db->insert('users', [
                    'id' => $u['id'],
                    'name' => mb_substr(trim((string) $u['name']) ?: 'Familie', 0, 100),
                    'email' => $email,
                    'password_hash' => $hash,
                    'email_verified_at' => $u['email_confirmed_at'] === null ? null : self::utc($u['email_confirmed_at']),
                    'created_at' => self::utc($u['created_at']),
                    'updated_at' => $this->clock->db(),
                ]);
            }
            $imported = [];
            foreach ($recipes as $rec) {
                $this->recipe($u['id'], $rec, $photo, $r);
                $imported[$rec['id']] = true;
            }
            $this->entries($u['id'], $src->mealPlans($u['id']), $imported, $r);
        });
        return $r;
    }

    /** @param array<string, ?string> $photo old URL → stored path */
    private function recipe(string $userId, array $rec, array $photo, array &$r): void
    {
        $category = self::pick((string) $rec['category'], Catalog::CATEGORIES);
        if ($category === null) {
            $category = 'Hauptspeise';
            $old = trim((string) $rec['category']) === '' ? '(leer)' : trim((string) $rec['category']);
            $r['fixedCategories'][$old] = ($r['fixedCategories'][$old] ?? 0) + 1;
        }
        $tags = [];
        foreach (self::tagList($rec['tags'] ?? null) as $t) {
            $known = self::pick($t, Catalog::TAGS);
            if ($known !== null) {
                $tags[] = $known;
            } else {
                $r['droppedTags'][$t] = ($r['droppedTags'][$t] ?? 0) + 1;
            }
        }
        $source = trim((string) ($rec['sourceUrl'] ?? ''));
        $this->db->insert('recipes', [
            'id' => $rec['id'],
            'user_id' => $userId,
            'title' => mb_substr(trim((string) $rec['title']), 0, 200) ?: 'Ohne Titel',
            'description' => trim((string) ($rec['description'] ?? '')) ?: null,
            'image_path' => isset($rec['imageUrl']) && $rec['imageUrl'] !== '' ? ($photo[$rec['imageUrl']] ?? null) : null,
            'category' => $category,
            'tags' => array_values(array_unique($tags)),
            'cooking_time' => self::int($rec['cookingTime'] ?? null, 1, 1440),
            'servings' => self::int($rec['servings'] ?? null, 1, 99),
            'difficulty' => self::pick((string) ($rec['difficulty'] ?? ''), Catalog::DIFFICULTIES),
            'rating' => self::int($rec['rating'] ?? null, 1, 5),
            'source_url' => $source !== '' && mb_strlen($source) <= 1000 ? $source : null,
            'created_via' => 'import',
            'created_at' => self::utc($rec['createdAt']),
            'updated_at' => self::utc($rec['updatedAt'], true),
        ]);
        $r['recipes']++;

        $pos = 0;
        foreach ($rec['ingredients'] as $i) {
            $name = mb_substr(trim((string) $i['name']), 0, 200);
            if ($name === '') {
                continue;
            }
            $amount = $i['amount'] === null || !is_finite((float) $i['amount']) || abs((float) $i['amount']) >= 1e7 ? null : round((float) $i['amount'], 3);
            $this->db->insert('ingredients', [
                'id' => Util::uuid(),
                'recipe_id' => $rec['id'],
                'position' => $pos++,
                'name' => $name,
                'amount' => $amount,
                'unit' => self::text($i['unit'] ?? null, 30),
                'notes' => self::text($i['notes'] ?? null, 300),
                'component' => self::text($i['component'] ?? null, 100),
                'section' => Shopping::classify($name),
            ]);
            $r['ingredients']++;
        }
        $step = 0;
        $steps = $rec['instructions'];
        usort($steps, fn ($a, $b) => (int) $a['stepNumber'] <=> (int) $b['stepNumber']);
        foreach ($steps as $s) {
            $text = trim((string) $s['description']);
            if ($text === '') {
                continue;
            }
            $this->db->insert('instructions', [
                'id' => Util::uuid(),
                'recipe_id' => $rec['id'],
                'step_number' => ++$step,
                'description' => $text,
                'image_path' => isset($s['imageUrl']) && $s['imageUrl'] !== '' ? ($photo[$s['imageUrl']] ?? null) : null,
                'ingredient_ids' => null,
            ]);
            $r['steps']++;
        }
    }

    /** @param array<string, true> $recipes ids imported for this family */
    private function entries(string $userId, array $plans, array $recipes, array &$r): void
    {
        $berlin = new DateTimeZone(Clock::TZ);
        $positions = [];
        foreach ($plans as $p) {
            if ($p['recipeId'] === null || !isset($recipes[$p['recipeId']])) {
                $r['skippedEntries']++;
                continue;
            }
            $at = (new DateTimeImmutable('@' . (int) floor($p['date'])));
            $day = $at->setTimezone($berlin)->format('Y-m-d');
            // The old app wrote UTC midnight; anything else lands on its Berlin day — worth a look.
            if ($at->format('H:i:s') !== '00:00:00' || $at->format('Y-m-d') !== $day) {
                $r['movedDays']++;
            }
            $this->db->insert('meal_plan_entries', [
                'id' => $p['id'],
                'user_id' => $userId,
                'date' => $day,
                'meal_slot_id' => Catalog::slotId('lunch'),
                'recipe_id' => $p['recipeId'],
                'note' => null,
                'position' => $positions[$day] = ($positions[$day] ?? -1) + 1,
                'created_via' => 'app',
                'created_at' => self::utc($p['createdAt'], true),
                'updated_at' => self::utc($p['updatedAt'], true),
            ]);
            $r['entries']++;
        }
    }

    /** Stores a photo like an upload; a link that can't be fetched stays a link. */
    private function photo(string $userId, string $url, bool $download, array &$r): ?string
    {
        if (!preg_match('~^https?://~i', $url)) {
            $r['photoFailures'][] = "$url (not a link)";
            return null;
        }
        $keep = mb_strlen($url) <= 500 ? $url : null;
        if (!$download) {
            $r['photoLinksKept']++;
            return $keep;
        }
        $bytes = ($this->fetch)($url);
        if ($bytes !== null) {
            try {
                $stored = $this->media->store($userId, $bytes)['url'];
                $r['photos']++;
                return $stored;
            } catch (ApiError $e) {
                $r['photoFailures'][] = "$url ({$e->getMessage()})";
                return $keep;
            }
        }
        $r['photoFailures'][] = "$url (download failed)";
        return $keep;
    }

    private static function download(string $url): ?string
    {
        $ch = curl_init($url);
        $bytes = '';
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_USERAGENT => 'Essensplan-Import/1.0',
            CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$bytes): int {
                $bytes .= $chunk;
                return strlen($bytes) > MediaStore::MAX_BYTES ? 0 : strlen($chunk);
            },
        ]);
        if (PHP_OS_FAMILY === 'Windows' && !ini_get('curl.cainfo')) {
            // Windows PHP (Local) ships without a CA bundle; use the system store there.
            curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
        }
        $ok = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return $ok !== false && $status === 200 && $bytes !== '' ? $bytes : null;
    }

    /** @return list<string> tags from a JSON array string (the old column) or a comma list */
    private static function tagList(mixed $raw): array
    {
        if (is_array($raw)) {
            return array_map('strval', $raw);
        }
        $raw = trim((string) $raw);
        if ($raw === '') {
            return [];
        }
        $v = json_decode($raw, true);
        $list = is_array($v) ? $v : explode(',', $raw);
        return array_values(array_filter(array_map(fn ($t) => trim((string) $t), $list), fn ($t) => $t !== ''));
    }

    /** The set member equal to $v ignoring case and umlaut spelling ("Fruhstuck", "Fruehstueck"), or null. */
    private static function pick(string $v, array $set): ?string
    {
        $fold = fn (string $s) => strtr(mb_strtolower(trim($s)), ['ä' => 'a', 'ö' => 'o', 'ü' => 'u', 'ß' => 'ss', 'ae' => 'a', 'oe' => 'o', 'ue' => 'u']);
        foreach ($set as $s) {
            if ($fold($s) === $fold($v)) {
                return $s;
            }
        }
        return null;
    }

    private static function int(mixed $v, int $min, int $max): ?int
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return null;
        }
        $n = (int) round((float) $v);
        return $n >= $min && $n <= $max ? $n : null;
    }

    private static function text(mixed $v, int $max): ?string
    {
        $s = trim((string) ($v ?? ''));
        return $s === '' ? null : mb_substr($s, 0, $max);
    }

    private static function utc(float $epoch, bool $micro = false): string
    {
        $t = DateTimeImmutable::createFromFormat('U.u', sprintf('%.6F', $epoch), new DateTimeZone('UTC'));
        return $t->format($micro ? 'Y-m-d H:i:s.u' : 'Y-m-d H:i:s');
    }

    private static function summary(string $email, array $r): string
    {
        if (!str_starts_with($r['status'], 'imported')) {
            return "$email: {$r['status']}";
        }
        $lines = [sprintf(
            '%s: %s — %d recipes (%d ingredients, %d steps), %d plan entries, %d photos stored',
            $email, $r['status'], $r['recipes'], $r['ingredients'], $r['steps'], $r['entries'], $r['photos'],
        )];
        if ($r['photoLinksKept']) {
            $lines[] = "  {$r['photoLinksKept']} photos kept as links (--no-images)";
        }
        foreach ($r['photoFailures'] as $f) {
            $lines[] = "  photo not stored: $f";
        }
        if ($r['skippedEntries']) {
            $lines[] = "  {$r['skippedEntries']} plan entries without a recipe left out";
        }
        if ($r['movedDays']) {
            $lines[] = "  {$r['movedDays']} plan entries were not at UTC midnight; check their day";
        }
        foreach ($r['fixedCategories'] as $c => $n) {
            $lines[] = "  category „{$c}“ ×$n set to Hauptspeise";
        }
        foreach ($r['droppedTags'] as $t => $n) {
            $lines[] = "  tag „{$t}“ dropped ×$n (not in the new set)";
        }
        if ($r['noPassword']) {
            $lines[] = '  no password in the old app: send user:invite';
        }
        return implode(PHP_EOL, $lines);
    }
}
