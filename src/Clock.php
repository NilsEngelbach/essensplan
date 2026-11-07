<?php

declare(strict_types=1);

namespace Essensplan;

use DateTimeImmutable;
use DateTimeZone;

/**
 * The one source of "now". Timestamps are UTC; calendar days are Europe/Berlin.
 * Tests swap in a fixed time with set().
 */
final class Clock
{
    public const TZ = 'Europe/Berlin';

    private ?DateTimeImmutable $fixed = null;

    public function now(): DateTimeImmutable
    {
        return $this->fixed ?? new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }

    public function set(string|DateTimeImmutable|null $at): void
    {
        $this->fixed = $at === null ? null : (is_string($at) ? new DateTimeImmutable($at) : $at)->setTimezone(new DateTimeZone('UTC'));
    }

    /** Today's calendar day in Berlin, YYYY-MM-DD. */
    public function today(): string
    {
        return $this->now()->setTimezone(new DateTimeZone(self::TZ))->format('Y-m-d');
    }

    /** For DATETIME columns (UTC). */
    public function db(string $modify = ''): string
    {
        $t = $this->now();
        return ($modify === '' ? $t : $t->modify($modify))->format('Y-m-d H:i:s');
    }

    /** For DATETIME(6) columns, where the exact value is compared later (undo safety). */
    public function dbMicro(): string
    {
        return $this->now()->format('Y-m-d H:i:s.u');
    }
}
