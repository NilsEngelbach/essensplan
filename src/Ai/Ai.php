<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;

/**
 * The AI import is optional (D25): every provider whose API key is set is
 * configured; with none (or AI_PROVIDER=off) the import is off and the app
 * hides it. AI_PROVIDER names the default; with several configured, a family
 * picks one in Konto (users.ai_provider). Every call is logged in ai_usage.
 */
final class Ai
{
    public const PROVIDERS = ['opencode', 'anthropic', 'openai'];
    public const LABELS = ['opencode' => 'OpenCode', 'anthropic' => 'Anthropic (Claude)', 'openai' => 'OpenAI (GPT)'];

    /** @param array<string, AiProvider> $providers by name, the default first */
    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly array $providers = [],
        private readonly string $why = '',
    ) {
    }

    public static function fromConfig(Config $config, Db $db, Clock $clock): self
    {
        $wanted = strtolower(trim($config->get('AI_PROVIDER', 'opencode')));
        if (in_array($wanted, ['off', 'none', 'aus'], true)) {
            return new self($db, $clock, [], "AI_PROVIDER=$wanted");
        }
        $timeout = (float) $config->int('AI_TIMEOUT', 150);
        $all = [];
        if ($config->get('OPENCODE_API_KEY') !== '') {
            $all['opencode'] = new OpenCodeProvider(
                $config->get('OPENCODE_API_KEY'),
                $config->get('OPENCODE_MODEL', 'glm-5.2'),
                $config->get('OPENCODE_IMAGE_MODEL', $config->get('OPENCODE_MODEL', 'kimi-k3')),
                $timeout,
            );
        }
        if ($config->get('ANTHROPIC_API_KEY') !== '') {
            $all['anthropic'] = new AnthropicProvider(
                $config->get('ANTHROPIC_API_KEY'),
                $config->get('ANTHROPIC_MODEL', 'claude-opus-5-5'),
                $config->get('ANTHROPIC_EFFORT', 'low'),
                $timeout,
            );
        }
        if ($config->get('OPENAI_API_KEY') !== '') {
            $all['openai'] = new OpenAiProvider(
                $config->get('OPENAI_API_KEY'),
                $config->get('OPENAI_MODEL', 'gpt-5-mini'),
                $config->get('OPENAI_EFFORT', 'low'),
                $timeout,
            );
        }
        // The default first; one without a key falls back to the first configured.
        if (isset($all[$wanted])) {
            $all = [$wanted => $all[$wanted]] + $all;
        }
        return new self($db, $clock, $all, $all === [] ? 'kein KI-Schlüssel gesetzt (OPENCODE_API_KEY, ANTHROPIC_API_KEY oder OPENAI_API_KEY)' : '');
    }

    public function enabled(): bool
    {
        return $this->providers !== [];
    }

    public function configured(string $name): bool
    {
        return isset($this->providers[$name]);
    }

    /** @return list<array{key: string, label: string, model: string}> the default first */
    public function providers(): array
    {
        $out = [];
        foreach ($this->providers as $name => $p) {
            $out[] = ['key' => $name, 'label' => self::LABELS[$name] ?? $name, 'model' => $p->model(false)];
        }
        return $out;
    }

    /** The provider name this family's imports use, or null when the AI import is off. */
    public function chosen(string $userId): ?string
    {
        if (!$this->enabled()) {
            return null;
        }
        $pick = count($this->providers) > 1 ? $this->db->value('SELECT ai_provider FROM users WHERE id = ?', [$userId]) : null;
        return is_string($pick) && $this->configured($pick) ? $pick : (string) array_key_first($this->providers);
    }

    /** For bin/console check: "anthropic · claude-opus-5-5 (Standard), openai · gpt-5-mini" or why it is off. */
    public function describe(): string
    {
        if (!$this->enabled()) {
            return $this->why;
        }
        $parts = [];
        foreach ($this->providers as $p) {
            $text = $p->model(false);
            $vision = $p->model(true);
            $parts[] = $p->name() . ' · ' . $text . ($vision !== $text ? " (Fotos: $vision)" : '') . ($parts === [] && count($this->providers) > 1 ? ' (Standard)' : '');
        }
        return implode(', ', $parts);
    }

    /** @return array<string, string> provider name → endpoint, for the reachability check */
    public function endpoints(): array
    {
        return array_map(fn (AiProvider $p) => $p->endpoint(), $this->providers);
    }

    /** @throws ApiError ai_unavailable when no provider is configured */
    public function require(?string $userId = null): AiProvider
    {
        if (!$this->enabled()) {
            throw new ApiError(503, 'ai_unavailable', 'Der KI-Import ist auf diesem Server nicht eingerichtet. Du kannst das Rezept selbst eingeben.');
        }
        return $this->providers[$userId === null ? array_key_first($this->providers) : $this->chosen($userId)];
    }

    /**
     * One call, logged in ai_usage (also when it fails).
     *
     * @param array{mime: string, data: string}|null $image
     * @param array<string, mixed> $schema
     */
    public function json(string $userId, ?string $apiKeyId, string $feature, string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $provider = $this->require($userId);
        $start = hrtime(true);
        try {
            $result = $provider->json($system, $user, $image, $schema, $schemaName);
        } catch (\Throwable $e) {
            $this->log($userId, $apiKeyId, $feature, $provider->name(), $provider->model($image !== null), 0, 0, $start, false);
            throw $e;
        }
        $this->log($userId, $apiKeyId, $feature, $provider->name(), $result->model, $result->inputTokens, $result->outputTokens, $start, true);
        return $result;
    }

    private function log(string $userId, ?string $apiKeyId, string $feature, string $provider, string $model, int $in, int $out, int|float $start, bool $success): void
    {
        $this->db->insert('ai_usage', [
            'user_id' => $userId,
            'api_key_id' => $apiKeyId,
            'feature' => $feature,
            'provider' => $provider,
            'model' => mb_substr($model, 0, 60),
            'input_tokens' => $in,
            'output_tokens' => $out,
            'duration_ms' => (int) ((hrtime(true) - $start) / 1_000_000),
            'success' => $success ? 1 : 0,
            'created_at' => $this->clock->db(),
        ]);
    }

    public static function keyId(Principal $p): ?string
    {
        return $p->key['id'] ?? null;
    }
}
