<?php

// The server's settings. Copy to config.production.php (never committed), fill in, and upload
// with ./deploy.sh --push-config: it lands on the server as config.php, next to src/.
// Plain PHP, so no quoting rules: write every value in '…' (a ' inside becomes \').
// The keys are the same as in the PHP block of .env.example; whatever is left out uses its default.

return [
    'APP_ENV' => 'production',
    'APP_URL' => 'https://essen.example.de',
    // Random, at least 32 characters: php -r "echo bin2hex(random_bytes(32));"
    'APP_SECRET' => '',

    // KAS → Datenbanken (MySQL 8).
    'DB_HOST' => 'localhost',
    'DB_PORT' => '3306',
    'DB_NAME' => '',
    'DB_USER' => '',
    'DB_PASS' => '',

    // KAS → E-Mail: the mailbox for invite and reset mails. Port 587 + tls or 465 + ssl.
    'MAIL_DRIVER' => 'smtp',
    'MAIL_HOST' => 'w0000000.kasserver.com',
    'MAIL_PORT' => '587',
    'MAIL_ENCRYPTION' => 'tls',
    'MAIL_USER' => '',
    'MAIL_PASS' => '',
    'MAIL_FROM' => 'essen@example.de',

    // "Angemeldet bleiben" off: the session ends after this many idle hours.
    'SESSION_IDLE_HOURS' => '12',
    'RATE_LIMIT_KEY' => '120',
    'RATE_LIMIT_IP' => '300',

    // AI import (optional): every provider with a key is configured; none (or 'off') turns
    // the import off ("selbst eingeben"). AI_PROVIDER names the default: opencode |
    // anthropic | openai. With several keys set, each family picks one in Konto.
    'AI_PROVIDER' => 'opencode',
    'OPENCODE_API_KEY' => '',
    'OPENCODE_MODEL' => 'glm-5.2',
    'OPENCODE_IMAGE_MODEL' => 'kimi-k3',
    'ANTHROPIC_API_KEY' => '',
    'ANTHROPIC_MODEL' => 'claude-opus-5-5',
    'ANTHROPIC_EFFORT' => 'low',
    'OPENAI_API_KEY' => '',
    'OPENAI_MODEL' => 'gpt-5-mini',
    'OPENAI_EFFORT' => 'low',
    'AI_TIMEOUT' => '150',
    'AI_IMPORTS_PER_HOUR' => '30',

    // The hosting's URL cron: https://<domain>/cron?token=<CRON_TOKEN>. At least 32 characters;
    // empty switches /cron off. php -r "echo bin2hex(random_bytes(24));"
    'CRON_TOKEN' => '',
];
