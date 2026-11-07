<?php

declare(strict_types=1);

namespace Essensplan\Service;

use Essensplan\Clock;
use Essensplan\Db;
use Essensplan\Http\Principal;
use Essensplan\Util;

/**
 * Writes `agent_activity` for every write made with an API key (REST or MCP),
 * inside the caller's transaction. App writes are not logged.
 */
final class ActivityLog
{
    public const RETENTION_DAYS = 90;

    public function __construct(private readonly Db $db, private readonly Clock $clock)
    {
    }

    /**
     * @param array{type: string, id: string, label: string, href: string} $target
     * @param array<string, mixed>|null $undo
     */
    public function record(Principal $p, string $action, array $target, string $summary, ?array $undo = null): void
    {
        if (!$p->isKey()) {
            return;
        }
        $this->db->insert('agent_activity', [
            'id' => Util::uuid(),
            'user_id' => $p->userId,
            'api_key_id' => $p->key['id'],
            'key_name' => $p->key['name'],
            'channel' => $p->channel === 'mcp' ? 'mcp' : 'rest',
            'action' => $action,
            'target_type' => $target['type'],
            'target_id' => mb_substr($target['id'], 0, 190),
            'target_label' => mb_substr($target['label'], 0, 200),
            'target_href' => $target['href'],
            'summary' => mb_substr($summary, 0, 300),
            'undo_payload' => $undo,
            'created_at' => $this->clock->dbMicro(),
        ]);
    }
}
