<?php

declare(strict_types=1);

namespace Essensplan\Ai;

use Essensplan\Http\ApiError;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;

/** OpenAI Responses API with a strict json_schema (docs/BACKEND.md §4.7). */
final class OpenAiProvider implements AiProvider
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
        return 'openai';
    }

    public function model(bool $vision): string
    {
        return $this->model;
    }

    public function endpoint(): string
    {
        return 'https://api.openai.com/v1/models';
    }

    public function json(string $system, string $user, ?array $image, array $schema, string $schemaName): AiResult
    {
        $content = [['type' => 'input_text', 'text' => $user]];
        if ($image !== null) {
            $content[] = ['type' => 'input_image', 'image_url' => "data:{$image['mime']};base64,{$image['data']}", 'detail' => 'high'];
        }
        $body = [
            'model' => $this->model,
            'instructions' => $system,
            'input' => [['role' => 'user', 'content' => $content]],
            'text' => ['format' => ['type' => 'json_schema', 'name' => $schemaName, 'schema' => $schema, 'strict' => true]],
        ];
        if ($this->effort !== '') {
            $body['reasoning'] = ['effort' => $this->effort];
        }
        $data = self::post('https://api.openai.com/v1/responses', $this->apiKey, $body, $this->timeout, 'OPENAI_API_KEY');

        if (($data['status'] ?? '') === 'incomplete') {
            throw new ApiError(502, 'ai_failed', 'Die Antwort der KI war unvollständig. Versuch es noch einmal.');
        }
        $text = '';
        foreach ($data['output'] ?? [] as $item) {
            foreach (($item['type'] ?? '') === 'message' ? ($item['content'] ?? []) : [] as $part) {
                if (($part['type'] ?? '') === 'refusal') {
                    throw new ApiError(422, 'ai_refused', 'Die KI wollte diese Quelle nicht lesen. Gib das Rezept selbst ein.');
                }
                if (($part['type'] ?? '') === 'output_text') {
                    $text .= (string) $part['text'];
                }
            }
        }
        $json = AiResult::decode($text);
        if ($json === null) {
            throw new ApiError(502, 'ai_failed', 'Die Antwort der KI war unvollständig. Versuch es noch einmal.');
        }
        return new AiResult($json, (string) ($data['model'] ?? $this->model), (int) ($data['usage']['input_tokens'] ?? 0), (int) ($data['usage']['output_tokens'] ?? 0));
    }

    /**
     * POST JSON with a Bearer key; maps HTTP failures to German ApiErrors.
     *
     * @return array<string, mixed>
     */
    public static function post(string $url, string $key, array $body, float $timeout, string $envName, array $headers = []): array
    {
        $client = new Client(['timeout' => $timeout, 'connect_timeout' => 10, 'curl' => Tls::curl()]);
        try {
            $res = $client->post($url, [
                'headers' => ['Authorization' => "Bearer $key", 'Accept' => 'application/json', 'User-Agent' => 'Essensplan-Rezeptimport/1.0', ...$headers],
                'json' => $body,
            ]);
        } catch (ConnectException $e) {
            error_log("[essensplan] $url " . $e->getMessage());
            throw new ApiError(502, 'ai_failed', 'Die KI ist nicht erreichbar. Versuch es gleich noch einmal.');
        } catch (RequestException $e) {
            $status = $e->getResponse()?->getStatusCode() ?? 0;
            $body = (string) $e->getResponse()?->getBody();
            error_log("[essensplan] $url HTTP $status " . mb_strimwidth($body, 0, 500));
            throw match (true) {
                $status === 401 || $status === 403 => new ApiError(503, 'ai_unavailable', "Der KI-Zugang ist ungültig oder abgelaufen. Prüf $envName auf dem Server."),
                (bool) preg_match('/insufficient_quota|credit_balance|billing/i', $body) => new ApiError(503, 'ai_unavailable', 'Beim KI-Anbieter ist kein Guthaben mehr. Gib das Rezept selbst ein; der Betreiber muss Guthaben aufladen.'),
                $status === 429 => new ApiError(503, 'ai_busy', 'Die KI ist gerade ausgelastet. Versuch es in einer Minute noch einmal.'),
                default => new ApiError(502, 'ai_failed', 'Die KI hat nicht geantwortet. Versuch es noch einmal.'),
            };
        }
        $data = json_decode((string) $res->getBody(), true);
        if (!is_array($data)) {
            throw new ApiError(502, 'ai_failed', 'Die KI hat nicht geantwortet. Versuch es noch einmal.');
        }
        return $data;
    }
}
