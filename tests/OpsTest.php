<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** The operator door for hosts without SSH (deploy.sh) and the hosting cron. */
final class OpsTest extends TestCase
{
    private const OPS = 'ops-token-that-is-long-enough-0123456789';
    private const CRON = 'cron-token-that-is-long-enough-012345678';

    private function ops(string $action, ?array $body = null, string $token = self::OPS): array
    {
        return $this->call('POST', "/ops/$action", $body, null, $token === '' ? [] : ['X-Ops-Token' => $token]);
    }

    public function testOffWithoutATokenAndQuietOnAWrongOne(): void
    {
        $this->assertSame(404, $this->ops('check')['status']);
        $this->assertSame(404, $this->call('GET', '/cron?token=' . self::CRON)['status']);

        $this->boot(['OPS_TOKEN' => self::OPS, 'CRON_TOKEN' => 'kurz']);
        $this->assertSame(404, $this->call('GET', '/cron?token=kurz')['status'], 'short tokens switch the door off');
        for ($i = 0; $i < 9; $i++) { // + the cron miss above = 10
            $this->assertSame(404, $this->ops('check', null, 'falsch')['status']);
        }
        $this->assertSame(429, $this->ops('check')['status'], 'ten misses lock the IP out, even with the right token');
        $this->ip = '198.51.100.9';
        $this->assertSame(200, $this->ops('check')['status']);
    }

    public function testMigrateCheckConsoleAndCron(): void
    {
        $this->boot(['OPS_TOKEN' => self::OPS, 'CRON_TOKEN' => self::CRON]);
        $r = $this->ops('migrate');
        $this->assertSame([200, "Nothing to migrate.\n"], [$r['status'], $r['body']]);

        $r = $this->ops('check');
        $this->assertSame(200, $r['status']);
        $this->assertMatchesRegularExpression('/^✓ PHP\s+8\.\d/m', $r['body']);
        $this->assertMatchesRegularExpression('/^✓ Migrationen\s+\d+ angewendet/mu', $r['body']);

        $r = $this->ops('console', ['command' => 'user:create', 'args' => ['--email=neu@familie.de', '--name=Neu', '--no-invite']]);
        $this->assertSame(200, $r['status'], $r['body']);
        $this->assertStringContainsString('Created neu@familie.de', $r['body']);
        $this->assertStringContainsString('neu@familie.de', $this->ops('console', ['command' => 'user:list'])['body']);

        foreach (['user:delete', 'api-key:create', 'openapi:dump'] as $cmd) {
            $r = $this->ops('console', ['command' => $cmd, 'args' => ['--email=neu@familie.de', '--yes']]);
            $this->assertSame(400, $r['status'], $cmd);
        }
        $this->assertSame(1, (int) $this->db->value("SELECT COUNT(*) FROM users WHERE email = 'neu@familie.de'"));
        $r = $this->ops('console', ['command' => 'user:invite', 'args' => []]);
        $this->assertSame([400, "FEHLER: --email= is required\n"], [$r['status'], $r['body']]);

        $r = $this->call('GET', '/cron?token=' . self::CRON);
        $this->assertSame(200, $r['status']);
        $this->assertStringContainsString('import job(s) run', $r['body']);
        $this->assertMatchesRegularExpression('/^sessions\s+\d+$/m', $r['body']);
    }
}
