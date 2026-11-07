<?php

declare(strict_types=1);

namespace Essensplan\Console;

use Essensplan\Db;

/** Applies migrations/*.sql in name order, once each, recorded in schema_migrations. */
final class Migrator
{
    public function __construct(private readonly Db $db, private readonly string $dir)
    {
    }

    /** @return list<string> the versions applied now */
    public function migrate(?callable $log = null): array
    {
        $this->db->pdo()->exec('CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(100) NOT NULL PRIMARY KEY,
            applied_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
        $done = array_flip($this->db->column('SELECT version FROM schema_migrations'));
        $files = glob($this->dir . '/*.sql') ?: [];
        sort($files);
        $applied = [];
        foreach ($files as $file) {
            $version = basename($file, '.sql');
            if (isset($done[$version])) {
                continue;
            }
            // MySQL commits DDL implicitly, so a failed file is reported and the run stops.
            foreach (self::statements((string) file_get_contents($file)) as $sql) {
                $this->db->pdo()->exec($sql);
            }
            $this->db->exec('INSERT INTO schema_migrations (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [$version]);
            $applied[] = $version;
            if ($log) {
                $log("applied $version");
            }
        }
        return $applied;
    }

    /** Splits a file on semicolons at line ends, ignoring -- comments. @return list<string> */
    public static function statements(string $sql): array
    {
        $lines = array_filter(explode("\n", str_replace("\r", '', $sql)), fn ($l) => !str_starts_with(ltrim($l), '--'));
        $out = [];
        foreach (preg_split('/;\s*(\n|$)/', implode("\n", $lines)) as $stmt) {
            if (trim($stmt) !== '') {
                $out[] = trim($stmt);
            }
        }
        return $out;
    }
}
