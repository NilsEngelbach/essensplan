<?php

declare(strict_types=1);

namespace Essensplan\Http;

/**
 * An error the client should see as {"error":{"code","message"}}. The message
 * is German, "du" voice, and shown to the user as is.
 */
final class ApiError extends \RuntimeException
{
    /** @param list<array{path: string, message: string}> $details */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }

    public static function notFound(string $message = 'Nicht gefunden.'): self
    {
        return new self(404, 'not_found', $message);
    }

    public static function badRequest(string $message = 'Die Anfrage ist ungültig.'): self
    {
        return new self(400, 'bad_request', $message);
    }

    /** @param list<array{path: string, message: string}> $details */
    public static function validation(array $details, string $message = 'Bitte prüf deine Eingaben.'): self
    {
        return new self(422, 'validation_failed', $message, $details);
    }

    public static function field(string $path, string $message): self
    {
        return self::validation([['path' => $path, 'message' => $message]], $message);
    }

    public static function conflict(string $message, string $code = 'conflict'): self
    {
        return new self(409, $code, $message);
    }

    public static function unauthenticated(): self
    {
        return new self(401, 'unauthenticated', 'Bitte melde dich an.', [], ['WWW-Authenticate' => 'Bearer realm="essensplan"']);
    }

    public static function rateLimited(int $seconds): self
    {
        $min = max(1, (int) ceil($seconds / 60));
        $text = $min === 1 ? 'einer Minute' : "$min Minuten";
        return new self(429, 'rate_limited', "Zu viele Versuche. Probier es in $text wieder.", [], ['Retry-After' => (string) max(1, $seconds)]);
    }
}
