<?php

declare(strict_types=1);

namespace Essensplan;

use PDO;

/** Thin PDO wrapper: positional parameters, UTC session time zone, nestable transactions. */
final class Db
{
    private int $depth = 0;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public static function connect(Config $config, ?string $database = null): self
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config->get('DB_HOST', '127.0.0.1'),
            $config->int('DB_PORT', 3306),
            $database ?? $config->get('DB_NAME', 'essensplan'),
        );
        $pdo = new PDO($dsn, $config->get('DB_USER', 'root'), $config->get('DB_PASS'), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00', NAMES utf8mb4 COLLATE utf8mb4_unicode_ci, "
            . "sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'");
        return new self($pdo);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    /** @return list<array<string, mixed>> */
    public function all(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        return $st->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function one(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    /** @return list<mixed> */
    public function column(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        return $st->fetchAll(PDO::FETCH_COLUMN);
    }

    public function exec(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute(array_values($params));
        return $st->rowCount();
    }

    /** @param array<string, mixed> $row */
    public function insert(string $table, array $row): void
    {
        $cols = array_keys($row);
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(', ', $cols),
            implode(', ', array_fill(0, count($cols), '?')),
        );
        $this->exec($sql, array_map(self::param(...), array_values($row)));
    }

    /** Booleans and arrays as MySQL wants them. */
    public static function param(mixed $v): mixed
    {
        return match (true) {
            is_bool($v) => $v ? 1 : 0,
            is_array($v) => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            default => $v,
        };
    }

    /** "?, ?, ?" for an IN list. */
    public static function marks(array $values): string
    {
        return implode(', ', array_fill(0, max(1, count($values)), '?'));
    }

    /**
     * @template T
     * @param callable(): T $fn
     * @return T
     */
    public function transaction(callable $fn): mixed
    {
        if ($this->depth > 0) {
            $this->depth++;
            try {
                return $fn();
            } finally {
                $this->depth--;
            }
        }
        $this->pdo->beginTransaction();
        $this->depth = 1;
        try {
            $result = $fn();
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        } finally {
            $this->depth = 0;
        }
    }
}
