# Deploy to all-inkl

`./deploy.sh` builds the app on your computer: `vendor/` (`composer install --no-dev`) and the SPA (`npm run build`). The server never needs Composer. Two ways up:

- **SSH (use this when the plan has it).** Set `DEPLOY_SSH`, `DEPLOY_SSH_PATH` and, if needed, `DEPLOY_SSH_PHP` in `.env.deploy`. One `ssh` connection carries the whole build as one archive (about 4 MB). On the server it is unpacked into `.deploy-new/`. Then maintenance goes on, the folders are swapped (the previous version waits in `.deploy-old/`), `bin/console migrate` runs, and maintenance goes off. `config.php`, `storage/` and everything else not in the archive stay. `--console` runs `bin/console` over SSH with every command, including `import:supabase` and `user:delete`. With a password you type it once per run; with an SSH key never.
- **FTP (fallback without SSH).** Uploads changed files over FTPS. Migrations and console commands run over HTTPS at `/ops`, guarded by a token.

The script runs in **Git Bash**, which brings `ssh`, `tar` and `curl`. For the build it uses Local's PHP and its bundled Composer (or `DEPLOY_PHP` / `DEPLOY_COMPOSER`), plus Node for the SPA.

### SSH setup
1. Log in once by hand: `ssh <ssh-user>@w0….kasserver.com`. Note the app folder's absolute path (`cd essensplan; pwd`, e.g. `/www/htdocs/w0…/essensplan`), and check `php -v`. If it is older than 8.2, find the versioned command (`ls /usr/bin/php*`, e.g. `php83`).
2. Optional, saves the password: `ssh-keygen -t ed25519` (Enter for the defaults), then `cat ~/.ssh/id_ed25519.pub | ssh <ssh-user>@w0….kasserver.com 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'`.
3. In `.env.deploy`: `DEPLOY_SSH=<ssh-user>@w0….kasserver.com`, `DEPLOY_SSH_PATH=<that path>`, `DEPLOY_SSH_PHP=<php or php83>`. Keep `DEPLOY_URL` (the check after each deploy) and `DEPLOY_OPS_TOKEN` (`--check` shows the web PHP's limits through `/ops`).
4. `./deploy.sh --dry-run`, then `./deploy.sh` (add `--push-config` to replace `config.php`).

## What lands where

```
<DEPLOY_PATH>/            e.g. /essensplan, never reachable from the web (.htaccess: Require all denied)
├── config.php            the server's settings (deploy.sh --push-config, never in a normal upload)
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
5. **Domain.** KAS → Domain → Ziel: `<folder>/public`. Turn on SSL (Let's Encrypt). Do this before the first upload: the upload ends with the migrations over `https://…/ops`, and without the domain they fail and the site stays in maintenance mode. Once https works, uncomment the HSTS line in `public/.htaccess` and deploy again.
6. **`.env.deploy`** (only for the script, never uploaded). Copy `.env.deploy.example` to `.env.deploy` and fill in:
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PASS`, `DEPLOY_PATH`;
   - `DEPLOY_URL` (the https address);
   - `DEPLOY_OPS_TOKEN`: `php -r "echo bin2hex(random_bytes(24));"`.
7. **`config.production.php`** (the app's settings; on the server it becomes `config.php`). Copy `config.production.example.php` and fill in:
   - `APP_ENV` `production`, `APP_URL` `https://…`, `APP_SECRET` (`php -r "echo bin2hex(random_bytes(32));"`);
   - `DB_HOST` `localhost`, `DB_PORT` `3306`, `DB_NAME`, `DB_USER`, `DB_PASS` from step 2;
   - `MAIL_DRIVER` `smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_ENCRYPTION`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` from step 3;
   - `OPS_TOKEN` = the same value as `DEPLOY_OPS_TOKEN`, and a different `CRON_TOKEN`;
   - the AI provider and its key (`AI_PROVIDER`, `OPENCODE_API_KEY` …).

   It is plain PHP (`return ['KEY' => '…', …];`), so passwords need no escaping beyond `\'`. Both files are gitignored. Before uploading, the script loads the file with PHP and stops on syntax errors, missing values or a token mismatch.
8. **Upload.** `./deploy.sh --push-config`. The first run uploads about 5 000 files (mostly the Anthropic SDK in `vendor/`); against a local test server that took 6 minutes. It uploads in batches and records each batch in the manifest, so an aborted run only sends the rest next time. Then it applies the migrations over `/ops/migrate`.
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
./deploy.sh --push-config # also replace the server's config.php with config.production.php
```

- **Changed files only.** Deploys the files git knows about in `bin/ src/ migrations/ public/`, the root `.htaccess`, `vendor/` and `public/app/`. Only changed files go up (by the hashes in the server's `.deploy-manifest`, so any computer can deploy), files you deleted are removed, uncommitted changes are uploaded with a warning. After each batch the script lists the target folders and checks that every file is there with its size; only those go into the manifest.
- **Maintenance mode.** When code changes (anything outside `public/app/`), the script first puts `.maintenance` on the server. Everything except `/ops` then answers 503 "Essensplan wird gerade aktualisiert" (the SPA shows its error toast). After the upload it migrates and removes the flag. If a run aborts, the site stays in maintenance until the next successful run, or `./deploy.sh --maintenance-off`. A change to the SPA alone needs no maintenance: assets go up first, `index.html` last.
- **Live version.** Every deploy writes `public/version.txt` (commit and time) and checks it and `/api/v1/health` over https afterwards.

Deleting is deliberately narrow, as in the schichtplan script:
- only single files listed in the server manifest, plus folders that became empty, never recursively;
- only into a folder that is empty, has the manifest, or already holds this app (another start folder stops before any change);
- the manifest must come from this script, be complete (it ends with `# Ende (N Dateien)`) and list only plain paths; `config.php`, `.env`, `.maintenance`, `storage/` and `public/version.txt` can never be in it;
- more than 10 deletions that are also more than a quarter of the deployment need `--allow-delete`.

## Console without SSH (FTP mode)

```sh
./deploy.sh --check
./deploy.sh --console user:list
./deploy.sh --console user:create --email=oma@familie.de "--name=Oma und Opa"
./deploy.sh --console user:invite --email=oma@familie.de
./deploy.sh --console user:disable --email=…    # and user:enable
./deploy.sh --console purge
```

Allowed over HTTP: `migrate`, `check`, `user:create`, `user:invite`, `user:list`, `user:disable`, `user:enable`, `purge`, `jobs:run`, `cron`, `media:move`, and **temporarily** `import:supabase` (for the one-time migration; remove it from `Console::HTTP_COMMANDS` after the cutover). The rest is never allowed over HTTP, so a leaked `OPS_TOKEN` can neither delete a family nor read one: `user:delete` and `api-key:create`. For those, run `bin/console` locally against a copy of the database, or use phpMyAdmin.

Ten wrong tokens from one IP lock that IP out of `/ops` and `/cron` for 10 minutes. To switch the door off, empty `OPS_TOKEN` in `config.production.php` and run `./deploy.sh --push-config`. Then migrations have to go through phpMyAdmin (`migrations/*.sql` in order, plus a row in `schema_migrations`).

## Not verified on all-inkl yet

The script was tested against a local FTPS server (pyftpdlib with TLS) and `php -S`:
- first deploy;
- no-op run;
- SPA-only change;
- code change with a migration run;
- deletions with empty folders;
- refusing a foreign folder;
- `--check`, `--console`.

Learned on the real host (first deploy, 2026-11-08):
- **FTP certificate.** The `w0….kasserver.com` name works with Schannel.
- **426 on uploads.** With `DEPLOY_PARALLEL=4`, uploads ended in 426 ("transfer aborted"). Curl still counted many of them as sent: about 2 150 of 5 000 files were missing or 0 bytes on the server, all listed in the manifest. Since then, every upload is checked by listing its folders (size per file). Only files found complete go into the manifest; missing ones get one more try, one at a time, and otherwise the run stops, so the next run sends them again.
- **Parent `.htaccess`.** Apache also applies the app folder's `.htaccess` (`Require all denied`) below `public/`, so `public/.htaccess` has to say `Require all granted`. Without it, every URL answers 403.
- **Old curl.** Even one file at a time, Git Bash's curl 8.10.1 (Schannel) got 426 or "partial file" on most uploads. The script now uses the newest curl it finds (Windows ships 8.21 in System32; `DEPLOY_CURL` overrides it); `DEPLOY_TLS_MAX=1.2` is the next thing to try.
- **Domain SSL.** Until Let's Encrypt is on for the domain, it serves the `*.kasserver.com` certificate, and every `/ops` call fails with `SEC_E_WRONG_PRINCIPAL`.

Still to see on the real host:
- how many parallel connections work without 426 (`DEPLOY_PARALLEL`);
- PHP-FPM limits (`--check`);
- the Apache rewrite for `Authorization`.
