<?php

declare(strict_types=1);

namespace Essensplan\Console;

use Essensplan\Ai\ImportJobs;
use Essensplan\App;
use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Http\OpenApi;
use Essensplan\Http\Principal;
use Essensplan\Repository\UserRepository;
use Essensplan\Service\ApiKeyService;
use Essensplan\Service\FamilyAdmin;
use Essensplan\Service\MediaStore;
use Psr\Container\ContainerInterface;

/**
 * The operator commands behind bin/console (on the server: deploy.sh --console … over SSH).
 * GET /cron?token= runs the `cron` command for the hosting's cron.
 */
final class Console
{
    public function __construct(private readonly ContainerInterface $c, private readonly Config $config)
    {
    }

    /** "--a=1 --b x" → ['a' => '1', 'b' => true, '_' => ['x']] */
    public static function parse(array $args): array
    {
        $opts = [];
        foreach ($args as $arg) {
            if (preg_match('/^--([a-z-]+)(?:=(.*))?$/s', (string) $arg, $m)) {
                $opts[$m[1]] = $m[2] ?? true;
            } else {
                $opts['_'][] = (string) $arg;
            }
        }
        return $opts;
    }

    /**
     * @param array<string, mixed> $opts
     * @param callable(string): void $out
     * @throws ConsoleError for usage errors; ApiError and others pass through
     */
    public function run(string $command, array $opts, callable $out): void
    {
        $admin = fn (): FamilyAdmin => $this->c->get(FamilyAdmin::class);
        $need = fn (string $o): string => is_string($opts[$o] ?? null) && $opts[$o] !== '' ? $opts[$o] : throw new ConsoleError("--$o= is required");

        switch ($command) {
            case 'migrate':
                $this->migrate($out);
                break;

            case 'check':
                foreach (ServerCheck::run($this->config, $this->c) as [$ok, $label, $value]) {
                    $out(sprintf('%s %-26s %s', $ok === null ? '·' : ($ok ? '✓' : '✗'), $label, $value));
                }
                break;

            case 'user:create':
                // A new family (D20). Without --password it gets an invite mail with a link to set one.
                $user = $admin()->create(
                    $need('email'),
                    is_string($opts['name'] ?? null) ? $opts['name'] : 'Familie',
                    is_string($opts['password'] ?? null) ? $opts['password'] : null,
                    !isset($opts['no-invite']),
                );
                $out("Created {$user['email']} ($user[id])" . (isset($opts['password']) ? '' : (isset($opts['no-invite']) ? ', no invite sent' : ', invite mail sent')));
                break;

            case 'user:invite':
                $admin()->invite($need('email'));
                $out('Invite mail sent.');
                break;

            case 'user:list':
                // sprintf pads bytes; names have umlauts.
                $pad = fn (string $s, int $w) => $s . str_repeat(' ', max(0, $w - mb_strlen($s)));
                $out(sprintf('%-30s %-16s %-10s %-10s %7s %7s %4s  %s', 'E-Mail', 'Name', 'Seit', 'Zuletzt', 'Geräte', 'Rezepte', 'Keys', 'Status'));
                foreach ($admin()->list() as $u) {
                    $out(sprintf(
                        '%-30s %s %-10s %-10s %7d %7d %4d  %s',
                        $u['email'], $pad(mb_strimwidth($u['name'], 0, 16), 16), substr($u['created_at'], 0, 10), substr((string) $u['last_seen_at'], 0, 10) ?: '–',
                        $u['devices'], $u['recipes'], $u['api_keys'],
                        $u['disabled_at'] !== null ? 'gesperrt' : ($u['email_verified_at'] === null && $u['last_seen_at'] === null ? 'eingeladen' : 'aktiv'),
                    ));
                }
                break;

            case 'user:disable':
            case 'user:enable':
                $email = $need('email');
                $command === 'user:disable' ? $admin()->disable($email) : $admin()->enable($email);
                $out($command === 'user:disable' ? "$email is locked." : "$email is active again.");
                break;

            case 'user:delete':
                $email = $need('email');
                if (($opts['yes'] ?? false) !== true) {
                    throw new ConsoleError("This deletes $email and all its recipes, plans, lists and keys. Add --yes to confirm.");
                }
                foreach ($admin()->delete($email) as $table => $count) {
                    $out(sprintf('%-22s %d', $table, $count));
                }
                break;

            case 'api-key:create':
                $user = $this->c->get(UserRepository::class)->findByEmail($need('email')) ?? throw new ConsoleError('No such user.');
                $scopes = array_filter(explode(',', is_string($opts['scopes'] ?? null) ? $opts['scopes'] : 'recipes:read,mealplan:read,shopping:read'));
                $session = ['id' => 'console', 'user_id' => $user['id'], 'csrf_token' => ''];
                $r = $this->c->get(ApiKeyService::class)->create(Principal::forSession($session), [
                    'name' => $opts['name'] ?? 'Konsole',
                    'scopes' => array_values($scopes),
                    'client' => $opts['client'] ?? 'rest',
                ]);
                $out($r['secret']);
                break;

            case 'purge':
                $this->purge($out);
                break;

            case 'jobs:run':
                $n = $this->c->get(ImportJobs::class)->runPending((int) ($opts['limit'] ?? 5));
                $out("$n import job(s) run.");
                break;

            case 'cron':
                // What the hosting's cron calls (GET /cron?token=…): leftover import jobs, then the cleanup.
                $this->run('jobs:run', [], $out);
                $this->purge($out);
                break;

            case 'media:move':
                $this->moveMedia($out);
                break;

            case 'openapi:dump':
                $file = $opts['_'][0] ?? 'php://stdout';
                file_put_contents($file, json_encode(OpenApi::document($this->config), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
                break;

            default:
                $out(self::help());
        }
    }

    public static function help(): string
    {
        return <<<TXT
        Essensplan console

          migrate                                   apply migrations/*.sql (creates the database if needed)
          check                                     PHP, extensions, limits, database, writable folders
          user:create --email= [--name=] [--password=] [--no-invite]
                                                    add a family; without --password an invite mail is sent
          user:invite --email=                      send the invite mail again (link valid 7 days)
          user:list                                 all families with devices, recipes, keys
          user:disable --email= / user:enable --email=
                                                    lock a family out (sessions, keys, links) or let it back in
          user:delete --email= --yes                delete a family and everything it owns
          api-key:create --email= [--scopes=a,b] [--name=] [--client=]
          purge                                     remove old soft-deleted rows, sessions, tokens, activity, unused photos
          jobs:run [--limit=5]                      run AI import jobs nobody picked up
          cron                                      jobs:run + purge (what /cron?token= runs)
          media:move                                move photos from public/media (before 2026-11-08) to MEDIA_DIR
          openapi:dump [file]                       write the OpenAPI document
        TXT;
    }

    private function migrate(callable $out): void
    {
        $name = $this->config->get('DB_NAME', 'essensplan');
        if (!preg_match('/^\w+$/', $name)) {
            throw new ConsoleError("Invalid DB_NAME $name");
        }
        try {
            $db = Db::connect($this->config);
        } catch (\PDOException $e) {
            // 1049 = unknown database: create it on a fresh server (Local, CI). Hosted databases
            // (all-inkl) exist already and the user may not create databases.
            if (!str_contains($e->getMessage(), '1049')) {
                throw $e;
            }
            Db::connect($this->config, '')->pdo()->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $db = Db::connect($this->config);
        }
        $applied = (new Migrator($db, App::root() . '/migrations'))->migrate($out);
        $out($applied ? 'Done.' : 'Nothing to migrate.');
    }

    private function purge(callable $out): void
    {
        $db = $this->c->get(Db::class);
        $clock = $this->c->get(Clock::class);
        $n = [
            'entries' => $db->exec('DELETE FROM meal_plan_entries WHERE deleted_at < ?', [$clock->db('-7 days')]),
            'manual items' => $db->exec('DELETE FROM shopping_manual_items WHERE deleted_at < ? OR bought_at < ?', [$clock->db('-7 days'), $clock->db('-180 days')]),
        ];
        // Recipes go after 30 days; their entries were detached on delete and only lose the link back.
        $old = $db->column('SELECT id FROM recipes WHERE deleted_at < ?', [$clock->db('-30 days')]);
        if ($old) {
            $db->exec('UPDATE meal_plan_entries SET detached_recipe_id = NULL WHERE detached_recipe_id IN (' . Db::marks($old) . ')', $old);
            $n['recipes'] = $db->exec('DELETE FROM recipes WHERE id IN (' . Db::marks($old) . ')', $old);
        }
        $n['sessions'] = $db->exec('DELETE FROM sessions WHERE expires_at <= ?', [$clock->db()]);
        $n['device links'] = $db->exec('DELETE FROM device_links WHERE expires_at <= ?', [$clock->db('-1 day')]);
        $n['reset tokens'] = $db->exec('DELETE FROM password_resets WHERE expires_at <= ?', [$clock->db('-1 day')]);
        $n['rate limits'] = $db->exec('DELETE FROM rate_limits WHERE TIMESTAMPADD(SECOND, window_seconds, window_start) <= ?', [$clock->db()]);
        $n['activity'] = $db->exec('DELETE FROM agent_activity WHERE created_at < ?', [$clock->db('-90 days')]);
        // Import jobs keep their draft a day (the SPA reads it once); usage rows stay for the cost overview.
        $n['import jobs'] = $this->c->get(ImportJobs::class)->purge();
        // Photos no recipe uses any more (also those of the recipes purged above), after a day.
        $n['photo files'] = $this->c->get(MediaStore::class)->collectGarbage();
        foreach ($n as $what => $count) {
            $out(sprintf('%-14s %d', $what, $count));
        }
    }

    /** Photos used to live in public/media (served by the web server to anyone with the link). */
    private function moveMedia(callable $out): void
    {
        $from = App::root() . '/public/media';
        $to = $this->config->get('MEDIA_DIR', App::root() . '/storage/media');
        if (!is_dir($from)) {
            $out('Nothing to move: public/media does not exist.');
            return;
        }
        $moved = 0;
        foreach (glob($from . '/*', GLOB_ONLYDIR) ?: [] as $dir) {
            $user = basename($dir);
            if (!preg_match('/^[0-9a-f-]{36}$/', $user)) {
                continue;
            }
            if (!is_dir("$to/$user") && !mkdir("$to/$user", 0775, true) && !is_dir("$to/$user")) {
                throw new \RuntimeException("Cannot create $to/$user");
            }
            foreach (glob($dir . '/*.jpg') ?: [] as $file) {
                $target = "$to/$user/" . basename($file);
                if (!is_file($target) && !rename($file, $target)) {
                    throw new \RuntimeException("Cannot move $file");
                }
                $moved++;
            }
            @rmdir($dir);
        }
        $left = !@rmdir($from);
        $out("$moved photo file(s) moved to $to." . ($left ? ' public/media still holds other files; look at them and remove it by hand.' : ''));
    }
}
