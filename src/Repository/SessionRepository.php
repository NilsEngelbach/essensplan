<?php

declare(strict_types=1);

namespace Essensplan\Repository;

use Essensplan\Clock;
use Essensplan\Db;

/** One row per logged-in device (D19). */
final class SessionRepository
{
    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /** @param array<string, mixed> $row */
    public function insert(array $row): void
    {
        $this->db->insert('sessions', $row);
    }

    /**
     * Pre-auth lookup by the cookie's hash.
     *
     * @return array<string, mixed>|null
     */
    public function findLive(string $tokenHash): ?array
    {
        return $this->db->one('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', [$tokenHash, $this->clock->db()]);
    }

    public function touch(string $userId, string $id, string $expiresAt): void
    {
        $this->db->exec(
            'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ? AND user_id = ?',
            [$this->clock->db(), $expiresAt, $id, $userId],
        );
    }

    /** @return list<array<string, mixed>> */
    public function listLive(string $userId): array
    {
        return $this->db->all(
            'SELECT * FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC',
            [$userId, $this->clock->db()],
        );
    }

    public function delete(string $userId, string $id): bool
    {
        return $this->db->exec('DELETE FROM sessions WHERE id = ? AND user_id = ?', [$id, $userId]) > 0;
    }

    public function deleteAllExcept(string $userId, ?string $keepId): int
    {
        return $this->db->exec('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$userId, $keepId ?? '']);
    }

    public function purgeExpired(): int
    {
        return $this->db->exec('DELETE FROM sessions WHERE expires_at <= ?', [$this->clock->db()]);
    }
}
