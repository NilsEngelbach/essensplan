<?php

declare(strict_types=1);

namespace Essensplan\Http;

use Essensplan\Domain\Catalog;

/**
 * Who is calling: a logged-in device (session) or an API key. Services take
 * this instead of a bare user id so they can set created_via and log agent writes.
 */
final class Principal
{
    /** @var list<string> */
    public readonly array $scopes;

    /**
     * @param array<string, mixed>|null $session row from `sessions`
     * @param array<string, mixed>|null $key     row from `api_keys`
     */
    private function __construct(
        public readonly string $userId,
        public readonly ?array $session,
        public readonly ?array $key,
        public readonly string $channel,
    ) {
        $this->scopes = $key === null ? [] : Catalog::expandScopes(json_decode((string) $key['scopes'], true) ?: []);
    }

    public static function forSession(array $session): self
    {
        return new self((string) $session['user_id'], $session, null, 'app');
    }

    public static function forKey(array $key, string $channel = 'api'): self
    {
        return new self((string) $key['user_id'], null, $key, $channel);
    }

    /** The same key, speaking MCP. */
    public function viaMcp(): self
    {
        return new self($this->userId, $this->session, $this->key, 'mcp');
    }

    public function isKey(): bool
    {
        return $this->key !== null;
    }

    public function sessionId(): ?string
    {
        return $this->session['id'] ?? null;
    }

    /** Sessions may do everything their user may; keys only what their scopes say. */
    public function can(string $scope): bool
    {
        return !$this->isKey() || in_array($scope, $this->scopes, true);
    }

    /** created_via for rows this caller writes: app | api | mcp. */
    public function via(): string
    {
        return $this->channel;
    }
}
