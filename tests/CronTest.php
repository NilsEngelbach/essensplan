<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** The hosting's URL cron (GET /cron?token=). */
final class CronTest extends TestCase
{
    private const CRON = 'cron-token-that-is-long-enough-012345678';

    public function testOffWithoutATokenAndQuietOnAWrongOne(): void
    {
        $this->assertSame(404, $this->call('GET', '/cron?token=' . self::CRON)['status'], 'no CRON_TOKEN: off');

        $this->boot(['CRON_TOKEN' => 'kurz']);
        $this->assertSame(404, $this->call('GET', '/cron?token=kurz')['status'], 'short tokens switch it off');

        $this->boot(['CRON_TOKEN' => self::CRON]);
        for ($i = 0; $i < 10; $i++) { // boot() emptied the rate limits, so these are the first ten
            $this->assertSame(404, $this->call('GET', '/cron?token=falsch')['status']);
        }
        $this->assertSame(429, $this->call('GET', '/cron?token=' . self::CRON)['status'], 'ten misses lock the IP out, even with the right token');
        $this->ip = '198.51.100.9';
        $this->assertSame(200, $this->call('GET', '/cron?token=' . self::CRON)['status']);
    }

    public function testRunsJobsAndPurge(): void
    {
        $this->boot(['CRON_TOKEN' => self::CRON]);
        $r = $this->call('GET', '/cron?token=' . self::CRON);
        $this->assertSame(200, $r['status']);
        $this->assertStringContainsString('import job(s) run', $r['body']);
        $this->assertMatchesRegularExpression('/^sessions\s+\d+$/m', $r['body']);
        $this->assertContains($this->call('POST', '/ops/migrate')['status'], [404, 405], 'the old operator door is gone');
    }
}
