<?php

declare(strict_types=1);

namespace Essensplan\Domain;

/** Fixed sets shared with the SPA (frontend/src/lib/types.ts, shopping.ts). */
final class Catalog
{
    public const CATEGORIES = ['Hauptspeise', 'Salat', 'Suppe', 'Beilage', 'Frühstück', 'Dessert', 'Snack'];
    public const TAGS = ['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Schnell', 'Gesund', 'Würzig', 'Süß'];
    public const DIFFICULTIES = ['Einfach', 'Mittel', 'Schwer'];

    public const SLOTS = [
        'breakfast' => ['id' => 1, 'name' => 'Frühstück', 'short' => 'Früh'],
        'lunch' => ['id' => 2, 'name' => 'Mittagessen', 'short' => 'Mittag'],
        'dinner' => ['id' => 3, 'name' => 'Abendessen', 'short' => 'Abend'],
        'snack' => ['id' => 4, 'name' => 'Snack', 'short' => 'Snack'],
    ];

    /** Free-text entries offered first (D15). */
    public const PRESETS = ['Reste', 'Essen gehen', 'Auswärts', 'Bestellen'];

    public const SCOPES = [
        'recipes:read', 'recipes:write', 'recipes:delete',
        'mealplan:read', 'mealplan:write',
        'shopping:read', 'shopping:write',
        'ai:use',
    ];

    /** Write implies read (D18). profile:read is implicit for every key. */
    public const IMPLIED = [
        'recipes:write' => ['recipes:read'],
        'recipes:delete' => ['recipes:read'],
        'mealplan:write' => ['mealplan:read'],
        'shopping:write' => ['shopping:read'],
    ];

    public const CLIENTS = ['claude-code', 'claude-desktop', 'mcp', 'rest'];

    public static function slotKey(int $id): string
    {
        foreach (self::SLOTS as $key => $s) {
            if ($s['id'] === $id) {
                return $key;
            }
        }
        throw new \InvalidArgumentException("Unknown slot $id");
    }

    public static function slotId(string $key): int
    {
        return self::SLOTS[$key]['id'] ?? throw new \InvalidArgumentException("Unknown slot $key");
    }

    /** @return list<string> */
    public static function expandScopes(array $scopes): array
    {
        $out = ['profile:read'];
        foreach ($scopes as $s) {
            $out[] = $s;
            array_push($out, ...(self::IMPLIED[$s] ?? []));
        }
        return array_values(array_unique($out));
    }
}
