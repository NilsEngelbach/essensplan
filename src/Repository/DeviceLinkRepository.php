<?php

declare(strict_types=1);

namespace Essensplan\Repository;

use Essensplan\Clock;
use Essensplan\Db;

/** Codes and QR tokens that let a new family device log in (D19). */
final class DeviceLinkRepository
{
    private const OPEN = 'used_at IS NULL AND spent_at IS NULL AND expires_at > ?';

    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /** @param array<string, mixed> $row */
    public function insert(array $row): void
    {
        $this->db->insert('device_links', $row);
    }

    /** One open link per user: a new one replaces the old. */
    public function deleteOpen(string $userId): void
    {
        $this->db->exec('DELETE FROM device_links WHERE user_id = ? AND used_at IS NULL', [$userId]);
    }

    /** @return array<string, mixed>|null */
    public function find(string $userId, string $id): ?array
    {
        return $this->db->one('SELECT * FROM device_links WHERE id = ? AND user_id = ?', [$id, $userId]);
    }

    public function delete(string $userId, string $id): bool
    {
        return $this->db->exec('DELETE FROM device_links WHERE id = ? AND user_id = ?', [$id, $userId]) > 0;
    }

    /**
     * Pre-auth lookup by the code's or token's hash (the new device has no session yet).
     *
     * @return array<string, mixed>|null
     */
    public function findOpenBy(string $column, string $hash): ?array
    {
        $column = $column === 'code' ? 'code_hash' : 'token_hash';
        return $this->db->one("SELECT * FROM device_links WHERE $column = ? AND " . self::OPEN . ' FOR UPDATE', [$hash, $this->clock->db()]);
    }

    /** Claims the link; false if someone else was faster. */
    public function markUsed(string $id, string $sessionId, string $label): bool
    {
        return $this->db->exec(
            'UPDATE device_links SET used_at = ?, used_by_session = ?, used_by_label = ? WHERE id = ? AND ' . self::OPEN,
            [$this->clock->db(), $sessionId, $label, $id, $this->clock->db()],
        ) > 0;
    }

    /**
     * A wrong code can't be tied to one link, so it counts against all open
     * ones. Returns how many links it spent (reached $max misses).
     */
    public function countMiss(int $max): int
    {
        $now = $this->clock->db();
        $this->db->exec('UPDATE device_links SET attempts = attempts + 1 WHERE ' . self::OPEN, [$now]);
        return $this->db->exec('UPDATE device_links SET spent_at = ? WHERE attempts >= ? AND ' . self::OPEN, [$now, $max, $now]);
    }

    public function purgeOld(): int
    {
        return $this->db->exec('DELETE FROM device_links WHERE expires_at <= ?', [$this->clock->db('-1 day')]);
    }
}
