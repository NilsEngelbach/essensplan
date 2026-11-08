<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\RateLimitException;
use Essensplan\Http\ApiError;

/**
 * Claude via the official SDK (anthropic-ai/sdk). Structured output through
 * output_config.format json_schema, so the reply always matches the schema.
 * Thinking stays at the model's default (adaptive); effort is low by default,
 * which is plenty for reading a recipe. Server-side fallbacks are on: should
 * the model decline for policy reasons, the API retries on its default
 * fallback model inside the same call.
 */
final class AnthropicProvider implements AiProvider
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $model,
        private readonly string $effort,
        private readonly float $timeout,
    ) {
    }

    public function name(): string
    {
        return 'anthropic';
    }

    public function model(bool $vision): string
    {
        return $this->model;
    }

    public function endpoint(): string
    {
        return 'https://api.anthropic.com/v1/models';
    }

    public function json(string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $options = ['timeout' => $this->timeout, 'maxRetries' => 1];
        if (Tls::curl() !== []) {
            // Windows/Local: a transport that trusts the system store (see Tls).
            $options['transporter'] = new \GuzzleHttp\Client(['timeout' => $this->timeout, 'connect_timeout' => 10, 'curl' => Tls::curl()]);
        }
        $client = new Client(apiKey: $this->apiKey, requestOptions: $options);
        $content = [];
        if ($image !== null) {
            $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $image['mime'], 'data' => $image['data']]];
        }
        $content[] = ['type' => 'text', 'text' => $user];
        try {
            $message = $client->beta->messages->create(
                maxTokens: 16000,
                messages: [['role' => 'user', 'content' => $content]],
                model: $this->model,
                system: $system,
                outputConfig: ['effort' => $this->effort, 'format' => ['type' => 'json_schema', 'schema' => $schema]],
                fallbacks: 'default',
                betas: ['server-side-fallback-2026-07-01'],
            );
        } catch (AuthenticationException) {
            throw new ApiError(503, 'ai_unavailable', 'Der KI-Zugang ist ungültig. Prüf ANTHROPIC_API_KEY auf dem Server.');
        } catch (RateLimitException) {
            throw new ApiError(503, 'ai_busy', 'Die KI ist gerade ausgelastet. Versuch es in einer Minute noch einmal.');
        } catch (APIStatusException $e) {
            error_log('[essensplan] anthropic ' . $e->getMessage());
            throw new ApiError(502, 'ai_failed', 'Die KI hat nicht geantwortet. Versuch es noch einmal.');
        } catch (APIConnectionException $e) {
            error_log('[essensplan] anthropic ' . $e->getMessage());
            throw new ApiError(502, 'ai_failed', 'Die KI ist nicht erreichbar. Versuch es gleich noch einmal.');
        }

        $in = (int) $message->usage->inputTokens;
        $out = (int) $message->usage->outputTokens;
        if ($message->stopReason === 'refusal') {
            throw new ApiError(422, 'ai_refused', 'Die KI wollte diese Quelle nicht lesen. Gib das Rezept selbst ein.');
        }
        if ($message->stopReason === 'max_tokens') {
            throw new ApiError(502, 'ai_failed', 'Das Rezept ist zu lang für einen Durchgang. Gib es selbst ein oder kürze die Quelle.');
        }
        $text = '';
        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $text .= $block->text;
            }
        }
        $data = AiResult::decode($text);
        if ($data === null) {
            throw new ApiError(502, 'ai_failed', 'Die Antwort der KI war unvollständig. Versuch es noch einmal.');
        }
        return new AiResult($data, (string) $message->model, $in, $out);
    }
}
