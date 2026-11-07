# Migration Plan: Essensplan → PHP/MySQL on all-inkl, UX-first, with Agent API + MCP

Status: **Phase 1 in progress – init ✅, critique ✅ (17/40), audit ✅, shape app-shell ✅, shape rezepte ✅ (world: „Das Küchengerät“), Rezepte prototype built + reviewed (ship) ✅, DESIGN.md ✅, shape wochenplan ✅ (structure: „Tagleiste + Rezepte“), Wochenplan prototype built ✅, shape einkaufsliste ✅ („Kassenzettel“), Einkauf prototype built ✅, Kochmodus shaped + built ✅, API & Agenten shaped + built ✅, Login & Geräte shaped + built ✅ (all surfaces done); backend draft 1 ✅ on branch `backend-draft` ([BACKEND_REQUIREMENTS.md](BACKEND_REQUIREMENTS.md), 37 tests green on MySQL 8.4 + MariaDB 10.6); next: owner review of the draft, then the Local site spike (§3.1) and wiring the SPA**
Created: 2026-11-07 · Revised: 2026-11-07 (UX-first order, multiple meals per day, API keys only, Local dev env)

---

## 0. Decisions log

| # | Decision | Status |
|---|---|---|
| D1 | No Laravel. **Slim 4** + PDO + small Composer packages | decided |
| D2 | **UX/UI first.** The redesign defines the screen structure; backend schema and API follow from it | decided |
| D3 | **Multiple meals per day** (meal slots) | decided |
| D4 | Agent access via **API keys** only (REST + MCP). OAuth for claude.ai/ChatGPT connectors is out of scope for now | decided |
| D5 | Local development on the **Local** site `essen.local` (§12) | decided |
| D6 | React SPA (Vite) as frontend | decided |
| D7 | Meal slots are a **fixed set**: Frühstück, Mittagessen, Abendessen, Snack. **Several entries per slot** allowed | decided |
| D8 | Imported old meal plans go into **Mittagessen** | decided |
| D9 | impeccable build path: **code-first** (no image comps) | decided |
| D10 | **Family-only app**: no public landing page, no open sign-up (registration disabled after the owner's account / invite-only) | decided (init) |
| D11 | **No households / multi-user sharing**: one planner account, family uses the same login | decided (init) |
| D12 | Grocery list is **used in the store**: check-off state persisted on the server. **No offline mode** (always online is fine) | decided (init, shape app-shell) |
| D14 | **Home = the week.** Installable web app (PWA) on Android + iPhone; **share target on Android**, paste-link fallback on iPhone. Phone, tablet and desktop all first-class | decided (shape app-shell) |
| D13 | UI voice: **"du"**; dark mode required | decided (init) |
| D18 | **API & Agenten:** no scope presets (rights picked per key; write implies read); setup snippets for Claude Code, Claude Desktop (via mcp-remote), other MCP clients and REST. **claude.ai web and ChatGPT need OAuth** (still out of scope, D4); the UI says so. Activity log with per-action undo (blocked when the target changed since), marks where it happened, avatar dot; 90-day retention. New scopes `shopping:read|write` | decided (shape api-agenten) |
| D19 | **Login & Geräte:** e-mail + password with "Angemeldet bleiben" (on by default → rolling 1-year session; off → ends with the browser). **New family devices pair** with a logged-in one: a 6-digit code or QR (10 min, single use), no password needed; paired devices stay logged in. Konto lists **Geräte** (sessions, log out one or all others) and **Name und E-Mail** (e-mail change needs the current password). No password change in Konto (reset mail instead), no web setup screen (owner comes from the import / `bin/console user:create`). Sessions are DB rows, not native PHP sessions | decided (shape login) |
| D17 | **Kochmodus:** propped-up reading at a distance; one step per screen; tap anywhere for next; per-step ingredients; no timers, no mise en place; "gekocht" stays derived from past plan entries (no explicit cooked events) | decided (shape kochmodus) |
| D16 | **Einkaufsliste:** days chosen per trip (default: planned days not yet shopped); one store with a user-defined section order; own extra items until bought; "Zuhause prüfen" with learned "meist da"; live list (plan changes print as "neu"); explicit "Einkauf abschließen" (undoable). Not chosen: several stores, two-phone live sync, "which recipe needs it" | decided (shape einkaufsliste) |
| D15 | **Wochenplan:** a plan entry is a recipe **or** free text (presets Reste · Essen gehen · Auswärts · Bestellen + recent own texts). **No per-entry servings, no notes**; grocery list uses recipe base servings. Mostly Mittagessen is planned; planning happens on the phone in one sit-down. **Wochenbeginn** (default Mo) and **Planungstag** (default Fr; home flips to next week from then) are user settings | decided (shape wochenplan) |
| – | Open questions | see §14 |

---

## 1. Target Architecture

```
                      ┌──────────────────────── all-inkl / Local ────────────────────────┐
 Browser (React SPA) ─┤ session cookie + CSRF ─┐                                          │
                      │                        ├─► /api/v1/*  REST ─┐                     │
 AI agents / scripts ─┤ Bearer API key ────────┤                    ├─► Services ─► MySQL │
 (Claude Code, Cursor,│                        └─► /mcp       MCP ──┘      ├─► media/     │
  VS Code, cron, …)   │                                                    └─► AI APIs    │
                      └──────────────────────────────────────────────────────────────────┘
```

**One service layer, three doors.** The SPA, the REST API and the MCP server call the same PHP services. Authorization, validation (JSON Schema) and business rules exist exactly once.

| Concern | Target |
|---|---|
| Runtime | PHP **8.2+** (Local ships 8.2.29; all-inkl: pick 8.2 or newer) |
| HTTP | Slim 4 (router + PSR-15 middleware) |
| DB | MySQL 8 via PDO; repositories with plain SQL; `migrations/*.sql` + `bin/console migrate` |
| Auth | DB-backed sessions (one row per device, D19) + CSRF for the browser; **generated API keys** (Bearer, scoped) for agents |
| Storage | `public/media/{userId}/…` + generated thumbnails |
| Frontend | React 18 + Vite + React Router + TanStack Query; built into `public/app/` |
| AI | PHP providers: OpenAI, Anthropic (`anthropic-ai/sdk`), OpenCode |
| MCP | Streamable HTTP, stateless. Draft 1 uses a small hand-rolled JSON-RPC server (`src/Mcp/`); `mcp/sdk` 0.9 installs but keeps sessions for the handshake era (BACKEND_REQUIREMENTS §9) |
| Mail | PHPMailer (Mailpit locally, all-inkl SMTP in production) |
| Jobs | `ai_jobs` table + cron `bin/console jobs:run` |

**Composer packages:** `slim/slim`, `slim/psr7`, `php-di/php-di`, `vlucas/phpdotenv`, `phpmailer/phpmailer`, `opis/json-schema`, `guzzlehttp/guzzle`, `anthropic-ai/sdk`, `mcp/sdk`, `intervention/image`; dev: `phpunit/phpunit`.
Each must support PHP 8.2; `composer install` in Phase 2 confirms this.

**Built in-house (was Laravel's job), each with tests:**
- Sessions as DB rows, one per device (D19). Cookie Secure/HttpOnly/SameSite=Lax; a fresh id on every login.
- CSRF token header.
- `password_hash`/`password_verify`. These accept Supabase's `$2a$` hashes; rehash on login.
- Password reset tokens (SHA-256 stored, 60 min, single use).
- Rate limits table.
- Migration runner.

**Repo layout** (new PHP app lives next to the old Next.js code until cutover):
```
essensplan/
├── public/            ← docroot (Local: junction target; all-inkl: domain docroot)
│   ├── index.php      ← Slim front controller: /api/v1, /mcp, SPA fallback
│   ├── .htaccess      ← Apache (all-inkl) only; nginx (Local) ignores it
│   ├── app/           ← Vite build output
│   └── media/         ← uploaded/imported images (gitignored)
├── src/               Http/, Mcp/, Service/, Repository/, Ai/, Schema/
├── frontend/          ← new React SPA source
├── migrations/  bin/console  tests/  composer.json  .env
├── app/ components/ lib/ supabase/ prisma/   ← old Next.js app, deleted at cutover
└── docs/
```

---

## 2. Phase 1 – Product & UX foundation with `impeccable` (drives everything else)

**Why first:** the redesign may restructure the app: navigation, which screens exist, what a "day" in the plan is, how the grocery list works, whether households exist. Those answers determine the schema, the REST endpoints and the MCP tools. So the backend is designed *after* the screens are confirmed.

### 2.1 Framing
- **Redesign, not refinement.** The current look (generic Tailwind blue, purple AI gradients) is *evidence and anti-reference*. Product truth, content and functions are kept; the visual world and screen structure may change.
- **Mode:** all screens are **Operate** (task completion in real scenes: collecting, planning, shopping, cooking). There is no Persuade surface (D10): logged-out users only see a login.
- **Status:** ✅ `init` done 2026-11-07, see [PRODUCT.md](../PRODUCT.md); `buildPath: code` in `.impeccable/config.json`. No DESIGN.md yet (created at the end from the shipped build).
- **Detector baseline** (7 hits):
  - AI purple gradients in `ImageEnhancementModal.tsx:90` and `ImageUploadSection.tsx:199`.
  - Bounce easing in `ai-import/LoadingOverlay.tsx:52,79`.
  - Accent border on rounded elements in `app/page.tsx:112` and `PageStateHandler.tsx:37`.

### 2.2 Steps

| Step | Command | Output | Backend impact |
|---|---|---|---|
| 1.1 | `/impeccable init` | **PRODUCT.md**: family roles (who plans, cooks, shops), usage scenes, principles, brand commitments, a11y, platform `web` (PWA). Also records `buildPath` (comp-first vs code-first) | Household yes/no; roles |
| 1.2 ✅ | `/impeccable critique` + `/impeccable audit` (done 2026-11-07: critique **17/40**, snapshot `.impeccable/critique/2026-11-07T08-47-01Z__app.md`, screenshots `.impeccable/review/critique-baseline/`; audit **7/20**) | P0: planning flow, grocery list in store. P1: hidden AI import with read-only preview, recipe wall without history filters. P2: no identity, dark mode, du-voice or a11y | Silent overwrite (upsert by date) → entries model; persisted grocery state; UTC date bug → Europe/Berlin |
| 1.3 ✅ | `/impeccable shape app-shell` (confirmed 2026-11-07; brief in `.impeccable/surfaces/frontend-src-app-appshell-tsx.md`: home = week; bottom bar Woche · Rezepte · ＋ · Einkauf; account behind header avatar; German routes; share target `POST /teilen`) | **Screen map & navigation**: top-level areas, entry points (share target, quick add). **Decides the home screen** (week board vs "Heute" vs other) | Route list, endpoint list |
| 1.4 ✅ | `/impeccable shape rezepte` (first surface: **create incl. AI import, search & filter, recipe detail**; recipes are the core per PRODUCT.md) → **new-work: choose the visual world**. Tone steer from the critique: *calm & utilitarian, with fun little details* | Surface brief + binding visual direction | Recipe fields, search/filter/sort, import flow, image handling |
| 1.4b ✅ | **Rezepte prototype** in `frontend/` (Vite + React, demo data, `npm run dev` → http://localhost:5173): list, recipe view with servings dial, capture/import flow, edit form. Finish review: *ship*. System recorded in [DESIGN.md](../DESIGN.md) + `.impeccable/design.json` | Confirms recipe fields, filters, plan-entry shape |
| 1.5a ✅ | `/impeccable shape wochenplan` (confirmed 2026-11-07; brief in `.impeccable/surfaces/frontend-src-features-woche.md`: home = 7 fixed day rows; planning mode = pinned key row of 7 day keys + presets, suggestion shelves, recipe list; pick → next empty day) | Surface brief | Entry = recipe XOR note; no servings; `seen_at`; suggestions endpoint; `week_start`/`planning_weekday` settings |
| 1.5b ✅ | **Wochenplan prototype** in `frontend/`: home week (7 fixed day rows, today line, LED strip), planning mode (day keys + presets, suggestion shelves, recipe list; pick → next free day), entry menu (open/move/remove), Konto settings Wochenbeginn + Planungstag, routes `/woche/:start`, `/konto` | Confirms entry shape, suggestions, settings |
| 1.5c ✅ | `/impeccable shape einkaufsliste` + **Einkauf prototype** (brief `.impeccable/surfaces/frontend-src-features-einkauf.md`): days picked per trip (pre-ticked = planned, not yet shopped), store section order ("Mein Laden"), Zuhause prüfen with "meist da", own items, live list with "neu" lines, strike in place, finish trip with undo | Trips, item state, manual items, section overrides/order, at-home counts |
| 1.5d ✅ | `/impeccable shape kochmodus` + **Kochmodus prototype** (brief `.impeccable/surfaces/frontend-src-features-kochen.md`): one step per screen read from a distance, tap anywhere / swipe / keys, ingredients per step (scaled), Wake Lock, servings carried from the dial. No timers, no mise en place, "gekocht" stays derived from the plan | `instructions.ingredient_ids` (AI import fills; text-match fallback); no cooked_events |
| 1.5e ✅ | `/impeccable shape api-agenten` + **prototype** (brief `.impeccable/surfaces/frontend-src-features-konto.md`): keys with rights picked per key (no presets; write implies read), show-once secret with setup for Claude Code / Claude Desktop (mcp-remote) / MCP / REST, activity log with undo and blocked-undo reason, agent marks on plan/recipes/shopping, avatar dot | Scopes + `shopping:*`; `api_keys.client`; `agent_activity.undo_payload/undone_at/seen_at`; undo + unseen endpoints |
| 1.5f ✅ | `/impeccable shape login` + **prototype** (brief `.impeccable/surfaces/frontend-src-features-login.md`): standby login (wordmark LED dark until you are in), "Angemeldet bleiben" rocker, pairing by code or QR (`/koppeln/:token`), forgot/reset, Konto → Geräte (sessions, pairing panel) and Name und E-Mail, "Abmelden" in the account menu, 401 → `/login?zurueck=` | `sessions` table with device label; `device_links`; pair, device-link, session endpoints; `PATCH /me` with `currentPassword` (D19, HANDOFF §4) |
| 1.6 (draft) | **Backend requirements extract** (written 2026-11-07 together with the first backend draft, branch `backend-draft`) | [docs/BACKEND_REQUIREMENTS.md](BACKEND_REQUIREMENTS.md): entities, fields, endpoints, MCP tools, error codes; deviations in its §9, open points in §10 | **Input for Phase 3**; waits for the owner's confirmation (gate below) |

**Gate:** PRODUCT.md, screen map, surface briefs, chosen visual direction and BACKEND_REQUIREMENTS.md are confirmed by you. Only then are the schema and API contract frozen.

### 2.3 Surfaces & UX questions that change the backend

| Surface | Product ideas (input for `shape`) | Questions with backend consequences |
|---|---|---|
| **App shell / navigation** | Bottom nav on mobile; maybe a "Heute" home (today's meals, cooking mode entry, shopping status) | Is there a dashboard endpoint (`/today`)? |
| **Wochenplan** | Week view with **meal slots per day**; quick add; drag and drop between days and slots; suggestions (top-rated, not cooked lately); copy last week; badge for agent-planned entries | Slots fixed (D7), several per slot. Free-text entries ("Reste", "Essen gehen")? Servings per entry? |
| **Rezept-Detail + Kochmodus** | Step-by-step full screen, Wake Lock, portion scaling, ingredient check-off, timers from step text | Store "cooked" events explicitly (instead of deriving from the plan)? |
| **Einkaufsliste** | Used **in the store** (D12): aggregate by ingredient and unit, scaled by entry servings; grouped by supermarket section; manual extra items; persisted check state; no offline mode (D12) | Persistent shopping list entity (likely yes, D12)? Section mapping (static, user-defined or AI-classified)? |
| **KI-Import** | Main entry point; **PWA Share Target** (link or photo from the phone); live progress; editable preview | Async jobs needed (progress states)? |
| **Rezeptliste** | Instant search; filter chips; thumbnail cards; sort by last cooked / rating | Full-text search (MySQL FULLTEXT)? |
| **Einstellungen → API & Agenten** | Key creation with scope presets; one-time reveal with copy-ready MCP snippets; revoke; activity log | Fixed by §6 |
| **Login / empty states** | Login only (no sign-up page, D10); password reset; device pairing; empty states for a fresh collection | Decided in D19. Registration disabled by config after the owner exists |

---

## 3. Phase 2 – Environment spike (runs in parallel with Phase 1)

### 3.1 Local (`essen.local`), see §12 for details
- [ ] Junction `app\public` → `C:\DEV\essensplan\public`; "hello Slim" answers on `http://essen.local/api/v1/health`
- [x] `composer install` works with Local's PHP 8.2.29 (checks package constraints). Verified 2026-11-07 with Local's php.exe on the CLI (all §1 packages, `config.platform.php` 8.2.29), not yet inside the site shell
- [ ] Database `essensplan` created on `127.0.0.1:10029`
- [ ] Mail via Local's Mailpit arrives
- [ ] `Authorization: Bearer` header reaches PHP through nginx
- [ ] MCP smoke test: `claude mcp add --transport http essensplan-local http://essen.local/mcp --header "Authorization: Bearer <key>"`, then call a test tool

### 3.2 all-inkl (production)
- [ ] PHP ≥ 8.2 per domain; extensions `pdo_mysql`, `mbstring`, `intl`, `curl`, `gd`, `fileinfo`, `openssl`, `sodium`
- [ ] SSH + composer (otherwise CI uploads `vendor/`); docroot can point to `essensplan/public`
- [ ] **`Authorization` header reaches PHP under Apache.** `.htaccess`: `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]`
- [ ] **`max_execution_time` / FastCGI timeout:** endpoint sleeping 150 s. Local allows 1200 s, so **only all-inkl reveals this limit**
- [ ] Cron available + minimum interval; upload limits ≥ 10 MB; outbound HTTPS to the AI APIs
- [ ] MySQL vs MariaDB version. Keep SQL compatible with both: JSON columns yes, no MySQL-only functions. (Schema and test suite verified 2026-11-07 on MySQL 8.4.0 and MariaDB 10.6.23 locally; all-inkl's version still to check)
- [ ] SMTP sender + SPF/DKIM
- [ ] Check which MCP protocol revisions `mcp/sdk` serves: the current spec 2026-07-28 is stateless ([release](https://github.com/modelcontextprotocol/specification/releases/tag/2026-07-28)), while older clients still send `initialize` (2025-11-25)

---

## 4. Phase 3 – Domain model & API contract (frozen after the Phase 1 gate)

This is the **draft**; Phase 1 may change it.

### 4.1 Schema (MySQL 8, utf8mb4)
```sql
users              id CHAR(36) PK, name, email UNIQUE, password_hash, email_verified_at,
                   week_start TINYINT DEFAULT 1 (Mo), planning_weekday TINYINT DEFAULT 5 (Fr) (D15),
                   created_at, updated_at
recipes            id VARCHAR(36) PK, user_id FK, title, description TEXT NULL, image_path NULL,
                   category, tags JSON, cooking_time INT NULL, servings INT NULL,
                   difficulty NULL, rating TINYINT NULL, source_url NULL,
                   created_via ENUM('app','import','api','mcp'), created_at, updated_at
                   INDEX(user_id, created_at), FULLTEXT(title, description)?
ingredients        id PK, recipe_id FK CASCADE, position, name, amount DECIMAL(10,3) NULL,
                   unit NULL, notes NULL, component NULL
instructions       id PK, recipe_id FK CASCADE, step_number, description TEXT, image_path NULL

meal_slots         id PK, key ENUM('breakfast','lunch','dinner','snack') UNIQUE, name ('Frühstück',
                   'Mittagessen','Abendessen','Snack'), position   ← fixed global set (D7), seeded once
meal_plan_entries  id CHAR(36) PK, user_id FK, date DATE, meal_slot_id FK,
                   recipe_id FK NULL, note VARCHAR(80) NULL ('Reste', 'Essen gehen'), position INT,
                   created_via ENUM('app','api','mcp'), seen_at NULL (api/mcp entries, D15),
                   created_at, updated_at
                   INDEX(user_id, date)  CHECK((recipe_id IS NULL) <> (note IS NULL))
                   ← on recipe delete (app logic): note = recipe title, recipe_id = NULL
                   ← no per-entry servings (D15); free text never counts as cooked
                   ← several entries per slot allowed (main + side), ordered by position

api_keys           id CHAR(36) PK, user_id FK, name, prefix CHAR(12), key_hash CHAR(64) UNIQUE,
                   scopes JSON, last_used_at NULL, last_used_ip NULL, expires_at NULL,
                   revoked_at NULL, created_at
agent_activity     id, user_id, api_key_id, channel ENUM('rest','mcp'), action, target_type,
                   target_id, summary, created_at
ai_usage           id, user_id, api_key_id NULL, feature, provider, model, input_tokens,
                   output_tokens, duration_ms, success, created_at      ← TODO.md analytics
ai_jobs            id, user_id, type, status, progress, input JSON, result JSON, error,
                   created_at, finished_at
sessions           (D19) id hash, user_id, remember, device_label, user_agent, ip, via, created_at,
                   last_seen_at, expires_at   ← listed and revocable in Konto → Geräte
device_links       (D19) code_hash, token_hash, created_by_session, expires_at, used_at, used_by_session
password_resets, rate_limits, schema_migrations
(+ shopping_list_items / households if Phase 1 decides so)
```

**Notes:**
- **Multiple meals per day:**
  - The old `UNIQUE(userId, date)` is gone. An entry = date + slot + recipe or note.
  - Moving an entry = updating `date`/`meal_slot_id`.
  - "Cooked" statistics (`timesCooked`, `lastCooked`) count past entries with a recipe.
- **`ON DELETE SET NULL`** for the recipe: deleting a recipe no longer silently deletes plan history. The entry keeps its date and shows "Rezept gelöscht".

### 4.2 REST API `/api/v1` (SPA *and* agents)

| Method | Route | Scope (API key) |
|---|---|---|
| POST | `/auth/login`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password` (`/auth/register` only while `REGISTRATION_ENABLED=true`, D10) | session only |
| POST / GET / DELETE | `/auth/pair`, `/auth/device-links[/{id}]`, `/auth/sessions[/{id}]`, `/auth/sessions/revoke-others` (D19, details in HANDOFF §4) | session only |
| GET/PATCH | `/me` | `profile:read` |
| GET | `/recipes?q&category&tags[]&maxTime&minRating&notCookedSince&sort&limit&cursor` | `recipes:read` |
| GET | `/recipes/{id}` | `recipes:read` |
| POST / PUT / PATCH | `/recipes`, `/recipes/{id}` | `recipes:write` |
| DELETE | `/recipes/{id}` | `recipes:delete` |
| GET | `/meal-slots` (fixed set) | `mealplan:read` |
| GET | `/meal-plan?from&to` → days → slots → entries | `mealplan:read` |
| POST | `/meal-plan/entries` `{date, slotId, recipeId \| note}` | `mealplan:write` |
| PATCH | `/meal-plan/entries/{id}` `{date?, slotId?, position?}` (move, reorder) | `mealplan:write` |
| DELETE | `/meal-plan/entries/{id}` | `mealplan:write` |
| GET | `/meal-plan/presets` (fixed + 4 most recent own texts) | `mealplan:read` |
| GET | `/suggestions?date&slot` → shelves `[{reason, recipes[]}]` (lange her, Lieblinge, schnell; ±14-day exclusion) | `recipes:read` |
| GET | `/grocery-list?from&to` (aggregated, scaled by recipe base servings) | `mealplan:read` |
| POST | `/images` (multipart) | `recipes:write` |
| POST | `/ai/import`, `/ai/enhance-image` · GET `/ai/jobs/{id}` | `ai:use` |
| GET/POST/DELETE | `/api-keys` · GET `/agent-activity` | session only |
| GET | `/config`, `/openapi.json`, `/health` | public |

Errors use one format: `{"error":{"code":"…","message":"…"}}`. The existing `ErrorCode` enum is ported.

### 4.3 Security (replaces RLS)
- Every repository method requires `$userId`; there is no unscoped "find by id".
- Cross-user tests (session **and** API key) are written first.
- Middleware order: `JsonErrors → RateLimit → Authenticate (session | key) → RequireScope → Csrf (session only)`.
- Uploads: `finfo` check, re-encode with GD (strips EXIF), max 2000 px, random names.
- URL import: SSRF guard (http/https only, block private and loopback IPs, size and redirect caps).
- HTTPS + HSTS in production.

---

## 5. Phase 4 – Backend build

**Draft 1 (2026-11-07, branch `backend-draft`):** steps 1–3 and 5–7 are drafted and tested (private MySQL 8.4 / MariaDB 10.6 instances and `php -S`, not yet the Local site). Step 4: recipes, plan, shopping and suggestions are in; images with variants are not (Phase 6). `import:supabase` is not written (Phase 8).
1. Skeleton:
   - Slim app, container, `.env`, `JsonErrors` middleware.
   - `bin/console` (`migrate`, `jobs:run`, `import:supabase`).
2. Migrations from §4.1. Seed the four fixed meal slots once.
3. Auth: register/login/logout, sessions, CSRF, password reset (Mailpit locally), rate limits.
4. Services + repositories: recipes (transactional create/update), meal plan entries, grocery aggregation, images with variants (`thumb` 400 px, `medium` 1000 px).
5. API keys (§6) + `agent_activity` logging.
6. `openapi.json`, generated from the same JSON Schemas.
7. PHPUnit: cross-user isolation, auth flows, grocery aggregation (unit conversion, servings scaling), key scopes.

---

## 6. API keys
- **Create** (Einstellungen → API & Agenten): name, scope preset (**Nur lesen** / **Planen** / **Vollzugriff**) or custom scopes, optional expiry.
- **Format and storage:** `esp_` + 40 chars base62 from `random_bytes(30)`. Only `sha256(key)` and a 12-char `prefix` are stored. High-entropy keys make a fast hash correct here.
- **Shown once,** with copy-ready snippets:
  - `claude mcp add --transport http essensplan https://<domain>/mcp --header "Authorization: Bearer esp_…"`
  - Cursor/VS Code `mcp.json`
  - a `curl` example.
- **Use:**
  1. `Authorization: Bearer esp_…`; look up by hash.
  2. Check `revoked_at`/`expires_at`.
  3. Update `last_used_at`.
  4. Check scopes per route or tool.
- **Scopes:** `profile:read`, `recipes:read`, `recipes:write`, `recipes:delete`, `mealplan:read`, `mealplan:write`, `ai:use` (off by default; costs tokens).
- **Transparency:** every write is logged in `agent_activity` ("*Claude Code Laptop* hat Lasagne für Di, Abendessen geplant"). Entries and recipes carry `created_via`.
- **Revoke** takes effect immediately.
- **OAuth** (for claude.ai/ChatGPT connectors) is out of scope (D4). The scope model is designed so OAuth tokens could map onto it later.

---

## 7. Phase 5 – MCP server
- **Endpoint:** `/mcp`, Streamable HTTP. Each message is a `POST` with a JSON-RPC body; responses are `application/json`. `GET /mcp` → 405 (no server-push stream; not needed for tools).
- **Stateless,** matching spec 2026-07-28, which suits PHP's request/response model. Older clients' `initialize` (2025-11-25) is still answered.
- **Auth:** Bearer API key; `401` + `WWW-Authenticate` when missing. Validate the `Origin` header if present.
- **Implementation:** `mcp/sdk` `StreamableHttpTransport` behind the `/mcp` route. Fallback: a hand-rolled JSON-RPC dispatcher (`initialize`, `tools/list`, `tools/call`, `ping`, version negotiation; ~200 lines).

| Tool | Scope | Annotation | Purpose |
|---|---|---|---|
| `search_recipes` | recipes:read | readOnly | Query, category, tags, max time, min rating, not cooked since; compact list + cooking stats |
| `get_recipe` | recipes:read | readOnly | Full recipe |
| `create_recipe` | recipes:write | – | Agent saves a recipe it extracted itself (same schema as AI import) |
| `update_recipe` | recipes:write | idempotent | Partial update |
| `delete_recipe` | recipes:delete | destructive | Delete |
| `list_meal_slots` | mealplan:read | readOnly | Slots of this user |
| `get_meal_plan` | mealplan:read | readOnly | Days → slots → entries for a date range |
| `add_meal` | mealplan:write | – | `{date, slot, recipeId \| note}` → entry id |
| `suggest_meals` | recipes:read | readOnly | Same shelves as `/suggestions` |
| `move_meal` | mealplan:write | idempotent | Entry to another date and/or slot |
| `remove_meal` | mealplan:write | destructive | Remove entry |
| `get_grocery_list` | mealplan:read | readOnly | Aggregated, servings-scaled, grouped |
| `import_recipe_from_url` | ai:use + recipes:write | – | Server-side AI import (async job if needed, + `get_import_status`) |

**Prompts:** `plan_week` (e.g. "no repeats from the last 14 days, vegetarian lunches, quick dinner on Wednesday") and `shopping_for_week`.

**Safety:**
- Imported web text is untrusted. It's returned as data fields and length-capped.
- Read-only presets.
- Destructive annotations.
- Per-key rate limit and an optional daily write cap.

---

## 8. Phase 6 – AI features in PHP
- **Structure** (`src/Ai/`):
  - `RecipeExtractor` and `ImageEnhancer` interfaces.
  - `OpenAiProvider` (Responses API, strict json_schema).
  - `AnthropicProvider` (`anthropic-ai/sdk`, `output_config.format` json_schema; default `claude-opus-5-5`, effort `low`; switchable to `claude-sonnet-5-5` / `claude-haiku-4-5`).
  - `OpenCodeProvider` (OpenAI-compatible chat completions, `json_object`).
  - `UrlContentFetcher`, `RecipeNormalizer` (ports the existing unwrap and `reasoning_content` fallbacks).
  - `AiManager` (picks the provider, logs `ai_usage`).
- **One schema:** `src/Schema/recipe.schema.json` validates AI output, `POST /recipes` and MCP `create_recipe`.
- **URL import:**
  1. SSRF-safe fetch.
  2. **Extract schema.org `Recipe` JSON-LD** (most recipe sites have it); fall back to stripped page text.
  3. Structured-output call; validate (one retry with the errors fed back). Set `sourceUrl` server-side.
  4. Download, re-encode and store the image; return a temp ID.
  - The pipeline is identical for all providers, so there's no dependency on OpenAI's web search.
- **Photo import:** client-side downscale to ~1600 px. Anthropic base64 image block / OpenAI `input_image` / OpenCode `image_url`.
- **Image enhancement:** OpenAI `gpt-image-1` only. Independent of the text provider via `AI_IMAGE_PROVIDER`; exposed in `/config`.
- **Long requests:** if all-inkl allows ~150 s, run synchronously. Otherwise:
  1. `ai_jobs` row created.
  2. Cron `jobs:run` processes it.
  3. Client polls; the UI shows progress steps (fits the import design from Phase 1).
- **Cost:** `ai_usage` per user and key, rate limits, optional monthly cap.

```env
AI_PROVIDER=anthropic          # openai | anthropic | opencode
AI_IMAGE_PROVIDER=openai       # empty = enhancement off
ANTHROPIC_API_KEY=   ANTHROPIC_MODEL=claude-opus-5-5   ANTHROPIC_EFFORT=low
OPENAI_API_KEY=      OPENAI_MODEL=gpt-5-mini           OPENAI_IMAGE_MODEL=gpt-image-1
OPENCODE_API_KEY=    OPENCODE_MODEL=glm-5.2            OPENCODE_IMAGE_MODEL=kimi-k3
```

---

## 9. Phase 7 – Frontend build in the new design
Screens are **built new in the chosen visual world**; we don't port the old screens.

1. **Reuse logic, not markup:**
   - Port the data access (`lib/supabase.ts` → `lib/api.ts`), contexts and form logic (React Hook Form + Zod).
   - Grocery aggregation moves to the server.
2. `frontend/` with Vite + React Router + TanStack Query; build to `public/app/`. Locally, the Vite dev server proxies `/api` and `/mcp` to `http://essen.local` (§12).
3. **Per surface, in the order from the screen map:** build → run the detector once → `/impeccable harden`, `onboard`, `clarify` for that surface.
4. PWA: manifest, minimal service worker (installability only, no offline, D12), **Share Target** for the import (Android; POST handled server-side).
5. New screen **API & Agenten** (§6).

---

## 10. Phase 8 – Data migration & cutover
1. **Importer** `bin/console import:supabase`, run locally:
   - Enable `extension=php_pdo_pgsql.dll` in the Local site's `conf/php/php.ini.hbs`; the DLL ships with Local.
   - Connect to Supabase via `DIRECT_URL`.
   - `auth.users`: keep IDs and bcrypt hashes, so users keep their passwords.
   - Copy recipes, ingredients and instructions.
   - **Old `MealPlan` rows → `meal_plan_entries`:** convert the date to Europe/Berlin and assign slot **Mittagessen** (D8).
   - Download the `recipe-images` bucket (service role key), re-encode, create variants, rewrite paths.
2. **Dry run** into the Local DB; compare counts per user and spot-check in the new UI.
3. **Cutover:**
   1. Freeze writes (maintenance page on Vercel).
   2. Final import → `mysqldump` → import on all-inkl; rsync `public/media/`.
   3. Switch the domain, smoke-test.
4. **Rollback:** Supabase and Vercel paused (not deleted) for 4 weeks.
5. **Deploy** (GitHub Actions):
   1. `composer install --no-dev -o`, `npm ci && npm run build`.
   2. rsync/SFTP.
   3. `php bin/console migrate`.
6. Delete the old Next.js code, `supabase/` and `prisma/`; update `CLAUDE.md` and `README.md`.

---

## 11. Phase 9 – Finish
1. `/impeccable adapt`, `animate`, `optimize` (cross-cutting).
2. `/impeccable live` for in-browser fine tuning (`http://essen.local` or the Vite dev server).
3. `impeccable-finish-reviewer` → `/impeccable polish` (one pass).
4. `/impeccable document` → **DESIGN.md** from the shipped build.

---

## 12. Local development environment ("Local" site `essen`)

| Item | Value |
|---|---|
| URL | `http://essen.local/` |
| Docroot | `C:\Users\Nils\Local Sites\essen\app\public` (currently empty, so the site answers 403) |
| Web server | nginx 1.26. Already routes every non-file request to `index.php` (`try_files $uri $uri/ /index.php$is_args$args`), which is exactly what the Slim front controller needs. **Dotfiles are blocked** (`location ~ /\.`); `.htaccess` is ignored locally |
| PHP | 8.2.29 (Local offers 8.2.x only); `max_execution_time` 1200, `fastcgi_read_timeout` 1200 s; `gd`, `imagick`, `intl`, `sodium`, `pdo_mysql`, `opcache` loaded; `php_pdo_pgsql.dll` present but **not enabled** |
| Composer | Bundled with Local (in PATH of the Local site shell / `.envrc`) |
| DB | MySQL 8.4.0 at `127.0.0.1:10029`, `root`/`root`. Existing DB `local`; create **`essensplan`** for this app |
| Mail | Local's Mailpit (port shown in Local → Tools → Mailpit) |

**Setup (Phase 2):**
1. Replace the empty docroot with a junction to the repo's `public/`:
   `cmd /c rmdir "C:\Users\Nils\Local Sites\essen\app\public"` then
   `cmd /c mklink /J "C:\Users\Nils\Local Sites\essen\app\public" "C:\DEV\essensplan\public"`.
   PHP resolves `__DIR__` to the real path, so `../vendor` and `../src` work.
2. `.env`:
   ```env
   APP_URL=http://essen.local
   DB_HOST=127.0.0.1
   DB_PORT=10029
   DB_NAME=essensplan
   DB_USER=root
   DB_PASS=root
   MAIL_HOST=127.0.0.1
   MAIL_PORT=<mailpit smtp port>
   ```
3. `composer install`, `php bin/console migrate`.
4. Frontend dev: `npm run dev` in `frontend/` (Vite on :5173, proxy `/api` and `/mcp` → `http://essen.local`, so cookies stay same-origin). For the integrated check: `npm run build` → `http://essen.local/`.
5. MCP: create a key in the local UI, then `claude mcp add --transport http essensplan-local http://essen.local/mcp --header "Authorization: Bearer esp_…"`.

**Local ≠ production:**
- nginx locally, Apache with `.htaccess` on all-inkl.
- Local's generous timeouts hide all-inkl limits.

Both are covered by the all-inkl checks in §3.2.

---

## 13. Risks

| Risk | Mitigation |
|---|---|
| UX decisions arrive late and force schema changes | UX-first order; backend contract frozen only after the Phase 1 gate |
| Hosting timeouts kill AI requests (invisible locally) | all-inkl spike; async jobs |
| `Authorization` header stripped (Apache) | `.htaccess` rewrite, tested on all-inkl |
| Authorization bugs without RLS and without a framework | `$userId` mandatory everywhere; cross-user tests for session + key |
| Hand-built session/CSRF/reset code | Small, isolated, tested; OWASP cheat sheets |
| PHP 8.2 locally vs newer on all-inkl | Write for 8.2, CI runs tests on 8.2 + production version |
| MCP spec/client version mismatch | Verify `mcp/sdk`; hand-rolled fallback negotiates both revisions |
| Agent misuse / prompt injection | Scopes, presets, destructive annotations, activity log, rate limits |
| Old meal plans land on the wrong day | Europe/Berlin conversion; count checks (slot is fixed to Mittagessen, D8) |
| Lost `next/image` optimization | Thumbnail variants at upload |

---

## 14. Open decisions

1. **Default AI provider and model:** Anthropic `claude-opus-5-5` (effort low), Sonnet 5.5, OpenAI or OpenCode? (All stay switchable.)
2. ~~Free-text entries and per-entry servings~~: decided (D15).
3. ~~Grocery list details~~: decided (D16).
