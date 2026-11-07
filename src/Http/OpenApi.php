<?php

declare(strict_types=1);

namespace Essensplan\Http;

use Essensplan\Config;
use Essensplan\Domain\Catalog;
use Essensplan\Schema\Schemas;

/** openapi.json from the route table and the same JSON Schemas that validate the bodies. */
final class OpenApi
{
    public static function document(Config $config): array
    {
        $paths = [];
        foreach (Routes::all() as [$method, $path, , $auth, $schema, $summary]) {
            $oaPath = preg_replace('/\{(\w+)(:[^}]+)?\}/', '{$1}', $path);
            $op = [
                'summary' => $summary,
                'operationId' => strtolower($method) . str_replace(' ', '', ucwords(preg_replace('/[^a-z0-9]+/i', ' ', $oaPath))),
                'tags' => [explode('/', trim($path, '/'))[0]],
                'responses' => [
                    '200' => ['description' => 'OK'],
                    'default' => ['$ref' => '#/components/responses/Error'],
                ],
            ];
            preg_match_all('/\{(\w+)/', $path, $m);
            foreach ($m[1] as $param) {
                $op['parameters'][] = ['name' => $param, 'in' => 'path', 'required' => true, 'schema' => ['type' => 'string']];
            }
            if ($schema !== null) {
                $op['requestBody'] = ['required' => true, 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/' . self::ref($schema)]]]];
            }
            $op['security'] = match (true) {
                $auth === 'public' || $auth === 'guest' => [],
                $auth === 'session' => [['session' => []]],
                default => [['session' => []], ['apiKey' => $auth === 'profile' ? [] : [$auth]]],
            };
            if (str_contains($auth, ':')) {
                $op['x-scope'] = $auth;
            } elseif ($auth !== 'public') {
                $op['x-auth'] = $auth;
            }
            $paths[$oaPath][strtolower($method)] = $op;
        }
        $schemas = [];
        foreach (Schemas::all() as $name => $s) {
            $schemas[self::ref($name)] = $s;
        }
        $schemas['Error'] = [
            'type' => 'object',
            'required' => ['error'],
            'properties' => ['error' => [
                'type' => 'object',
                'required' => ['code', 'message'],
                'properties' => [
                    'code' => ['type' => 'string'],
                    'message' => ['type' => 'string', 'description' => 'German, shown to the user as is'],
                    'details' => ['type' => 'array', 'items' => ['type' => 'object', 'properties' => ['path' => ['type' => 'string'], 'message' => ['type' => 'string']]]],
                ],
            ]],
        ];
        return [
            'openapi' => '3.1.0',
            'info' => [
                'title' => 'Essensplan API',
                'version' => '1.0.0-draft',
                'description' => 'Recipes, meal plan and shopping list of one family. Agents authenticate with an API key (Bearer esp_…); scopes per route are listed as x-scope. Write implies read.',
            ],
            'servers' => [['url' => $config->appUrl() . '/api/v1']],
            'paths' => $paths,
            'components' => [
                'schemas' => $schemas,
                'responses' => ['Error' => ['description' => 'Error', 'content' => ['application/json' => ['schema' => ['$ref' => '#/components/schemas/Error']]]]],
                'securitySchemes' => [
                    'apiKey' => ['type' => 'http', 'scheme' => 'bearer', 'description' => 'esp_… key. Scopes: ' . implode(', ', Catalog::SCOPES)],
                    'session' => ['type' => 'apiKey', 'in' => 'cookie', 'name' => Io::COOKIE, 'description' => 'Browser session; unsafe requests also need X-CSRF-Token'],
                ],
            ],
        ];
    }

    private static function ref(string $name): string
    {
        return str_replace(' ', '', ucwords(str_replace('-', ' ', $name)));
    }
}
