<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Http\ApiError;
use Essensplan\Repository\UserRepository;

/**
 * Operator tasks for several families on one install (D20), CLI only: there
 * is no sign-up and no admin role over HTTP. One account is one family (D11).
 */
final class FamilyAdmin
{
    /** Child tables first; the recipe FK of plan entries has no cascade. */
    private const OWNED = [
        'agent_activity', 'api_keys', 'shopping_home_counts', 'section_overrides', 'shopping_manual_items',
        'shopping_trips', 'meal_plan_entries', 'recipes', 'password_resets', 'device_links', 'sessions',
        'ai_jobs', 'ai_usage',
    ];

    public function __construct(
        private readonly Db $db,
        private readonly Clock $clock,
        private readonly UserRepository $users,
        private readonly AuthService $auth,
        private readonly MediaStore $media,
    ) {
    }

    /**
     * Creates a family account. Without a password it gets an invite mail and
     * can't log in until the link is used.
     *
     * @return array<string, mixed> the user row
     */
    public function create(string $email, string $name, ?string $password = null, bool $invite = true): array
    {
        $email = mb_strtolower(trim($email));
        if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/u', $email)) {
            throw new ApiError(400, 'invalid_email', 'Das sieht nicht nach einer E-Mail-Adresse aus.');
        }
        if ($this->users->emailTaken($email)) {
            throw ApiError::conflict("$email gibt es schon.", 'email_taken');
        }
        if ($password !== null && mb_strlen($password) < AuthService::MIN_PASSWORD) {
            throw new ApiError(400, 'weak_password', 'Das Passwort braucht mindestens ' . AuthService::MIN_PASSWORD . ' Zeichen.');
        }
        // Nobody knows this one: the family sets its own through the invite link.
        $hash = password_hash($password ?? bin2hex(random_bytes(32)), PASSWORD_DEFAULT);
        $id = $this->users->create(trim($name) !== '' ? trim($name) : 'Familie', $email, $hash);
        if ($password === null && $invite) {
            $this->auth->invite($id);
        }
        return $this->users->find($id);
    }

    /** @return array<string, mixed> */
    public function byEmail(string $email): array
    {
        return $this->users->findByEmail($email) ?? throw ApiError::notFound("Kein Konto mit $email.");
    }

    public function invite(string $email): void
    {
        $this->auth->invite($this->byEmail($email)['id']);
    }

    /** @return list<array<string, mixed>> one row per family with a few counts */
    public function list(): array
    {
        return $this->db->all(
            'SELECT u.id, u.name, u.email, u.created_at, u.disabled_at, u.email_verified_at,
                (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
                (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > ?) AS devices,
                (SELECT COUNT(*) FROM recipes r WHERE r.user_id = u.id AND r.deleted_at IS NULL) AS recipes,
                (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked_at IS NULL) AS api_keys
             FROM users u ORDER BY u.created_at, u.email',
            [$this->clock->db()],
        );
    }

    /** Locks a family out at once: login, sessions, keys, pairing and reset links stop working. */
    public function disable(string $email): void
    {
        $this->users->update($this->byEmail($email)['id'], ['disabled_at' => $this->clock->db()]);
    }

    public function enable(string $email): void
    {
        $this->users->update($this->byEmail($email)['id'], ['disabled_at' => null]);
    }

    /**
     * Removes a family and everything it owns. Other families are untouched.
     *
     * @return array<string, int> rows deleted per table
     */
    public function delete(string $email): array
    {
        $user = $this->byEmail($email);
        $n = $this->db->transaction(function () use ($user) {
            $n = [];
            foreach (self::OWNED as $table) {
                $n[$table] = $this->db->exec("DELETE FROM $table WHERE user_id = ?", [$user['id']]);
            }
            $n['rate_limits'] = $this->db->exec('DELETE FROM rate_limits WHERE bucket LIKE ?', ['login-fail:' . $user['email'] . '|%']);
            $n['users'] = $this->db->exec('DELETE FROM users WHERE id = ?', [$user['id']]);
            return $n;
        });
        // After the commit: a failed delete leaves the photos, not dangling rows.
        $this->media->deleteAll($user['id']);
        return $n;
    }
}
