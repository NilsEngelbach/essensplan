# Decisions

The product and architecture decisions behind Essensplan. Code comments and migrations cite them by number (`D15`, `D19`, …). Numbers are never reused; a decision that changes gets a new entry.

The app was moved from Next.js/Supabase/Vercel to PHP/MySQL on all-inkl in November 2026 and has been live there since 2026-11-08. The migration plan and handoff notes were retired afterwards; they are in the git history before that date.

| # | Decision |
|---|---|
| D1 | **No Laravel.** Slim 4, PHP-DI, plain PDO and a few small Composer packages. Sessions, CSRF, password resets, rate limits and the migration runner are built in-house and tested. |
| D2 | **UX first.** Each screen was shaped and prototyped before its backend; the schema and the API follow the screens. |
| D3 | **Several meals per day** (meal slots). |
| D4 | **Agents authenticate with API keys only** (REST and MCP). OAuth, which claude.ai in the browser and ChatGPT need for their connectors, is out of scope. The scope model is built so OAuth tokens could map onto it later. |
| D5 | **Local development on a "Local" site** (`essen.local`, nginx + PHP 8.2 + MySQL 8, Mailpit). See [DEVELOPMENT.md](DEVELOPMENT.md). |
| D6 | **React SPA built with Vite**, served by the PHP app from `public/app`. |
| D7 | **Meal slots are a fixed set:** Frühstück, Mittagessen, Abendessen, Snack. Several entries per slot. |
| D8 | Plan entries imported from the old app went into **Mittagessen**. |
| D9 | impeccable build path: **code-first** (no image comps). |
| D10 | **Family-only app:** no public landing page, no open sign-up. |
| D11 | **One account is one family.** The family shares the login and pairs its devices; there are no members, roles or households. |
| D12 | **The grocery list is used in the store,** so its check-off state lives on the server. No offline mode. |
| D13 | **UI voice "du"**; dark mode is required. |
| D14 | **Home is the week.** Installable web app on Android and iPhone; share target on Android, paste-a-link on iPhone. Phone, tablet and desktop are all first-class. |
| D15 | **Wochenplan:** an entry is a recipe **or** free text (presets Reste · Essen gehen · Auswärts · Bestellen, plus recent own texts). No per-entry servings, no notes; the grocery list uses the recipe's base servings. **Wochenbeginn** (default Mo) and **Planungstag** (default Fr; the home week flips to next week from then on) are settings. |
| D16 | **Einkaufsliste:** days picked per trip (default: planned days not yet shopped); one store with a user-defined section order; own items stay until bought; "Zuhause prüfen" with learned "meist da"; the list follows plan changes live ("neu"); "Einkauf abschließen" is explicit and undoable. Not built: several stores, live sync between two phones, "which recipe needs it". |
| D17 | **Kochmodus:** one step per screen, readable from a distance; tap anywhere for the next step; ingredients per step; no timers, no mise en place. "Gekocht" is derived from past plan entries; there are no cooked events. |
| D18 | **API & Agenten:** rights picked per key, no presets; write implies read. Setup snippets for Claude Code, Claude Desktop (via `mcp-remote`), other MCP clients and REST. Activity log with per-action undo (blocked once the target changed), marks where an agent changed something, avatar dot; 90-day retention. Scopes `shopping:read|write`. |
| D19 | **Login & Geräte:** e-mail and password with "Angemeldet bleiben" (on: rolling one-year session; off: ends with the browser). New family devices pair with a logged-in one by a 6-digit code or QR (10 minutes, single use). Konto lists the devices (log out one or all others) and Name und E-Mail (changing the e-mail needs the current password). No password change in Konto (the reset mail does it), no web setup screen. Sessions are DB rows, one per device. |
| D20 | **Several families per install.** `users.id` is the tenant key. No sign-up over HTTP: the operator adds a family with `bin/console user:create`, which mails an invite link (7 days); `user:disable` / `user:enable` lock a family out and back in; `user:delete` removes it with all its data. Wrong pairing codes count per IP and install-wide, never against another family's code. |
| D21 | **MySQL 8 only.** MariaDB is not supported or tested; MySQL 8 features may be used. |
| D22 | **Deploys run from the owner's machine over SSH** (`deploy.sh`): build locally, send one archive, swap it in, migrate on the server. The first deploys went over FTPS and lost files, so the FTP mode and its HTTP operator door `/ops` were dropped. See [DEPLOY.md](DEPLOY.md). |
| D23 | **The MCP server is hand-rolled** (`src/Mcp/`), stateless, instead of `mcp/sdk`: the SDK's handshake-era transport keeps sessions and was pre-1.0. Worth revisiting once `mcp/sdk` reaches 1.0. |
| D24 | **Servings per plan entry** (replaces "no per-entry servings" in D15). A recipe entry may cook for 1–12 servings; unset means the recipe's own. The grocery list scales that entry's ingredients by entry ÷ recipe servings. The control stays quiet because it is rarely used: a stepper in the entry menu, a small „6 Port.“ on the entry only when it differs, and planning from a recipe takes over its servings dial. |
| D25 | **The AI import is optional.** A provider is configured when its API key is set; with none (or `AI_PROVIDER=off`) the import is off: the app opens the editor instead, hides the „KI-Import“ right for new keys, and MCP drops `import_recipe_from_url`. The REST API and MCP server stay on either way. `AI_PROVIDER` is the default; with several configured, each family picks one in Konto. |
