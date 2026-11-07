<?php

declare(strict_types=1);

namespace Essensplan\Tests;

/** A caller in tests: a logged-in device (cookie + CSRF) or an API key. */
final class Actor
{
    public function __construct(
        public readonly ?string $cookie = null,
        public readonly ?string $csrf = null,
        public readonly ?string $sessionId = null,
        public readonly ?string $key = null,
        public readonly ?string $keyId = null,
    ) {
    }
}
