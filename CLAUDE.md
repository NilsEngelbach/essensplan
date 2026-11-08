# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Essensplan is a German family meal planner: one family's recipe collection, a weekly meal plan with meal slots, a grocery list derived from the plan, a cooking mode, and AI import of recipes from a link or a photo. AI agents use it through a REST API and an MCP server with scoped API keys. Product context: [PRODUCT.md](PRODUCT.md); visual system: [DESIGN.md](DESIGN.md); data model, endpoints, MCP tools and error codes: [docs/BACKEND.md](docs/BACKEND.md); connecting agents: [docs/MCP.md](docs/MCP.md).

It runs on all-inkl webspace (Apache, PHP-FPM, MySQL 8), live since 2026-11-08; it replaced a Next.js/Supabase app, which is gone. Decisions D1–D23, cited in code comments, are in [docs/DECISIONS.md](docs/DECISIONS.md); open work in [TODO.md](TODO.md).

## Commands

Backend (repo root):
- `composer install`
- `php bin/console migrate` – apply `migrations/*.sql` (creates the database if missing)
- `php bin/console help` – all operator commands (users, API keys, purge, jobs, cron, openapi:dump)
- `vendor/bin/phpunit` – tests; needs MySQL 8 and recreates `essensplan_test` each run (connection from env vars, defaults in `phpunit.xml`)
- `vendor/bin/phpunit tests/PlanTest.php` – one test file; `--filter testName` for one test
- `vendor/bin/phpstan analyse`

Frontend (`frontend/`):
- `npm run dev` – Vite on :5173, proxies `/api`, `/mcp` and `/media` to `http://essen.local`
- `npm run build` – type-checks and builds the SPA into `../public/app`
- `npm run typecheck`

Deploy: `./deploy.sh` (build locally, swap in over SSH, migrate), `./deploy.sh --console <command>` on the server. See [docs/DEPLOY.md](docs/DEPLOY.md).

Local environment: the "Local" site `essen` at http://essen.local (nginx, PHP 8.2, MySQL 8, Mailpit); its docroot is a junction to the repo's `public/`. Setup: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). This machine's paths, ports and demo login are in the gitignored `LOCAL.md`; read it when you need them, and never copy them into committed files.

## Architecture

**Backend** (`src/`, namespace `Essensplan\`, PHP 8.2, Slim 4, PHP-DI, plain PDO; no framework ORM):
- `public/index.php` – front controller: maintenance check, then Slim. `App.php` builds the container and routes: `/api/v1` (REST, table in `Http/Routes.php`), `/mcp`, `/media/{user}/{file}` (photos, family-only), `/cron?token=`, everything else the SPA.
- `Http/` – controllers, middleware, `Routes.php` (method, path, handler, auth/scope per route), `OpenApi.php` (generated from the same JSON Schemas used for validation, `Schema/`).
- `Service/` – domain logic shared by REST and MCP (recipes, plan, shopping, auth/sessions/devices, API keys, agent activity and undo, media, mail, rate limits).
- `Repository/` – SQL. **Every method takes `$userId`**; there is no unscoped lookup. This is what keeps families apart.
- `Domain/` – pure logic ported from the frontend (shopping aggregation and sections, catalog of categories/tags).
- `Mcp/` – stateless Streamable HTTP MCP server and its tools.
- `Ai/` – AI import: page fetching, providers (OpenCode, Anthropic, OpenAI behind `AI_PROVIDER`), import jobs that run after the response.
- `Console/` – `bin/console` commands, migrator, server check.

**Frontend** (`frontend/src/`, React 18 + react-router 6, no UI library):
- `features/` – one folder per surface: `rezepte`, `woche`, `einkauf`, `kochen`, `konto`, `login`.
- `lib/api.ts`, `lib/auth.ts` – the API client; their signatures and `lib/types.ts` are the contract the backend serves.
- `lib/shopping.ts`, `lib/cooking.ts`, `lib/format.ts` – client-side logic; `src/Domain/Shopping.php` mirrors `shopping.ts`.
- `styles/tokens.css` – design tokens from DESIGN.md.

**Configuration:** `.env` locally (template `.env.example`); on the server `config.php`, a PHP array uploaded with `./deploy.sh --push-config` from the gitignored `config.production.php` (template `config.production.example.php`). `Config::load` prefers `config.php` when it exists.

## Conventions

- **JSON:** camelCase, matching `frontend/src/lib/types.ts`. Dates `YYYY-MM-DD` in Europe/Berlin, timestamps ISO 8601. Errors are `{"error":{"code":"…","message":"…"}}`.
- **User-visible text is German, "du" voice.** Reuse the strings the frontend already shows.
- **Middleware order:** JsonErrors → routing → RateLimit → Authenticate (session | API key) → RequireScope → Csrf (session only).
- **API keys:** `esp_` + base62; only the sha256 hash and a 12-char prefix are stored; the secret is shown once. Scopes: `recipes:read|write|delete`, `mealplan:read|write`, `shopping:read|write`, `ai:use`; write implies read. Every key-authenticated write is logged in `agent_activity` with an undo payload.
- **Migrations:** add a new `migrations/NNN_name.sql` (MySQL 8, utf8mb4); never edit an applied one. MariaDB is not a target (D21).
- **Passwords:** bcrypt; `$2a$` hashes from the imported accounts are accepted and rehashed on login.
- **Never commit secrets or machine paths:** `.env`, `.env.deploy`, `config.production.php` and `LOCAL.md` are gitignored.
- **Docs:** keep them current, not historical. Update `docs/BACKEND.md` with the code, record a new decision as the next D-number in `docs/DECISIONS.md`, and use placeholders (`<repo>`, `essen.example.de`) for paths and domains.
