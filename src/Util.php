<?php

declare(strict_types=1);

namespace Essensplan;

use DateTimeImmutable;
use DateTimeZone;

/** Small pure helpers: ids, secrets, dates. Dates mirror frontend/src/lib/format.ts. */
final class Util
{
    public const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    public static function base62(int $length): string
    {
        $alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        $out = '';
        while (strlen($out) < $length) {
            foreach (str_split(random_bytes($length)) as $c) {
                $n = ord($c);
                if ($n < 248) { // 248 = 4 × 62: no modulo bias
                    $out .= $alphabet[$n % 62];
                }
            }
        }
        return substr($out, 0, $length);
    }

    /** DB DATETIME (UTC) → ISO 8601 in Berlin time, or null. */
    public static function iso(?string $utc): ?string
    {
        if ($utc === null || $utc === '') {
            return null;
        }
        $t = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
        return $t->setTimezone(new DateTimeZone(Clock::TZ))->format(DATE_ATOM);
    }

    public static function isDate(mixed $s): bool
    {
        if (!is_string($s) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            return false;
        }
        [$y, $m, $d] = array_map('intval', explode('-', $s));
        return checkdate($m, $d, $y);
    }

    public static function addDays(string $date, int $days): string
    {
        return (new DateTimeImmutable($date . ' 12:00:00', new DateTimeZone('UTC')))->modify(sprintf('%+d days', $days))->format('Y-m-d');
    }

    public static function daysBetween(string $from, string $to): int
    {
        $a = new DateTimeImmutable($from . ' 12:00:00', new DateTimeZone('UTC'));
        $b = new DateTimeImmutable($to . ' 12:00:00', new DateTimeZone('UTC'));
        return (int) round(($b->getTimestamp() - $a->getTimestamp()) / 86400);
    }

    /** 0 = Sonntag … 6 = Samstag, like getUTCDay(). */
    public static function weekday(string $date): int
    {
        return (int) (new DateTimeImmutable($date . ' 12:00:00', new DateTimeZone('UTC')))->format('w');
    }

    public static function weekStartOf(string $date, int $weekStart): string
    {
        return self::addDays($date, -((self::weekday($date) - $weekStart + 7) % 7));
    }

    /**
     * The week home opens on: the running week, or the next one from the
     * planning day on. A planning day equal to the week start never flips.
     */
    public static function defaultWeekStart(string $today, int $weekStart, int $planningWeekday): string
    {
        $start = self::weekStartOf($today, $weekStart);
        $planOffset = ($planningWeekday - $weekStart + 7) % 7;
        $todayOffset = (self::weekday($today) - $weekStart + 7) % 7;
        return $planOffset > 0 && $todayOffset >= $planOffset ? self::addDays($start, 7) : $start;
    }

    /** "Do 12." */
    public static function dayShort(string $date): string
    {
        return self::WEEKDAY[self::weekday($date)] . ' ' . (int) substr($date, 8, 2) . '.';
    }

    public static function json(mixed $v): string
    {
        return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    }

    /** @return array<mixed> */
    public static function decode(?string $json): array
    {
        if ($json === null || $json === '') {
            return [];
        }
        $v = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        return is_array($v) ? $v : [];
    }
}
