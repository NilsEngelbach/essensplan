# Backend requirements (draft 1)

Written 2026-11-07 (step 1.6 of [MIGRATION_PLAN.md](MIGRATION_PLAN.md)). Consolidated from:
- the "Backend consequences" sections of the seven briefs in `.impeccable/surfaces/`;
- decisions D1–D19 (MIGRATION_PLAN §0);
- MIGRATION_PLAN §4 (schema, REST), §6 (API keys), §7 (MCP);
- the mock API in `frontend/src/lib/` (`api.ts`, `auth.ts`, `shopping.ts`, `format.ts`, `types.ts`).

Where the sources disagree, HANDOFF §4 wins (the briefs and D15–D19 are newer than MIGRATION_PLAN §4–§7). This file describes what the `backend-draft` branch **actually builds**. What differs from the plan, and what is still open, is listed in §9 and §10.

**Verified (2026-11-07, on the owner's Windows machine, outside the Local site):**
- PHP 8.2.29 (Local's binary, CLI) with `composer install`;
- MySQL 8.4.0 **and** MariaDB 10.6.23 (Local's binaries, private instances);
- `php bin/console migrate` on an empty server, twice (the second run is a no-op);
- `vendor/bin/phpunit`: 43 tests, 867 assertions, green on both databases (after the D20 change, 2026-11-07);
- PHPStan level 5 on `src/` and `bin/console`: no errors;
- `curl` smoke test against `php -S` with a session and with a scoped key: health, recipe CRUD, plan entries, suggestions, `/shopping/current`, MCP `initialize`, `tools/list` and `tools/call`.

**Later the same day:** the Local site (nginx, junction, Mailpit, `Authorization` through nginx; MIGRATION_PLAN §3.1), photo storage (§4.3.1) and the Supabase importer (§7.1, run against the real old database into the Local DB). The suite is now 50 tests, 946 assertions, green on MySQL 8.4. MariaDB is no longer a target (D21).

**2026-11-08:** photos behind the session (§4.3.1), the AI import (§4.7, Phase 6), the operator door for hosts without SSH (§4.8) and `deploy.sh` (FTP over TLS, [DEPLOY.md](DEPLOY.md)). 67 tests, 1127 assertions, green on a private MySQL 8.4; PHPStan level 5 clean. `deploy.sh` ran end to end against a local FTPS server (pyftpdlib with TLS) and `php -S`: first deploy (5 007 files in batches, migrations over `/ops` with a DB user that may not create databases), a no-op run, `--check` and `--console`. The AI providers are tested with a fake; no real model was called.

**Not verified yet:** anything on all-inkl (Apache `.htaccess`, FPM timeouts, FTP server, SMTP) and real calls to OpenCode, Anthropic and OpenAI. See §11 for how to run it.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | REST under `/api/v1`, MCP at `/mcp`, photos at `/media/…`, operator door at `/ops/…` and `/cron`, everything else is the SPA (`public/app/index.html`) |
| JSON | camelCase keys, matching `frontend/src/lib/types.ts` |
| Dates | `YYYY-MM-DD`, always the calendar day in **Europe/Berlin** |
| Timestamps | ISO 8601 with offset (`2026-11-07T14:03:00+01:00`); stored as UTC `DATETIME` |
| IDs | UUID v4 strings (`VARCHAR(36)`; imported Supabase/cuid IDs fit too) |
| Errors | `{"error":{"code":"…","message":"…","details"?:[…]}}`; `message` is German, "du" voice, shown to the user as is |
| Weekdays | `0` = Sonntag … `6` = Samstag (JS `getUTCDay()`) |
| Isolation | Every repository method takes `$userId`. There is no unscoped find-by-id (replaces Supabase RLS). The only lookups without a user are **by credential**, before anyone is known: user by e-mail (login, reset), session by cookie hash, key by secret hash, pairing link by code/token hash, reset token by hash |
| Soft delete | Recipes, plan entries and own shopping items have `deleted_at`, so the in-app undo toasts can restore them. `bin/console purge` removes them for good (§7) |

### Error codes

| HTTP | `code` | Message (examples) |
|---|---|---|
| 400 | `bad_request` | „Die Anfrage ist ungültig.“ |
| 401 | `unauthenticated` | „Bitte melde dich an.“ |
| 401 | `invalid_key` | „Dieser API-Schlüssel ist ungültig, abgelaufen oder widerrufen.“ |
| 403 | `forbidden_scope` | „Diesem Schlüssel fehlt das Recht recipes:write.“ |
| 403 | `session_required` | „Das geht nur in der App, nicht mit einem API-Schlüssel.“ |
| 403 | `csrf_failed` | „Die Sitzung ist abgelaufen. Lade die Seite neu.“ |
| 404 | `not_found` | „Rezept nicht gefunden.“ (per entity) |
| 409 | `undo_blocked` | the reasons from `api.ts`, e.g. „Nicht mehr rückgängig: „Linsensuppe“ wurde inzwischen geändert.“ |
| 409 | `conflict` | e.g. „Dieser Einkauf ist schon abgeschlossen.“ |
| 415 | `unsupported_media_type` | „Bitte schick JSON.“ |
| 422 | `validation_failed` | „Bitte prüf deine Eingaben.“ + `details: [{path, message}]` |
| 429 | `rate_limited` | „Zu viele Versuche. Probier es in 5 Minuten wieder.“ |
| 500 | `server_error` | „Da ist etwas schiefgelaufen. Versuch es gleich noch einmal.“ |
| 503 | `maintenance` | „Essensplan wird gerade aktualisiert. Versuch es in einer Minute noch einmal.“ (during a deploy, §4.8) |
| 503 | `ai_unavailable` | „Der KI-Import ist auf diesem Server nicht eingerichtet. Du kannst das Rezept selbst eingeben.“ |

AI import errors arrive on the job (`error: {code, message}`, §4.7): `no_recipe`, `fetch_failed`, `url_blocked`, `ai_failed`, `ai_busy`, `ai_refused`, `import_timeout`, `import_failed`.

Auth codes from `lib/auth.ts`, with its exact strings: `invalid_credentials`, `rate_limited`, `invalid_code`, `code_spent`, `link_expired`, `reset_invalid`, `weak_password`, `wrong_password`, `invalid_email`, plus `account_disabled` („Dieses Konto ist gesperrt.“, only after the right password). The `code_spent` text changed with D20 (§2.5).

---

## 2. Authentication and authorization

### 2.1 Doors
- **Browser:** session cookie `esp_session` (HttpOnly, SameSite=Lax, Secure when `APP_URL` is https) + `X-CSRF-Token` header on every unsafe request. The token comes back from login/pair/reset and from `GET /me`.
- **Agents:** `Authorization: Bearer esp_…` (REST and MCP). Sessions are not accepted at `/mcp`.
- Requests with a body must be `Content-Type: application/json` (415 otherwise). Together with SameSite=Lax this also protects the logged-out POSTs (login, pair, forgot, reset), which have no CSRF token yet.

### 2.2 Middleware order
`JsonErrors → (Slim routing) → RateLimit → Authenticate (session | key) → RequireScope → Csrf (session only) → controller`.
Slim's routing middleware only resolves the route (so the later steps can read its metadata); it does not run the handler.

### 2.3 Sessions (D19)
- One DB row per device. The cookie holds a random 32-byte token; the row stores `sha256(token)`. Every login, pairing and reset creates a new row (fresh id).
- **Angemeldet bleiben** on (default): persistent cookie; `expires_at` = last use + 365 days (rolling). The cookie is re-sent at most once a day.
- Off: a browser-session cookie; the row expires after `SESSION_IDLE_HOURS` (default 12) without use.
- Paired devices and the device that did a reset always get a lasting session.
- `last_seen_at` is written at most every 5 minutes.
- Device label from the User-Agent, same rules as `deviceLabel()` in `auth.ts` ("iPhone · Safari").

### 2.4 Passwords
- `password_hash(PASSWORD_DEFAULT)`; `password_verify` accepts Supabase's `$2a$` and `$2y$` bcrypt hashes. `password_needs_rehash` → rehash on successful login.
- Minimum length 10 (`weak_password`: „Das Passwort braucht mindestens 10 Zeichen.“).
- **Login lockout:** 5 failures per e-mail + IP → locked for 5 minutes (`rate_limited` with the minutes left). Plus 30 login attempts per IP per 15 minutes.
- **Reset:** `POST /auth/forgot-password` always answers 204. If the account exists, a token (32 random bytes, hex) is mailed as `APP_URL/passwort-zuruecksetzen?token=…`. Stored as SHA-256, valid 60 minutes, single use; a new request invalidates older tokens. Mail is sent with PHPMailer over SMTP (`MAIL_DRIVER=smtp`, Mailpit locally) or written to `storage/mail.log` (`MAIL_DRIVER=log`, the default).
- **No password change in Konto** (it goes through the reset mail). **No web setup screen and no sign-up over HTTP** (D10, D20): families come from the Supabase import or `bin/console user:create` (§2.8).

### 2.5 Pairing a new device (D19)
- A logged-in device creates a link: a 6-digit code (stored as HMAC-SHA256 with `APP_SECRET`) and a 24-byte token for the QR URL `/koppeln/{token}` (stored as SHA-256). Valid 10 minutes, single use. One open link per user: a new one replaces the old.
- The new device sends `{code}` or `{token}`; it gets a lasting session (`via = pairing`).
- **Wrong codes** can't be tied to one family, so they are counted per IP and across the install, never on another family's link (D20):
  - 5 misses from one IP within 10 minutes → that device waits 10 minutes (`code_spent`: „Zu viele falsche Codes. Warte 10 Minuten und lass dir dann auf dem anderen Gerät einen neuen Code anzeigen.“). Its family's open code stays valid.
  - 30 misses across all IPs within 10 minutes (guessing from many addresses) → every open code of every family is spent.
  - Plus 20 pairing attempts per IP per 10 minutes.
- A locked family's codes don't work.
- The trusted device polls `GET /auth/device-links/{id}` every second and sees `usedAt` and `usedByLabel`.

### 2.6 API keys (§6, D18)
- Format `esp_` + 40 base62 characters from `random_bytes`. Stored: `sha256(secret)` and the first 12 characters as `prefix`. The secret is returned exactly once.
- Lookup by hash; rejected when revoked or expired (`invalid_key`); `last_used_at` / `last_used_ip` are written at most once a minute.
- **Scopes:** `recipes:read`, `recipes:write`, `recipes:delete`, `mealplan:read`, `mealplan:write`, `shopping:read`, `shopping:write`, `ai:use`. `profile:read` is implicit. No presets. **Write implies read** (`recipes:write` and `recipes:delete` imply `recipes:read`, and so on).
- `client` ENUM(`claude-code`, `claude-desktop`, `mcp`, `rest`) is only a label for the setup snippet.
- Optional expiry: 30 days, 1 year or none (`validDays`: 30 | 365 | null).
- Name fallback: „Schlüssel vom 7. Nov.“ (ICU `d. MMM`, de_DE, Europe/Berlin).
- Revoke takes effect immediately. **Un-revoke** is allowed for 10 minutes after revoking (undo toast).
- Every write made with a key is logged in `agent_activity` (§5.7). Entries, recipes and own shopping items carry `created_via` (`app` | `api` | `mcp`).

### 2.7 Rate limits (table `rate_limits`, fixed windows)
| Bucket | Limit |
|---|---|
| Any request per API key | 120 / minute |
| Any request per IP without a key | 300 / minute |
| Login per IP / per e-mail + IP failures | 30 / 15 min · 5 failures → 5 min lock |
| Pairing per IP | 20 / 10 min · 5 wrong codes → 10 min wait · 30 wrong codes install-wide → all open codes spent |
| Forgot password per IP | 5 / hour |
| AI imports per family | `AI_IMPORTS_PER_HOUR` (30) / hour |
| Wrong ops/cron tokens per IP | 10 / 10 min, then even the right token waits |
| Photos (`/media/…`) | exempt (a list loads dozens at once; each needs a session or key) |

### 2.8 Several families (D20)
- **One account is one family** (D11: the family shares the login and pairs its devices). `users.id` is the tenant key: every table hangs off it, every repository method takes it, and the isolation tests (`IsolationTest`, `FamiliesTest`) cover session, key and MCP.
- **No sign-up over HTTP.** The operator adds a family on the CLI: `bin/console user:create --email= --name=` stores a random password nobody knows and mails a welcome link (`password_resets.purpose = invite`, 7 days, single use). It opens the same page as a reset (`/passwort-zuruecksetzen?token=…`); `POST /auth/reset-password/check` answers `{purpose: "invite"}` so the page can greet a new family. Setting the password logs that device in (`via = invite`) and marks the address verified.
- **Lock** (`user:disable`): `users.disabled_at` stops login, sessions, API keys, MCP, pairing and reset links at once; `user:enable` brings back the same devices and keys.
- **Delete** (`user:delete --yes`): removes the family and every row it owns, children first; other families are untouched (tested by counting rows).
- **Shared across families:** only the fixed sets (`meal_slots`, categories, tags, sections) and `rate_limits`. E-mail addresses are unique across the install.
- **Not built:** several logins per family (members). If that comes, a `households` table with `users.household_id` would become the tenant key; today's `user_id` columns would move to it in one migration.

---

## 3. Entities

All tables: InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` (accent- and case-insensitive search). MySQL 8 only (D21). Migrations `001_init.sql` and `002_families.sql` (D20).

| Table | Fields | Notes |
|---|---|---|
| `users` | id, name, email UNIQUE, password_hash, email_verified_at, disabled_at, week_start TINYINT (1), planning_weekday TINYINT (5), section_order JSON NULL, created_at, updated_at | One row = one family and the tenant key of every other table (§2.8). NULL `section_order` = default order |
| `sessions` | id, user_id, token_hash UNIQUE, csrf_token, remember, device_label, user_agent, ip, via ENUM(password, pairing, reset, register, invite) (`register` is unused since D20), created_at, last_seen_at, expires_at | `id` is public (listing, revoking); the cookie value is never stored |
| `device_links` | id, user_id, code_hash, token_hash UNIQUE, created_by_session, created_at, expires_at, used_at, used_by_session, used_by_label, spent_at | |
| `password_resets` | id, user_id, purpose ENUM(reset, invite), token_hash UNIQUE, created_at, expires_at, used_at | reset: 60 min · invite: 7 days |
| `rate_limits` | bucket PK, hits, window_start, window_seconds | |
| `recipes` | id, user_id, title, description, image_path, category, tags JSON, cooking_time, servings, difficulty, rating, source_url, created_via, created_at, updated_at, deleted_at | FULLTEXT(title, description) for later; search uses LIKE (§5.1) |
| `ingredients` | id, recipe_id CASCADE, position, name, amount DECIMAL(10,3), unit, notes, component, section | `section` set on save by the word list (`Shopping::classify`) |
| `instructions` | id, recipe_id CASCADE, step_number, description, image_path, ingredient_ids JSON NULL | NULL → the SPA matches ingredient names in the step text |
| `meal_slots` | id, slot_key UNIQUE, name, short_name, position | seeded: breakfast/Frühstück, lunch/Mittagessen, dinner/Abendessen, snack/Snack |
| `meal_plan_entries` | id, user_id, date, meal_slot_id, recipe_id NULL, note VARCHAR(80) NULL, detached_recipe_id NULL, position, created_via, seen_at, created_at, updated_at, deleted_at | CHECK exactly one of recipe_id / note. No servings (D15) |
| `shopping_trips` | id, user_id, days JSON, days_chosen, created_at, completed_at | at most one open trip per user (app logic) |
| `shopping_item_state` | trip_id, line_key, checked NULL, at_home NULL, seen_at, updated_at | PK(trip_id, line_key); NULL = never touched |
| `shopping_manual_items` | id, user_id, name, section, created_via, created_at, bought_at, bought_trip_id, deleted_at | own items stay until bought |
| `section_overrides` | user_id, name_key, section | "Abschnitt ändern" |
| `shopping_home_counts` | user_id, name_key, count | "meist da" from 2 |
| `api_keys` | id, user_id, name, prefix, key_hash UNIQUE, scopes JSON, client, last_used_at, last_used_ip, expires_at, revoked_at, created_at | |
| `agent_activity` | id, user_id, api_key_id, key_name, channel ENUM(rest, mcp), action, target_type, target_id, target_label, target_href, summary, undo_payload JSON, created_at, undone_at, seen_at | 90-day retention |
| `ai_usage` | id, user_id, api_key_id, feature (`import-url` · `import-photo`), provider, model, input_tokens, output_tokens, duration_ms, success, created_at | one row per model call, also failed ones; kept for a cost overview |
| `ai_jobs` | id, user_id, type (`recipe-import`), status ENUM(queued, running, done, failed), progress (step 0–3), input JSON, result JSON (`{draft}`), error (`{code, message}`), created_at, finished_at | §4.7; purged after a day |
| `schema_migrations` | version, applied_at | written by `bin/console migrate` |

**Recipe delete:** soft delete. Its live plan entries get `note = title`, `recipe_id = NULL`, `detached_recipe_id = id`, so the week keeps the day. Restoring the recipe re-links the entries whose note is still the title.

**Cooking stats** (`timesCooked`, `lastCooked`): counted from non-deleted entries with that recipe dated **today or earlier** (Europe/Berlin). Free text never counts. No `cooked_events` (D17).

---

## 4. REST endpoints (`/api/v1`)

Auth column: `public`, `session` (session only, never a key), or a scope (session **or** a key with that scope).

### 4.1 System
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | `{status, db, time}` |
| GET | `/config` | public | `{minPassword, slots, categories, tags, difficulties, scopes, sections, presets, ai: {import}}` |
| GET | `/openapi.json` | public | generated from the route table and the JSON Schemas used for validation |

### 4.2 Auth and account (all `session`; logged-out ones marked)
| Method | Route | Body → Response |
|---|---|---|
| POST | `/auth/login` (logged out) | `{email, password, remember}` → `{account, session, csrfToken}` + cookie |
| POST | `/auth/logout` | → 204, cookie cleared |
| POST | `/auth/pair` (logged out) | `{code}` or `{token}` → like login |
| POST | `/auth/device-links` | → `{id, code, token, url, createdAt, expiresAt}` (201) |
| GET | `/auth/device-links/{id}` | → `{id, createdAt, expiresAt, usedAt, usedByLabel, spent}` |
| DELETE | `/auth/device-links/{id}` | → 204 |
| GET | `/auth/sessions` | → `{items: Session[]}`, this device first with `current: true`, then by last use |
| DELETE | `/auth/sessions/{id}` | → 204 (own session = logout) |
| POST | `/auth/sessions/revoke-others` | → `{revoked: n}` |
| POST | `/auth/forgot-password` (logged out or in) | `{email}` → 204 always |
| POST | `/auth/reset-password/check` (logged out) | `{token}` → `{purpose: "reset" \| "invite"}` or 400 `reset_invalid` |
| POST | `/auth/reset-password` (logged out) | `{token, password, revokeOthers}` → like login |
| GET | `/me` | `profile:read` (implicit for every key) → `{id, name, email, settings: {weekStart, planningWeekday}, today, defaultWeekStart, csrfToken?}` |
| PATCH | `/me` | `{name?, email?, currentPassword?, settings?: {weekStart?, planningWeekday?}}`; `currentPassword` required only when the e-mail changes |

`Session` = `{id, deviceLabel, remember, createdAt, lastSeenAt, via, current}`.

### 4.3 Recipes
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/recipes` | recipes:read | `q` (title **or** ingredient, accent-insensitive), `category`, `tags[]` (all must match), `maxTime`, `minRating`, `notCookedSince` (date; never-cooked recipes match), shorthands `favourites=1` (minRating 4), `quick=1` (maxTime 30), `sort` = `loved` (default) · `title` · `lastCooked` · `newest` · `time`, `limit` (≤ 200, default 50), `cursor` → `{items: [{recipe: RecipeSummary, matchedIngredient}], nextCursor, total}` |
| GET | `/recipes/{id}` | recipes:read | full `Recipe` + `agentChanged` |
| POST | `/recipes` | recipes:write | `RecipeDraft` → `Recipe` (201) |
| PUT | `/recipes/{id}` | recipes:write | full `RecipeDraft`; ingredients and steps are replaced |
| PATCH | `/recipes/{id}` | recipes:write | any subset of `RecipeDraft` |
| DELETE | `/recipes/{id}` | recipes:delete | soft delete; → `{recipe, detachedEntries}` |
| POST | `/recipes/{id}/restore` | recipes:delete | in-app undo of a delete |

`Recipe` and `RecipeSummary` carry `thumbUrl` (the 400 px variant of a stored photo; a linked photo is its own thumbnail), and so does the recipe embedded in a plan entry.
`RecipeSummary` = `Recipe` without `ingredients`/`instructions`, plus `ingredientCount`. `loved` = `rating × 100 + min(timesCooked, 99)` (`lovedScore()`).
Validation (`src/Schema/recipe.schema.json`): title 1–200, category ∈ CATEGORIES, tags ⊂ TAGS, difficulty ∈ DIFFICULTIES or null, rating 1–5 or null, cookingTime 1–1440, servings 1–99, `imageUrl` an http(s) URL or a `/media/…` path, ingredients ≤ 100, steps ≤ 60, `ingredientIds` per step optional.

### 4.3.1 Photos
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/images` | recipes:write | multipart field `file` (the SPA) or the image as the body (`Content-Type: image/*`) → 201 `{url, thumbUrl, width, height}`; put `url` into `imageUrl` |

| GET | `/media/{userId}/{name}.jpg` | session, or a key with recipes:read | the photo (also `…-thumb.jpg`); another family's photo answers 404 like a missing one, logged out 401 |

`src/Service/MediaStore.php`: JPEG, PNG, WebP or GIF up to 15 MB and 30 MP. Every image is decoded and re-encoded with GD (EXIF orientation applied, metadata gone) into `storage/media/{userId}/{random}.jpg` (1000 px, quality 82) and `…-thumb.jpg` (400 px); transparency becomes white. **Photos are protected (2026-11-08):** `storage/` is outside the docroot, and `MediaController` serves a photo only to a session of its family (the cookie rides along with `<img>`, SameSite=Lax) or an API key with `recipes:read`. Answers carry `Cache-Control: private, max-age=31536000, immutable` and an ETag (304 on `If-None-Match`): names never change, so a browser asks once. URLs stay `/media/…`, so stored `imageUrl`s did not change; `bin/console media:move` moved the files out of the old `public/media`. Errors: 413 `too_large`, 415 `unsupported_image` / `unsupported_media_type`. `purge` deletes photos no recipe or step refers to (after a day, so an upload whose recipe isn't saved yet survives); `user:delete` removes the family's folder. The SPA downscales a picked photo to 1600 px for the preview and uploads it on save, so a cancelled edit uploads nothing. `MEDIA_DIR` overrides the folder (tests).

### 4.4 Meal plan
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/meal-slots` | mealplan:read | the four fixed slots |
| GET | `/meal-plan?from&to` | mealplan:read | ≤ 62 days → `{from, to, entries: PlanEntry[]}`; each entry embeds `recipe: {id, title, imageUrl, cookingTime, category} \| null` |
| POST | `/meal-plan/entries` | mealplan:write | `{date, slot, recipeId}` **xor** `{date, slot, note}` → `PlanEntry` (201), appended at the end of the slot |
| PATCH | `/meal-plan/entries/{id}` | mealplan:write | `{date?, slot?, position?}`; a move without `position` goes to the end of the target slot |
| DELETE | `/meal-plan/entries/{id}` | mealplan:write | soft delete → the removed `PlanEntry` |
| POST | `/meal-plan/entries/{id}/restore` | mealplan:write | in-app undo of remove |
| POST | `/meal-plan/seen` | session | `{ids}`: the LEDs of agent-created entries go out |
| GET | `/meal-plan/presets` | mealplan:read | `Reste · Essen gehen · Auswärts · Bestellen` + the 4 most recent own app texts (not recipe titles, not fixed ones) |
| GET | `/suggestions?weekStart&slot` | recipes:read | shelves `langeher`, `lieblinge`, `schnell` (§5.3) |

### 4.5 Shopping (replaces `/grocery-list`)
| Method | Route | Auth | Notes |
|---|---|---|---|
| GET | `/shopping/current` | shopping:read | → `{trip, sections: [{section, lines}], planDays: [{date, dishes, shopped}], allShopped, recentManualNames}` |
| POST | `/shopping/trips` | shopping:write | `{days}`: sets the days of the open trip (`daysChosen = true`) |
| PATCH | `/shopping/items/{key}` | shopping:write | `{checked?, atHome?, section?}` (`key` URL-encoded; `section` = "Abschnitt ändern", remembered for the name) |
| POST | `/shopping/seen` | shopping:write | `{keys}`: lines stop printing "neu" |
| POST | `/shopping/manual-items` | shopping:write | `{name}` (1–60) → `ManualItem` (201) |
| DELETE | `/shopping/manual-items/{id}` | shopping:write | soft delete → the removed item |
| POST | `/shopping/manual-items/{id}/restore` | shopping:write | in-app undo |
| POST | `/shopping/trips/{id}/complete` | shopping:write | days count as shopped; bought own items leave the list |
| POST | `/shopping/trips/{id}/reopen` | shopping:write | undo of complete (only the most recent trip) |
| GET / PUT | `/shopping/section-order` | shopping:read / write | `{sections: string[]}`, a permutation of SECTIONS |

### 4.6 API keys and agent activity (all `session`)
| Method | Route | Notes |
|---|---|---|
| GET | `/api-keys` | newest first |
| POST | `/api-keys` | `{name?, scopes, validDays, client}` → `{key, secret}` (201); the only time the secret is sent |
| PATCH | `/api-keys/{id}` | `{client}` |
| DELETE | `/api-keys/{id}` | revoke → `ApiKey` |
| POST | `/api-keys/{id}/unrevoke` | within 10 minutes of revoking |
| GET | `/agent-activity?limit` | newest first; each item has `undoBlocked: string \| null` |
| GET | `/agent-activity/unseen-count` | `{count, recipeIds}` (`recipeIds` = the "vom Agenten geändert" marks) |
| POST | `/agent-activity/seen` | `{ids?}` or `{recipeId}`; empty body = all |
| POST | `/agent-activity/{id}/undo` | 409 `undo_blocked` with the reason when no longer safe |

### 4.7 AI import (Phase 6, `src/Ai/`)
| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/ai/import` | ai:use | JSON `{url}` (http/https), or a photo as multipart field `photo` or an `image/*` body → `ImportJob`; **200** when it already finished, **202** while it runs |
| GET | `/ai/jobs/{id}` | ai:use | → `ImportJob`; poll every second while `queued`/`running` |

`ImportJob` = `{id, status: queued | running | done | failed, step: 0–3, source: url | photo, draft?, error?: {code, message}, createdAt}`. `step` indexes `IMPORT_STEPS` (Quelle lesen · Zutaten erkennen · Schritte ordnen · Fertig). `draft` is a `RecipeDraft` for `POST /recipes`: ingredient ids `n1…`, steps with `ingredientIds` (or all null when the model linked none, so Kochmodus matches names). The import never saves a recipe; the SPA shows the draft in the edit form („Import prüfen“). Jobs are deleted after a day.

**Pipeline** (`RecipeImporter`, the same for every provider, MIGRATION_PLAN §8):
1. **Link:** `PageFetcher` fetches the page SSRF-safe: http/https on ports 80/443 only, no `user:pass@`, every resolved address must be public (no private, loopback, link-local, CGNAT, reserved; IPv4-mapped IPv6 checked as IPv4), the connection is pinned to the checked address (no DNS rebinding), redirects (≤ 4) are followed by hand and checked again, ≤ 3 MB, 20 s. 403/429 answers suggest a screenshot instead.
2. `RecipePage` takes the schema.org `Recipe` from the JSON-LD (`@graph`, `mainEntity`, HowToSection/HowToStep flattened to text, ≤ 40 000 characters); without one, the visible text (`<main>`/`<article>` if big enough, ≤ 60 000 characters). The photo: the Recipe's `image`, else `og:image`.
3. **One structured-output call** with a German system prompt (port of the old edge function's rules: exact amounts, metric units, de units, `component` groups, step → ingredient positions, tags only when sure, source text is data, not instructions). Schema: every field required, null where unknown, only the strict-output subset (no length/range limits). If the reply breaks the structure (OpenCode has no schema enforcement), **one retry** with the errors appended; categories or tags outside the lists are not worth a retry.
4. **Normalise** (`draft()`): clamp to the recipe schema (title ≤ 200, time 1–1440, servings 1–99, ≤ 100 ingredients, ≤ 60 steps), unknown category → Hauptspeise, unknown tags dropped, amount 0 → null, leading step numbers removed; `found: false` or nothing usable → `no_recipe`. `sourceUrl` = the given link.
5. **Photo:** the page photo is downloaded (same guard, ≤ 15 MB) and stored like an upload; `imageUrl` = its `/media/…` path, or null if that fails (no hotlinking). For a photo import `imageUrl` stays null and the SPA keeps the picked photo as the recipe photo (uploaded on save).
- **Photo import:** the upload is re-encoded to a ≤ 1600 px JPEG (EXIF orientation applied) in `storage/ai-input/` and deleted once its job ran.

**Running the job** (`ImportJobs`): under PHP-FPM (all-inkl) `POST` answers 202 at once and the work continues after `fastcgi_finish_request` (`AfterResponse`); everywhere else (php -S, Local's php-cgi, tests) it runs inside the request, which then answers finished. A queued job nobody started is run by the next poll after 20 s or by the cron; a job running longer than 10 minutes is failed (`import_timeout`). The claim is atomic (`UPDATE … WHERE status = 'queued'`). Up to `AI_IMPORTS_PER_HOUR` (30) per family.

**Providers** (`AI_PROVIDER`, default `opencode` like the old app; `Ai::fromConfig`):

| Provider | Call | Default model | Notes |
|---|---|---|---|
| `opencode` | chat completions at `opencode.ai/zen/go/v1`, `response_format: json_object`, schema in the system prompt | `OPENCODE_MODEL` glm-5.2, photos `OPENCODE_IMAGE_MODEL` kimi-k3 | fences, text around the object and a `{"recipe": …}` wrapper are tolerated; `reasoning_content` used when `content` is empty |
| `anthropic` | official SDK (`anthropic-ai/sdk`), `output_config.format` json_schema | `ANTHROPIC_MODEL` claude-opus-5-5, `ANTHROPIC_EFFORT` low | thinking at the model's default (adaptive); **server-side fallbacks on** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`): a policy decline is retried on the default fallback model in the same call; a remaining `refusal` → `ai_refused` |
| `openai` | Responses API, strict json_schema | `OPENAI_MODEL` gpt-5-mini, `OPENAI_EFFORT` low | |

Every call writes an `ai_usage` row (tokens, duration, success; also failed calls). Without the provider's key the import answers 503 `ai_unavailable` and `/config` says `ai.import: false`. `AI_TIMEOUT` (150 s) per call. Image enhancement (`/ai/enhance-image`) is not built: no surface asks for it.

### 4.8 Operator door (no SSH on all-inkl)
| Method | Route | Auth | Does |
|---|---|---|---|
| POST | `/ops/migrate` | header `X-Ops-Token: <OPS_TOKEN>` | `bin/console migrate` |
| POST | `/ops/check` | same | `bin/console check`: PHP, extensions, limits, `fastcgi_finish_request`, MySQL version, pending migrations, writable folders, mail, tokens, AI |
| POST | `/ops/console` | same | `{command, args: string[]}` for `migrate`, `check`, `user:create`, `user:invite`, `user:list`, `user:disable`, `user:enable`, `purge`, `jobs:run`, `cron`, `media:move`, temporarily `import:supabase` (cutover only). Not over HTTP: `user:delete`, `api-key:create`, `openapi:dump` |
| GET | `/cron?token=<CRON_TOKEN>` | query token | `bin/console cron` (= `jobs:run` + `purge`) for the hosting's URL cron |

Plain-text answers (`FEHLER: …` with 400/500 on failure). A token shorter than 32 characters switches its door off; a wrong one answers 404 like an unknown path and counts against the IP (10 per 10 minutes). Before the first migration the rate-limit table does not exist; the door then works without it. `deploy.sh` uses these ([DEPLOY.md](DEPLOY.md)).

**Maintenance mode:** while `../.maintenance` exists (deploy.sh puts it there during code uploads), `public/index.php` answers everything except `/ops/` with 503 `maintenance` (JSON for `/api`, `/mcp`, `/media`, a small page otherwise) before loading any code, so a half-uploaded `vendor/` never runs.

---

## 5. Domain rules (ported from the prototype)

### 5.1 Recipe search
Title **or** any ingredient name contains `q` (LIKE under `utf8mb4_unicode_ci`, so „kase“ finds „Käse“). For hits not matched by title, `matchedIngredient` is the first matching ingredient.

### 5.2 Week
- `weekStartOf(date, weekStart)`; `defaultWeekStart(today, settings)`: the running week, or the next one from the planning day on. A planning day equal to the week start never flips.
- `today` is the Berlin calendar day (`Clock`).

### 5.3 Suggestions (`suggestions()` in `api.ts`)
- Slot → categories: breakfast → Frühstück; lunch, dinner → Hauptspeise, Suppe, Salat; snack → Snack, Dessert.
- Excluded: recipes planned between `weekStart − 14` and `weekStart + 6 + 14`.
- Shelves, in this order, each recipe on one shelf at most, ≤ 8 each, empty shelves dropped:
  1. `langeher` „Lange nicht gegessen“ / „Gut bewertet, seit 6 Wochen nicht gekocht“: rating ≥ 4 and last cooked ≥ 42 days ago, oldest first.
  2. `lieblinge` „Lieblinge“ / „Am besten bewertet und oft gekocht“: rating ≥ 4 by lovedScore.
  3. `schnell` „Schnell“ / „Bis 30 Minuten“: cookingTime ≤ 30 by lovedScore.

### 5.4 Shopping (`shopping.ts`, `openTrip` / `buildLines` / `completeTrip` / `reopenTrip`)
- **Lines from the plan are computed live, never stored.** Ingredients of every recipe entry on the trip's days, unscaled (recipe base servings, D15). Aggregation by `baseName()` (before the first comma) and `nameKey()` (lowercase); unit families g/kg → g, ml/l → ml, Zehe(n), Prise(n), others by unit label; plural keys fold into the singular ("Zwiebeln" + "Zwiebel"); amounts printed like `formatAmount()` (de-DE, ½ ¼ ¾ ⅓ ⅔, „1,2 kg“). `Wasser` / `Leitungswasser` are skipped.
- Section: override for the name key, else the ingredient's stored section, else `classify()`.
- **Trip:** the default days are the planned days (recipe entries) in the next 14 days not covered by a completed trip. An untouched trip (days not chosen, no line state) follows the plan. Manual-line keys are `m:<id>`.
- "neu": lines whose key is not in the trip's seen set. A new trip starts with all current lines seen.
- "da" toggles change the name's home count (not for own items); `likelyHome` = not checked, not at home, count ≥ 2.
- **Complete:** own items that are checked or at home get `bought_at`; the trip gets `completed_at`. **Reopen:** only the most recently completed trip of the user; it clears those `bought_at`s and drops an untouched open trip created after it.
- `recentManualNames`: the last 8 distinct names of bought own items not on the list now.

### 5.5 Presets
Fixed list in code; recents = the user's last 4 distinct notes of `created_via = app` entries, not equal to a fixed preset or a live recipe title.

### 5.6 In-app undo toasts (HANDOFF §4, decided here)
| Toast | Server support | Window |
|---|---|---|
| Plan entry removed | soft delete + `POST /meal-plan/entries/{id}/restore` | until purge (7 days) |
| Recipe deleted (with its entries) | soft delete + `POST /recipes/{id}/restore` | until purge (30 days) |
| Key revoked | `POST /api-keys/{id}/unrevoke` | 10 minutes |
| Own item removed | soft delete + `POST /shopping/manual-items/{id}/restore` | until purge (7 days) |
| Trip completed | `POST /shopping/trips/{id}/reopen` | while it is the latest completed trip |

### 5.7 Agent activity and undo
- Logged on every key-authenticated write (REST and MCP), in the same transaction as the write. `summary` is German, e.g. „hat Do 12. Mittag: Gnocchi-Pfanne geplant“, „hat „Backpapier“ auf die Einkaufsliste gesetzt“, „hat „Linsensuppe“ geändert“.
- Undo kinds (`undo_payload.kind`):

| Kind | Written for | Undo does | Blocked when (message from `api.ts`) |
|---|---|---|---|
| `plan.remove` | entry added | removes it | entry gone: „Nicht mehr rückgängig: Der Eintrag ist schon weg.“ |
| `plan.move` | entry moved | moves it back | entry gone, or changed since („… Der Eintrag wurde inzwischen geändert.“) |
| `plan.restore` | entry removed | restores it | purged |
| `shopping.remove` | own item added | removes it | gone or bought: „Nicht mehr rückgängig: Der Artikel ist schon von der Liste.“ |
| `recipe.restore` | recipe updated | writes the previous version back | deleted („… Das Rezept gibt es nicht mehr.“) or `updated_at` changed („… „X“ wurde inzwischen geändert.“) |
| `recipe.remove` | recipe created | soft-deletes it | changed since |
| `recipe.undelete` | recipe deleted | restores it with its entries | purged |

- Logged without undo: shopping state toggles (check, "da", section), choosing trip days, completing a trip, and an agent removing an own item.
- `seen_at` drives the avatar dot (`unseen-count`). The recipe mark = unseen, not-undone activity on that recipe. Opening the recipe marks it seen (`POST /agent-activity/seen {recipeId}`).
- Retention 90 days (`bin/console purge`).

---

## 6. MCP server (`/mcp`)
- Streamable HTTP, stateless: every message is a `POST` with a JSON-RPC body, answered as `application/json`. `GET`/`DELETE /mcp` → 405. No `Mcp-Session-Id` is issued.
- Protocol versions: answers `initialize` for 2025-03-26, 2025-06-18 and 2025-11-25 (handshake era) and accepts requests carrying `_meta["io.modelcontextprotocol/protocolVersion"] = "2026-07-28"` without a handshake (+ `server/discover`).
- Auth: Bearer key only; 401 + `WWW-Authenticate: Bearer` otherwise. An `Origin` header, if present, must match `APP_URL`.
- `tools/list` only shows the tools the key's scopes allow. Results carry `structuredContent` plus the same JSON as text.

| Tool | Scope | Annotations |
|---|---|---|
| `get_profile` | – (profile:read) | readOnly · today, weekStart, planningWeekday, defaultWeekStart |
| `search_recipes` | recipes:read | readOnly |
| `get_recipe` | recipes:read | readOnly |
| `create_recipe` | recipes:write | – |
| `update_recipe` | recipes:write | idempotent |
| `delete_recipe` | recipes:delete | destructive |
| `list_meal_slots` | mealplan:read | readOnly |
| `get_meal_plan` | mealplan:read | readOnly · days → slots → entries |
| `add_meal` | mealplan:write | – |
| `move_meal` | mealplan:write | idempotent |
| `remove_meal` | mealplan:write | destructive |
| `suggest_meals` | recipes:read | readOnly · same shelves as `/suggestions` |
| `get_grocery_list` | shopping:read | readOnly |
| `add_grocery_item` | shopping:write | – |
| `import_recipe_from_url` | ai:use (+ recipes:write to save) | openWorld · `{url, save?}`: the app's own import (§4.7), synchronous; saves the recipe unless `save: false`, which returns the draft only |

**Prompts:** `plan_week` (reads `week_start` / `planning_weekday` and targets `defaultWeekStart` unless a week is given; optional wishes) and `shopping_for_week`.

---

## 7. Console (`bin/console`, commands in `src/Console/Console.php`)
On all-inkl the commands marked † also run over HTTPS: `./deploy.sh --console user:list` (§4.8).

| Command | Does |
|---|---|
| `migrate` † | applies `migrations/*.sql` in order, recorded in `schema_migrations`; creates the database only when it does not exist (hosted databases may not be created) |
| `check` † | what the server offers (§4.8) |
| `user:create --email= [--name=] [--password=] [--no-invite]` † | adds a family; without `--password` it gets the invite mail |
| `user:invite --email=` † | sends the invite mail again (replaces the old link) |
| `user:list` † | every family with last use, devices, recipes, keys and status (eingeladen · aktiv · gesperrt) |
| `user:disable --email=` · `user:enable --email=` † | locks a family out at once, or lets it back in with its devices and keys |
| `user:delete --email= --yes` | deletes a family and everything it owns |
| `api-key:create --email= --scopes=a,b [--name=]` | prints a new key (for smoke tests) |
| `purge` † | removes soft-deleted entries/items (> 7 days) and recipes (> 30 days), expired sessions, links and reset tokens, activity > 90 days, import jobs > 1 day, unused photos (> 1 day) |
| `jobs:run [--limit=5]` † | runs import jobs nobody picked up, fails those stuck > 10 min |
| `cron` † | `jobs:run` + `purge` (what `/cron?token=` runs) |
| `media:move` † | moves photos from the old `public/media` into `MEDIA_DIR` (once, 2026-11-08) |
| `import:supabase [--email=] [--replace] [--no-images]` | copies families from the old app (§7.1) |
| `openapi:dump [file]` | writes the OpenAPI document |

### 7.1 Supabase import (Phase 8, `src/Import/`)
`SupabaseSource` reads the old Postgres over `SUPABASE_DB_URL` (falls back to `DIRECT_URL`) in a read-only transaction; it needs `pdo_pgsql` (on Local: `extension=php_pdo_pgsql.dll`, the DLL and `libpq.dll` ship with Local's PHP). `SupabaseImporter` writes each family in one transaction:
- **Account:** `auth.users` with its id and bcrypt hash (`$2a$` logs in and is rehashed to `$2y$`), `email_confirmed_at`, name from the user metadata or „Familie“. Without a password (magic link) the account gets a random hash and the report says to send `user:invite`.
- **Recipes** keep their ids, `created_via = import`, and their timestamps. Category, tags and difficulty are matched ignoring case and umlaut spelling (`Fruhstuck` → Frühstück); an empty or unknown category becomes Hauptspeise and unknown tags are dropped, both counted in the report. (`Cookidoo`, which the old form offered, is in the new set since 2026-11-07.) Out-of-range times, servings and ratings become null. Ingredients keep the old table order and get their `section` from the word list; steps are renumbered 1…n; `ingredient_ids` stay null.
- **Photos** (recipe and step) are downloaded and stored like uploads (§4.3.1). A failed download keeps the old link and is listed. On Windows without `curl.cainfo` the download uses the system certificate store.
- **MealPlan rows** become Mittagessen entries (D8) on their Europe/Berlin day, keeping their ids; rows without a recipe are left out; rows not at UTC midnight are counted ("check their day").
- A family that already has recipes or entries is skipped unless `--replace`, which first deletes its recipes, entries, shopping state and agent log (account, devices and keys stay). An e-mail that belongs to a different local account is never touched.

**Dry run, 2026-11-07** (old database → Local DB): 2 accounts, 69 recipes, 544 ingredients, 277 steps, 35 photos and 123 of 130 plan entries (7 had no recipe), all counts matching the source; 11 recipes had an empty category. After Cookidoo joined the tag set, the 2 recipes that had it got the tag back by a one-off update (no re-import). About 24 s, mostly photo downloads.

---

## 8. Configuration (`.env` locally, see `.env.example`; `config.php` on the server, see `config.production.example.php`)
`APP_ENV`, `APP_URL`, `APP_SECRET`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `MAIL_DRIVER` (log | smtp), `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `SESSION_IDLE_HOURS`, `TRUSTED_PROXIES`, `RATE_LIMIT_KEY`, `RATE_LIMIT_IP`, `MEDIA_DIR` (default `storage/media`), `SUPABASE_DB_URL` (importer; falls back to `DIRECT_URL`).
AI (§4.7): `AI_PROVIDER` (opencode | anthropic | openai, default opencode), `OPENCODE_API_KEY`, `OPENCODE_MODEL`, `OPENCODE_IMAGE_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_EFFORT`, `AI_TIMEOUT`, `AI_IMPORTS_PER_HOUR`, `AI_INPUT_DIR` (tests).
Operator (§4.8): `OPS_TOKEN`, `CRON_TOKEN` (each ≥ 32 characters, empty = off). Deploy settings live in `.env.deploy`, not here ([DEPLOY.md](DEPLOY.md)). When `config.php` exists (a PHP array, uploaded by `deploy.sh --push-config`), it replaces `.env`; real env vars fill in keys it leaves out.

---

## 9. Deviations from MIGRATION_PLAN §4–§7
1. **MCP is hand-rolled** (`src/Mcp/Server.php`), not `mcp/sdk`. `mcp/sdk` 0.9 installs on PHP 8.2 and supports both protocol eras, but its handshake-era transport keeps sessions (a session store), and it is pre-1.0. The dispatcher is small and fully stateless. Worth revisiting at `mcp/sdk` 1.0. **2026-11-08:** `mcp/sdk` and the likewise unused `intervention/image` (photos use GD directly) were removed from `composer.json`; they only made the FTP upload bigger.
2. **List endpoints return summaries:** `/recipes` and suggestion shelves return `RecipeSummary` (no ingredients/steps); the prototype passes full recipes around in memory.
3. **`/meal-plan` is flat** (`entries[]` with an embedded recipe summary), like `listPlanEntries()`; the MCP tool groups by day and slot.
4. **`/grocery-list` is replaced by `/shopping/*`**; `get_grocery_list` needs `shopping:read`, not `mealplan:read`.
5. **AI (2026-11-08, §4.7):** `/ai/import` takes a link or a photo (one endpoint instead of separate ones) and always returns a job; `import_recipe_from_url` runs synchronously and has no `get_import_status` companion. `/ai/enhance-image` is not built. `/images` exists since 2026-11-07 (§4.3.1).
6. **Settings live on `/me`** (`settings: {weekStart, planningWeekday}`), not a separate endpoint.
7. **Extra undo kinds** `plan.restore` and `recipe.remove` (agent removed an entry / created a recipe).
8. **FK `meal_plan_entries.recipe_id` is RESTRICT,** not SET NULL: MySQL forbids a CHECK on a column used in an FK action. The app detaches entries before a recipe is purged.
9. **`get_profile` tool added,** so `plan_week` can read the settings.
10. **Photos are no longer plain files** (2026-11-08): `storage/media` + `MediaController` instead of `public/media` (§4.3.1). The plan's "public/media/{userId}" layout is gone.
11. **Deploy over FTP** (2026-11-08) instead of GitHub Actions + rsync/SSH (MIGRATION_PLAN §10.5): `deploy.sh` builds locally and migrates through `/ops` ([DEPLOY.md](DEPLOY.md)).

## 10. Assumptions / open (for the owner)
1. **Undo windows** (§5.6): 7 days for entries and own items, 30 days for recipes, 10 minutes for un-revoking a key. Confirm.
2. **Cooking stats count today** (an entry for today counts as cooked).
3. **Category and tag sets are enforced** on save. The importer maps the old values (§7.1); recipes with an empty old category land in Hauptspeise. Confirm, or give a better default.
4. **Pairing misses** are per IP (5) and install-wide (30), see §2.5. Families behind one shared IP (a carrier NAT) can block each other's pairing for 10 minutes; the password login still works.
5. **Login lockout is per e-mail + IP.** A per-account lock would let anyone lock the family out.
6. ~~SPA build path~~ — resolved 2026-11-07: Vite builds with `base: '/app/'`, so the web server serves the assets directly; `index.php` only answers SPA routes with `app/index.html`.
7. **Images: done 2026-11-07, protected since 2026-11-08** (§4.3.1). Open: photos linked as http(s) URLs (old recipes, agents) are still hotlinked, not copied (the AI import copies its photos); step photos have no upload in the SPA yet; AI image enhancement is not built (no surface asks for it). The seeded demo family's pictures under `public/media/<id>/demo/` keep working as plain files locally; they are not part of a deploy.
8. **Section classification** uses the word list only; an AI fallback for unknown names is not built (it would cost a call per unknown ingredient).
9. **`recentManualNames`** comes from bought own items; the prototype used a fixed list.
10. **iPad vs Mac:** iPadOS sends a Mac User-Agent and the server can't see touch support, so an iPad is labelled "Mac · Safari". The prototype's client-side check could tell them apart; the SPA could send a hint at login if this matters.
11. **SPA wiring: done 2026-11-07** (`frontend/src/lib/http.ts`, `api.ts`, `auth.ts`); the capture flow uses the real `/ai/import` since 2026-11-08 (`lib/demo-data.ts` is gone). Still client-side: the cooking-step ingredient matching when `ingredientIds` is null.
12. ~~`mcp/sdk`~~: removed 2026-11-08 (§9.1).
13. **Rate-limit defaults** (120 per key, 300 per IP per minute, 30 AI imports per family and hour) are guesses; tune once real agents run.
14. **Default AI provider** (MIGRATION_PLAN §14.1): the code defaults to `opencode` (the old app's setting, its key is in the local `.env`). Anthropic and OpenAI are one variable away. None of the three has been called for real yet: try a few links and photos with each before cutover and compare.
15. **all-inkl and long requests:** whether PHP-FPM there allows `fastcgi_finish_request` and `set_time_limit(300)` is unknown until `./deploy.sh --check` runs on the real host. Without them an import runs inside the request and must finish within the host's limit (often 60–120 s on shared hosting); the poll and cron fallbacks then catch jobs that were cut off.
16. **Recipes saved from an import** get `created_via = app`, not `import` (the draft does not say where it came from). Add an `importJobId` to `POST /recipes` if the difference matters.

---

## 11. Running it

```sh
composer install
cp .env.example .env          # the PHP block at the end; set APP_SECRET
php bin/console migrate       # creates DB_NAME if missing
php bin/console user:create --email=nils@familie.de --name=Nils   # invite mail; or --password=…
php -S localhost:8080 -t public public/index.php    # or the Local site (nginx → public/index.php)
php bin/console api-key:create --email=nils@familie.de --scopes=recipes:read,mealplan:write
claude mcp add --transport http essensplan-local http://localhost:8080/mcp --header "Authorization: Bearer esp_…"
```

Tests need a MySQL 8 server; they recreate their own database (`TEST_DB_NAME`, default `essensplan_test`) on every run. Connection defaults in `phpunit.xml` are the Local site's (`127.0.0.1:10029`, root/root); env vars override them: `DB_PORT=3306 DB_PASS= vendor/bin/phpunit`. `vendor/bin/phpstan analyse` runs the static check.

**On all-inkl** there is no shell: `./deploy.sh` builds and uploads over FTP, migrates through `/ops/migrate`, and `./deploy.sh --console …` runs the † commands of §7. Setup and day-to-day use: [DEPLOY.md](DEPLOY.md).
