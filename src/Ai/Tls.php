<?php

declare(strict_types=1);

namespace Essensplan\Ai;

/**
 * Outgoing HTTPS on Windows PHP (Local by Flywheel): it ships without a CA
 * bundle, and Local's php.ini points curl.cainfo at a WordPress file this site
 * doesn't have. Then curl should use the Windows certificate store. On Linux
 * hosts (all-inkl) the system bundle works and nothing changes.
 */
final class Tls
{
    /** @return array<int, int> extra curl options */
    public static function curl(): array
    {
        $ca = (string) ini_get('curl.cainfo');
        return PHP_OS_FAMILY === 'Windows' && ($ca === '' || !is_file($ca)) ? [CURLOPT_SSL_OPTIONS => CURLSSLOPT_NATIVE_CA] : [];
    }
}
