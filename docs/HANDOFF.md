# Handoff: first backend draft (PHP / Slim 4 / MySQL)

Written 2026-11-07 for an agent picking this up without the earlier conversation.

> **Historical.** The app has been live on all-inkl since 2026-11-08. The families are imported, and the old Next.js/Supabase app, the importer and the FTP deploy with its `/ops` door are removed. Deploys go over SSH. For the current state, read [CLAUDE.md](../CLAUDE.md), [MIGRATION_PLAN.md](MIGRATION_PLAN.md) (status line) and [DEPLOY.md](DEPLOY.md). The constraint "do not modify the old Next.js app" below no longer applies.

## 1. Where things stand

Essensplan is a German family meal planner. It is being moved off Next.js/Supabase/Vercel to a self-hosted PHP app on all-inkl. **[docs/MIGRATION_PLAN.md](MIGRATION_PLAN.md) is the master plan.** The work is UX-first: each screen was shaped and prototyped before any backend was written.

**Done (Phase 1, UX):**
- Product context: [PRODUCT.md](../PRODUCT.md).
- Visual system: [DESIGN.md](../DESIGN.md) and `.impeccable/design.json`.
- Seven surface briefs in `.impeccable/surfaces/`:
  - App-Shell, Rezepte, Wochenplan, Einkauf, Kochmodus, API & Agenten (`…-konto.md`), Login & Geräte (`…-login.md`).
- A clickable prototype in `frontend/` (Vite + React 18 + react-router 6, no backend).
  - `frontend/src/lib/api.ts` is a **mock API on localStorage**. Its function signatures and the types in `frontend/src/lib/types.ts` are the de-facto contract the real API has to serve.
  - Run it: `cd frontend && npm install && npm run dev` (http://localhost:5173).

**Login surface: done** (2026-11-07, brief `.impeccable/surfaces/frontend-src-features-login.md`). Login, pairing by code/QR, password reset, Konto → Geräte and Name und E-Mail are in the prototype. The mock is `frontend/src/lib/auth.ts`; its functions are the contract for `/api/v1/auth/*` and `/me`. See the "Auth and devices" delta in §4.

**Backend draft 1: done** (2026-11-07, branch `backend-draft`, not merged). Everything in §2 except the PR itself is built; [BACKEND_REQUIREMENTS.md](BACKEND_REQUIREMENTS.md) describes it, with what was verified where at the top, deviations in §9, open points in §10 and how to run it in §11. Next: the owner reviews it, then the Local site spike (MIGRATION_PLAN §3.1) and wiring the SPA to the real API.

**Local deployment and SPA wiring: done** (2026-11-07). http://essen.local serves the API, MCP and the built SPA (`npm run build` in `frontend/`); the SPA uses the real API, also in `npm run dev` (proxy to essen.local). A demo family is seeded locally (nils@familie.de / essensplan-lokal). The prototype's localStorage mock is gone; `lib/demo-data.ts` only feeds the import demo now.

**Photos and the Supabase importer: done** (2026-11-07). `POST /images` stores re-encoded photos with a 400 px thumbnail (`thumbUrl` on recipes); the SPA uploads on save. `bin/console import:supabase` copies the old app's families (ids and bcrypt hashes kept, photos downloaded, old plans → Mittagessen); a dry run into the Local DB matched every count. See BACKEND_REQUIREMENTS §4.3.1 and §7.1. Next: the owner spot-checks the imported data, then Phase 6 (AI import).

**Photos protected, AI import, FTP deploy: done** (2026-11-08):
- Photos moved to `storage/media/` (outside the docroot). `/media/…` now goes through PHP and serves a photo only to its family's session or a key with `recipes:read` (BACKEND_REQUIREMENTS §4.3.1). Locally they were moved with `bin/console media:move`.
- Phase 6: `POST /ai/import` (link or photo) → job → draft. Providers: OpenCode (default), Anthropic, OpenAI. The SPA capture flow and MCP `import_recipe_from_url` use it (§4.7). Tested with a fake provider only.
- `./deploy.sh`: FTPS upload, no SSH or Composer on the server; migrations and console commands via `/ops` with `OPS_TOKEN`, cron via `/cron?token=` (§4.8, [DEPLOY.md](DEPLOY.md)).
- 67 tests green.

Next: try the import with real links and photos per provider, then the first deploy to all-inkl (`./deploy.sh --push-config`, then `--check`).

## 2. Your task

Produce a **first working draft of the PHP backend** on a branch (suggested name: `backend-draft`), opened as a PR against `main`. Do not merge it.

### Steps, in this order
1. **Write `docs/BACKEND_REQUIREMENTS.md`**, consolidated from:
   - the "Backend consequences" / "Backend impact" sections of every brief in `.impeccable/surfaces/`;
   - decisions D1–D18 in MIGRATION_PLAN.md §0;
   - MIGRATION_PLAN.md §4 (schema/REST), §6 (API keys), §7 (MCP);
   - the mock API and types in `frontend/src/lib/`.

   It must list the entities, fields, endpoints and MCP tools, with scopes, error codes and an "Assumptions / open" section. Where sources conflict, apply §4 of this file.
2. **Skeleton:**
   - `composer.json` (packages per MIGRATION_PLAN §1);
   - `public/index.php` (Slim front controller for `/api/v1`, `/mcp`, SPA fallback);
   - `public/.htaccess` (including the `HTTP_AUTHORIZATION` rewrite);
   - `src/` (Http/, Service/, Repository/, Mcp/, Ai/, Schema/), PHP-DI container;
   - `.env.example`;
   - a `JsonErrors` middleware;
   - `bin/console` with `migrate`.
3. **Migrations** `migrations/*.sql` (MySQL 8, utf8mb4; MariaDB is not a target, D21). Seed the four meal slots.
4. **Auth (backend only):**
   - session login/logout;
   - CSRF header;
   - `password_verify` accepting `$2a$`/`$2y$` with rehash on login;
   - password reset tokens (SHA-256 stored, 60 min, single use; mail sending can be a logged stub);
   - ~~`REGISTRATION_ENABLED` switch~~ (dropped with D20: no sign-up over HTTP; families are added with `bin/console user:create`);
   - rate limits table.
5. **Domain services and REST**, one service layer shared by REST and MCP:
   - recipes, including search by title **and** ingredient, the filters and `cookingStats`;
   - meal plan entries;
   - presets, suggestions, settings;
   - shopping (trips, line state, manual items, section order and overrides, "meist da" counts, complete/reopen);
   - API keys;
   - agent activity with undo.
6. **API-key auth** (Bearer `esp_…`, sha256 lookup, scopes per route) and `agent_activity` logging on every key-authenticated write.
7. **MCP server** at `/mcp` (stateless Streamable HTTP; tool list in MIGRATION_PLAN §7 plus the shopping tools in §4 of this file). Try `mcp/sdk` first; the hand-rolled JSON-RPC fallback is acceptable.
8. **`openapi.json`** generated from the same JSON Schemas used for validation.
9. **PHPUnit:**
   - cross-user isolation for both session and key (write these first);
   - scopes;
   - grocery aggregation;
   - suggestions;
   - `defaultWeekStart` (planning-day flip);
   - undo safety.

**Out of this draft:**
- the AI providers, beyond interfaces and the `ai_jobs` table (Phase 6);
- the Supabase importer (Phase 8);
- wiring the React prototype to the real API;
- PWA / share target;
- anything all-inkl-specific that needs the real host.

## 3. Hard constraints
- **PHP 8.2**, no Laravel (D1). Slim 4 + PDO + plain SQL repositories.
- **Every repository method takes `$userId`.** There is no unscoped find-by-id; this replaces Supabase RLS.
- **JSON:**
  - camelCase, matching `frontend/src/lib/types.ts`;
  - dates are `YYYY-MM-DD` in **Europe/Berlin**, timestamps are ISO 8601;
  - errors use `{"error":{"code":"…","message":"…"}}`.
- **User-visible messages are German, "du" voice.** Reuse the exact strings the prototype shows, e.g. the undo-blocked reasons in `api.ts`.
- **Middleware order:** `JsonErrors → RateLimit → Authenticate (session | key) → RequireScope → Csrf (session only)`.
- **API keys:**
  - format `esp_` + random base62;
  - store only the sha256 hash and a 12-char prefix;
  - return the secret exactly once.
- **Never commit secrets.** `.env` is gitignored; ship `.env.example` only.
- **Do not modify:**
  - the old Next.js app (`app/ components/ lib/ supabase/ prisma/`), which stays until cutover;
  - `frontend/`, except for reading it;
  - DESIGN.md and PRODUCT.md.

## 4. Where later decisions override MIGRATION_PLAN §4/§6/§7

§4–§7 of the plan were drafted before the surface work. **The briefs and D15–D18 win.** Known deltas:

**Users**
- Add `week_start` TINYINT (0–6, default 1), `planning_weekday` TINYINT (default 5) and `section_order` JSON.
- Weekdays are numbered as in JS `getUTCDay()`: 0 = Sonntag.
- The home week flips to next week from the planning day on. See `defaultWeekStart` in `api.ts`.

**Recipes**
- `ingredients.section` is set on save from a word list. Port `classify()` and `SECTIONS` from `frontend/src/lib/shopping.ts`.
- `instructions.ingredient_ids` is JSON NULL. When it is NULL, the frontend falls back to matching ingredient names in the step text (`lib/cooking.ts`); the backend only stores the IDs.
- Deleting a recipe keeps its plan entries: the title is copied into `note` and `recipe_id` is set to NULL.

**Meal plan entries**
- `recipe_id` XOR `note` (CHECK).
- No `servings` column.
- Add `seen_at` and `created_via`.
- Move with `PATCH {date, slot, position}`.

**Presets**
- The fixed list is `Reste · Essen gehen · Auswärts · Bestellen`.
- After it come the 4 most recent app-created own notes, excluding recipe titles and the fixed ones. See `planPresets()`.

**Suggestions**
- `GET /suggestions?weekStart&slot` returns the shelves `langeher`, `lieblinge` and `schnell`.
- Exclude recipes planned within ±14 days of the week. Each recipe appears on one shelf at most, 8 per shelf.
- Slot→category mapping and scoring are in `suggestions()` / `lovedScore()`.
- The same logic backs MCP `suggest_meals`.

**Shopping** (replaces `/grocery-list`)
- Tables: `shopping_trips`, `shopping_item_state`, `shopping_manual_items` (with `created_via`), `section_overrides`, and a per-name_key "da" counter.
- Plan-derived lines are **computed live, never stored**:
  - aggregate on the base name with unit families g/kg and ml/l;
  - port `aggregate()`, `baseName()` and `nameKey()` from `lib/shopping.ts`;
  - scale by the recipe's base servings only.
- **Trip lifecycle:**
  - The default days are planned days in the next 14 that are not yet shopped.
  - An untouched trip follows the plan.
  - Complete removes bought manual items.
  - Reopen undoes a completion.
  - "neu" marks lines not yet seen.
  - The reference behaviour is `openTrip`, `buildLines`, `completeTrip` and `reopenTrip`.
- **REST:** `GET /shopping/current`, `POST /shopping/trips`, `PATCH /shopping/items/{key}`, `POST|DELETE /shopping/manual-items`, `POST /shopping/trips/{id}/complete` (+ reopen), `GET|PUT /shopping/section-order`.
- **MCP:** `get_grocery_list`, `add_grocery_item`.

**Scopes (D18)**
- The full set is `recipes:read|write|delete`, `mealplan:read|write`, `shopping:read|write` and `ai:use`; `profile:read` is implicit.
- **No presets.** Write implies read.
- §6's "Nur lesen / Planen / Vollzugriff" presets are dropped.

**API keys**
- Add `client` ENUM(`claude-code`, `claude-desktop`, `mcp`, `rest`). It is only a label for the setup snippet.
- Optional expiry: 30 days, 1 year or none.
- If no name is given, the fallback is "Schlüssel vom 7. Nov.".

**Agent activity**
- Add `undo_payload` JSON, `undone_at`, `seen_at`, and a target (type, id, label).
- Endpoints, all session only:
  - `POST /agent-activity/{id}/undo`, which refuses when the target changed since: compare the `updated_at` recorded in the payload;
  - `GET /agent-activity/unseen-count`;
  - `POST /agent-activity/seen` (all, or the given ids).
- **Undo kinds** (the prototype implements the first three):
  - `plan.remove`;
  - `shopping.remove`;
  - `recipe.restore` (previous version);
  - `recipe.undelete`;
  - `plan.move` (move back).
- The "vom Agenten geändert" recipe mark is derived from unseen, not-undone activity on that recipe.
- Retention: 90 days.

**Auth and devices** (D19, Login brief)
- **`sessions` table** (DB-backed, so devices can be listed and logged out remotely): id (store a hash of the cookie value), user_id, remember, device_label (derived from the User-Agent, e.g. "iPhone · Safari"), user_agent, ip, via ENUM(`password`, `pairing`, `reset`), created_at, last_seen_at, expires_at.
  - "Angemeldet bleiben" on (the default): persistent cookie, rolling 1 year from last use. Off: a browser-session cookie; the row expires after a short idle time.
  - Paired devices always get a lasting session.
- **`device_links` table** (pairing a new device): code_hash (6 digits), token_hash (for the QR URL `/koppeln/{token}`), created_by_session, expires_at (+10 min), used_at, used_by_session. Single use; one open link per user (a new one replaces the old).
  - Wrong codes count against **all open links**; after 5 misses they are spent ("Zu viele falsche Codes. …"). Also rate-limit `POST /auth/pair` per IP.
- **Endpoints:**
  - `POST /auth/login {email, password, remember}`; `POST /auth/logout`.
  - `POST /auth/pair {code}` or `{token}` (logged out; creates a session).
  - `POST /auth/device-links` → `{id, code, token, expiresAt}`; `GET /auth/device-links/{id}` → adds `usedAt, usedByLabel` (the trusted device polls it every second); `DELETE /auth/device-links/{id}`.
  - `GET /auth/sessions` (with `current: true` on this device); `DELETE /auth/sessions/{id}`; `POST /auth/sessions/revoke-others`.
  - `POST /auth/forgot-password {email}` always answers 204 (no enumeration); `POST /auth/reset-password {token, password, revokeOthers}` logs this device in. Minimum password length 10.
  - `PATCH /me {name, email, currentPassword}`; `currentPassword` is required only when the e-mail changes.
  - All session-only (never with an API key).
- **Error codes and messages:** reuse the strings in `lib/auth.ts` (`invalid_credentials` "E-Mail oder Passwort stimmt nicht.", `rate_limited`, `invalid_code`, `code_spent`, `link_expired`, `reset_invalid`, `weak_password`, `wrong_password`, `invalid_email`).
- **401 → `/login?zurueck=<path>`**; the SPA returns there after login.
- **No password change in Konto.** It goes through the reset mail ("Link schicken"). No web setup screen: the owner account comes from the Supabase import, with `bin/console user:create` as fallback.

**In-app undo toasts need server support too.** Pick an approach and record it in BACKEND_REQUIREMENTS:
- restore a removed plan entry;
- restore a deleted recipe together with its entries (suggestion: `deleted_at` soft delete, purged later);
- un-revoke a key (suggestion: allowed within a few minutes of revoking);
- restore a removed manual item;
- reopen a completed trip.

**MCP prompts:** `plan_week` must read `week_start` and `planning_weekday` so it targets the right days.

## 5. Environment

The owner develops on Windows with the "Local" app: `http://essen.local`, MySQL 8.4 at `127.0.0.1:10029` (root/root), nginx, PHP 8.2.29. Details are in MIGRATION_PLAN §12. **That is not available in a cloud sandbox.** There:
- Install PHP 8.2+ (with `pdo_mysql mbstring intl curl gd sodium`), Composer, and MySQL 8 if missing.
- Run tests against a real database. Read the connection from env vars (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`); tests use their own `DB_NAME`.
- Don't swap in SQLite: the schema relies on MySQL JSON, CHECK and FULLTEXT.
- `php -S localhost:8080 -t public` is enough for smoke tests.

## 6. Definition of done for this draft
- `composer install`, `php bin/console migrate` and `vendor/bin/phpunit` all pass on a clean database.
- The following work with a session and with a scoped key:
  - `curl` against `/api/v1/health`, recipes CRUD, plan entries, suggestions and `/shopping/current`;
  - `/mcp` answers `initialize`, `tools/list` and one `tools/call`.
- `docs/BACKEND_REQUIREMENTS.md` exists and matches what was built. Deviations and open questions are listed at its end for the owner.
- **Update MIGRATION_PLAN.md:**
  - the status line;
  - step 1.6 marked as a draft;
  - Phase 2/4 checkboxes ticked where they were actually verified, saying where (sandbox vs Local).
- The PR description lists what is stubbed, what is untested against Local/all-inkl, and the decisions you made that the owner should confirm.

## 7. Still open for the owner (don't block on these; choose a default and note it)
- **Default AI provider/model** (MIGRATION_PLAN §14.1). Not needed for this draft.
- **Undo windows** for the in-app toasts (§4 above).
- ~~Login surface~~: done, see "Auth and devices" in §4.
