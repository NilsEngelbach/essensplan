<?php

declare(strict_types=1);

namespace Essensplan\Import;

use PDO;

/**
 * Reads the old app straight from Supabase's Postgres (DIRECT_URL, not the
 * pooler). Needs pdo_pgsql; on the Local site enable php_pdo_pgsql.dll.
 * Read-only: only SELECTs, in a read-only transaction.
 */
final class SupabaseSource implements ImportSource
{
    public function __construct(private readonly PDO $pdo)
    {
        $this->pdo->exec('BEGIN TRANSACTION READ ONLY');
    }

    /** postgresql://user:pass@host:port/db?sslmode=… → PDO */
    public static function connect(string $url): self
    {
        $u = parse_url($url);
        if ($u === false || !in_array($u['scheme'] ?? '', ['postgres', 'postgresql'], true) || empty($u['host'])) {
            throw new \InvalidArgumentException('SUPABASE_DB_URL / DIRECT_URL must be a postgresql:// URL.');
        }
        if (!extension_loaded('pdo_pgsql')) {
            throw new \RuntimeException('pdo_pgsql is not loaded (Local: extension=php_pdo_pgsql.dll).');
        }
        parse_str($u['query'] ?? '', $q);
        $dsn = sprintf(
            'pgsql:host=%s;port=%d;dbname=%s;sslmode=%s',
            $u['host'],
            $u['port'] ?? 5432,
            ltrim($u['path'] ?? '/postgres', '/') ?: 'postgres',
            $q['sslmode'] ?? 'require',
        );
        $pdo = new PDO($dsn, rawurldecode($u['user'] ?? ''), rawurldecode($u['pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        return new self($pdo);
    }

    public function users(): array
    {
        $rows = $this->pdo->query(
            "SELECT id::text AS id, email, encrypted_password AS password_hash,
                    COALESCE(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', raw_user_meta_data->>'display_name') AS name,
                    extract(epoch FROM created_at)::float8 AS created_at,
                    extract(epoch FROM email_confirmed_at)::float8 AS email_confirmed_at
             FROM auth.users
             WHERE deleted_at IS NULL AND email IS NOT NULL
             ORDER BY created_at"
        )->fetchAll();
        return array_map(fn ($r) => [
            ...$r,
            'password_hash' => $r['password_hash'] === '' ? null : $r['password_hash'],
            'created_at' => (float) $r['created_at'],
            'email_confirmed_at' => $r['email_confirmed_at'] === null ? null : (float) $r['email_confirmed_at'],
        ], $rows);
    }

    public function recipes(string $userId): array
    {
        $st = $this->pdo->prepare(
            'SELECT id, title, description, "imageUrl", category, tags, "cookingTime", servings, difficulty, rating, "sourceUrl",
                    extract(epoch FROM "createdAt")::float8 AS "createdAt", extract(epoch FROM "updatedAt")::float8 AS "updatedAt"
             FROM "Recipe" WHERE "userId" = ? ORDER BY "createdAt", id'
        );
        $st->execute([$userId]);
        $recipes = $st->fetchAll();
        if (!$recipes) {
            return [];
        }
        $ids = array_column($recipes, 'id');
        $marks = implode(',', array_fill(0, count($ids), '?'));
        // The old app never sorted ingredients; it showed them in table order.
        $ing = $this->pdo->prepare("SELECT id, name, amount, unit, notes, component, \"recipeId\" FROM \"Ingredient\" WHERE \"recipeId\" IN ($marks) ORDER BY ctid");
        $ing->execute($ids);
        $steps = $this->pdo->prepare("SELECT id, \"stepNumber\", description, \"imageUrl\", \"recipeId\" FROM \"Instruction\" WHERE \"recipeId\" IN ($marks) ORDER BY \"stepNumber\", ctid");
        $steps->execute($ids);
        $by = [];
        foreach ($ing->fetchAll() as $r) {
            $by[$r['recipeId']]['ingredients'][] = $r;
        }
        foreach ($steps->fetchAll() as $r) {
            $by[$r['recipeId']]['instructions'][] = $r;
        }
        return array_map(fn ($r) => [
            ...$r,
            'createdAt' => (float) $r['createdAt'],
            'updatedAt' => (float) $r['updatedAt'],
            'ingredients' => $by[$r['id']]['ingredients'] ?? [],
            'instructions' => $by[$r['id']]['instructions'] ?? [],
        ], $recipes);
    }

    public function mealPlans(string $userId): array
    {
        $st = $this->pdo->prepare(
            'SELECT id, extract(epoch FROM date)::float8 AS date, "recipeId",
                    extract(epoch FROM "createdAt")::float8 AS "createdAt", extract(epoch FROM "updatedAt")::float8 AS "updatedAt"
             FROM "MealPlan" WHERE "userId" = ? ORDER BY date, "createdAt"'
        );
        $st->execute([$userId]);
        return array_map(fn ($r) => [
            ...$r,
            'date' => (float) $r['date'],
            'createdAt' => (float) $r['createdAt'],
            'updatedAt' => (float) $r['updatedAt'],
        ], $st->fetchAll());
    }
}
