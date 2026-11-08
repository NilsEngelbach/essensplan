<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\Http\ApiError;

/**
 * Fetches a recipe page or photo for the import, SSRF-safe (MIGRATION_PLAN §4.3):
 * http/https on the default ports only, no user:pass@, every address the host
 * resolves to must be public, the connection is pinned to the checked address
 * (no DNS rebinding), redirects are followed by hand and checked again, and
 * the body is capped.
 */
class PageFetcher
{
    private const MAX_REDIRECTS = 4;

    /** @param (callable(string): list<string>)|null $resolve host → IPs (tests) */
    public function __construct(private readonly string $userAgent = 'Mozilla/5.0 (compatible; Essensplan-Rezeptimport/1.0)', private $resolve = null)
    {
    }

    /**
     * @param list<string> $types accepted Content-Type prefixes, e.g. ['text/html']
     * @return array{url: string, type: string, body: string}
     */
    public function fetch(string $url, int $maxBytes, array $types, int $timeout = 20): array
    {
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            [$host, $port, $ip] = $this->check($url);
            $body = '';
            $tooBig = false;
            $headers = [];
            $ch = curl_init($url);
            curl_setopt_array($ch, Tls::curl() + [
                CURLOPT_RESOLVE => ["$host:$port:" . (str_contains($ip, ':') ? "[$ip]" : $ip)],
                CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_ENCODING => '',
                CURLOPT_HTTPHEADER => [
                    'User-Agent: ' . $this->userAgent,
                    'Accept: ' . (in_array('text/html', $types, true) ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' : 'image/avif,image/webp,image/*;q=0.9'),
                    'Accept-Language: de-DE,de;q=0.9,en;q=0.6',
                ],
                CURLOPT_HEADERFUNCTION => function ($ch, string $line) use (&$headers) {
                    if (str_contains($line, ':')) {
                        [$k, $v] = explode(':', $line, 2);
                        $headers[strtolower(trim($k))] = trim($v);
                    }
                    return strlen($line);
                },
                CURLOPT_WRITEFUNCTION => function ($ch, string $chunk) use (&$body, &$tooBig, $maxBytes) {
                    if (strlen($body) + strlen($chunk) > $maxBytes) {
                        $tooBig = true;
                        return 0; // aborts the transfer
                    }
                    $body .= $chunk;
                    return strlen($chunk);
                },
            ]);
            $ok = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($tooBig) {
                throw new ApiError(422, 'fetch_failed', 'Die Seite ist zu groß zum Lesen.');
            }
            if ($ok === false) {
                error_log("[essensplan] fetch $url: $error");
                throw new ApiError(422, 'fetch_failed', 'Die Seite ließ sich nicht laden. Prüf den Link und versuch es noch einmal.');
            }
            if ($status >= 300 && $status < 400 && isset($headers['location'])) {
                $url = self::absolute($headers['location'], $url);
                continue;
            }
            if ($status === 403 || $status === 429) {
                throw new ApiError(422, 'fetch_failed', 'Die Seite lässt Essensplan nicht hinein. Mach einen Screenshot vom Rezept und lies das Foto ein.');
            }
            if ($status >= 400) {
                throw new ApiError(422, 'fetch_failed', "Die Seite ließ sich nicht laden (HTTP $status). Prüf den Link.");
            }
            $type = strtolower(trim(explode(';', $headers['content-type'] ?? '')[0]));
            $accepted = $type === '' || array_filter($types, fn ($t) => str_starts_with($type, $t)) !== [];
            if (!$accepted) {
                throw new ApiError(422, 'fetch_failed', 'Unter diesem Link liegt keine Webseite, sondern eine Datei.');
            }
            return ['url' => $url, 'type' => $headers['content-type'] ?? '', 'body' => $body];
        }
        throw new ApiError(422, 'fetch_failed', 'Der Link leitet zu oft weiter.');
    }

    /**
     * @return array{0: string, 1: int, 2: string} host, port, the public IP to connect to
     * @throws ApiError url_blocked
     */
    public function check(string $url): array
    {
        $blocked = new ApiError(422, 'url_blocked', 'Diesen Link kann Essensplan nicht abrufen. Nimm die Adresse der Rezeptseite (https://…).');
        $p = parse_url($url);
        $scheme = strtolower((string) ($p['scheme'] ?? ''));
        $host = strtolower(rtrim((string) ($p['host'] ?? ''), '.'));
        if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($p['user']) || isset($p['pass'])) {
            throw $blocked;
        }
        $port = (int) ($p['port'] ?? ($scheme === 'https' ? 443 : 80));
        if ($port !== ($scheme === 'https' ? 443 : 80)) {
            throw $blocked;
        }
        $host = trim($host, '[]');
        $ips = filter_var($host, FILTER_VALIDATE_IP) ? [$host] : $this->resolve($host);
        if ($ips === []) {
            throw new ApiError(422, 'fetch_failed', 'Diese Adresse gibt es nicht. Prüf den Link.');
        }
        foreach ($ips as $ip) {
            if (!self::isPublic($ip)) {
                throw $blocked;
            }
        }
        return [$host, $port, $ips[0]];
    }

    public static function isPublic(string $ip): bool
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
        $bin = (string) inet_pton($ip);
        if (strlen($bin) === 16) {
            // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/96) carry an IPv4 address: check that one.
            if (str_starts_with($bin, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($bin, "\x00\x64\xff\x9b" . str_repeat("\0", 8))) {
                return self::isPublic((string) inet_ntop(substr($bin, 12)));
            }
            return true;
        }
        $n = (int) sprintf('%u', ip2long($ip));
        foreach ([['100.64.0.0', 10], ['192.0.0.0', 24], ['198.18.0.0', 15]] as [$net, $bits]) {
            $mask = -1 << (32 - $bits) & 0xFFFFFFFF;
            if (($n & $mask) === ((int) sprintf('%u', ip2long($net)) & $mask)) {
                return false;
            }
        }
        return true;
    }

    /** @return list<string> */
    private function resolve(string $host): array
    {
        if ($this->resolve !== null) {
            return ($this->resolve)($host);
        }
        $ips = [];
        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) {
            $ips[] = $r['ip'] ?? $r['ipv6'] ?? null;
        }
        $ips = array_values(array_filter($ips));
        return $ips !== [] ? $ips : (gethostbynamel($host) ?: []);
    }

    /** Resolves a (possibly relative) link against the page it was on. */
    public static function absolute(string $link, string $base): string
    {
        $link = trim(html_entity_decode($link, ENT_QUOTES | ENT_HTML5));
        if ($link === '' || preg_match('~^[a-z][a-z0-9+.-]*:~i', $link)) {
            return $link;
        }
        $b = parse_url($base);
        $origin = ($b['scheme'] ?? 'https') . '://' . ($b['host'] ?? '') . (isset($b['port']) ? ':' . $b['port'] : '');
        if (str_starts_with($link, '//')) {
            return ($b['scheme'] ?? 'https') . ':' . $link;
        }
        if (str_starts_with($link, '/')) {
            return $origin . $link;
        }
        $dir = preg_replace('~/[^/]*$~', '/', $b['path'] ?? '/') ?: '/';
        return $origin . $dir . $link;
    }
}
