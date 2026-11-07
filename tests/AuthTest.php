<?php

declare(strict_types=1);

namespace Essensplan\Tests;

use Essensplan\Service\Mailer;

/** Login, sessions, CSRF, pairing and password reset (D19). */
final class AuthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->user();
    }

    public function testLoginSetsCookieAndRemember(): void
    {
        $r = $this->call('POST', '/api/v1/auth/login', ['email' => ' Nils@Familie.de ', 'password' => self::PASSWORD]);
        $this->assertSame(200, $r['status']);
        $this->assertSame(['name' => 'Nils', 'email' => 'nils@familie.de'], $r['body']['account']);
        $this->assertSame('iPhone · Safari', $r['body']['session']['deviceLabel']);
        $cookie = $r['headers']['Set-Cookie'][0];
        $this->assertStringContainsString('HttpOnly', $cookie);
        $this->assertStringContainsString('SameSite=Lax', $cookie);
        $this->assertStringContainsString('Max-Age=31536000', $cookie, 'remember is the default');

        $r = $this->call('POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => self::PASSWORD, 'remember' => false]);
        $this->assertStringNotContainsString('Max-Age', $r['headers']['Set-Cookie'][0], 'browser-session cookie');
        $this->assertSame(0, (int) $this->db->value('SELECT COUNT(*) FROM sessions WHERE token_hash = ?', [self::cookie($r)]), 'only the hash is stored');
    }

    public function testWrongPasswordAndLockout(): void
    {
        $err = $this->fails(401, 'invalid_credentials', 'POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => 'falsch']);
        $this->assertSame('E-Mail oder Passwort stimmt nicht.', $err['message']);
        $this->fails(401, 'invalid_credentials', 'POST', '/api/v1/auth/login', ['email' => 'niemand@familie.de', 'password' => 'falsch']);
        for ($i = 0; $i < 3; $i++) {
            $this->call('POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => 'falsch']);
        }
        $err = $this->fails(429, 'rate_limited', 'POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => 'falsch']);
        $this->assertSame('Zu viele Versuche. Probier es in 5 Minuten wieder.', $err['message']);
        // Even the right password waits until the lock is over.
        $this->fails(429, 'rate_limited', 'POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => self::PASSWORD]);
        $this->clock->set('2026-11-12T09:05:01Z');
        $this->login();
    }

    public function testSupabaseHashIsAcceptedAndRehashed(): void
    {
        $a2 = '$2a$' . substr(password_hash(self::PASSWORD, PASSWORD_BCRYPT, ['cost' => 10]), 4);
        $this->user('alt@familie.de', 'Alt', $a2);
        $this->login('alt@familie.de');
        $hash = $this->db->value('SELECT password_hash FROM users WHERE email = ?', ['alt@familie.de']);
        $this->assertNotSame($a2, $hash);
        $this->assertTrue(password_verify(self::PASSWORD, $hash));
    }

    public function testCsrfAndLogout(): void
    {
        $me = $this->login();
        $this->fails(403, 'csrf_failed', 'POST', '/api/v1/auth/logout', null, new Actor(cookie: $me->cookie, csrf: 'falsch'));
        $this->assertSame($me->csrf, $this->ok(200, 'GET', '/api/v1/me', null, $me)['csrfToken']);
        $r = $this->call('POST', '/api/v1/auth/logout', null, $me);
        $this->assertSame(204, $r['status']);
        $this->assertStringContainsString('Max-Age=0', $r['headers']['Set-Cookie'][0]);
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/me', null, $me);
        $r = $this->call('POST', '/api/v1/auth/login', 'email=x', null, ['Content-Type' => 'application/x-www-form-urlencoded']);
        $this->assertSame(415, $r['status']);
    }

    public function testSessionsListAndRevoke(): void
    {
        $phone = $this->login();
        $this->clock->set('2026-11-12T09:10:00Z');
        $laptop = $this->call('POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => self::PASSWORD], null, ['User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0']);
        $laptop = new Actor(cookie: self::cookie($laptop), csrf: $laptop['body']['csrfToken'], sessionId: $laptop['body']['session']['id']);
        $list = $this->ok(200, 'GET', '/api/v1/auth/sessions', null, $laptop)['items'];
        $this->assertSame(['Windows · Edge', 'iPhone · Safari'], array_column($list, 'deviceLabel'));
        $this->assertSame([true, false], array_column($list, 'current'));
        $this->ok(204, 'DELETE', "/api/v1/auth/sessions/{$phone->sessionId}", null, $laptop);
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/me', null, $phone);
        $this->assertSame(0, $this->ok(200, 'POST', '/api/v1/auth/sessions/revoke-others', null, $laptop)['revoked']);
    }

    public function testIdleSessionWithoutRememberExpires(): void
    {
        $me = $this->login(remember: false);
        $this->clock->set('2026-11-12T20:00:00Z');
        $this->ok(200, 'GET', '/api/v1/me', null, $me); // touched: 11 h later, idle window starts again
        $this->clock->set('2026-11-13T07:30:00Z'); // 20:00 + 12 h = 08:00
        $this->ok(200, 'GET', '/api/v1/me', null, $me);
        $this->clock->set('2026-11-14T09:00:00Z');
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/me', null, $me);
    }

    public function testPairingWithCodeAndToken(): void
    {
        $phone = $this->login();
        $link = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $this->assertMatchesRegularExpression('/^\d{6}$/', $link['code']);
        $this->assertSame('http://essen.test/koppeln/' . $link['token'], $link['url']);
        $this->assertNull($this->ok(200, 'GET', "/api/v1/auth/device-links/{$link['id']}", null, $phone)['usedAt']);

        $r = $this->call('POST', '/api/v1/auth/pair', ['code' => substr($link['code'], 0, 3) . ' ' . substr($link['code'], 3)], null, ['User-Agent' => 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36']);
        $this->assertSame(200, $r['status'], json_encode($r['body']));
        $this->assertSame('pairing', $r['body']['session']['via']);
        $this->assertStringContainsString('Max-Age=31536000', $r['headers']['Set-Cookie'][0], 'paired devices stay logged in');
        $polled = $this->ok(200, 'GET', "/api/v1/auth/device-links/{$link['id']}", null, $phone);
        $this->assertNotNull($polled['usedAt']);
        $this->assertSame('Android · Chrome', $polled['usedByLabel']);

        // Single use.
        $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $link['code']]);

        // QR token, and a new link replaces the open one.
        $old = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $new = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $this->fails(400, 'link_expired', 'POST', '/api/v1/auth/pair', ['token' => $old['token']]);
        $this->ok(200, 'POST', '/api/v1/auth/pair', ['token' => $new['token']]);
        $this->fails(400, 'link_expired', 'POST', '/api/v1/auth/pair', ['token' => $new['token']]);

        // Ten minutes.
        $late = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $this->clock->set('2026-11-12T09:10:01Z');
        $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $late['code']]);
    }

    public function testFiveWrongCodesLockThisDeviceOnly(): void
    {
        $phone = $this->login();
        $link = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $wrong = str_pad((string) (((int) $link['code'] + 1) % 1_000_000), 6, '0', STR_PAD_LEFT);
        $this->ip = '198.51.100.1';
        for ($i = 0; $i < 4; $i++) {
            $err = $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $wrong]);
        }
        $this->assertSame('Der Code passt nicht. Schau noch einmal auf das andere Gerät.', $err['message']);
        $err = $this->fails(400, 'code_spent', 'POST', '/api/v1/auth/pair', ['code' => $wrong]);
        $this->assertSame('Zu viele falsche Codes. Warte 10 Minuten und lass dir dann auf dem anderen Gerät einen neuen Code anzeigen.', $err['message']);
        // This device waits, even with the right code …
        $this->fails(400, 'code_spent', 'POST', '/api/v1/auth/pair', ['code' => $link['code']]);
        $this->assertFalse($this->ok(200, 'GET', "/api/v1/auth/device-links/{$link['id']}", null, $phone)['spent']);
        // … after ten minutes it can try again.
        $this->clock->set('2026-11-12T09:10:01Z');
        $fresh = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $this->ok(200, 'POST', '/api/v1/auth/pair', ['code' => $fresh['code']]);
    }

    public function testGuessingFromManyIpsSpendsAllOpenCodes(): void
    {
        $phone = $this->login();
        $link = $this->ok(201, 'POST', '/api/v1/auth/device-links', null, $phone);
        $wrong = str_pad((string) (((int) $link['code'] + 1) % 1_000_000), 6, '0', STR_PAD_LEFT);
        for ($i = 0; $i < 30; $i++) {
            $this->ip = '198.51.100.' . (10 + intdiv($i, 3));
            $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $wrong]);
        }
        $this->assertTrue($this->ok(200, 'GET', "/api/v1/auth/device-links/{$link['id']}", null, $phone)['spent']);
        $this->ip = '198.51.100.99';
        $this->fails(400, 'invalid_code', 'POST', '/api/v1/auth/pair', ['code' => $link['code']]);
    }

    public function testPasswordReset(): void
    {
        $other = $this->login();
        $mailer = $this->c->get(Mailer::class);
        $this->ok(204, 'POST', '/api/v1/auth/forgot-password', ['email' => 'niemand@familie.de']);
        $this->assertCount(0, $mailer->sent, 'no enumeration, no mail');
        $this->ok(204, 'POST', '/api/v1/auth/forgot-password', ['email' => 'nils@familie.de']);
        $this->assertCount(1, $mailer->sent);
        preg_match('/token=([0-9a-f]{64})/', $mailer->sent[0]['body'], $m);
        $token = $m[1];

        $this->assertSame(['purpose' => 'reset'], $this->ok(200, 'POST', '/api/v1/auth/reset-password/check', ['token' => $token]));
        $err = $this->fails(400, 'weak_password', 'POST', '/api/v1/auth/reset-password', ['token' => $token, 'password' => 'kurz']);
        $this->assertSame('Das Passwort braucht mindestens 10 Zeichen.', $err['message']);
        $r = $this->ok(200, 'POST', '/api/v1/auth/reset-password', ['token' => $token, 'password' => 'ganz-neues-passwort', 'revokeOthers' => true]);
        $this->assertSame('reset', $r['session']['via']);
        $this->fails(401, 'unauthenticated', 'GET', '/api/v1/me', null, $other);
        $this->fails(400, 'reset_invalid', 'POST', '/api/v1/auth/reset-password', ['token' => $token, 'password' => 'noch-ein-passwort']);
        $this->ok(200, 'POST', '/api/v1/auth/login', ['email' => 'nils@familie.de', 'password' => 'ganz-neues-passwort']);

        // 60 minutes.
        $this->ok(204, 'POST', '/api/v1/auth/forgot-password', ['email' => 'nils@familie.de']);
        preg_match('/token=([0-9a-f]{64})/', $mailer->sent[1]['body'], $m);
        $this->clock->set('2026-11-12T10:00:01Z');
        $this->fails(400, 'reset_invalid', 'POST', '/api/v1/auth/reset-password/check', ['token' => $m[1]]);
    }

    public function testChangeEmailNeedsPasswordAndSettings(): void
    {
        $me = $this->login();
        $r = $this->ok(200, 'PATCH', '/api/v1/me', ['name' => 'Nils E.', 'settings' => ['weekStart' => 0, 'planningWeekday' => 4]], $me);
        $this->assertSame(['weekStart' => 0, 'planningWeekday' => 4], $r['settings']);
        $this->assertSame('Nils E.', $r['name']);
        $this->fails(400, 'wrong_password', 'PATCH', '/api/v1/me', ['email' => 'neu@familie.de'], $me);
        $this->fails(400, 'invalid_email', 'PATCH', '/api/v1/me', ['email' => 'kaputt', 'currentPassword' => self::PASSWORD], $me);
        $this->assertSame('neu@familie.de', $this->ok(200, 'PATCH', '/api/v1/me', ['email' => 'neu@familie.de', 'currentPassword' => self::PASSWORD], $me)['email']);
        $this->fails(422, 'validation_failed', 'PATCH', '/api/v1/me', ['settings' => ['weekStart' => 9]], $me);
    }

    public function testThereIsNoSignUpOverHttp(): void
    {
        $this->fails(404, 'not_found', 'POST', '/api/v1/auth/register', ['email' => 'neu@familie.de', 'password' => self::PASSWORD]);
        $this->assertArrayNotHasKey('registrationEnabled', $this->ok(200, 'GET', '/api/v1/config'));
    }
}
