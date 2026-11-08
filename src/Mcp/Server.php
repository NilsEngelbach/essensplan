<?php

declare(strict_types=1);

namespace Essensplan\Mcp;

use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Schema\Schemas;

/**
 * A stateless MCP server over Streamable HTTP (docs/BACKEND.md §6, D23): one
 * JSON-RPC message per POST, answered as application/json, no session id.
 *
 * Handshake era (2025-03-26 … 2025-11-25): initialize is answered, nothing
 * is remembered. Modern era (2026-07-28): requests carry the version in
 * params._meta and need no handshake; results get resultType "complete".
 */
final class Server
{
    public const HANDSHAKE_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
    public const MODERN_VERSIONS = ['2026-07-28'];
    private const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
    private const META_SERVER = 'io.modelcontextprotocol/serverInfo';

    private const INSTRUCTIONS = 'Essensplan is one family\'s recipe collection, weekly meal plan and shopping list (German). '
        . 'Call get_profile first: it tells today\'s date (Europe/Berlin), the week start and the week the family is planning. '
        . 'Dates are YYYY-MM-DD. A plan entry is a recipe or a short free text. Everything you change is logged and the family can undo it.';

    public function __construct(private readonly Tools $tools)
    {
    }

    public static function serverInfo(): array
    {
        return ['name' => 'essensplan', 'title' => 'Essensplan', 'version' => '1.0.0-draft'];
    }

    /**
     * @param array<string, mixed>|mixed $msg one decoded JSON-RPC message
     * @return array<string, mixed>|null the response, or null for a notification
     */
    public function handle(Principal $p, mixed $msg, string $headerVersion = ''): ?array
    {
        if (!is_array($msg) || array_is_list($msg) || ($msg['jsonrpc'] ?? null) !== '2.0' || !is_string($msg['method'] ?? null)) {
            return self::error(null, -32600, 'Invalid Request');
        }
        $id = $msg['id'] ?? null;
        $isNotification = !array_key_exists('id', $msg);
        $method = $msg['method'];
        $params = is_array($msg['params'] ?? null) ? $msg['params'] : [];
        $modernVersion = $params['_meta'][self::META_VERSION] ?? null;

        if ($isNotification) {
            return null; // notifications/initialized, cancelled, …: nothing to keep
        }
        if ($modernVersion !== null) {
            if (!in_array($modernVersion, self::MODERN_VERSIONS, true)) {
                return self::error($id, -32602, 'Unsupported protocol version', ['supported' => [...self::MODERN_VERSIONS, ...self::HANDSHAKE_VERSIONS], 'requested' => $modernVersion]);
            }
            if ($headerVersion !== '' && $headerVersion !== $modernVersion) {
                return self::error($id, -32600, 'MCP-Protocol-Version header and _meta disagree');
            }
            if (in_array($method, ['initialize', 'ping', 'logging/setLevel'], true)) {
                return self::error($id, -32601, "Method not found: $method");
            }
        }

        try {
            $result = match ($method) {
                'initialize' => $this->initialize($params),
                'server/discover' => $this->discover(),
                'ping' => new \stdClass(),
                'tools/list' => ['tools' => $this->listTools($p)],
                'tools/call' => $this->callTool($p, $params),
                'prompts/list' => ['prompts' => $this->listPrompts()],
                'prompts/get' => $this->getPrompt($p, $params),
                'resources/list' => ['resources' => []],
                'resources/templates/list' => ['resourceTemplates' => []],
                default => null,
            };
        } catch (\InvalidArgumentException $e) {
            return self::error($id, -32602, $e->getMessage());
        }
        if ($result === null) {
            return self::error($id, -32601, "Method not found: $method");
        }
        if ($modernVersion !== null && is_array($result)) {
            $result['resultType'] = 'complete';
            $result['_meta'] = [self::META_SERVER => self::serverInfo()];
        }
        return ['jsonrpc' => '2.0', 'id' => $id, 'result' => $result];
    }

    private function capabilities(): array
    {
        return ['tools' => ['listChanged' => false], 'prompts' => ['listChanged' => false], 'resources' => new \stdClass()];
    }

    private function initialize(array $params): array
    {
        $asked = (string) ($params['protocolVersion'] ?? '');
        return [
            'protocolVersion' => in_array($asked, self::HANDSHAKE_VERSIONS, true) ? $asked : self::HANDSHAKE_VERSIONS[0],
            'capabilities' => $this->capabilities(),
            'serverInfo' => self::serverInfo(),
            'instructions' => self::INSTRUCTIONS,
        ];
    }

    private function discover(): array
    {
        return [
            'supportedVersions' => [...self::MODERN_VERSIONS, ...self::HANDSHAKE_VERSIONS],
            'capabilities' => $this->capabilities(),
            'serverInfo' => self::serverInfo(),
            'instructions' => self::INSTRUCTIONS,
        ];
    }

    /** Only what this key may use. */
    private function listTools(Principal $p): array
    {
        $out = [];
        foreach ($this->tools->all() as $name => $t) {
            if ($p->can($t['scope'])) {
                $out[] = ['name' => $name, 'title' => $t['annotations']['title'], 'description' => $t['description'], 'inputSchema' => $t['inputSchema'], 'annotations' => $t['annotations']];
            }
        }
        return $out;
    }

    private function callTool(Principal $p, array $params): array
    {
        $name = (string) ($params['name'] ?? '');
        $tool = $this->tools->all()[$name] ?? throw new \InvalidArgumentException("Unknown tool: $name");
        $args = $params['arguments'] ?? [];
        if (!is_array($args)) {
            throw new \InvalidArgumentException('arguments must be an object');
        }
        if (!$p->can($tool['scope'])) {
            return self::toolError("Diesem Schlüssel fehlt das Recht {$tool['scope']}.");
        }
        try {
            Schemas::validate($tool['inputSchema'], Schemas::toObject($args));
            $data = ($tool['run'])($p, $args);
        } catch (ApiError $e) {
            $text = $e->getMessage();
            foreach ($e->details as $d) {
                $text .= "\n- " . ($d['path'] !== '' ? $d['path'] . ': ' : '') . $d['message'];
            }
            return self::toolError($text);
        }
        $structured = is_array($data) && !array_is_list($data) ? $data : ['result' => $data];
        return [
            'content' => [['type' => 'text', 'text' => json_encode($structured, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT)]],
            'structuredContent' => $structured,
            'isError' => false,
        ];
    }

    private static function toolError(string $text): array
    {
        return ['content' => [['type' => 'text', 'text' => $text]], 'isError' => true];
    }

    private function listPrompts(): array
    {
        $out = [];
        foreach (Tools::prompts() as $name => $pr) {
            $out[] = ['name' => $name, ...$pr];
        }
        return $out;
    }

    private function getPrompt(Principal $p, array $params): array
    {
        $name = (string) ($params['name'] ?? '');
        if (!isset(Tools::prompts()[$name])) {
            throw new \InvalidArgumentException("Unknown prompt: $name");
        }
        return $this->tools->prompt($p, $name, is_array($params['arguments'] ?? null) ? $params['arguments'] : []);
    }

    public static function error(mixed $id, int $code, string $message, ?array $data = null): array
    {
        $err = ['code' => $code, 'message' => $message];
        if ($data !== null) {
            $err['data'] = $data;
        }
        return ['jsonrpc' => '2.0', 'id' => $id, 'error' => $err];
    }
}
