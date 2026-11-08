<?php

declare(strict_types=1);

namespace Essensplan\Console;

use Essensplan\Ai\Ai;
use Essensplan\App;
use Essensplan\Config;
use Essensplan\Db;
use Psr\Container\ContainerInterface;

/**
 * What the host gives us (docs/DEPLOY.md, step 9): `bin/console check`, on all-inkl through
 * `deploy.sh --check` over SSH. That is the command-line PHP: the web PHP's limits
 * (max_execution_time, fastcgi_finish_request) can differ.
 * Each row is [ok (null = info only), label, value].
 */
final class ServerCheck
{
    private const EXTENSIONS = ['pdo_mysql', 'mbstring', 'intl', 'curl', 'gd', 'fileinfo', 'openssl', 'sodium', 'json'];

    /** @return list<array{0: ?bool, 1: string, 2: string}> */
    public static function run(Config $config, ContainerInterface $c): array
    {
        $rows = [];
        $rows[] = [version_compare(PHP_VERSION, '8.2.0', '>='), 'PHP', PHP_VERSION . ' (' . PHP_SAPI . ')'];
        foreach (self::EXTENSIONS as $ext) {
            $rows[] = [extension_loaded($ext), "ext-$ext", extension_loaded($ext) ? 'ok' : 'fehlt'];
        }
        $rows[] = [null, 'ext-exif', extension_loaded('exif') ? 'ok' : 'fehlt (Hochkant-Fotos werden nicht gedreht)'];
        // AI imports run up to a few minutes; the request has to be allowed that long.
        $before = (int) ini_get('max_execution_time');
        $raised = @set_time_limit(300);
        $after = (int) ini_get('max_execution_time');
        $rows[] = [$after === 0 || $after >= 120, 'max_execution_time', "{$before}s, nach set_time_limit(300): {$after}s" . ($raised ? '' : ' (set_time_limit gesperrt)')];
        $rows[] = [function_exists('fastcgi_finish_request') ? true : null, 'fastcgi_finish_request', function_exists('fastcgi_finish_request') ? 'ja: KI-Import läuft nach der Antwort weiter' : 'nein: KI-Import läuft in der Anfrage'];
        $rows[] = [self::bytes((string) ini_get('memory_limit')) >= 128 << 20 || ini_get('memory_limit') === '-1', 'memory_limit', (string) ini_get('memory_limit')];
        $upload = min(self::bytes((string) ini_get('upload_max_filesize')), self::bytes((string) ini_get('post_max_size')));
        $rows[] = [$upload >= 10 << 20, 'upload limit', ini_get('upload_max_filesize') . ' / post ' . ini_get('post_max_size') . ' (Fotos bis 15 MB)'];

        try {
            $db = $c->get(Db::class);
            $version = (string) $db->value('SELECT VERSION()');
            $maria = stripos($version, 'mariadb') !== false;
            $rows[] = [!$maria && version_compare($version, '8.0.0', '>='), 'MySQL', $version . ($maria ? ' (MariaDB wird nicht unterstützt, D21)' : '')];
            $done = $db->column("SELECT version FROM schema_migrations");
            $files = array_map(fn ($f) => basename($f, '.sql'), glob(App::root() . '/migrations/*.sql') ?: []);
            $pending = array_values(array_diff($files, $done));
            $rows[] = [$pending === [], 'Migrationen', $pending === [] ? count($done) . ' angewendet' : 'offen: ' . implode(', ', $pending)];
        } catch (\Throwable $e) {
            $rows[] = [false, 'Datenbank', self::short($e->getMessage())];
        }

        foreach (['storage', 'storage/media'] as $dir) {
            $path = App::root() . '/' . $dir;
            @mkdir($path, 0775, true);
            $rows[] = [is_dir($path) && is_writable($path), "$dir/ beschreibbar", is_writable($path) ? 'ja' : 'nein'];
        }
        $rows[] = [is_file(App::root() . '/public/app/index.html'), 'SPA gebaut', is_file(App::root() . '/public/app/index.html') ? 'public/app/index.html' : 'fehlt'];

        $prod = $config->get('APP_ENV', 'production') === 'production';
        $rows[] = [null, 'APP_ENV', $config->get('APP_ENV', 'production')];
        $rows[] = [strlen($config->get('APP_SECRET')) >= 32, 'APP_SECRET', $config->get('APP_SECRET') === '' ? 'fehlt' : strlen($config->get('APP_SECRET')) . ' Zeichen'];
        $rows[] = [!$prod || $config->secureCookies(), 'APP_URL', $config->appUrl()];
        $rows[] = [!$prod || $config->get('MAIL_DRIVER', 'log') === 'smtp', 'MAIL_DRIVER', $config->get('MAIL_DRIVER', 'log') . ($config->get('MAIL_HOST') !== '' ? ' via ' . $config->get('MAIL_HOST') . ':' . $config->get('MAIL_PORT') : '')];
        $len = strlen($config->get('CRON_TOKEN'));
        $rows[] = [$len === 0 ? null : $len >= 32, 'CRON_TOKEN', $len === 0 ? 'nicht gesetzt (aus)' : "$len Zeichen"];

        $ai = $c->get(Ai::class);
        $rows[] = [$ai->enabled() ? true : null, 'KI-Import', $ai->enabled() ? $ai->describe() : 'aus (' . $ai->describe() . ')'];
        $rows[] = [null, 'KI erreichbar', self::reachable($ai->endpoint())];
        return $rows;
    }

    private static function reachable(string $url): string
    {
        if ($url === '') {
            return '–';
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, \Essensplan\Ai\Tls::curl() + [CURLOPT_NOBODY => true, CURLOPT_TIMEOUT => 8, CURLOPT_RETURNTRANSFER => true]);
        $ok = curl_exec($ch) !== false;
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        return $ok ? parse_url($url, PHP_URL_HOST) . " antwortet (HTTP $code)" : 'nein: ' . $err;
    }

    private static function bytes(string $v): int
    {
        $v = trim($v);
        $n = (int) $v;
        return match (strtolower(substr($v, -1))) {
            'g' => $n << 30,
            'm' => $n << 20,
            'k' => $n << 10,
            default => $n,
        };
    }

    private static function short(string $s): string
    {
        return mb_strimwidth(preg_replace('/\s+/', ' ', $s) ?? $s, 0, 160, '…');
    }
}
