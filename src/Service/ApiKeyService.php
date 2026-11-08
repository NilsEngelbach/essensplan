<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Domain\Catalog;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Util;

/** API keys (docs/BACKEND.md §2.6, D18): `esp_` + 40 base62, only sha256 + prefix stored. */
final class ApiKeyService
{
    public const UNREVOKE_MINUTES = 10;

    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /**
     * Pre-auth lookup by the secret's hash.
     *
     * @return array<string, mixed>|null the live key row
     */
    public function authenticate(string $secret, ?string $ip): ?array
    {
        if (!str_starts_with($secret, 'esp_')) {
            return null;
        }
        $key = $this->db->one(
            'SELECT k.* FROM api_keys k JOIN users u ON u.id = k.user_id WHERE k.key_hash = ? AND u.disabled_at IS NULL',
            [hash('sha256', $secret)],
        );
        if ($key === null || $key['revoked_at'] !== null || ($key['expires_at'] !== null && $key['expires_at'] <= $this->clock->db())) {
            return null;
        }
        // Written at most once a minute, so a busy agent doesn't turn reads into writes.
        if ($key['last_used_at'] === null || $key['last_used_at'] < $this->clock->db('-1 minute')) {
            $this->db->exec('UPDATE api_keys SET last_used_at = ?, last_used_ip = ? WHERE id = ?', [$this->clock->db(), $ip, $key['id']]);
        }
        return $key;
    }

    /** @return list<array<string, mixed>> newest first */
    public function list(Principal $p): array
    {
        return array_map($this->json(...), $this->db->all('SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [$p->userId]));
    }

    /**
     * The secret is returned exactly once.
     *
     * @param array{name?: ?string, scopes: list<string>, validDays?: ?int, client?: string} $in
     * @return array{key: array<string, mixed>, secret: string}
     */
    public function create(Principal $p, array $in): array
    {
        $scopes = array_values(array_unique($in['scopes']));
        foreach ($scopes as $s) {
            if (!in_array($s, Catalog::SCOPES, true)) {
                throw ApiError::field('scopes', "Das Recht $s gibt es nicht.");
            }
        }
        if (!$scopes) {
            throw ApiError::field('scopes', 'Wähl mindestens ein Recht aus.');
        }
        $secret = 'esp_' . Util::base62(40);
        $name = mb_substr(trim((string) ($in['name'] ?? '')), 0, 60);
        $validDays = $in['validDays'] ?? null;
        $row = [
            'id' => Util::uuid(),
            'user_id' => $p->userId,
            'name' => $name !== '' ? $name : 'Schlüssel vom ' . $this->shortDate(),
            'prefix' => substr($secret, 0, 12),
            'key_hash' => hash('sha256', $secret),
            'scopes' => $scopes,
            'client' => $in['client'] ?? 'rest',
            'expires_at' => $validDays ? $this->clock->db("+$validDays days") : null,
            'created_at' => $this->clock->dbMicro(),
        ];
        $this->db->insert('api_keys', $row);
        return ['key' => $this->json($this->row($p, $row['id'])), 'secret' => $secret];
    }

    /** "7. Nov." in Berlin time, as the prototype prints it. */
    private function shortDate(): string
    {
        $f = new \IntlDateFormatter('de_DE', \IntlDateFormatter::NONE, \IntlDateFormatter::NONE, 'Europe/Berlin', null, 'd. MMM');
        return (string) $f->format($this->clock->now());
    }

    private function row(Principal $p, string $id): array
    {
        return $this->db->one('SELECT * FROM api_keys WHERE id = ? AND user_id = ?', [$id, $p->userId])
            ?? throw ApiError::notFound('Diesen Schlüssel gibt es nicht.');
    }

    public function setClient(Principal $p, string $id, string $client): array
    {
        $this->row($p, $id);
        $this->db->exec('UPDATE api_keys SET client = ? WHERE id = ? AND user_id = ?', [$client, $id, $p->userId]);
        return $this->json($this->row($p, $id));
    }

    /** Takes effect immediately. */
    public function revoke(Principal $p, string $id): array
    {
        $key = $this->row($p, $id);
        if ($key['revoked_at'] === null) {
            $this->db->exec('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ?', [$this->clock->db(), $id, $p->userId]);
        }
        return $this->json($this->row($p, $id));
    }

    /** Undo toast: allowed for a few minutes after revoking. */
    public function unrevoke(Principal $p, string $id): array
    {
        $key = $this->row($p, $id);
        if ($key['revoked_at'] === null) {
            return $this->json($key);
        }
        if ($key['revoked_at'] < $this->clock->db('-' . self::UNREVOKE_MINUTES . ' minutes')) {
            throw ApiError::conflict('Der Schlüssel ist zu lange widerrufen. Leg einen neuen an.');
        }
        $this->db->exec('UPDATE api_keys SET revoked_at = NULL WHERE id = ? AND user_id = ?', [$id, $p->userId]);
        return $this->json($this->row($p, $id));
    }

    public function json(array $k): array
    {
        return [
            'id' => $k['id'],
            'name' => $k['name'],
            'prefix' => $k['prefix'],
            'scopes' => Util::decode($k['scopes']),
            'client' => $k['client'],
            'createdAt' => Util::iso(substr((string) $k['created_at'], 0, 19)),
            'lastUsedAt' => Util::iso($k['last_used_at']),
            'expiresAt' => Util::iso($k['expires_at']),
            'revokedAt' => Util::iso($k['revoked_at']),
        ];
    }
}
