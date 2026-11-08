# Deploy to all-inkl

`./deploy.sh` builds the app on your computer and uploads it over FTP with TLS. The server needs neither SSH nor Composer:
- `vendor/` (`composer install --no-dev`) and the SPA (`npm run build`) are built locally and uploaded;
- migrations and the console commands run over HTTPS at `/ops`, guarded by a token.

The script runs in **Git Bash**; its `curl` speaks FTPS, so nothing else needs installing. For the build it uses Local's PHP and its bundled Composer (or `DEPLOY_PHP` / `DEPLOY_COMPOSER`), plus Node for the SPA.

## What lands where

```
<DEPLOY_PATH>/            e.g. /essensplan, never reachable from the web (.htaccess: Require all denied)
├── .env                  the server's settings (deploy.sh --push-env, never in a normal upload)
├── .deploy-manifest      what was uploaded, with hashes
├── .htaccess  bin/  migrations/  src/  vendor/
├── storage/              written by PHP: media/ (photos), ai-input/, mail.log. Never uploaded, never deleted
└── public/               ← the domain points here
    ├── index.php  .htaccess  version.txt
    └── app/              the built SPA
```

## First setup

1. **PHP.** KAS → Domain → PHP version: **8.2 or newer** for the domain.
2. **Database.** KAS → Datenbanken → new MySQL database. Note the database name, user and password (host `localhost`). It must be **MySQL 8**, not MariaDB (D21); `./deploy.sh --check` shows the version later.
3. **Mailbox.** KAS → E-Mail → a mailbox such as `essen@deine-domain.de` for invite and reset mails. SMTP: `w0….kasserver.com`, port 587 (`tls`) or 465 (`ssl`); user and password are the mailbox's.
4. **FTP user.** KAS → FTP → "FTP-Zugang anlegen", limited to a new folder `/essensplan`. Then `DEPLOY_PATH=/` (the user's root is that folder). With the main FTP user instead: `DEPLOY_PATH=/essensplan`.
5. **`.env.deploy`.** Copy `.env.deploy.example` to `.env.deploy` and fill in:
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PASS`, `DEPLOY_PATH`;
   - `DEPLOY_URL` (the https address);
   - `DEPLOY_OPS_TOKEN`: `php -r "echo bin2hex(random_bytes(24));"`.
6. **`.env.production`.** The server's `.env`. Take the PHP block at the end of `.env.example` and set:
   - `APP_ENV=production`, `APP_URL=https://…`, `APP_SECRET` (`php -r "echo bin2hex(random_bytes(32));"`);
   - `DB_HOST=localhost`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASS` from step 2;
   - `MAIL_DRIVER=smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_ENCRYPTION`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` from step 3;
   - `OPS_TOKEN` = the same value as `DEPLOY_OPS_TOKEN`, and a different `CRON_TOKEN`;
   - the AI provider and its key (`AI_PROVIDER`, `OPENCODE_API_KEY` …).

   Both files are gitignored. The script checks the obvious mistakes before uploading.
7. **Upload.** `./deploy.sh --push-env`. The first run uploads about 5 000 files (mostly the Anthropic SDK in `vendor/`); against a local test server that took 6 minutes. It uploads in batches and records each batch in the manifest, so an aborted run only sends the rest next time. Then it applies the migrations over `/ops/migrate`.
8. **Domain.** KAS → Domain → Ziel: `<folder>/public`. Turn on SSL (Let's Encrypt). Once https works, uncomment the HSTS line in `public/.htaccess` and deploy again.
9. **Check.** `./deploy.sh --check` lists what the server offers. Important for the AI import:
   - `max_execution_time` after `set_time_limit(300)`;
   - `fastcgi_finish_request` (with it, imports run after the answer and the app polls).

   It also shows PHP extensions, upload limits, the MySQL version, pending migrations, writable folders, mail and the AI key.
10. **Families.** `./deploy.sh --console user:create --email=… --name=…` sends the invite mail. The data of the old app comes with the cutover (MIGRATION_PLAN §10): import locally, then `mysqldump` → phpMyAdmin, and upload `storage/media/` by FTP.
11. **Cron.** KAS → Tools → Cronjobs, every 15 minutes or hourly, URL `https://<domain>/cron?token=<CRON_TOKEN>`. It runs import jobs that were cut off and the cleanup (`purge`). Without it, cleanups don't happen; imports still work.

## Updates

```sh
./deploy.sh --dry-run     # build and list what would be uploaded or deleted
./deploy.sh               # upload it, migrate
./deploy.sh --no-build    # same, with the last build (.deploy/build)
./deploy.sh --full        # upload everything again (e.g. after changing files on the server by hand)
./deploy.sh --push-env    # also replace the server's .env with .env.production
```

- **Changed files only.** Deploys the files git knows about in `bin/ src/ migrations/ public/`, the root `.htaccess`, `vendor/` and `public/app/`. Only changed files go up (by the hashes in the server's `.deploy-manifest`, so any computer can deploy), files you deleted are removed, uncommitted changes are uploaded with a warning.
- **Maintenance mode.** When code changes (anything outside `public/app/`), the script first puts `.maintenance` on the server. Everything except `/ops` then answers 503 "Essensplan wird gerade aktualisiert" (the SPA shows its error toast). After the upload it migrates and removes the flag. If a run aborts, the site stays in maintenance until the next successful run, or `./deploy.sh --maintenance-off`. A change to the SPA alone needs no maintenance: assets go up first, `index.html` last.
- **Live version.** Every deploy writes `public/version.txt` (commit and time) and checks it and `/api/v1/health` over https afterwards.

Deleting is deliberately narrow, as in the schichtplan script:
- only single files listed in the server manifest, plus folders that became empty, never recursively;
- only into a folder that is empty, has the manifest, or already holds this app (another start folder stops before any change);
- the manifest must come from this script, be complete (it ends with `# Ende (N Dateien)`) and list only plain paths; `.env`, `.maintenance`, `storage/` and `public/version.txt` can never be in it;
- more than 10 deletions that are also more than a quarter of the deployment need `--allow-delete`.

## Console without SSH

```sh
./deploy.sh --check
./deploy.sh --console user:list
./deploy.sh --console user:create --email=oma@familie.de "--name=Oma und Opa"
./deploy.sh --console user:invite --email=oma@familie.de
./deploy.sh --console user:disable --email=…    # and user:enable
./deploy.sh --console purge
```

Allowed over HTTP: `migrate`, `check`, `user:create`, `user:invite`, `user:list`, `user:disable`, `user:enable`, `purge`, `jobs:run`, `cron`, `media:move`. The rest is never allowed over HTTP, so a leaked `OPS_TOKEN` can neither delete a family nor read one: `user:delete`, `api-key:create` and the importer. For those, run `bin/console` locally against a copy of the database, or use phpMyAdmin.

Ten wrong tokens from one IP lock that IP out of `/ops` and `/cron` for 10 minutes. To switch the door off, empty `OPS_TOKEN` in the server's `.env`. Then migrations have to go through phpMyAdmin (`migrations/*.sql` in order, plus a row in `schema_migrations`).

## Not verified on all-inkl yet

The script was tested against a local FTPS server (pyftpdlib with TLS) and `php -S`:
- first deploy;
- no-op run;
- SPA-only change;
- code change with a migration run;
- deletions with empty folders;
- refusing a foreign folder;
- `--check`, `--console`.

Still to see on the real host:
- all-inkl's FTP server and certificate (Schannel checks it; `DEPLOY_HOST` must be the `w0….kasserver.com` name the certificate is for);
- how many parallel connections it accepts (`DEPLOY_PARALLEL`, default 4);
- PHP-FPM limits (`--check`);
- the Apache rewrite for `Authorization`.
