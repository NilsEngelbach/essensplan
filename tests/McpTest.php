<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** /mcp: stateless JSON-RPC over HTTP, Bearer key only, tools filtered by scope. */
final class McpTest extends TestCase
{
    private Actor $me;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user();
        $this->me = $this->login();
    }

    private function rpc(Actor $key, string $method, array $params = [], int|string|null $id = 1, array $headers = []): array
    {
        $msg = ['jsonrpc' => '2.0', 'method' => $method, 'params' => $params ?: new \stdClass()];
        if ($id !== null) {
            $msg['id'] = $id;
        }
        $r = $this->call('POST', '/mcp', $msg, $key, ['Accept' => 'application/json, text/event-stream', ...$headers]);
        return $r;
    }

    public function testHandshakeEraLifecycle(): void
    {
        $key = $this->key($this->me, ['recipes:read', 'mealplan:write']);
        $r = $this->rpc($key, 'initialize', ['protocolVersion' => '2025-06-18', 'capabilities' => new \stdClass(), 'clientInfo' => ['name' => 'test', 'version' => '1']]);
        $this->assertSame(200, $r['status']);
        $this->assertSame('2025-06-18', $r['body']['result']['protocolVersion']);
        $this->assertSame('essensplan', $r['body']['result']['serverInfo']['name']);
        $this->assertArrayNotHasKey('Mcp-Session-Id', $r['headers'], 'stateless: no session');
        $this->assertSame('2025-11-25', $this->rpc($key, 'initialize', ['protocolVersion' => '2099-01-01'])['body']['result']['protocolVersion']);

        $this->assertSame(202, $this->rpc($key, 'notifications/initialized', [], null)['status']);
        $this->assertSame([], (array) $this->rpc($key, 'ping')['body']['result']);

        $tools = array_column($this->rpc($key, 'tools/list')['body']['result']['tools'], 'name');
        $this->assertContains('search_recipes', $tools);
        $this->assertContains('add_meal', $tools);
        $this->assertContains('get_meal_plan', $tools, 'write implies read');
        $this->assertContains('get_profile', $tools);
        $this->assertNotContains('create_recipe', $tools);
        $this->assertNotContains('get_grocery_list', $tools);

        $this->assertSame(-32601, $this->rpc($key, 'nope/nope')['body']['error']['code']);
        $this->assertSame(-32602, $this->rpc($key, 'tools/call', ['name' => 'nope'])['body']['error']['code']);
    }

    public function testToolsCallThroughTheServices(): void
    {
        $recipe = $this->recipe($this->me);
        $key = $this->key($this->me, ['recipes:read', 'mealplan:write', 'shopping:write']);

        $res = $this->rpc($key, 'tools/call', ['name' => 'search_recipes', 'arguments' => ['q' => 'linsen']])['body']['result'];
        $this->assertFalse($res['isError']);
        $this->assertSame('Linsensuppe', $res['structuredContent']['recipes'][0]['title']);
        $this->assertSame($res['structuredContent'], json_decode($res['content'][0]['text'], true));

        $profile = $this->rpc($key, 'tools/call', ['name' => 'get_profile'])['body']['result']['structuredContent'];
        $this->assertSame(['today' => '2026-11-12', 'weekStart' => 1, 'planningWeekday' => 5, 'defaultWeekStart' => '2026-11-09'], $profile);

        $added = $this->rpc($key, 'tools/call', ['name' => 'add_meal', 'arguments' => ['date' => '2026-11-13', 'slot' => 'lunch', 'recipeId' => $recipe['id']]])['body']['result'];
        $this->assertFalse($added['isError'], json_encode($added));
        $this->assertSame('mcp', $added['structuredContent']['createdVia']);
        $act = $this->ok(200, 'GET', '/api/v1/agent-activity', null, $this->me)['items'][0];
        $this->assertSame(['mcp', 'hat Fr 13. Mittag: Linsensuppe geplant'], [$act['channel'], $act['summary']]);

        $plan = $this->rpc($key, 'tools/call', ['name' => 'get_meal_plan', 'arguments' => ['from' => '2026-11-09', 'to' => '2026-11-15']])['body']['result']['structuredContent'];
        $this->assertSame('Linsensuppe', $plan['days'][0]['slots']['lunch'][0]['title']);
        $this->assertSame('Fr', $plan['days'][0]['weekday']);

        $grocery = $this->rpc($key, 'tools/call', ['name' => 'get_grocery_list'])['body']['result']['structuredContent'];
        $this->assertSame(['2026-11-13'], $grocery['days']);
        $this->rpc($key, 'tools/call', ['name' => 'add_grocery_item', 'arguments' => ['name' => 'Backpapier']]);
        $this->assertTrue(in_array('Backpapier', array_merge(...array_map(fn ($s) => array_column($s['items'], 'name'), $this->rpc($key, 'tools/call', ['name' => 'get_grocery_list'])['body']['result']['structuredContent']['sections'])), true));

        // Validation and scope errors come back as tool errors the model can read.
        $bad = $this->rpc($key, 'tools/call', ['name' => 'add_meal', 'arguments' => ['date' => 'morgen', 'slot' => 'lunch', 'note' => 'x']])['body']['result'];
        $this->assertTrue($bad['isError']);
        $this->assertStringContainsString('Bitte prüf deine Eingaben.', $bad['content'][0]['text']);
        $forbidden = $this->rpc($key, 'tools/call', ['name' => 'create_recipe', 'arguments' => ['title' => 'X', 'category' => 'Salat']])['body']['result'];
        $this->assertSame([true, 'Diesem Schlüssel fehlt das Recht recipes:write.'], [$forbidden['isError'], $forbidden['content'][0]['text']]);
    }

    public function testModernEraAndPrompts(): void
    {
        $key = $this->key($this->me, ['recipes:read']);
        $meta = ['_meta' => ['io.modelcontextprotocol/protocolVersion' => '2026-07-28', 'io.modelcontextprotocol/clientCapabilities' => new \stdClass()]];
        $r = $this->rpc($key, 'tools/list', $meta, 7, ['MCP-Protocol-Version' => '2026-07-28'])['body'];
        $this->assertSame(7, $r['id']);
        $this->assertSame('complete', $r['result']['resultType']);
        $this->assertSame('essensplan', $r['result']['_meta']['io.modelcontextprotocol/serverInfo']['name']);
        $this->assertSame(-32601, $this->rpc($key, 'initialize', $meta)['body']['error']['code'], 'no handshake in the modern era');
        $discover = $this->rpc($key, 'server/discover', $meta)['body']['result'];
        $this->assertContains('2026-07-28', $discover['supportedVersions']);
        $this->assertSame(-32602, $this->rpc($key, 'tools/list', ['_meta' => ['io.modelcontextprotocol/protocolVersion' => '2030-01-01']])['body']['error']['code']);

        $prompts = array_column($this->rpc($key, 'prompts/list')['body']['result']['prompts'], 'name');
        $this->assertSame(['plan_week', 'shopping_for_week'], $prompts);
        $this->ok(200, 'PATCH', '/api/v1/me', ['settings' => ['planningWeekday' => 4]], $this->me);
        $text = $this->rpc($key, 'prompts/get', ['name' => 'plan_week', 'arguments' => ['wishes' => 'vegetarisch']])['body']['result']['messages'][0]['content']['text'];
        $this->assertStringContainsString('vom 2026-11-16 bis 2026-11-22', $text, 'targets defaultWeekStart from the settings');
        $this->assertStringContainsString('Wünsche: vegetarisch', $text);
    }

    public function testAuthAndTransportRules(): void
    {
        $r = $this->call('POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping']);
        $this->assertSame(401, $r['status']);
        $this->assertStringStartsWith('Bearer', $r['headers']['WWW-Authenticate'][0]);
        // A browser session is not enough for MCP.
        $this->assertSame(401, $this->call('POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'], $this->me)['status']);
        $key = $this->key($this->me, ['recipes:read']);
        $this->assertSame(405, $this->call('GET', '/mcp', null, $key)['status']);
        $this->assertSame(403, $this->call('POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'], $key, ['Origin' => 'https://evil.example'])['status']);
        $this->assertSame(200, $this->call('POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping'], $key, ['Origin' => 'http://essen.test'])['status']);
        $this->assertSame(-32700, $this->call('POST', '/mcp', '{not json', $key)['body']['error']['code']);
    }
}
