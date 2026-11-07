<?php

declare(strict_types=1);

namespace Essensplan;

use Dotenv\Dotenv;

/** Settings from the environment (.env locally, real env vars on the host and in tests). */
final class Config
{
    /** @param array<string, string> $values */
    private function __construct(private readonly array $values)
    {
    }

    public static function load(string $root): self
    {
        if (is_file($root . '/.env')) {
            Dotenv::createImmutable($root)->safeLoad();
        }
        $values = [];
        foreach ([...$_SERVER, ...$_ENV] as $k => $v) {
            if (is_string($k) && is_scalar($v)) {
                $values[$k] = (string) $v;
            }
        }
        foreach (getenv() as $k => $v) {
            $values[$k] ??= $v;
        }
        return new self($values);
    }

    /** @param array<string, string> $values */
    public static function fromArray(array $values): self
    {
        return new self($values);
    }

    public function get(string $key, string $default = ''): string
    {
        $v = $this->values[$key] ?? '';
        return $v === '' ? $default : $v;
    }

    public function int(string $key, int $default): int
    {
        $v = $this->get($key);
        return $v === '' ? $default : (int) $v;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $v = strtolower($this->get($key));
        return $v === '' ? $default : in_array($v, ['1', 'true', 'yes', 'on'], true);
    }

    public function appUrl(): string
    {
        return rtrim($this->get('APP_URL', 'http://localhost:8080'), '/');
    }

    public function secureCookies(): bool
    {
        return str_starts_with($this->appUrl(), 'https://');
    }

    public function secret(): string
    {
        $s = $this->get('APP_SECRET');
        if ($s === '') {
            if ($this->get('APP_ENV', 'production') === 'production') {
                throw new \RuntimeException('APP_SECRET is not set.');
            }
            return 'dev-only-secret';
        }
        return $s;
    }

    public function isDebug(): bool
    {
        return $this->bool('APP_DEBUG', $this->get('APP_ENV', 'production') !== 'production');
    }
}
