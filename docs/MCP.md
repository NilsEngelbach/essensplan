# Connecting an AI agent (MCP)

Essensplan has an MCP server, so an assistant such as Claude Code, Claude Desktop, Cursor or VS Code can search your recipes, plan meals and fill the shopping list for you. Everything an agent changes shows up in Konto → Aktivität, and you can undo it there.

| | |
|---|---|
| URL | `https://<your domain>/mcp` (locally `http://essen.local/mcp`) |
| Transport | Streamable HTTP, stateless (`POST` only; no SSE stream, no session) |
| Auth | `Authorization: Bearer esp_…`, an API key from the app |

The examples below use `https://essen.example.de`. Replace it with your domain and `esp_…` with your key.

## 1. Create an API key

1. In the app, open **Konto → API & Agenten** and tap **Neuer Schlüssel**.
2. Give it a name you will recognise in the activity log ("Claude Code Laptop").
3. Pick the **rights** (scopes). Write implies read: `mealplan:write` can also read the plan.
4. Pick the **tool** you want to connect. The app then shows the key **once**, together with a ready-to-copy setup for that tool. Copy it right away; the key cannot be shown again (create a new one if you lose it).

Give each tool and device its own key, with only the rights it needs:

| Use | Rights |
|---|---|
| Look things up ("what's on the plan?", "find a quick soup") | `recipes:read`, `mealplan:read`, `shopping:read` |
| Planning assistant | `recipes:read`, `mealplan:write`, `shopping:write` |
| Collect recipes, including import from a link | `recipes:write`, `ai:use` |
| Delete recipes | add `recipes:delete` only if you really want that |

`ai:use` runs the app's own AI import, which costs tokens on the server's AI account. A key can expire after 30 days or a year, or never. Revoking it in Konto takes effect at once (and can be undone for 10 minutes).

The operator can also create a key on the server: `./deploy.sh --console api-key:create --email=… --scopes=recipes:read,mealplan:read`.

## 2. Connect your tool

### Claude Code

```sh
claude mcp add --transport http essensplan https://essen.example.de/mcp \
  --header "Authorization: Bearer esp_…"
```

This makes the server available in the current project. Add `--scope user` to have it in every project. Check with `claude mcp list`, or `/mcp` inside Claude Code.

Do **not** use `--scope project`: it writes the key into `.mcp.json`, which is meant to be committed. If you want a shared `.mcp.json`, reference an environment variable instead and keep the key out of the file:

```json
{
  "mcpServers": {
    "essensplan": {
      "type": "http",
      "url": "https://essen.example.de/mcp",
      "headers": { "Authorization": "Bearer ${ESSENSPLAN_API_KEY}" }
    }
  }
}
```

### Claude Desktop

Claude Desktop reaches remote servers with a custom header through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), which needs Node.js. Open the config file (Claude → Settings → Developer → Edit Config):

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

and add:

```json
{
  "mcpServers": {
    "essensplan": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://essen.example.de/mcp", "--header", "Authorization:${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer esp_…" }
    }
  }
}
```

Restart Claude Desktop. The header goes through `env` (and without a space after the colon) because Windows splits arguments at spaces.

### Cursor

`~/.cursor/mcp.json` (all projects) or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "essensplan": {
      "url": "https://essen.example.de/mcp",
      "headers": { "Authorization": "Bearer esp_…" }
    }
  }
}
```

### VS Code (GitHub Copilot agent mode)

`.vscode/mcp.json` in a workspace, or **MCP: Open User Configuration** for all of them. VS Code asks for the key once and stores it securely, so it never lands in the file:

```json
{
  "inputs": [
    { "type": "promptString", "id": "essensplan-key", "description": "Essensplan API key", "password": true }
  ],
  "servers": {
    "essensplan": {
      "type": "http",
      "url": "https://essen.example.de/mcp",
      "headers": { "Authorization": "Bearer ${input:essensplan-key}" }
    }
  }
}
```

### Other MCP clients

Any client that supports Streamable HTTP with a custom header works: URL `https://essen.example.de/mcp`, header `Authorization: Bearer esp_…`. Clients that only speak stdio can go through `mcp-remote` as shown for Claude Desktop.

### claude.ai in the browser, ChatGPT

Not possible for now. Their connectors only log in with OAuth, and Essensplan only accepts API keys (D4).

## 3. Try it

Ask the agent something like:

- „Was steht diese Woche auf dem Plan?“
- „Plan nächste Woche Mittagessen, vegetarisch, Mittwoch was Schnelles.“
- „Importier das Rezept von https://… und plan es für Samstag Abend.“
- „Was fehlt noch auf der Einkaufsliste für die geplanten Tage?“

Clients that support MCP prompts also offer **`plan_week`** (optional `week` and `wishes`; it knows your Wochenbeginn and Planungstag) and **`shopping_for_week`**. In Claude Code they appear as `/mcp__essensplan__plan_week`.

## Tools

An agent only sees the tools its key's rights allow.

| Tool | Right | What it does |
|---|---|---|
| `get_profile` | (every key) | Today, Wochenbeginn, Planungstag and the week the app opens on |
| `search_recipes` | recipes:read | Search by title or ingredient; filter by category, tags, time, rating, "not cooked since"; sort |
| `get_recipe` | recipes:read | A full recipe with ingredients and steps |
| `suggest_meals` | recipes:read | The app's suggestion shelves for a week and slot (lange nicht gegessen, Lieblinge, schnell) |
| `create_recipe` | recipes:write | Save a recipe |
| `update_recipe` | recipes:write | Change part of a recipe |
| `import_recipe_from_url` | ai:use (+ recipes:write to save) | The app's AI import from a link; `save: false` returns only the draft |
| `delete_recipe` | recipes:delete | Delete a recipe (its plan entries keep the title as text) |
| `list_meal_slots` | mealplan:read | Frühstück, Mittagessen, Abendessen, Snack |
| `get_meal_plan` | mealplan:read | Days → slots → entries for a date range |
| `add_meal` | mealplan:write | Plan a recipe or a short text ("Reste") for a day and slot |
| `move_meal` | mealplan:write | Move an entry to another day, slot or position |
| `remove_meal` | mealplan:write | Remove an entry |
| `get_grocery_list` | shopping:read | The current shopping list, by store section |
| `add_grocery_item` | shopping:write | Put an own item on the list |

Field-level details: `tools/list` returns the input schemas, and [BACKEND.md](BACKEND.md) §6 describes the server.

## What the family sees

- Every change an agent makes is logged under **Konto → Aktivität** with the key's name, e.g. „hat Do 12. Mittag: Gnocchi-Pfanne geplant“. Each entry has **Rückgängig**, as long as nobody changed the target since.
- Plan entries, recipes and shopping items an agent added are marked in the app until someone has seen them; the avatar shows a dot for unseen agent changes.
- Revoke a key in Konto → API & Agenten to stop an agent at once.

## Check the connection by hand

```sh
curl -s https://essen.example.de/mcp \
  -H "Authorization: Bearer esp_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

A list of tools means URL, key and header are fine. The same key works for the REST API: `curl -H "Authorization: Bearer esp_…" "https://essen.example.de/api/v1/recipes?limit=5"` (endpoints in [BACKEND.md](BACKEND.md) §4, OpenAPI at `/api/v1/openapi.json`).

## Troubleshooting

| Symptom | Cause |
|---|---|
| 401 `unauthenticated` | No `Authorization` header arrived. Check the header in your config. On Apache, `public/.htaccess` must pass it on to PHP (the `HTTP_AUTHORIZATION` rewrite). |
| 401 `invalid_key` | The key is wrong, revoked or expired. Create a new one. |
| 403 `forbidden_scope`, or a tool is missing | The key lacks that right. Keys can't be changed; create one with the right rights. |
| 403 `forbidden_origin` | The client sent an `Origin` header from another site (browser-based clients such as the MCP Inspector's web UI). Use a desktop or CLI client, or `mcp-remote`. |
| 405 on `GET /mcp` | Expected: the server is stateless and has no event stream. Clients fall back to plain POST. |
| 429 `rate_limited` | More than 120 requests a minute with one key. |
| 503 `maintenance` | A deploy is running; try again in a minute. |
| 503 `ai_unavailable` from `import_recipe_from_url` | The server has no AI provider key configured. |
