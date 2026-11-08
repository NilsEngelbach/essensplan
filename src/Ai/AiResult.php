<?php

declare(strict_types=1);

namespace Essensplan\Ai;

final class AiResult
{
    /** @param array<string, mixed> $data */
    public function __construct(
        public readonly array $data,
        public readonly string $model,
        public readonly int $inputTokens = 0,
        public readonly int $outputTokens = 0,
    ) {
    }

    /**
     * The JSON object in a model's text: tolerates ```json fences, text
     * around the object and a {"recipe": {...}} wrapper (OpenCode models do
     * all three). Null if there is no object.
     *
     * @return array<string, mixed>|null
     */
    public static function decode(string $text, string $wrapper = ''): ?array
    {
        $text = trim((string) preg_replace('/^```(?:json)?\s*|\s*```$/i', '', trim($text)));
        $data = json_decode($text, true);
        if (!is_array($data)) {
            $start = strpos($text, '{');
            $end = strrpos($text, '}');
            $data = ($start !== false && $end > $start) ? json_decode(substr($text, $start, $end - $start + 1), true) : null;
        }
        if (!is_array($data) || array_is_list($data)) {
            return null;
        }
        if ($wrapper !== '' && count($data) === 1 && is_array($data[$wrapper] ?? null)) {
            $data = $data[$wrapper];
        }
        return $data;
    }
}
