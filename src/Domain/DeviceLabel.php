<?php

declare(strict_types=1);

namespace Essensplan\Domain;

/** "iPhone · Safari" from a User-Agent, same rules as deviceLabel() in frontend/src/lib/auth.ts. */
final class DeviceLabel
{
    public static function fromUserAgent(string $ua): string
    {
        $os = match (true) {
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS X') => 'Mac', // iPadOS sends a Mac UA; the server can't tell (no touch info)
            str_contains($ua, 'Linux') => 'Linux',
            default => 'Gerät',
        };
        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'Browser',
        };
        return "$os · $browser";
    }
}
