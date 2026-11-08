<?php

declare(strict_types=1);

namespace Essensplan\Ai;

/**
 * One structured-output call: system + user text (+ an optional image) in,
 * a JSON object matching $schema out. The pipeline around it (fetching,
 * prompts, validation, normalising) is the same for every provider.
 */
interface AiProvider
{
    /** openai | anthropic | opencode */
    public function name(): string;

    /** The model used for text, or for an image when $vision. */
    public function model(bool $vision): string;

    /** A URL to probe for reachability (bin/console check). */
    public function endpoint(): string;

    /**
     * @param array{mime: string, data: string}|null $image base64 data
     * @param array<string, mixed> $schema JSON Schema (the strict-output subset: no length or range limits)
     * @throws \Essensplan\Http\ApiError ai_failed / ai_refused with a German message
     */
    public function json(string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult;
}
