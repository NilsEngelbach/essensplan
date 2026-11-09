<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Ai\Ai;
use Essensplan\Clock;
use Essensplan\Config;
use Essensplan\Db;
use Essensplan\Domain\DeviceLabel;
use Essensplan\Http\ApiError;
use Essensplan\Http\Principal;
use Essensplan\Repository\DeviceLinkRepository;
use Essensplan\Repository\SessionRepository;
use Essensplan\Repository\UserRepository;
use Essensplan\Util;

/**
 * Login, logout, pairing, sessions, password reset and the account (D19).
 * Messages are the exact strings of frontend/src/lib/auth.ts.
 */
final class AuthService
{
    public const MIN_PASSWORD = 10;
    public const LINK_MINUTES = 10;
    public const MAX_CODE_ATTEMPTS = 5;
    public const MAX_LOGIN_FAILURES = 5;
    public const LOCK_SECONDS = 300;
    public const REMEMBER_DAYS = 365;
    public const RESET_MINUTES = 60;
    public const INVITE_DAYS = 7;
    public const MISS_WINDOW = 600;
    public const MAX_MISSES_ALL = 30;

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly Config $config,
        private readonly UserRepository $users,
        private readonly SessionRepository $sessions,
        private readonly DeviceLinkRepository $links,
        private readonly RateLimiter $limiter,
        private readonly Mailer $mailer,
        private readonly Ai $ai,
    ) {
    }

    /* ── Sessions ─────────────────────────────────────────────────────────── */

    /**
     * Creates a session row and returns it with the cookie token (shown once).
     *
     * @return array{session: array<string, mixed>, token: string}
     */
    public function startSession(string $userId, bool $remember, string $via, string $userAgent, ?string $ip): array
    {
        $token = bin2hex(random_bytes(32));
        $now = $this->clock->db();
        $row = [
            'id' => Util::uuid(),
            'user_id' => $userId,
            'token_hash' => hash('sha256', $token),
            'csrf_token' => bin2hex(random_bytes(32)),
            'remember' => $remember ? 1 : 0,
            'device_label' => DeviceLabel::fromUserAgent($userAgent),
            'user_agent' => mb_substr($userAgent, 0, 500),
            'ip' => $ip,
            'via' => $via,
            'created_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $this->expiry($remember),
        ];
        $this->sessions->insert($row);
        return ['session' => $row, 'token' => $token];
    }

    public function expiry(bool $remember): string
    {
        return $remember
            ? $this->clock->db('+' . self::REMEMBER_DAYS . ' days')
            : $this->clock->db('+' . $this->config->int('SESSION_IDLE_HOURS', 12) . ' hours');
    }

    /** @return array<string, mixed>|null the live session for a cookie token */
    public function sessionForToken(string $token): ?array
    {
        return $token === '' ? null : $this->sessions->findLive(hash('sha256', $token));
    }

    /** Rolling expiry; written at most every 5 minutes. Returns true when the cookie should be re-sent. */
    public function touch(array $session): bool
    {
        $last = strtotime($session['last_seen_at'] . ' UTC');
        $age = $this->clock->now()->getTimestamp() - $last;
        if ($age < 300) {
            return false;
        }
        $this->sessions->touch($session['user_id'], $session['id'], $this->expiry((bool) $session['remember']));
        return (bool) $session['remember'] && $age >= 86400;
    }

    /* ── Login, logout ────────────────────────────────────────────────────── */

    /** A real hash, so a login for an unknown e-mail costs the same time. */
    private static function dummyHash(): string
    {
        static $hash = null;
        return $hash ??= password_hash('not-a-password', PASSWORD_DEFAULT);
    }

    /** @return array{user: array<string, mixed>, session: array<string, mixed>, token: string} */
    public function login(string $email, string $password, bool $remember, string $userAgent, ?string $ip): array
    {
        $email = mb_strtolower(trim($email));
        $this->limiter->hit('login-ip:' . $ip, 30, 900);
        $failBucket = "login-fail:$email|$ip";
        $this->limiter->check($failBucket, self::MAX_LOGIN_FAILURES);

        $user = $email === '' ? null : $this->users->findByEmail($email);
        $ok = password_verify($password, $user['password_hash'] ?? self::dummyHash()) && $user !== null;
        if (!$ok) {
            $fails = $this->limiter->add($failBucket, self::LOCK_SECONDS);
            if ($fails >= self::MAX_LOGIN_FAILURES) {
                throw ApiError::rateLimited(self::LOCK_SECONDS);
            }
            throw new ApiError(401, 'invalid_credentials', 'E-Mail oder Passwort stimmt nicht.');
        }
        $this->limiter->clear($failBucket);
        // Only told after the right password, so it reveals nothing to a guesser.
        if ($user['disabled_at'] !== null) {
            throw new ApiError(403, 'account_disabled', 'Dieses Konto ist gesperrt.');
        }
        // $2a$ hashes (accounts imported from the old app) and older costs are upgraded on the first login.
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->users->update($user['id'], ['password_hash' => password_hash($password, PASSWORD_DEFAULT)]);
        }
        return ['user' => $user, ...$this->startSession($user['id'], $remember, 'password', $userAgent, $ip)];
    }

    public function logout(Principal $p): void
    {
        if ($p->sessionId() !== null) {
            $this->sessions->delete($p->userId, $p->sessionId());
        }
    }

    /** @return list<array<string, mixed>> this device first, then by last use */
    public function listSessions(Principal $p): array
    {
        $rows = $this->sessions->listLive($p->userId);
        usort($rows, fn ($a, $b) => ($b['id'] === $p->sessionId()) <=> ($a['id'] === $p->sessionId()));
        return array_map(fn ($s) => $this->sessionJson($s, $p->sessionId()), $rows);
    }

    public function revokeSession(Principal $p, string $id): void
    {
        if (!$this->sessions->delete($p->userId, $id)) {
            throw ApiError::notFound('Dieses Gerät ist nicht mehr angemeldet.');
        }
    }

    public function revokeOthers(Principal $p): int
    {
        return $this->sessions->deleteAllExcept($p->userId, $p->sessionId());
    }

    /** @return array<string, mixed> */
    public function sessionJson(array $s, ?string $currentId): array
    {
        return [
            'id' => $s['id'],
            'deviceLabel' => $s['device_label'],
            'remember' => (bool) $s['remember'],
            'createdAt' => Util::iso($s['created_at']),
            'lastSeenAt' => Util::iso($s['last_seen_at']),
            'via' => $s['via'],
            'current' => $s['id'] === $currentId,
        ];
    }

    /* ── Pairing a new device ─────────────────────────────────────────────── */

    /** On the trusted device: a code and a QR token, valid for 10 minutes, single use. */
    public function createDeviceLink(Principal $p): array
    {
        return $this->db->transaction(function () use ($p) {
            $this->links->deleteOpen($p->userId);
            do {
                $code = str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
            } while ($this->links->findOpenBy('code', $this->codeHash($code)) !== null);
            $token = bin2hex(random_bytes(24));
            $row = [
                'id' => Util::uuid(),
                'user_id' => $p->userId,
                'code_hash' => $this->codeHash($code),
                'token_hash' => hash('sha256', $token),
                'created_by_session' => $p->sessionId(),
                'created_at' => $this->clock->db(),
                'expires_at' => $this->clock->db('+' . self::LINK_MINUTES . ' minutes'),
            ];
            $this->links->insert($row);
            return [
                ...$this->linkJson($row),
                'code' => $code,
                'token' => $token,
                'url' => $this->config->appUrl() . '/koppeln/' . $token,
            ];
        });
    }

    public function getDeviceLink(Principal $p, string $id): array
    {
        $row = $this->links->find($p->userId, $id) ?? throw ApiError::notFound('Dieser Code ist abgelaufen.');
        return $this->linkJson($row);
    }

    public function cancelDeviceLink(Principal $p, string $id): void
    {
        $this->links->delete($p->userId, $id);
    }

    private function linkJson(array $row): array
    {
        return [
            'id' => $row['id'],
            'createdAt' => Util::iso($row['created_at']),
            'expiresAt' => Util::iso($row['expires_at']),
            'usedAt' => Util::iso($row['used_at'] ?? null),
            'usedByLabel' => $row['used_by_label'] ?? null,
            'spent' => !empty($row['spent_at']),
        ];
    }

    private function codeHash(string $code): string
    {
        return hash_hmac('sha256', $code, $this->config->secret());
    }

    /**
     * On the new device: the 6-digit code or the QR token. Paired devices always stay logged in.
     *
     * A wrong code can't be tied to one family, so misses are counted per IP
     * (5 → this device waits 10 minutes) and across the install (30 in 10
     * minutes → every open code is spent, against guessing from many IPs).
     * One family's typos never spend another family's code.
     */
    public function pair(?string $code, ?string $token, string $userAgent, ?string $ip): array
    {
        $this->limiter->hit('pair-ip:' . $ip, 20, 600);
        if ($token !== null && $token !== '') {
            $result = $this->claim('token', hash('sha256', $token), $userAgent, $ip);
            return $result ?? throw new ApiError(400, 'link_expired', 'Dieser Code ist abgelaufen oder schon benutzt.');
        }
        $missBucket = 'pair-miss:' . $ip;
        $this->checkMisses($missBucket);
        $digits = preg_replace('/\D/', '', (string) $code);
        $result = strlen($digits) === 6 ? $this->claim('code', $this->codeHash($digits), $userAgent, $ip) : null;
        if ($result !== null) {
            $this->limiter->clear($missBucket);
            return $result;
        }
        if ($this->limiter->add('pair-miss-all', self::MISS_WINDOW) >= self::MAX_MISSES_ALL) {
            $this->links->spendAllOpen();
        }
        if ($this->limiter->add($missBucket, self::MISS_WINDOW) >= self::MAX_CODE_ATTEMPTS) {
            $this->checkMisses($missBucket);
        }
        throw new ApiError(400, 'invalid_code', 'Der Code passt nicht. Schau noch einmal auf das andere Gerät.');
    }

    private function checkMisses(string $bucket): void
    {
        try {
            $this->limiter->check($bucket, self::MAX_CODE_ATTEMPTS);
        } catch (ApiError $e) {
            $min = max(1, (int) ceil(((int) ($e->headers['Retry-After'] ?? 600)) / 60));
            throw new ApiError(400, 'code_spent', "Zu viele falsche Codes. Warte $min Minuten und lass dir dann auf dem anderen Gerät einen neuen Code anzeigen.", [], $e->headers);
        }
    }

    private function claim(string $by, string $hash, string $userAgent, ?string $ip): ?array
    {
        return $this->db->transaction(function () use ($by, $hash, $userAgent, $ip) {
            $link = $this->links->findOpenBy($by, $hash);
            $user = $link === null ? null : $this->users->find($link['user_id']);
            if ($link === null || $user === null || $user['disabled_at'] !== null) {
                return null;
            }
            $started = $this->startSession($link['user_id'], true, 'pairing', $userAgent, $ip);
            if (!$this->links->markUsed($link['id'], $started['session']['id'], $started['session']['device_label'])) {
                throw new ApiError(400, 'link_expired', 'Dieser Code ist abgelaufen oder schon benutzt.');
            }
            return ['user' => $user, ...$started];
        });
    }

    /* ── Password reset and invites ───────────────────────────────────────── */

    /**
     * Stores a single-use token (only its hash) and returns it. A new token
     * makes older unused ones of that user useless.
     */
    private function issueToken(string $userId, string $purpose, string $validFor): string
    {
        $token = bin2hex(random_bytes(32));
        $this->db->transaction(function () use ($userId, $token, $purpose, $validFor) {
            $this->db->exec('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [$userId]);
            $this->db->insert('password_resets', [
                'id' => Util::uuid(),
                'user_id' => $userId,
                'purpose' => $purpose,
                'token_hash' => hash('sha256', $token),
                'created_at' => $this->clock->db(),
                'expires_at' => $this->clock->db($validFor),
            ]);
        });
        return $token;
    }

    /** Always ends the same way, whether or not the address exists. */
    public function forgotPassword(string $email, ?string $ip): void
    {
        $this->limiter->hit('forgot-ip:' . $ip, 5, 3600);
        $user = $this->users->findByEmail($email);
        if ($user === null || $user['disabled_at'] !== null) {
            return;
        }
        $token = $this->issueToken($user['id'], 'reset', '+' . self::RESET_MINUTES . ' minutes');
        $url = $this->config->appUrl() . '/passwort-zuruecksetzen?token=' . $token;
        $this->mailer->send(
            $user['email'],
            'Neues Passwort für Essensplan',
            "Hallo {$user['name']},\n\nüber diesen Link setzt du ein neues Passwort:\n$url\n\n"
            . 'Der Link gilt ' . self::RESET_MINUTES . " Minuten und nur einmal.\n"
            . "Wenn du das nicht angefordert hast, kannst du diese Mail ignorieren.\n",
        );
    }

    /**
     * Onboarding a family (CLI only, D20): a welcome mail with a link to set
     * the password. Valid 7 days; the same page as the reset.
     */
    public function invite(string $userId): void
    {
        $user = $this->users->find($userId) ?? throw ApiError::notFound('Dieses Konto gibt es nicht.');
        $token = $this->issueToken($userId, 'invite', '+' . self::INVITE_DAYS . ' days');
        $url = $this->config->appUrl() . '/passwort-zuruecksetzen?token=' . $token;
        $this->mailer->send(
            $user['email'],
            'Willkommen bei Essensplan',
            "Hallo {$user['name']},\n\nfür euch ist ein Essensplan eingerichtet: Rezepte, Wochenplan und Einkaufsliste für die ganze Familie.\n\n"
            . "Über diesen Link legst du dein Passwort fest und bist gleich angemeldet:\n$url\n\n"
            . 'Der Link gilt ' . self::INVITE_DAYS . " Tage und nur einmal. Weitere Geräte der Familie meldest du danach unter Konto, Geräte an.\n",
        );
    }

    /** @return array<string, mixed>|null */
    private function liveReset(string $token): ?array
    {
        return $this->db->one(
            'SELECT pr.* FROM password_resets pr JOIN users u ON u.id = pr.user_id
             WHERE pr.token_hash = ? AND pr.used_at IS NULL AND pr.expires_at > ? AND u.disabled_at IS NULL',
            [hash('sha256', $token), $this->clock->db()],
        );
    }

    /** @return array{purpose: string} reset or invite, so the page can greet a new family */
    public function checkResetToken(string $token): array
    {
        $reset = $token === '' ? null : $this->liveReset($token);
        if ($reset === null) {
            throw new ApiError(400, 'reset_invalid', 'Dieser Link ist abgelaufen oder schon benutzt.');
        }
        return ['purpose' => $reset['purpose']];
    }

    public function resetPassword(string $token, string $password, bool $revokeOthers, string $userAgent, ?string $ip): array
    {
        $this->limiter->hit('reset-ip:' . $ip, 10, 3600);
        $this->checkResetToken($token);
        $this->validPassword($password);
        return $this->db->transaction(function () use ($token, $password, $revokeOthers, $userAgent, $ip) {
            $reset = $this->liveReset($token) ?? throw new ApiError(400, 'reset_invalid', 'Dieser Link ist abgelaufen oder schon benutzt.');
            $this->db->exec('UPDATE password_resets SET used_at = ? WHERE id = ?', [$this->clock->db(), $reset['id']]);
            $user = $this->users->find($reset['user_id']);
            $fields = ['password_hash' => password_hash($password, PASSWORD_DEFAULT)];
            // The link arrived by mail, so the address works.
            if ($user['email_verified_at'] === null) {
                $fields['email_verified_at'] = $this->clock->db();
            }
            $this->users->update($user['id'], $fields);
            $this->db->exec('DELETE FROM rate_limits WHERE bucket LIKE ?', ['login-fail:' . $user['email'] . '|%']);
            if ($revokeOthers) {
                $this->sessions->deleteAllExcept($user['id'], null);
            }
            $via = $reset['purpose'] === 'invite' ? 'invite' : 'reset';
            return ['user' => $this->users->find($user['id']), ...$this->startSession($user['id'], true, $via, $userAgent, $ip)];
        });
    }

    /* ── Account ──────────────────────────────────────────────────────────── */

    public function me(Principal $p): array
    {
        $u = $this->users->find($p->userId) ?? throw ApiError::unauthenticated();
        $today = $this->clock->today();
        $me = [
            'id' => $u['id'],
            'name' => $u['name'],
            'email' => $u['email'],
            'settings' => ['weekStart' => (int) $u['week_start'], 'planningWeekday' => (int) $u['planning_weekday'], 'aiProvider' => $this->ai->chosen($u['id'])],
            // Off without a configured provider: the app hides the import (D25). Several: Konto offers a choice.
            'ai' => ['import' => $this->ai->enabled(), 'providers' => $this->ai->providers()],
            'today' => $today,
            'defaultWeekStart' => Util::defaultWeekStart($today, (int) $u['week_start'], (int) $u['planning_weekday']),
        ];
        if ($p->session !== null) {
            $me['csrfToken'] = $p->session['csrf_token'];
        }
        return $me;
    }

    /** @param array{name?: string, email?: string, currentPassword?: string, settings?: array} $patch */
    public function updateMe(Principal $p, array $patch): array
    {
        $u = $this->users->find($p->userId) ?? throw ApiError::unauthenticated();
        $fields = [];
        if (isset($patch['name']) && trim($patch['name']) !== '') {
            $fields['name'] = mb_substr(trim($patch['name']), 0, 100);
        }
        if (isset($patch['email'])) {
            $email = $this->validEmail($patch['email']);
            if ($email !== $u['email']) {
                if (!password_verify((string) ($patch['currentPassword'] ?? ''), $u['password_hash'])) {
                    throw new ApiError(400, 'wrong_password', 'Das Passwort stimmt nicht.');
                }
                if ($this->users->emailTaken($email, $u['id'])) {
                    throw ApiError::conflict('Diese E-Mail-Adresse wird schon verwendet.', 'email_taken');
                }
                $fields['email'] = $email;
            }
        }
        if (isset($patch['settings']['aiProvider'])) {
            if (!$this->ai->configured($patch['settings']['aiProvider'])) {
                throw ApiError::field('settings.aiProvider', 'Diesen KI-Anbieter gibt es auf diesem Server nicht.');
            }
            $fields['ai_provider'] = $patch['settings']['aiProvider'];
        }
        foreach (['weekStart' => 'week_start', 'planningWeekday' => 'planning_weekday'] as $k => $col) {
            if (isset($patch['settings'][$k])) {
                $fields[$col] = (int) $patch['settings'][$k];
            }
        }
        $this->users->update($u['id'], $fields);
        return $this->me($p);
    }

    public function accountJson(array $user): array
    {
        return ['name' => $user['name'], 'email' => $user['email']];
    }

    private function validEmail(string $email): string
    {
        $email = mb_strtolower(trim($email));
        if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $email) || mb_strlen($email) > 190) {
            throw new ApiError(400, 'invalid_email', 'Das sieht nicht nach einer E-Mail-Adresse aus.');
        }
        return $email;
    }

    private function validPassword(string $password): void
    {
        if (mb_strlen($password) < self::MIN_PASSWORD) {
            throw new ApiError(400, 'weak_password', 'Das Passwort braucht mindestens ' . self::MIN_PASSWORD . ' Zeichen.');
        }
    }
}
