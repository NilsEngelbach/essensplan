<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\Http\ApiError;

/**
 * OpenCode Go: OpenAI-compatible chat completions with json_object (no
 * schema enforcement), so the schema goes into the system prompt and the
 * importer validates the reply. Reasoning models (GLM, DeepSeek) sometimes
 * leave content empty and answer in reasoning_content; that is used then.
 * Go asks clients for an x-opencode-session id and their own User-Agent.
 */
final class OpenCodeProvider implements AiProvider
{
    public const BASE_URL = 'https://opencode.ai/zen/go/v1';

    public function __construct(
        private readonly string $apiKey,
        private readonly string $model,
        private readonly string $imageModel,
        private readonly float $timeout,
    ) {
        $this->session = \Essensplan\Util::uuid();
    }

    /** OpenCode Go routes by a stable session id per conversation; a job runs in one process, so one import (call + retry) is one. */
    private readonly string $session;

    public function name(): string
    {
        return 'opencode';
    }

    public function model(bool $vision): string
    {
        return $vision ? $this->imageModel : $this->model;
    }

    public function endpoint(): string
    {
        return self::BASE_URL . '/models';
    }

    public function json(string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $system .= "\n\nAntworte mit genau EINEM JSON-Objekt, ohne Markdown und ohne Erklärungen. Es muss dieses JSON Schema erfüllen:\n"
            . json_encode($schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $userContent = $image === null ? $user : [
            ['type' => 'text', 'text' => $user],
            ['type' => 'image_url', 'image_url' => ['url' => "data:{$image['mime']};base64,{$image['data']}"]],
        ];
        $model = $this->model($image !== null);
        $data = OpenAiProvider::post(self::BASE_URL . '/chat/completions', $this->apiKey, [
            'model' => $model,
            'response_format' => ['type' => 'json_object'],
            'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $userContent]],
        ], $this->timeout, 'OPENCODE_API_KEY', ['x-opencode-session' => $this->session]);

        $message = $data['choices'][0]['message'] ?? [];
        $text = (string) ($message['content'] ?? '');
        if (trim($text) === '') {
            $text = (string) ($message['reasoning_content'] ?? '');
        }
        $json = AiResult::decode($text, $schemaName);
        if ($json === null) {
            error_log('[essensplan] opencode reply without JSON (' . ($data['choices'][0]['finish_reason'] ?? '?') . '): ' . mb_strimwidth($text, 0, 300));
            throw new ApiError(502, 'ai_failed', 'Die Antwort der KI war kein lesbares Rezept. Versuch es noch einmal.');
        }
        return new AiResult($json, (string) ($data['model'] ?? $model), (int) ($data['usage']['prompt_tokens'] ?? 0), (int) ($data['usage']['completion_tokens'] ?? 0));
    }
}
