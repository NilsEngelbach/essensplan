<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Http\ApiError;

/** Fixed-window counters in the `rate_limits` table. */
final class RateLimiter
{
    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /** Counts one hit; throws rate_limited once the window is full. */
    public function hit(string $bucket, int $max, int $windowSeconds): void
    {
        $hits = $this->add($bucket, $windowSeconds);
        if ($hits > $max) {
            throw ApiError::rateLimited($this->secondsLeft($bucket));
        }
    }

    /** Throws if the bucket is already full, without counting (e.g. login lockout). */
    public function check(string $bucket, int $max): void
    {
        $row = $this->live($bucket);
        if ($row !== null && (int) $row['hits'] >= $max) {
            throw ApiError::rateLimited($this->secondsLeft($bucket));
        }
    }

    /** Adds a hit and returns the count in the current window. */
    public function add(string $bucket, int $windowSeconds): int
    {
        $bucket = substr($bucket, 0, 190);
        $now = $this->clock->db();
        // Restart the window if it is over, else count up. One statement, so concurrent hits don't race.
        $this->db->exec(
            'INSERT INTO rate_limits (bucket, hits, window_start, window_seconds) VALUES (?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE
               hits = IF(TIMESTAMPADD(SECOND, window_seconds, window_start) <= VALUES(window_start), 1, hits + 1),
               window_start = IF(TIMESTAMPADD(SECOND, window_seconds, window_start) <= VALUES(window_start), VALUES(window_start), window_start),
               window_seconds = VALUES(window_seconds)',
            [$bucket, $now, $windowSeconds],
        );
        return (int) $this->db->value('SELECT hits FROM rate_limits WHERE bucket = ?', [$bucket]);
    }

    public function clear(string $bucket): void
    {
        $this->db->exec('DELETE FROM rate_limits WHERE bucket = ?', [substr($bucket, 0, 190)]);
    }

    /** @return array<string, mixed>|null */
    private function live(string $bucket): ?array
    {
        return $this->db->one(
            'SELECT * FROM rate_limits WHERE bucket = ? AND TIMESTAMPADD(SECOND, window_seconds, window_start) > ?',
            [substr($bucket, 0, 190), $this->clock->db()],
        );
    }

    private function secondsLeft(string $bucket): int
    {
        $row = $this->live($bucket);
        if ($row === null) {
            return 1;
        }
        $end = strtotime($row['window_start'] . ' UTC') + (int) $row['window_seconds'];
        return max(1, $end - $this->clock->now()->getTimestamp());
    }

    public function purge(): int
    {
        return $this->db->exec('DELETE FROM rate_limits WHERE TIMESTAMPADD(SECOND, window_seconds, window_start) <= ?', [$this->clock->db()]);
    }
}
