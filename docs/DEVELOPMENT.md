# Local development

The app runs locally on a site in [Local](https://localwp.com/) (nginx, PHP 8.2, MySQL 8, Mailpit), whose docroot is the repo's `public/` folder (D5). The frontend can run on the Vite dev server against that site.

Paths and ports differ per machine. Keep yours in **`LOCAL.md`** in the repo root: it is gitignored, so the committed docs stay free of personal paths. Settings the app reads go into `.env` (also gitignored).

## Prerequisites

- Local with a site named `essen` (any blank PHP site: PHP 8.2, nginx, MySQL 8). It is reachable at http://essen.local.
- Node 20+ for the frontend.
- Git Bash on Windows (for `deploy.sh`).

Local's PHP and Composer are enough for the backend. In the site's shell (Local → right-click the site → Open site shell) `php` and `composer` are on the PATH.

## Setup

1. **Point the site at the repo.** Replace the site's empty docroot with a junction (Windows) or symlink to the repo's `public/`:

   ```bat
   rmdir "<Local Sites>\essen\app\public"
   mklink /J "<Local Sites>\essen\app\public" "<repo>\public"
   ```

   PHP resolves the junction, so `../vendor` and `../src` load. nginx already sends every non-file request to `index.php`; it ignores `.htaccess` and blocks dotfiles.
2. **Settings.** `cp .env.example .env`, then set `APP_SECRET` (`php -r "echo bin2hex(random_bytes(32));"`) and the database port and login from Local → Database. For mail through Mailpit, set `MAIL_DRIVER=smtp` and Mailpit's SMTP port (Local → Tools → Mailpit); with the default `MAIL_DRIVER=log`, mails land in `storage/mail.log`.
3. **Backend.**

   ```sh
   composer install
   php bin/console migrate                       # creates DB_NAME if missing
   php bin/console user:create --email=du@familie.de --name=Familie --password=…
   ```

   Without `--password`, `user:create` mails an invite link instead.
4. **Frontend.**

   ```sh
   cd frontend
   npm install
   npm run dev      # http://localhost:5173, proxies /api, /mcp and /media to http://essen.local
   npm run build    # type-checks and builds into public/app; then http://essen.local serves it
   ```

## Tests and checks

```sh
vendor/bin/phpunit                         # all tests
vendor/bin/phpunit tests/PlanTest.php      # one file; --filter testName for one test
vendor/bin/phpstan analyse
cd frontend && npm run typecheck
```

The tests need a MySQL 8 server and recreate their own database (`TEST_DB_NAME`, default `essensplan_test`, must contain "test") on every run. They don't read `.env`: the connection comes from environment variables, with defaults in `phpunit.xml`. If your MySQL differs from those defaults, override them, e.g. `DB_PORT=3306 DB_PASS= vendor/bin/phpunit`.

## Trying the API and MCP locally

```sh
php bin/console api-key:create --email=du@familie.de --scopes=recipes:read,mealplan:write
curl -H "Authorization: Bearer esp_…" "http://essen.local/api/v1/recipes?limit=5"
claude mcp add --transport http essensplan-local http://essen.local/mcp --header "Authorization: Bearer esp_…"
```

Or create the key in the app under Konto → API & Agenten. More in [MCP.md](MCP.md).

Without the Local site, PHP's built-in server works too: `php -S localhost:8080 -t public public/index.php` (set `APP_URL=http://localhost:8080`). It runs AI imports inside the request instead of after the response.

## Local vs. production

| | Local | all-inkl |
|---|---|---|
| Web server | nginx; `.htaccess` is ignored | Apache with `public/.htaccess` (rewrites, `Authorization` pass-through) |
| PHP | php-cgi, generous timeouts (1200 s) | PHP-FPM; the web limits are stricter and only visible there |
| Settings | `.env` | `config.php` (from `config.production.php`, [DEPLOY.md](DEPLOY.md)) |
| Mail | Mailpit or `storage/mail.log` | all-inkl SMTP |
| AI import | runs inside the request | answers 202 and continues after the response (`fastcgi_finish_request`) |
