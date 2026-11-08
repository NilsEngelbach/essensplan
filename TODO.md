# TODO

## Features

- Analytics UI
- Display the AI input / output tokens per user (`ai_usage` already records every call)

## Check on the live server (all-inkl)

- Web PHP limits for the AI import: `max_execution_time` / FastCGI timeout and `fastcgi_finish_request` (`./deploy.sh --check` only sees the command-line PHP)
- API keys and MCP from outside: the `Authorization` rewrite in `public/.htaccess` ([docs/MCP.md](docs/MCP.md), "Check the connection by hand")
- URL cron set up and running (`/cron?token=`)
- SMTP sender with SPF/DKIM; invite and reset mails arrive
- Real AI imports with links and photos

## Decide

- Default AI provider and model: OpenCode (current default), Anthropic or OpenAI. Compare all three on the same links and photos.
- Undo windows: 7 days for plan entries and own items, 30 days for recipes, 10 minutes for un-revoking a key.
- Cooking stats count today's entry as cooked.
- Rate-limit defaults (120 per key, 300 per IP per minute, 30 AI imports per family and hour): tune once real agents run.

## Design finish

- impeccable `adapt`, `animate`, `optimize` across the app
- `impeccable live` fine tuning, then one finish review and `polish`
- Refresh DESIGN.md from the shipped build (`impeccable document`)
