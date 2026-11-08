<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;

/**
 * Picks the provider from AI_PROVIDER (openai | anthropic | opencode; the old
 * app's default opencode stays the default) and logs every call in ai_usage.
 * Without the provider's key the AI import is off and says so.
 */
final class Ai
{
    public const PROVIDERS = ['opencode', 'anthropic', 'openai'];

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly ?AiProvider $provider,
        private readonly string $missing = '',
    ) {
    }

    public static function fromConfig(Config $config, Db $db, Clock $clock): self
    {
        $name = strtolower($config->get('AI_PROVIDER', 'opencode'));
        $timeout = (float) $config->int('AI_TIMEOUT', 150);
        $key = fn (string $env) => $config->get($env);
        [$provider, $env] = match ($name) {
            'anthropic' => [$key('ANTHROPIC_API_KEY') === '' ? null : new AnthropicProvider(
                $key('ANTHROPIC_API_KEY'),
                $config->get('ANTHROPIC_MODEL', 'claude-opus-5-5'),
                $config->get('ANTHROPIC_EFFORT', 'low'),
                $timeout,
            ), 'ANTHROPIC_API_KEY'],
            'openai' => [$key('OPENAI_API_KEY') === '' ? null : new OpenAiProvider(
                $key('OPENAI_API_KEY'),
                $config->get('OPENAI_MODEL', 'gpt-5-mini'),
                $config->get('OPENAI_EFFORT', 'low'),
                $timeout,
            ), 'OPENAI_API_KEY'],
            'opencode' => [$key('OPENCODE_API_KEY') === '' ? null : new OpenCodeProvider(
                $key('OPENCODE_API_KEY'),
                $config->get('OPENCODE_MODEL', 'glm-5.2'),
                $config->get('OPENCODE_IMAGE_MODEL', $config->get('OPENCODE_MODEL', 'kimi-k3')),
                $timeout,
            ), 'OPENCODE_API_KEY'],
            default => [null, "AI_PROVIDER=$name (erlaubt: " . implode(', ', self::PROVIDERS) . ')'],
        };
        return new self($db, $clock, $provider, $provider === null ? $env : '');
    }

    public function enabled(): bool
    {
        return $this->provider !== null;
    }

    /** For bin/console check: "anthropic · claude-opus-5-5" or what is missing. */
    public function describe(): string
    {
        if ($this->provider === null) {
            return $this->missing === '' ? 'kein Anbieter' : "$this->missing fehlt";
        }
        $text = $this->provider->model(false);
        $vision = $this->provider->model(true);
        return $this->provider->name() . ' · ' . $text . ($vision !== $text ? " (Fotos: $vision)" : '');
    }

    public function endpoint(): string
    {
        return $this->provider?->endpoint() ?? '';
    }

    /** @throws ApiError ai_unavailable when no provider is configured */
    public function require(): AiProvider
    {
        return $this->provider ?? throw new ApiError(503, 'ai_unavailable', 'Der KI-Import ist auf diesem Server nicht eingerichtet. Du kannst das Rezept selbst eingeben.');
    }

    /**
     * One call, logged in ai_usage (also when it fails).
     *
     * @param array{mime: string, data: string}|null $image
     * @param array<string, mixed> $schema
     */
    public function json(string $userId, ?string $apiKeyId, string $feature, string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $provider = $this->require();
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
