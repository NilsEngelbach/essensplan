<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Console\Migrator;
use Essensplan\Http\ApiError;
use Essensplan\Service\FamilyAdmin;
use Essensplan\Service\Mailer;

/** Several families on one install (D20): CLI onboarding, lock, delete, nothing leaks across. */
final class FamiliesTest extends TestCase
{
    private FamilyAdmin $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->c->get(FamilyAdmin::class);
    }

    /** @return string the token from the newest mail to that address */
    private function mailedToken(string $to): string
    {
        $mails = array_values(array_filter($this->c->get(Mailer::class)->sent, fn ($m) => $m['to'] === $to));
        $this->assertNotEmpty($mails, "no mail to $to");
        $this->assertTrue((bool) preg_match('/token=([0-9a-f]{64})/', end($mails)['body'], $m));
        return $m[1];
    }

    public function testInviteOnboarding(): void
    {
        $user = $this->admin->create('Mueller@Example.org', 'Familie Müller');
        $this->assertSame('mueller@example.org', $user['email']);
        $mail = $this->c->get(Mailer::class)->sent[0];
        $this->assertSame(['mueller@example.org', 'Willkommen bei Essensplan'], [$mail['to'], $mail['subject']]);
        $this->assertStringContainsString('http://essen.test/passwort-zuruecksetzen?token=', $mail['body']);

        // Nobody can log in before the link is used: the stored password is random.
        $this->fails(401, 'invalid_credentials', 'POST', '/api/v1/auth/login', ['email' => 'mueller@example.org', 'password' => '']);

        $token = $this->mailedToken('mueller@example.org');
        $this->assertSame(['purpose' => 'invite'], $this->ok(200, 'POST', '/api/v1/auth/reset-password/check', ['token' => $token]));
        // Valid for 7 days, not 60 minutes.
        $this->clock->set('2026-11-18T09:00:00Z');
        $r = $this->ok(200, 'POST', '/api/v1/auth/reset-password', ['token' => $token, 'password' => 'unser-familien-passwort']);
        $this->assertSame(['invite', 'Familie Müller'], [$r['session']['via'], $r['account']['name']]);
        $this->assertNotNull($this->db->value('SELECT email_verified_at FROM users WHERE id = ?', [$user['id']]));
        $this->ok(200, 'POST', '/api/v1/auth/login', ['email' => 'mueller@example.org', 'password' => 'unser-familien-passwort']);

        $late = $this->admin->create('spaet@example.org', 'Spät');
        $this->clock->set('2026-11-25T09:00:01Z');
        $this->fails(400, 'reset_invalid', 'POST', '/api/v1/auth/reset-password/check', ['token' => $this->mailedToken('spaet@example.org')]);
        // A new invite replaces the old link.
        $this->admin->invite('spaet@example.org');
        $this->ok(200, 'POST', '/api/v1/auth/reset-password/check', ['token' => $this->mailedToken('spaet@example.org')]);
        unset($late);
    }

    public function testCreateRulesAndList(): void
    {
        $this->admin->create('a@example.org', 'A', self::PASSWORD);
        $this->assertCount(0, $this->c->get(Mailer::class)->sent, 'with a password, no invite');
        $this->login('a@example.org');
        $this->admin->create('b@example.org', 'B', null, false);
        $this->assertCount(0, $this->c->get(Mailer::class)->sent);

        foreach ([['a@example.org', null], ['kaputt', null], ['c@example.org', 'kurz']] as [$email, $pw]) {
            try {
                $this->admin->create($email, 'X', $pw);
                $this->fail("created $email");
            } catch (ApiError $e) {
                $this->assertContains($e->errorCode, ['email_taken', 'invalid_email', 'weak_password']);
            }
        }
        $list = $this->admin->list();
        $this->assertSame(['a@example.org', 'b@example.org'], array_column($list, 'email'));
        $this->assertSame([1, 0], array_map('intval', array_column($list, 'devices')));
    }

    public function testDisableLocksOneFamilyOut(): void
    {
        $this->user('a@example.org', 'A');
        $this->user('b@example.org', 'B');
        $a = $this->login('a@example.org');
        $b = $this->login('b@example.org');
        $key = $this->key($a, ['recipes:read']);
        $link = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $a);

        $this->admin->disable('a@example.org');
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/me', null, $a);
        $this->fails(401, 'invalid_key', 'GET', '/api/v1/recipes', null, $key);
        $this->fails(401, 'unauthenticated', 'POST', '/mcp', ['jsonrpc' => '2.0', 'id' => 1, 'method' => 'ping']);
        $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $link['code']]);
        $this->fails(403, 'account_disabled', 'POST', '/api/v1/auth/login', ['email' => 'a@example.org', 'password' => self::PASSWORD]);
        $this->fails(401, 'invalid_credentials', 'POST', '/api/v1/auth/login', ['email' => 'a@example.org', 'password' => 'falsch'], null);
        $this->ok(204, 'POST', '/api/v1/auth/forgot-password', ['email' => 'a@example.org']);
        $this->assertCount(0, $this->c->get(Mailer::class)->sent, 'no reset mail for a locked family');
        $this->ok(200, 'GET', '/api/v1/me', null, $b);

        // Unlocking brings back the existing devices and keys.
        $this->admin->enable('a@example.org');
        $this->ok(200, 'GET', '/api/v1/me', null, $a);
        $this->ok(200, 'GET', '/api/v1/recipes', null, $key);
    }

    public function testDeleteRemovesOneFamilyCompletely(): void
    {
        $this->user('a@example.org', 'A');
        $this->user('b@example.org', 'B');
        foreach (['a@example.org', 'b@example.org'] as $email) {
            $me = $this->login($email);
            $r = $this->recipe($me);
            $this->plan($me, self::TODAY, $r['id']);
            $this->plan($me, '2026-11-13', null, 'dinner', 'Reste');
            $this->ok(200, 'DELETE', "/api/v1/recipes/{$r['id']}", null, $me);
            $kaffee = $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Kaffee'], $me);
            $this->ok(200, 'PATCH', '/api/v1/shopping/items/' . rawurlencode($kaffee['key']), ['section' => 'Getränke', 'checked' => true], $me);
            $agent = $this->key($me, ['mealplan:write', 'shopping:write']);
            $this->ok(201, 'POST', '/api/v1/shopping/manual-items', ['name' => 'Backpapier'], $agent);
            $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $me);
            $this->ok(204, 'POST', '/api/v1/auth/forgot-password', ['email' => $email]);
        }
        $before = $this->counts();
        $n = $this->admin->delete('a@example.org');
        $this->assertSame(1, $n['users']);
        $after = $this->counts();
        foreach ($before as $table => $count) {
            $this->assertSame(intdiv($count, 2), $after[$table], "$table keeps exactly family B's rows");
        }
        $b = $this->login('b@example.org');
        $this->assertCount(2, $this->ok(200, 'GET', '/api/v1/meal-plan?from=2026-11-12&to=2026-11-13', null, $b)['entries']);
    }

    /** @return array<string, int> */
    private function counts(): array
    {
        $out = [];
        foreach (['users', 'sessions', 'recipes', 'ingredients', 'instructions', 'meal_plan_entries', 'shopping_trips', 'shopping_item_state',
            'shopping_manual_items', 'api_keys', 'agent_activity', 'device_links', 'password_resets'] as $t) {
            $out[$t] = (int) $this->db->value("SELECT COUNT(*) FROM $t");
        }
        return $out;
    }

    public function testMigrationsAreRecorded(): void
    {
        $this->assertSame(['001_init', '002_families'], $this->db->column('SELECT version FROM schema_migrations ORDER BY version'));
        $this->assertSame([], (new Migrator($this->db, dirname(__DIR__) . '/migrations'))->migrate(), 'nothing left to apply');
    }
}
