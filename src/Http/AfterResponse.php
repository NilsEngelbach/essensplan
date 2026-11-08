<?php

declare(strict_types=1);

namespace Essensplan\Http;

/**
 * Work that may run after the response has gone out. Only PHP-FPM can hand
 * the response over early (fastcgi_finish_request); everywhere else (php -S,
 * php-cgi on Windows/Local, tests) callers run the work inside the request.
 */
final class AfterResponse
{
    /** @var list<callable(): void> */
    private array $tasks = [];

    public function __construct(private readonly bool $detachable = PHP_SAPI === 'fpm-fcgi')
    {
    }

    public function canDetach(): bool
    {
        return $this->detachable && function_exists('fastcgi_finish_request');
    }

    public function add(callable $task): void
    {
        $this->tasks[] = $task;
    }

    /** Called by public/index.php after the response was emitted. */
    public function run(): void
    {
        if ($this->tasks === []) {
            return;
        }
        if ($this->canDetach()) {
            fastcgi_finish_request();
        }
        ignore_user_abort(true);
        @set_time_limit(300);
        foreach ($this->tasks as $task) {
            try {
                $task();
            } catch (\Throwable $e) {
                error_log('[essensplan] after response: ' . $e::class . ': ' . $e->getMessage());
            }
        }
        $this->tasks = [];
    }
}
