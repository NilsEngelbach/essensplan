<?php

declare(strict_types=1);

namespace Essensplan\Schema;

use Essensplan\Domain\Catalog;
use Essensplan\Domain\Shopping;
use Essensplan\Http\ApiError;
use Opis\JsonSchema\Errors\ErrorFormatter;
use Opis\JsonSchema\Validator;

/**
 * Every request body schema, by name. The same schemas validate REST bodies
 * and MCP tool arguments, and feed openapi.json.
 */
final class Schemas
{
    /** @var array<string, array<string, mixed>>|null */
    private static ?array $all = null;

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        if (self::$all !== null) {
            return self::$all;
        }
        $recipe = json_decode((string) file_get_contents(__DIR__ . '/recipe.schema.json'), true, 64, JSON_THROW_ON_ERROR);
        unset($recipe['$schema']);
        $patch = $recipe;
        unset($patch['required']);
        $patch['title'] = 'RecipePatch';
        $patch['minProperties'] = 1;

        $str = fn (int $max, int $min = 0) => ['type' => 'string', 'minLength' => $min, 'maxLength' => $max];
        $date = ['type' => 'string', 'format' => 'date', 'pattern' => '^\d{4}-\d{2}-\d{2}$'];
        $slot = ['enum' => array_keys(Catalog::SLOTS)];
        $weekday = ['type' => 'integer', 'minimum' => 0, 'maximum' => 6];
        $obj = fn (array $props, array $required = [], array $extra = []) => [
            'type' => 'object',
            'properties' => $props,
            'additionalProperties' => false,
            ...($required ? ['required' => $required] : []),
            ...$extra,
        ];
        $ids = ['type' => 'array', 'maxItems' => 500, 'items' => $str(190, 1)];

        return self::$all = [
            'recipe' => $recipe,
            'recipe-patch' => $patch,
            'login' => $obj(['email' => $str(190), 'password' => $str(1000), 'remember' => ['type' => 'boolean']], ['email', 'password']),
            'pair' => $obj(['code' => $str(12), 'token' => $str(100)], [], ['minProperties' => 1]),
            'forgot' => $obj(['email' => $str(190)], ['email']),
            'reset-check' => $obj(['token' => $str(100)], ['token']),
            'reset' => $obj(['token' => $str(100), 'password' => $str(1000), 'revokeOthers' => ['type' => 'boolean']], ['token', 'password']),
            'me-patch' => $obj([
                'name' => $str(100),
                'email' => $str(190),
                'currentPassword' => $str(1000),
                'settings' => $obj(['weekStart' => $weekday, 'planningWeekday' => $weekday]),
            ], [], ['minProperties' => 1]),
            'plan-entry' => $obj([
                'date' => $date,
                'slot' => $slot,
                'recipeId' => $str(36, 1),
                'note' => $str(80, 1),
            ], ['date', 'slot']),
            'plan-entry-patch' => $obj(['date' => $date, 'slot' => $slot, 'position' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 100]], [], ['minProperties' => 1]),
            'ids' => $obj(['ids' => $ids], ['ids']),
            'trip-days' => $obj(['days' => ['type' => 'array', 'maxItems' => 31, 'items' => $date]], ['days']),
            'item-patch' => $obj(['checked' => ['type' => 'boolean'], 'atHome' => ['type' => 'boolean'], 'section' => ['enum' => Shopping::SECTIONS]], [], ['minProperties' => 1]),
            'keys' => $obj(['keys' => $ids], ['keys']),
            'ai-import' => $obj(['url' => ['type' => 'string', 'maxLength' => 2000, 'pattern' => '^https?://\S+$']], ['url']),
            'manual-item' => $obj(['name' => $str(60, 1)], ['name']),
            'section-order' => $obj(['sections' => ['type' => 'array', 'items' => ['enum' => Shopping::SECTIONS]]], ['sections']),
            'api-key' => $obj([
                'name' => ['type' => ['string', 'null'], 'maxLength' => 60],
                'scopes' => ['type' => 'array', 'minItems' => 1, 'items' => ['enum' => Catalog::SCOPES]],
                'validDays' => ['enum' => [30, 365, null]],
                'client' => ['enum' => Catalog::CLIENTS],
            ], ['scopes']),
            'api-key-patch' => $obj(['client' => ['enum' => Catalog::CLIENTS]], ['client']),
            'activity-seen' => $obj(['ids' => $ids, 'recipeId' => $str(36, 1)]),
        ];
    }

    /** @return array<string, mixed> */
    public static function get(string $name): array
    {
        return self::all()[$name] ?? throw new \InvalidArgumentException("No schema $name");
    }

    /**
     * Validates decoded JSON (objects as stdClass) and throws validation_failed
     * with one detail per broken path.
     */
    public static function validate(string|array $schema, mixed $data): void
    {
        $validator = new Validator();
        $validator->setMaxErrors(10);
        $schema = is_string($schema) ? self::get($schema) : $schema;
        $result = $validator->validate($data, json_decode(json_encode($schema, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), false));
        if ($result->isValid()) {
            return;
        }
        $details = [];
        foreach ((new ErrorFormatter())->format($result->error(), true) as $path => $messages) {
            foreach ((array) $messages as $m) {
                $details[] = ['path' => $path === '/' ? '' : (string) $path, 'message' => (string) $m];
            }
        }
        throw ApiError::validation($details);
    }

    /** Arrays → stdClass/array tree as json_decode() without assoc would give. */
    public static function toObject(mixed $data): mixed
    {
        if (is_array($data) && $data === []) {
            return new \stdClass();
        }
        return json_decode(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE), false);
    }
}
