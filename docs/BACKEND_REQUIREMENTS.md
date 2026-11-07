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

**Not verified yet:** anything on all-inkl (Apache `.htaccess`, timeouts, SMTP). See §11 for how to run it.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | REST under `/api/v1`, MCP at `/mcp`, everything else is the SPA (`public/app/index.html`) |
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
| `ai_usage`, `ai_jobs` | as in MIGRATION_PLAN §4.1 | tables only; filled in Phase 6 |
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
| GET | `/config` | public | `{minPassword, slots, categories, tags, difficulties, scopes, sections, presets}` |
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

`src/Service/MediaStore.php`: JPEG, PNG, WebP or GIF up to 15 MB and 30 MP. Every image is decoded and re-encoded with GD (EXIF orientation applied, metadata gone) into `public/media/{userId}/{random}.jpg` (1000 px, quality 82) and `…-thumb.jpg` (400 px); transparency becomes white. The web server serves `/media/` as plain files; names are 96 random bits, so a path is only known to whoever saved it (no per-request auth on photos). Errors: 413 `too_large`, 415 `unsupported_image` / `unsupported_media_type`. `purge` deletes photos no recipe or step refers to (after a day, so an upload whose recipe isn't saved yet survives); `user:delete` removes the family's folder. The SPA downscales a picked photo to 1600 px for the preview and uploads it on save, so a cancelled edit uploads nothing. `MEDIA_DIR` overrides the folder (tests).

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

**Prompts:** `plan_week` (reads `week_start` / `planning_weekday` and targets `defaultWeekStart` unless a week is given; optional wishes) and `shopping_for_week`.

---

## 7. Console (`bin/console`)
| Command | Does |
|---|---|
| `migrate` | applies `migrations/*.sql` in order, recorded in `schema_migrations` |
| `user:create --email= [--name=] [--password=] [--no-invite]` | adds a family; without `--password` it gets the invite mail |
| `user:invite --email=` | sends the invite mail again (replaces the old link) |
| `user:list` | every family with last use, devices, recipes, keys and status (eingeladen · aktiv · gesperrt) |
| `user:disable --email=` · `user:enable --email=` | locks a family out at once, or lets it back in with its devices and keys |
| `user:delete --email= --yes` | deletes a family and everything it owns |
| `api-key:create --email= --scopes=a,b [--name=]` | prints a new key (for smoke tests) |
| `purge` | removes soft-deleted entries/items (> 7 days) and recipes (> 30 days), expired sessions, links and reset tokens, activity > 90 days, unused photos (> 1 day) |
| `import:supabase [--email=] [--replace] [--no-images]` | copies families from the old app (§7.1) |
| `openapi:dump [file]` | writes the OpenAPI document |
| `jobs:run` | stub for Phase 6 |

### 7.1 Supabase import (Phase 8, `src/Import/`)
`SupabaseSource` reads the old Postgres over `SUPABASE_DB_URL` (falls back to `DIRECT_URL`) in a read-only transaction; it needs `pdo_pgsql` (on Local: `extension=php_pdo_pgsql.dll`, the DLL and `libpq.dll` ship with Local's PHP). `SupabaseImporter` writes each family in one transaction:
- **Account:** `auth.users` with its id and bcrypt hash (`$2a$` logs in and is rehashed to `$2y$`), `email_confirmed_at`, name from the user metadata or „Familie“. Without a password (magic link) the account gets a random hash and the report says to send `user:invite`.
- **Recipes** keep their ids, `created_via = import`, and their timestamps. Category, tags and difficulty are matched ignoring case and umlaut spelling (`Fruhstuck` → Frühstück); an empty or unknown category becomes Hauptspeise and unknown tags are dropped, both counted in the report. (`Cookidoo`, which the old form offered, is in the new set since 2026-11-07.) Out-of-range times, servings and ratings become null. Ingredients keep the old table order and get their `section` from the word list; steps are renumbered 1…n; `ingredient_ids` stay null.
- **Photos** (recipe and step) are downloaded and stored like uploads (§4.3.1). A failed download keeps the old link and is listed. On Windows without `curl.cainfo` the download uses the system certificate store.
- **MealPlan rows** become Mittagessen entries (D8) on their Europe/Berlin day, keeping their ids; rows without a recipe are left out; rows not at UTC midnight are counted ("check their day").
- A family that already has recipes or entries is skipped unless `--replace`, which first deletes its recipes, entries, shopping state and agent log (account, devices and keys stay). An e-mail that belongs to a different local account is never touched.

**Dry run, 2026-11-07** (old database → Local DB): 2 accounts, 69 recipes, 544 ingredients, 277 steps, 35 photos and 123 of 130 plan entries (7 had no recipe), all counts matching the source; 11 recipes had an empty category. After Cookidoo joined the tag set, the 2 recipes that had it got the tag back by a one-off update (no re-import). About 24 s, mostly photo downloads.

---

## 8. Configuration (`.env`, see `.env.example`)
`APP_ENV`, `APP_URL`, `APP_SECRET`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `MAIL_DRIVER` (log | smtp), `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`, `SESSION_IDLE_HOURS`, `TRUSTED_PROXIES`, `MEDIA_DIR` (default `public/media`), `SUPABASE_DB_URL` (importer; falls back to `DIRECT_URL`); AI variables as in MIGRATION_PLAN §8 (unused in this draft).

---

## 9. Deviations from MIGRATION_PLAN §4–§7
1. **MCP is hand-rolled** (`src/Mcp/Server.php`), not `mcp/sdk`. `mcp/sdk` 0.9 installs on PHP 8.2 and supports both protocol eras, but its handshake-era transport keeps sessions (a session store), and it is pre-1.0. The dispatcher is small and fully stateless. Worth revisiting at `mcp/sdk` 1.0.
2. **List endpoints return summaries:** `/recipes` and suggestion shelves return `RecipeSummary` (no ingredients/steps); the prototype passes full recipes around in memory.
3. **`/meal-plan` is flat** (`entries[]` with an embedded recipe summary), like `listPlanEntries()`; the MCP tool groups by day and slot.
4. **`/grocery-list` is replaced by `/shopping/*`**; `get_grocery_list` needs `shopping:read`, not `mealplan:read`.
5. **`import_recipe_from_url` and `/ai/*`** are not in this draft (Phase 6). `/images` exists since 2026-11-07 (§4.3.1).
6. **Settings live on `/me`** (`settings: {weekStart, planningWeekday}`), not a separate endpoint.
7. **Extra undo kinds** `plan.restore` and `recipe.remove` (agent removed an entry / created a recipe).
8. **FK `meal_plan_entries.recipe_id` is RESTRICT,** not SET NULL: MySQL forbids a CHECK on a column used in an FK action. The app detaches entries before a recipe is purged.
9. **`get_profile` tool added,** so `plan_week` can read the settings.

## 10. Assumptions / open (for the owner)
1. **Undo windows** (§5.6): 7 days for entries and own items, 30 days for recipes, 10 minutes for un-revoking a key. Confirm.
2. **Cooking stats count today** (an entry for today counts as cooked).
3. **Category and tag sets are enforced** on save. The importer maps the old values (§7.1); recipes with an empty old category land in Hauptspeise. Confirm, or give a better default.
4. **Pairing misses** are per IP (5) and install-wide (30), see §2.5. Families behind one shared IP (a carrier NAT) can block each other's pairing for 10 minutes; the password login still works.
5. **Login lockout is per e-mail + IP.** A per-account lock would let anyone lock the family out.
6. ~~SPA build path~~ — resolved 2026-11-07: Vite builds with `base: '/app/'`, so the web server serves the assets directly; `index.php` only answers SPA routes with `app/index.html`.
7. **Images: done 2026-11-07** (§4.3.1). Open: photos are public to anyone who knows the path (fine for a family app?); linked photos (http(s) URLs) are hotlinked, not copied; step photos have no upload in the SPA yet; AI image enhancement is Phase 6.
8. **Section classification** uses the word list only; the AI fallback for unknown names comes with Phase 6.
9. **`recentManualNames`** comes from bought own items; the prototype used a fixed list.
10. **iPad vs Mac:** iPadOS sends a Mac User-Agent and the server can't see touch support, so an iPad is labelled "Mac · Safari". The prototype's client-side check could tell them apart; the SPA could send a hint at login if this matters.
11. **SPA wiring: done 2026-11-07** (`frontend/src/lib/http.ts`, `api.ts`, `auth.ts`). The invite greeting is in; `account_disabled` and the new `code_spent` text come straight from the server. Still client-side: the AI import demo (Phase 6) and the cooking-step ingredient matching when `ingredientIds` is null.
12. **`mcp/sdk`** stays in `composer.json` (it installs on 8.2) but is unused; drop it or switch to it at 1.0.
13. **Rate-limit defaults** (120 per key, 300 per IP per minute) are guesses; tune once real agents run.

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
