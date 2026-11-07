<?php

declare(strict_types=1);

namespace Essensplan\Repository;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Util;

final class UserRepository
{
    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /** @return array<string, mixed>|null */
    public function find(string $userId): ?array
    {
        return $this->db->one('SELECT * FROM users WHERE id = ?', [$userId]);
    }

    /**
     * Pre-auth lookup by credential (login, reset). Not a find-by-id: the
     * caller proves who they are with the password or the mailed token.
     *
     * @return array<string, mixed>|null
     */
    public function findByEmail(string $email): ?array
    {
        return $this->db->one('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
    }

    public function emailTaken(string $email, ?string $exceptUserId = null): bool
    {
        return (bool) $this->db->value(
            'SELECT 1 FROM users WHERE email = ? AND id <> ?',
            [mb_strtolower(trim($email)), $exceptUserId ?? ''],
        );
    }

    public function create(string $name, string $email, string $passwordHash, ?string $id = null): string
    {
        $id ??= Util::uuid();
        $now = $this->clock->db();
        $this->db->insert('users', [
            'id' => $id,
            'name' => $name,
            'email' => mb_strtolower(trim($email)),
            'password_hash' => $passwordHash,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return $id;
    }

    /** @param array<string, mixed> $fields column => value */
    public function update(string $userId, array $fields): void
    {
        if (!$fields) {
            return;
        }
        $fields['updated_at'] = $this->clock->db();
        $sets = implode(', ', array_map(fn ($c) => "$c = ?", array_keys($fields)));
        $this->db->exec("UPDATE users SET $sets WHERE id = ?", [...array_map(Db::param(...), array_values($fields)), $userId]);
    }
}
