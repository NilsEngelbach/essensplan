#!/usr/bin/env bash
# Builds Essensplan locally and puts it on the server (all-inkl) over SSH. Composer is never
# needed on the server: vendor/ and the SPA are built here. The whole build goes up as one
# archive through one ssh connection, is swapped in on the server, and bin/console migrates
# there. Settings come from .env.deploy (see .env.deploy.example).
#
#   ./deploy.sh                  build, swap in, migrate
#   ./deploy.sh --dry-run        build and show what would go up
#   ./deploy.sh --no-build       skip composer/npm, use the last build in .deploy/build
#   ./deploy.sh --push-config    also replace the server's config.php with DEPLOY_CONFIG_FILE
#   ./deploy.sh --check          what the server's PHP offers (bin/console check)
#   ./deploy.sh --console user:list            run any bin/console command on the server
#   ./deploy.sh --console user:create --email=a@b.de --name=Familie
#   ./deploy.sh --maintenance-off             lift maintenance mode after a failed deploy
#
# Runs in Git Bash (ssh, tar, curl). Deploys the files git knows about in bin/, src/,
# migrations/, public/ and the root .htaccess, plus vendor/ (composer install --no-dev) and
# public/app (npm run build). config.php, storage/ (photos, logs) and anything else on the
# server that is not in the build stay untouched.
set -euo pipefail
cd "$(dirname "$0")"

DRY=0 BUILD=1 PUSH_CONFIG=0 CHECK=0 MAINT_OFF=0 CONSOLE=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY=1 ;;
    --no-build) BUILD=0 ;;
    --push-config) PUSH_CONFIG=1 ;;
    --check) CHECK=1 ;;
    --maintenance-off) MAINT_OFF=1 ;;
    --console) shift; [ $# -gt 0 ] || { echo "--console braucht einen Befehl, z. B. --console user:list" >&2; exit 2; }; CONSOLE=("$@"); break ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "✗ $*" >&2; exit 1; }

# ── .env.deploy ──────────────────────────────────────────────────────────────
# Parsed by hand instead of sourced, so values may contain $, spaces or quotes.
[ -f .env.deploy ] || die ".env.deploy fehlt. Kopiere .env.deploy.example nach .env.deploy und trag die SSH-Daten ein."
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}" val="${line#*=}"
  case "$val" in \"*\") val="${val:1:${#val}-2}" ;; \'*\') val="${val:1:${#val}-2}" ;; esac
  case "$key" in DEPLOY_[A-Z_]*) printf -v "$key" '%s' "$val" ;; esac
done < .env.deploy

DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_SSH_PATH="${DEPLOY_SSH_PATH:-}"
DEPLOY_SSH_PHP="${DEPLOY_SSH_PHP:-php}"
DEPLOY_URL="${DEPLOY_URL:-}"
DEPLOY_URL="${DEPLOY_URL%/}"
DEPLOY_CONFIG_FILE="${DEPLOY_CONFIG_FILE:-config.production.php}"

[ -n "$DEPLOY_SSH" ] || die "DEPLOY_SSH fehlt in .env.deploy (z. B. ssh-user@w0….kasserver.com)."
case "$DEPLOY_SSH_PATH" in
  /*/*) ;;
  *) die "DEPLOY_SSH_PATH muss der absolute Pfad des App-Ordners auf dem Server sein (all-inkl: /www/htdocs/w0…/essensplan)." ;;
esac
case "/$DEPLOY_SSH_PATH/" in */../*|*/./*) die "DEPLOY_SSH_PATH darf kein . oder .. enthalten." ;; esac
command -v ssh >/dev/null || die "ssh fehlt. Starte das Skript in Git Bash."

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
native() { cygpath -m "$1" 2>/dev/null || printf '%s' "$1"; }   # Windows path for Windows programs (PHP)

# One connection per run, so a password is asked once (an SSH key: never).
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # quote one word for the remote shell
remote() { ssh -p "$DEPLOY_SSH_PORT" -o ServerAliveInterval=30 "$DEPLOY_SSH" "$1"; }   # remote <script>; stdin goes along
sshp=$(q "${DEPLOY_SSH_PATH%/}") sshphp=$(q "$DEPLOY_SSH_PHP")

# ── Commands on the server ───────────────────────────────────────────────────
if [ $CHECK = 1 ]; then
  echo "(PHP auf der Kommandozeile; die Grenzen des Web-PHP können abweichen)"
  remote "cd $sshp && $sshphp bin/console check" </dev/null || exit 1
  exit 0
fi
if [ ${#CONSOLE[@]} -gt 0 ]; then
  cmd="cd $sshp && $sshphp bin/console"
  for a in "${CONSOLE[@]}"; do cmd+=" $(q "$a")"; done
  remote "$cmd" </dev/null || exit 1
  exit 0
fi
if [ $MAINT_OFF = 1 ]; then
  remote "rm -f $sshp/.maintenance" </dev/null || die "Konnte .maintenance nicht löschen."
  echo "✓ Wartungsmodus aus."
  exit 0
fi

# ── Build ────────────────────────────────────────────────────────────────────
build=.deploy/build
find_php() {
  if [ -n "${DEPLOY_PHP:-}" ]; then PHP=("$DEPLOY_PHP"); return; fi
  # Local's PHP (by Flywheel) loads no php.ini, so pass the extensions composer checks.
  local ls d
  ls="$(cygpath -u "${APPDATA:-}" 2>/dev/null)/Local/lightning-services"
  d=$(ls -d "$ls"/php-8.* 2>/dev/null | sort -V | tail -1 || true)
  if [ -n "$d" ] && [ -x "$d/bin/win64/php.exe" ]; then
    d="$d/bin/win64"
    PHP=("$d/php.exe" -d "extension_dir=$d/ext")
    for e in pdo_mysql mbstring openssl curl gd intl sodium fileinfo; do PHP+=(-d "extension=$e"); done
    return
  fi
  command -v php >/dev/null || die "Kein PHP gefunden. Setz DEPLOY_PHP in .env.deploy."
  PHP=(php)
}
find_composer() {
  if [ -n "${DEPLOY_COMPOSER:-}" ]; then COMPOSER=("${PHP[@]}" "$DEPLOY_COMPOSER"); return; fi
  local phar
  phar="$(cygpath -u "${LOCALAPPDATA:-}" 2>/dev/null)/Programs/Local/resources/extraResources/bin/composer/composer.phar"
  if [ -f "$phar" ]; then COMPOSER=("${PHP[@]}" "$phar"); return; fi
  command -v composer >/dev/null || die "Composer nicht gefunden. Setz DEPLOY_COMPOSER (Pfad zu composer.phar) in .env.deploy."
  COMPOSER=(composer)
}

if [ $BUILD = 1 ]; then
  echo "Baue …"
  find_php; find_composer
  # The SPA (Vite writes it to public/app).
  mkdir -p .deploy
  log=.deploy/build.log
  : > "$log"
  if [ ! -d frontend/node_modules ]; then (cd frontend && npm ci --no-audit --no-fund) >>"$log" 2>&1 || die "npm ci ist fehlgeschlagen ($log)."; fi
  (cd frontend && npm run build) >>"$log" 2>&1 || die "npm run build ist fehlgeschlagen ($log)."
  # The PHP app. vendor/ stays between builds, so composer only changes what changed.
  mkdir -p "$build"
  find "$build" -mindepth 1 -maxdepth 1 ! -name vendor -exec rm -rf {} +
  git ls-files -z --cached --others --exclude-standard -- bin src migrations public .htaccess composer.json composer.lock \
    | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
    | xargs -0 cp --parents -t "$build"
  [ -f public/app/index.html ] || die "public/app/index.html fehlt nach dem Build."
  cp -r public/app "$build/public/app"
  "${COMPOSER[@]}" install --working-dir="$build" --no-dev --optimize-autoloader --no-interaction --no-progress >>"$log" 2>&1 \
    || die "composer install --no-dev ist fehlgeschlagen ($log)."
else
  [ -f "$build/vendor/autoload.php" ] || die "Kein Build in $build. Ohne --no-build starten."
fi

# What goes up: everything in the build except composer's own files.
mapfile -t present < <(cd "$build" && find . -type f ! -path ./composer.json ! -path ./composer.lock | sed 's|^\./||' | LC_ALL=C sort)
[ ${#present[@]} -gt 0 ] || die "Der Build ist leer."
stamp=$(date '+%Y-%m-%d %H:%M:%S')

# ── The server's config ──────────────────────────────────────────────────────
# PHP itself reads the file, exactly as the server will.
validate_config() {
  [ -f "$DEPLOY_CONFIG_FILE" ] || die "$DEPLOY_CONFIG_FILE fehlt (DEPLOY_CONFIG_FILE). Kopiere config.production.example.php nach $DEPLOY_CONFIG_FILE und füll es aus."
  cat > "$tmp/check-config.php" <<'PHP'
<?php
$file = $argv[1];
$e = [];
try {
    ob_start();
    $c = (static fn () => require $file)();
    if (ob_get_clean() !== '') $e[] = 'Die Datei gibt Text aus (etwas vor <?php oder nach ?>). Das darf sie nicht.';
} catch (Throwable $t) {
    ob_end_clean();
    fwrite(STDERR, '  ' . $t->getMessage() . ' (Zeile ' . $t->getLine() . ")\n");
    exit(1);
}
if (!is_array($c)) { fwrite(STDERR, "  Die Datei muss ein Array zurückgeben: return ['APP_ENV' => 'production', …];\n"); exit(1); }
foreach ($c as $k => $v) {
    if (!is_string($k) || !(is_scalar($v) || $v === null)) $e[] = "Eintrag $k: nur 'NAME' => Text, Zahl, true/false oder null.";
}
$s = fn (string $k): string => is_scalar($c[$k] ?? null) ? (string) $c[$k] : '';
if ($s('APP_ENV') !== 'production') $e[] = "APP_ENV muss 'production' sein.";
if (strlen($s('APP_SECRET')) < 32) $e[] = 'APP_SECRET fehlt oder ist kürzer als 32 Zeichen.';
if (!str_starts_with($s('APP_URL'), 'https://')) $e[] = 'APP_URL muss mit https:// beginnen.';
foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'] as $k) if ($s($k) === '') $e[] = "$k fehlt.";
if ($s('MAIL_DRIVER') === 'smtp') {
    foreach (['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS', 'MAIL_FROM'] as $k) if ($s($k) === '') $e[] = "$k fehlt (MAIL_DRIVER ist smtp).";
}
if ($s('CRON_TOKEN') !== '' && strlen($s('CRON_TOKEN')) < 32) $e[] = 'CRON_TOKEN ist kürzer als 32 Zeichen (dann ist /cron aus).';
foreach ($e as $m) fwrite(STDERR, "  $m\n");
exit($e ? 1 : 0);
PHP
  declare -p PHP >/dev/null 2>&1 || find_php
  "${PHP[@]}" "$(native "$tmp/check-config.php")" "$(native "$DEPLOY_CONFIG_FILE")" \
    || die "$DEPLOY_CONFIG_FILE ist so nicht verwendbar (siehe oben). Es wurde nichts verändert."
}
[ $PUSH_CONFIG = 0 ] || validate_config

# ── version.txt: which commit is live ────────────────────────────────────────
extra="$tmp/extra"; mkdir -p "$extra/public"
dirty=""
if [ -n "$(git status --porcelain -- bin src migrations public frontend composer.json composer.lock .htaccess)" ]; then
  dirty=" (+ nicht committete Änderungen)"
  echo "! Es gibt Änderungen, die noch nicht committet sind. Sie werden mit hochgeladen."
fi
{ echo "Commit: $(git log -1 --format='%h %s')$dirty"
  echo "Deploy: $stamp ($(git config user.name || echo unbekannt))"; } > "$extra/public/version.txt"
extras=(public/version.txt)
if [ $PUSH_CONFIG = 1 ]; then cp "$DEPLOY_CONFIG_FILE" "$extra/config.php"; extras+=(config.php); fi
printf '%s\0' "${present[@]}" > "$tmp/list"

echo "Ziel: $DEPLOY_SSH:${DEPLOY_SSH_PATH%/} (Port $DEPLOY_SSH_PORT, PHP: $DEPLOY_SSH_PHP)"
echo "${#present[@]} Dateien in einem Archiv$([ $PUSH_CONFIG = 1 ] && echo ', config.php ersetzen'). Wartungsmodus während des Austauschs, danach Migrationen."
[ $DRY = 1 ] && exit 0

# ── On the server (POSIX sh): check, unpack, swap, migrate. Reads the archive from stdin. ──
# The previous version waits in .deploy-old until the migrations ran.
read -r -d '' remote_body <<'SH' || true
set -eu
umask 022
fail() { echo "✗ $*" >&2; exit 1; }
mkdir -p "$P" && cd "$P" || fail "Kann $P nicht anlegen."
# Only into an empty folder or one that already holds this app.
if [ -n "$(ls -A | grep -v '^\.deploy-' || true)" ] && ! { [ -d src ] && [ -d public ] && [ -f bin/console ]; }; then
  fail "$P ist nicht leer und enthält nicht diese App. Prüf DEPLOY_SSH_PATH. Es wurde nichts verändert."
fi
[ "$PUSH" = 1 ] || [ -f config.php ] || fail "Auf dem Server fehlt $P/config.php: ./deploy.sh --push-config. Es wurde nichts verändert."
command -v "$PHP" >/dev/null 2>&1 || fail "'$PHP' gibt es auf dem Server nicht. Setz DEPLOY_SSH_PHP (z. B. php82). Es wurde nichts verändert."
"$PHP" -r 'exit(PHP_VERSION_ID >= 80200 && extension_loaded("pdo_mysql") ? 0 : 1);' \
  || fail "$("$PHP" -v | head -n1): mindestens PHP 8.2 mit pdo_mysql nötig. Setz DEPLOY_SSH_PHP (z. B. php82, php83). Es wurde nichts verändert."
rm -rf .deploy-new .deploy-old
mkdir .deploy-new
tar -xzf - -C .deploy-new || fail "Das Archiv kam nicht vollständig an. Es wurde nichts verändert."
{ [ -f .deploy-new/vendor/autoload.php ] && [ -f .deploy-new/public/index.php ]; } || fail "Das Archiv ist unvollständig. Es wurde nichts verändert."
: > .maintenance
mkdir .deploy-old
for e in $(ls -A .deploy-new); do
  if [ -e "$e" ]; then mv "$e" ".deploy-old/$e"; fi
  mv ".deploy-new/$e" "$e"
done
rm -f .deploy-manifest   # left over from the FTP deploys
echo "  ausgetauscht, Migrationen:"
if ! out=$("$PHP" bin/console migrate 2>&1); then
  printf '%s\n' "$out" | sed 's/^/    /'
  fail "Migration fehlgeschlagen. Die Seite bleibt im Wartungsmodus (./deploy.sh --maintenance-off); die vorige Version liegt in $P/.deploy-old."
fi
printf '%s\n' "$out" | sed 's/^/    /'
rm -f .maintenance
rm -rf .deploy-old .deploy-new
SH

started=$SECONDS
set +e
tar -czf - -C "$build" --null -T "$tmp/list" -C "$extra" "${extras[@]}" \
  | remote "P=$sshp PHP=$sshphp PUSH=$PUSH_CONFIG"$'\n'"$remote_body"
st=("${PIPESTATUS[@]}")
set -e
[ "${st[1]}" = 0 ] || die "Deploy über SSH fehlgeschlagen (ssh ${st[1]}, Ausgabe oben)."
[ "${st[0]}" = 0 ] || die "tar ist fehlgeschlagen (${st[0]})."
echo "✓ Deploy fertig ($((SECONDS - started)) s)."

# ── Does the domain serve this deploy? ───────────────────────────────────────
if [ -n "$DEPLOY_URL" ]; then
  live=$(curl -fsS --max-time 15 "$DEPLOY_URL/version.txt?$(date +%s)" 2>/dev/null | tr -d '\r' || true)
  if [ "$live" = "$(cat "$extra/public/version.txt")" ]; then
    echo "✓ $DEPLOY_URL/version.txt zeigt diesen Deploy."
  else
    echo "! $DEPLOY_URL/version.txt zeigt nicht diesen Deploy. Zeigt die Domain auf ${DEPLOY_SSH_PATH%/}/public?"
    [ -n "$live" ] && sed 's/^/  /' <<<"$live"
  fi
  health=$(curl -sS --max-time 15 "$DEPLOY_URL/api/v1/health" 2>&1 || true)
  case "$health" in
    *'"status":"ok"'*) echo "✓ $DEPLOY_URL/api/v1/health: ok" ;;
    *) echo "! $DEPLOY_URL/api/v1/health antwortet: $(cut -c1-200 <<<"$health")" ;;
  esac
fi
