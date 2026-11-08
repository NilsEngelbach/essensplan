# Deploy to all-inkl

`./deploy.sh` builds the app on your computer: `vendor/` (`composer install --no-dev`) and the SPA (`npm run build`). The server never needs Composer. One `ssh` connection then carries the whole build as one archive (about 4 MB):
1. On the server, the script checks the target folder, `config.php`, and that PHP is 8.2+ with `pdo_mysql`. If anything is off, it stops before changing anything.
2. It unpacks the archive into `.deploy-new/`, turns maintenance mode on and swaps the folders in. The previous version waits in `.deploy-old/`.
3. `bin/console migrate` runs, maintenance mode goes off, and the old version is removed.

`config.php`, `storage/` and everything else not in the archive stay untouched. With a password you type it once per run; with an SSH key never.

The script runs in **Git Bash**, which brings `ssh`, `tar` and `curl`. For the build it uses Local's PHP and its bundled Composer (or `DEPLOY_PHP` / `DEPLOY_COMPOSER`), plus Node for the SPA.

## What lands where

```
<DEPLOY_SSH_PATH>/        e.g. /www/htdocs/w0…/essen.example.de, never reachable from the web (.htaccess: Require all denied)
├── config.php            the server's settings (deploy.sh --push-config, never in a normal deploy)
├── .htaccess  bin/  migrations/  src/  vendor/
├── storage/              written by PHP: media/ (photos), ai-input/, mail.log. Never in the archive
└── public/               ← the domain points here (its .htaccess says Require all granted)
    ├── index.php  .htaccess  version.txt
    └── app/              the built SPA
```

## First setup

1. **PHP.** KAS → Domain → PHP version: **8.2 or newer** for the domain.
2. **Database.** KAS → Datenbanken → new MySQL database. Note the database name, user and password (host `localhost`). It must be **MySQL 8**, not MariaDB (D21).
3. **Mailbox.** KAS → E-Mail → a mailbox such as `essen@deine-domain.de` for invite and reset mails. SMTP: `w0….kasserver.com`, port 587 (`tls`) or 465 (`ssl`); user and password are the mailbox's.
4. **SSH.** Log in once by hand: `ssh <ssh-user>@w0….kasserver.com`. Note the app folder's absolute path (`pwd`), and check `php -v`. If it is older than 8.2, find the versioned command (`ls /usr/bin/php*`, e.g. `php83`).

   Optional, saves the password: `ssh-keygen -t ed25519` (Enter for the defaults), then `cat ~/.ssh/id_ed25519.pub | ssh <ssh-user>@w0….kasserver.com 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'`.
5. **Domain.** KAS → Domain → Ziel: `<app folder>/public`. Turn on SSL (Let's Encrypt). Until it is on, the domain serves the `*.kasserver.com` certificate. Once https works, uncomment the HSTS line in `public/.htaccess` and deploy again.
6. **`.env.deploy`** (only for the script, never uploaded). Copy `.env.deploy.example` to `.env.deploy` and fill in `DEPLOY_SSH`, `DEPLOY_SSH_PATH`, `DEPLOY_SSH_PHP` and `DEPLOY_URL`.
7. **`config.production.php`** (the app's settings; on the server it becomes `config.php`). Copy `config.production.example.php` and fill in:
   - `APP_ENV` `production`, `APP_URL` `https://…`, `APP_SECRET` (`php -r "echo bin2hex(random_bytes(32));"`);
   - `DB_HOST` `localhost`, `DB_PORT` `3306`, `DB_NAME`, `DB_USER`, `DB_PASS` from step 2;
   - `MAIL_DRIVER` `smtp`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_ENCRYPTION`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` from step 3;
   - `CRON_TOKEN` (`php -r "echo bin2hex(random_bytes(24));"`);
   - the AI provider and its key (`AI_PROVIDER`, `OPENCODE_API_KEY` …).

   It is plain PHP (`return ['KEY' => '…', …];`), so passwords need no escaping beyond `\'`. Both files are gitignored. Before uploading, the script loads the file with PHP and stops on syntax errors or missing values.
8. **Deploy.** `./deploy.sh --dry-run`, then `./deploy.sh --push-config`.
9. **Check.** `./deploy.sh --check` lists PHP extensions, limits, the MySQL version, pending migrations, writable folders, mail and the AI key. It runs the command-line PHP. The web PHP's limits can differ, and two of them matter for the AI import: `max_execution_time` (the import raises it to 300 s) and `fastcgi_finish_request` (with it, imports run after the answer and the app polls).
10. **Families.** `./deploy.sh --console user:create --email=… --name=…` sends the invite mail.
11. **Cron.** KAS → Tools → Cronjobs, every 15 minutes or hourly, URL `https://<domain>/cron?token=<CRON_TOKEN>`. It runs import jobs that were cut off and the cleanup (`purge`). Without it, cleanups don't happen; imports still work. Ten wrong tokens from one IP lock that IP out of `/cron` for 10 minutes.

## Updates

```sh
./deploy.sh --dry-run          # build and show what would go up
./deploy.sh                    # swap in, migrate
./deploy.sh --no-build         # same, with the last build (.deploy/build)
./deploy.sh --push-config      # also replace the server's config.php with config.production.php
./deploy.sh --maintenance-off  # after a failed migration, once the cause is fixed
```

- **What goes up.** The files git knows about in `bin/ src/ migrations/ public/`, the root `.htaccess`, `vendor/` and `public/app/`. Uncommitted changes go up too, with a warning.
- **Maintenance mode.** While the folders are swapped and migrated, everything answers 503 "Essensplan wird gerade aktualisiert" (the SPA shows its error toast). That takes seconds. If the migration fails, the site stays in maintenance and the previous version stays in `.deploy-old/`. Fix the cause and deploy again, or run `./deploy.sh --maintenance-off`.
- **Live version.** Every deploy writes `public/version.txt` (commit and time) and checks it and `/api/v1/health` over https afterwards.
- **Safety.** The script only writes into an empty folder or one that already holds this app (`src/`, `public/`, `bin/console`); a wrong `DEPLOY_SSH_PATH` stops before any change.

## Console

```sh
./deploy.sh --check
./deploy.sh --console user:list
./deploy.sh --console user:create --email=oma@familie.de "--name=Oma und Opa"
./deploy.sh --console user:invite --email=oma@familie.de
./deploy.sh --console user:disable --email=…    # and user:enable
./deploy.sh --console api-key:create --email=… --scopes=recipes:read,mealplan:write
./deploy.sh --console purge
```

Every `bin/console` command works; `./deploy.sh --console help` lists them.

## Good to know on all-inkl

- **Parent `.htaccess`.** Apache also applies the app folder's `.htaccess` (`Require all denied`) below `public/`, so `public/.htaccess` has to say `Require all granted`. Without it, every URL answers 403.
- **Domain SSL.** Until Let's Encrypt is on for the domain, it serves the `*.kasserver.com` certificate and HTTPS checks fail with `SEC_E_WRONG_PRINCIPAL`.
- **SSH, not FTP.** FTPS uploads from Git Bash lost files (426 / partial uploads), so deploys go over SSH as one archive (D22).
- **Agents from outside** need the `Authorization` header to reach PHP; `public/.htaccess` passes it on. Check it with the `curl` call in [MCP.md](MCP.md).

Not checked yet on the live server: the web PHP's limits (step 9), cron and SMTP sender records. They are tracked in [TODO.md](../TODO.md).
