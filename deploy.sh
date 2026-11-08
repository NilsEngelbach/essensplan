#!/usr/bin/env bash
# Builds Essensplan locally and puts it on all-inkl. Composer is never needed on the server:
# vendor/ and the SPA are built here.
#   SSH (DEPLOY_SSH set): the whole build goes up as one archive through one ssh connection,
#     is swapped in on the server, and bin/console migrates there. --console runs over SSH too.
#   FTP (otherwise): uploads changed files over FTPS; migrations and console commands run over
#     HTTPS (/ops, guarded by OPS_TOKEN).
# Settings come from .env.deploy (see .env.deploy.example).
#
#   ./deploy.sh                  build, upload what changed, migrate
#   ./deploy.sh --dry-run        build and list what would change
#   ./deploy.sh --full           upload everything again
#   ./deploy.sh --no-build       skip composer/npm, use the last build in .deploy/build
#   ./deploy.sh --push-config    upload DEPLOY_CONFIG_FILE (config.production.php) as the server's config.php first
#   ./deploy.sh --check          only show what the server offers (PHP, limits, DB, mail, AI)
#   ./deploy.sh --console user:list            run a console command on the server
#   ./deploy.sh --console user:create --email=a@b.de --name=Familie
#   ./deploy.sh --maintenance-off             lift maintenance mode after an aborted deploy
#   ./deploy.sh --allow-delete   allow deleting more than a quarter of the files
#
# Runs in Git Bash (its curl speaks FTPS). Deploys the files git knows about in bin/, src/,
# migrations/, public/ and the root .htaccess, plus vendor/ (composer install --no-dev) and
# public/app (npm run build). config.php, storage/ (photos, logs) and .maintenance on the server
# are never uploaded by a normal run and never deleted. .deploy-manifest on the server lists
# what was uploaded with its hash: only changed files go up, files deleted locally are
# removed. While code is uploaded and migrated, the site shows a maintenance page.
set -euo pipefail
cd "$(dirname "$0")"

DRY=0 FULL=0 BUILD=1 PUSH_CONFIG=0 CHECK=0 MAINT_OFF=0 ALLOW_DELETE=0 CONSOLE=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY=1 ;;
    --full) FULL=1 ;;
    --no-build) BUILD=0 ;;
    --push-config|--push-env) PUSH_CONFIG=1 ;;
    --check) CHECK=1 ;;
    --maintenance-off) MAINT_OFF=1 ;;
    --allow-delete) ALLOW_DELETE=1 ;;
    --console) shift; [ $# -gt 0 ] || { echo "--console braucht einen Befehl, z. B. --console user:list" >&2; exit 2; }; CONSOLE=("$@"); break ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
  shift
done

die() { echo "✗ $*" >&2; exit 1; }

# ── .env.deploy ──────────────────────────────────────────────────────────────
# Parsed by hand instead of sourced, so passwords may contain $, spaces or quotes.
[ -f .env.deploy ] || die ".env.deploy fehlt. Kopiere .env.deploy.example nach .env.deploy und trag die FTP-Daten ein."
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}" val="${line#*=}"
  case "$val" in \"*\") val="${val:1:${#val}-2}" ;; \'*\') val="${val:1:${#val}-2}" ;; esac
  case "$key" in DEPLOY_[A-Z_]*) printf -v "$key" '%s' "$val" ;; esac
done < .env.deploy

DEPLOY_PORT="${DEPLOY_PORT:-21}"
DEPLOY_URL="${DEPLOY_URL:-}"
DEPLOY_OPS_TOKEN="${DEPLOY_OPS_TOKEN:-}"
DEPLOY_CONFIG_FILE="${DEPLOY_CONFIG_FILE:-config.production.php}"
DEPLOY_PARALLEL="${DEPLOY_PARALLEL:-4}"
DEPLOY_URL="${DEPLOY_URL%/}"
DEPLOY_TLS_MAX="${DEPLOY_TLS_MAX:-}"

# Which curl: DEPLOY_CURL, else the newest of Git Bash's and Windows' own. Git Bash's 8.10 (Schannel)
# broke FTPS uploads on all-inkl (426, partial files); Windows ships a newer one in System32.
pick_curl() {
  local c v best="" bestv=""
  if [ -n "${DEPLOY_CURL:-}" ]; then printf '%s' "$DEPLOY_CURL"; return; fi
  for c in "$(command -v curl 2>/dev/null)" /c/Windows/System32/curl.exe; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    v=$("$c" -V 2>/dev/null | head -1 | awk '{print $2}')
    [ -n "$v" ] || continue
    if [ -z "$best" ] || [ "$(printf '%s\n%s\n' "$bestv" "$v" | sort -V | tail -1)" != "$bestv" ]; then best="$c" bestv="$v"; fi
  done
  printf '%s' "$best"
}
CURL_BIN=$(pick_curl)
[ -n "$CURL_BIN" ] || die "curl fehlt."
curl() { "$CURL_BIN" "$@"; }

# Runs curl with options read from stdin, so passwords and tokens never show up in ps.
cfg() { local v="${1//\\/\\\\}"; printf '"%s"' "${v//\"/\\\"}"; }   # quote a curl config value

# ── HTTPS calls to /ops (migrate, check, console) ───────────────────────────
ops() {   # ops <action> [json-body] → prints the server's text answer, returns 1 on HTTP errors
  [ -n "$DEPLOY_URL" ] || die "DEPLOY_URL fehlt in .env.deploy."
  [ ${#DEPLOY_OPS_TOKEN} -ge 32 ] || die "DEPLOY_OPS_TOKEN fehlt in .env.deploy (mindestens 32 Zeichen, gleich OPS_TOKEN in config.php auf dem Server)."
  local body="${2:-}" out code
  [ -n "$body" ] || body='{}'
  out=$(printf 'silent\nshow-error\nrequest = "POST"\nmax-time = 300\nheader = %s\nheader = "Content-Type: application/json"\ndata-binary = %s\nwrite-out = "\\n%%{http_code}"\nurl = %s\n' \
    "$(cfg "X-Ops-Token: $DEPLOY_OPS_TOKEN")" "$(cfg "$body")" "$(cfg "$DEPLOY_URL/ops/$1")" | curl -K -) || { echo "$out"; return 1; }
  code="${out##*$'\n'}"
  out="${out%$'\n'*}"
  printf '%s\n' "$out" | sed '/^$/d'
  case "$code" in
    200) return 0 ;;
    404) echo "(HTTP 404: OPS_TOKEN auf dem Server fehlt, ist kürzer als 32 Zeichen oder passt nicht zu DEPLOY_OPS_TOKEN)" >&2; return 1 ;;
    429) echo "(HTTP 429: zu viele falsche Tokens von dieser IP, 10 Minuten warten)" >&2; return 1 ;;
    503) echo "(HTTP 503: Wartungsmodus? ./deploy.sh --maintenance-off)" >&2; return 1 ;;
    *) echo "(HTTP $code)" >&2; return 1 ;;
  esac
}
json_str() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
# Git Bash's curl is a Windows program: it can't open /tmp/… from a config file
# (only command-line arguments get translated), so hand it Windows paths.
native() { cygpath -m "$1" 2>/dev/null || printf '%s' "$1"; }
: > "$tmp/flag"

# ── SSH ──────────────────────────────────────────────────────────────────────
# One connection per run, so a password is asked once (an SSH key: never).
DEPLOY_SSH="${DEPLOY_SSH:-}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"
DEPLOY_SSH_PATH="${DEPLOY_SSH_PATH:-}"
DEPLOY_SSH_PHP="${DEPLOY_SSH_PHP:-php}"
q() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }   # quote one word for the remote shell
remote() { ssh -p "$DEPLOY_SSH_PORT" -o ServerAliveInterval=30 "$DEPLOY_SSH" "$1"; }   # remote <script>; stdin goes along
if [ -n "$DEPLOY_SSH" ]; then
  command -v ssh >/dev/null || die "ssh fehlt. Starte das Skript in Git Bash."
  case "$DEPLOY_SSH_PATH" in
    /*/*) ;;
    *) die "DEPLOY_SSH_PATH muss der absolute Pfad des App-Ordners auf dem Server sein (all-inkl: /www/htdocs/w0…/essensplan)." ;;
  esac
  case "/$DEPLOY_SSH_PATH/" in */../*|*/./*) die "DEPLOY_SSH_PATH darf kein . oder .. enthalten." ;; esac
  sshp=$(q "${DEPLOY_SSH_PATH%/}") sshphp=$(q "$DEPLOY_SSH_PHP")
fi

if [ $CHECK = 1 ]; then
  # Over HTTPS when possible: the web PHP's limits are what matter, not the CLI's.
  if [ -n "$DEPLOY_SSH" ] && { [ -z "$DEPLOY_URL" ] || [ ${#DEPLOY_OPS_TOKEN} -lt 32 ]; }; then
    echo "(PHP auf der Kommandozeile; die Grenzen des Web-PHP können abweichen)"
    remote "cd $sshp && $sshphp bin/console check" </dev/null || exit 1
  else
    ops check || exit 1
  fi
  exit 0
fi
if [ ${#CONSOLE[@]} -gt 0 ]; then
  if [ -n "$DEPLOY_SSH" ]; then   # every command, the server's CLI PHP
    cmd="cd $sshp && $sshphp bin/console"
    for a in "${CONSOLE[@]}"; do cmd+=" $(q "$a")"; done
    remote "$cmd" </dev/null || exit 1
    exit 0
  fi
  args=""
  for a in "${CONSOLE[@]:1}"; do args+="${args:+,}$(json_str "$a")"; done
  ops console "{\"command\":$(json_str "${CONSOLE[0]}"),\"args\":[$args]}" || exit 1
  exit 0
fi
if [ $MAINT_OFF = 1 ] && [ -n "$DEPLOY_SSH" ]; then
  remote "rm -f $sshp/.maintenance" </dev/null || die "Konnte .maintenance nicht löschen."
  echo "✓ Wartungsmodus aus."
  exit 0
fi

# ── FTP ──────────────────────────────────────────────────────────────────────
if [ -z "$DEPLOY_SSH" ]; then
: "${DEPLOY_HOST:?DEPLOY_HOST fehlt in .env.deploy}" "${DEPLOY_USER:?DEPLOY_USER fehlt in .env.deploy}" "${DEPLOY_PASS:?DEPLOY_PASS fehlt in .env.deploy}"
: "${DEPLOY_PATH:?DEPLOY_PATH fehlt in .env.deploy}"
curl -V | grep -qw ftps || die "Dieses curl kann kein FTPS. Starte das Skript in Git Bash."

# Only absolute paths, so uploads (URLs) and deletes (FTP commands) always mean the same
# folder. "/" is the FTP user's root.
case "$DEPLOY_PATH" in
  /) root="" ;;
  /*) root="${DEPLOY_PATH%/}" ;;
  *) die "DEPLOY_PATH muss mit / beginnen (absoluter Pfad, z. B. / oder /essensplan)." ;;
esac
case "/$root/" in */../*|*/./*) die "DEPLOY_PATH darf kein . oder .. enthalten." ;; esac

urlenc() {
  local s="$1" out="" c i
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"
    case "$c" in [A-Za-z0-9._~/-]) out+="$c" ;; *) out+=$(printf '%%%02X' "'$c") ;; esac
  done
  printf '%s' "$out"
}
base="ftp://$DEPLOY_HOST:$DEPLOY_PORT$(urlenc "$root")"

# Explicit TLS (AUTH TLS) is required: login, files and config.php never travel in clear text.
ftp_curl() {
  local extra="$1"; shift
  local tls=""
  [ -z "$DEPLOY_TLS_MAX" ] || tls="tls-max = $DEPLOY_TLS_MAX"$'\n'   # e.g. 1.2 if TLS 1.3 data connections break
  printf 'user = %s\nssl-reqd\nssl-revoke-best-effort\nsilent\nshow-error\nconnect-timeout = 20\n%s%s\n' "$(cfg "$DEPLOY_USER:$DEPLOY_PASS")" \
    "$tls" "$extra" \
    | curl -K - "$@"
}

maintenance_off() {
  ftp_curl "url = $(cfg "$base/")"$'\n'"list-only"$'\n'"quote = $(cfg "*DELE $root/.maintenance")" >/dev/null
}
if [ $MAINT_OFF = 1 ]; then
  maintenance_off || die "Konnte .maintenance nicht löschen."
  echo "✓ Wartungsmodus aus."
  exit 0
fi
fi   # FTP setup

manifest_marker="# Essensplan deploy manifest"

# The server's config: PHP itself reads the file, exactly as the server will.
# The token goes in via the environment, not argv.
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
$ops = (string) getenv('CHECK_OPS_TOKEN');
if ($ops !== '' && $s('OPS_TOKEN') !== $ops) $e[] = 'OPS_TOKEN ist nicht gleich DEPLOY_OPS_TOKEN in .env.deploy.';
if ($s('CRON_TOKEN') !== '' && $s('CRON_TOKEN') === $s('OPS_TOKEN')) $e[] = 'CRON_TOKEN muss ein anderer Wert sein als OPS_TOKEN.';
foreach ($e as $m) fwrite(STDERR, "  $m\n");
exit($e ? 1 : 0);
PHP
  declare -p PHP >/dev/null 2>&1 || find_php
  CHECK_OPS_TOKEN="$DEPLOY_OPS_TOKEN" "${PHP[@]}" "$(native "$tmp/check-config.php")" "$(native "$DEPLOY_CONFIG_FILE")" \
    || die "$DEPLOY_CONFIG_FILE ist so nicht verwendbar (siehe oben). Es wurde nichts verändert."
}

# version.txt: which commit is live. Uncommitted changes go up too, with a warning.
write_version() {   # write_version <file>
  local dirty=""
  if [ -n "$(git status --porcelain -- bin src migrations public frontend composer.json composer.lock .htaccess)" ]; then
    dirty=" (+ nicht committete Änderungen)"
    echo "! Es gibt Änderungen, die noch nicht committet sind. Sie werden mit hochgeladen." >&2
  fi
  { echo "Commit: $(git log -1 --format='%h %s')$dirty"
    echo "Deploy: $stamp ($(git config user.name || echo unbekannt))"; } > "$1"
}

live_version() {
  [ -n "$DEPLOY_URL" ] || return 0
  curl -fsS --max-time 15 "$DEPLOY_URL/version.txt?$(date +%s)" 2>/dev/null | tr -d '\r' || true
}
verify_live() {   # verify_live <version file>: does the domain serve this deploy?
  [ -n "$DEPLOY_URL" ] || return 0
  local live health
  live=$(live_version)
  if [ "$live" = "$(cat "$1")" ]; then
    echo "✓ $DEPLOY_URL/version.txt zeigt diesen Deploy."
  else
    echo "! $DEPLOY_URL/version.txt zeigt nicht diesen Deploy. Zeigt die Domain auf den Ordner public?"
    [ -n "$live" ] && sed 's/^/  /' <<<"$live"
  fi
  health=$(curl -sS --max-time 15 "$DEPLOY_URL/api/v1/health" 2>&1 || true)
  case "$health" in
    *'"status":"ok"'*) echo "✓ $DEPLOY_URL/api/v1/health: ok" ;;
    *) echo "! $DEPLOY_URL/api/v1/health antwortet: $(cut -c1-200 <<<"$health")" ;;
  esac
}

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
for f in "${present[@]}"; do
  [[ $f =~ ^[A-Za-z0-9._+@-]+(/[A-Za-z0-9._+@-]+)*$ ]] || die "Dateiname mit Sonderzeichen im Build: $f"
done
stamp=$(date '+%Y-%m-%d %H:%M:%S')

# ── SSH deploy: the whole build as one archive, swapped in on the server ────
# No diffing: a full build is a few MB compressed. The server keeps config.php, storage/ and
# everything else that is not in the archive. The previous version waits in .deploy-old until
# the migrations ran. .deploy-manifest is written too, so an FTP deploy can follow.
if [ -n "$DEPLOY_SSH" ]; then
  [ $PUSH_CONFIG = 0 ] || validate_config
  extra="$tmp/extra"; mkdir -p "$extra/public"
  { echo "$manifest_marker"; echo "# Deploy $stamp"
    (cd "$build" && printf '%s\0' "${present[@]}" | xargs -0 sha1sum --) | sed 's/ \*/  /'
    echo "# Ende (${#present[@]} Dateien)"; } > "$extra/.deploy-manifest"
  write_version "$extra/public/version.txt"
  extras=(.deploy-manifest public/version.txt)
  if [ $PUSH_CONFIG = 1 ]; then cp "$DEPLOY_CONFIG_FILE" "$extra/config.php"; extras+=(config.php); fi
  printf '%s\0' "${present[@]}" > "$tmp/list"
  echo "Ziel: $DEPLOY_SSH:${DEPLOY_SSH_PATH%/} (SSH, Port $DEPLOY_SSH_PORT, PHP: $DEPLOY_SSH_PHP)"
  echo "${#present[@]} Dateien in einem Archiv$([ $PUSH_CONFIG = 1 ] && echo ', config.php ersetzen'). Wartungsmodus während des Austauschs, danach Migrationen."
  [ $DRY = 1 ] && exit 0

  # Runs on the server (POSIX sh). Reads the archive from stdin.
  read -r -d '' remote_body <<'SH' || true
set -eu
umask 022
fail() { echo "✗ $*" >&2; exit 1; }
mkdir -p "$P" && cd "$P" || fail "Kann $P nicht anlegen."
# Only into an empty folder, one with our manifest, or one that already holds this app.
if [ -f .deploy-manifest ]; then
  [ "$(head -n1 .deploy-manifest)" = "# Essensplan deploy manifest" ] || fail "$P/.deploy-manifest stammt nicht von diesem Skript. Es wurde nichts verändert."
elif [ -n "$(ls -A | grep -v '^\.deploy-' || true)" ] && ! { [ -d src ] && [ -d public ]; }; then
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
  verify_live "$extra/public/version.txt"
  exit 0
fi

target="$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PORT $DEPLOY_PATH"

# ── Check login and target folder, fetch the server's manifest ──────────────
set +e
listing=$(ftp_curl "list-only"$'\n'"url = $(cfg "$base/")")
status=$?
set -e
case $status in
  0) ;;
  9) listing="" ;;   # the folder does not exist yet: ftp-create-dirs makes it
  67) die "Anmeldung abgelehnt. Prüf DEPLOY_USER und DEPLOY_PASS." ;;
  64) die "Der Server bietet kein FTP über TLS an." ;;
  35|60) die "TLS-Verbindung zu $DEPLOY_HOST fehlgeschlagen (curl $status). Stimmt DEPLOY_HOST (all-inkl: w0….kasserver.com)?" ;;
  *) die "Verbindung zu $DEPLOY_HOST fehlgeschlagen (curl $status)." ;;
esac
declare -A here=()
while IFS= read -r name; do
  name="${name%$'\r'}"; name="${name##*/}"
  case "$name" in ''|.|..) ;; *) here["$name"]=1 ;; esac
done <<<"$listing"

# The manifest ends with "# Ende (N Dateien)". Only a complete copy counts: some FTP servers
# drop the TLS data connection without a clean close, and curl then reports an error after
# the last byte. A missing manifest (78) is a first deploy; anything else stops here.
set +e
remote_manifest=$(ftp_curl "url = $(cfg "$base/.deploy-manifest")" 2>/dev/null)
mstatus=$?
set -e
remote_manifest="${remote_manifest//$'\r'/}"
manifest_complete() {
  local end count
  end=$(tail -n1 <<<"$1")
  count=$(grep -vc '^#' <<<"$1" || true)
  [ "$end" = "# Ende ($count Dateien)" ]
}
if [ $mstatus = 78 ] || [ $mstatus = 19 ] || [ $mstatus = 9 ]; then
  remote_manifest=""
elif ! manifest_complete "$remote_manifest"; then
  if [ $mstatus = 0 ] && [ -n "$remote_manifest" ] && [ "$(head -n1 <<<"$remote_manifest")" != "$manifest_marker" ]; then
    die "$DEPLOY_PATH/.deploy-manifest stammt nicht von diesem Skript. Es wurde nichts verändert."
  fi
  die "Das Manifest auf dem Server ließ sich nicht vollständig lesen (curl $mstatus). Es wurde nichts verändert; versuch es noch einmal."
fi

# Safety: only write into a folder that is empty, carries our manifest, or already holds
# this app. A different start folder (the webspace root with other sites) stops here.
if [ -n "$remote_manifest" ]; then
  :
elif [ ${#here[@]} = 0 ]; then
  echo "Zielordner $DEPLOY_PATH ist leer oder neu: erster Deploy."
elif [ -n "${here[public]:-}" ] && [ -n "${here[src]:-}" ] && [ -n "${here[vendor]:-}" ]; then
  echo "Zielordner $DEPLOY_PATH enthält die App, aber kein Manifest: alles wird einmal hochgeladen."
else
  die "Zielordner $DEPLOY_PATH ist nicht leer und enthält nicht diese App:
  $(printf '%s ' "${!here[@]}" | cut -c1-200)
  Prüf DEPLOY_PATH und den Startordner des FTP-Users. Es wurde nichts verändert."
fi

# The server manifest decides what gets deleted, so it is checked strictly: our marker,
# sha1 hashes, plain relative paths, never config.php, .env, storage/ or other runtime files.
declare -A old=()
if [ -n "$remote_manifest" ]; then
  [ "$(head -n1 <<<"$remote_manifest")" = "$manifest_marker" ] \
    || die "$DEPLOY_PATH/.deploy-manifest stammt nicht von diesem Skript. Es wurde nichts verändert."
  while read -r hash path; do
    [ -n "$hash" ] || continue
    [[ $hash =~ ^[0-9a-f]{40}$ && $path =~ ^[A-Za-z0-9._+@-]+(/[A-Za-z0-9._+@-]+)*$ ]] \
      || die "Ungültige Zeile im Manifest auf dem Server: $hash $path"
    case "/$path/" in */../*|*/./*) die "Ungültiger Pfad im Manifest auf dem Server: $path" ;; esac
    case "$path" in
      config.php|.env|.env.*|.maintenance|.deploy-manifest|storage/*|public/version.txt|public/media/*) die "Geschützte Datei im Manifest auf dem Server: $path" ;;
    esac
    [ $FULL = 1 ] || old["$path"]="$hash"
  done < <(grep -v '^#' <<<"$remote_manifest")
fi

# The app can't start without its config.php. Either it is there, or --push-config brings it.
# (Reads its first byte only; SIZE answers differ between FTP servers. 56 = the byte came,
# the TLS close did not, see the manifest above.)
set +e
ftp_curl "range = 0-0"$'\n'"url = $(cfg "$base/config.php")" >/dev/null 2>&1
estatus=$?
set -e
case $estatus in
  0|56) config_there=1 ;;
  78|19|9) config_there=0 ;;
  *) die "Konnte nicht prüfen, ob $DEPLOY_PATH/config.php da ist (curl $estatus). Es wurde nichts verändert." ;;
esac
if [ $PUSH_CONFIG = 1 ]; then
  validate_config
elif [ $config_there = 0 ] && [ $DRY = 1 ]; then
  echo "! Auf dem Server fehlt $DEPLOY_PATH/config.php: der echte Lauf braucht --push-config."
elif [ $config_there = 0 ]; then
  die "Auf dem Server fehlt $DEPLOY_PATH/config.php. Leg $DEPLOY_CONFIG_FILE an (Vorlage: config.production.example.php, docs/DEPLOY.md) und starte ./deploy.sh --push-config. Es wurde nichts verändert."
fi

# ── What changed ─────────────────────────────────────────────────────────────
new_manifest="$tmp/manifest"
{ echo "$manifest_marker"; echo "# Deploy $stamp"; } > "$new_manifest"
# Through xargs: thousands of vendor paths are too long for one Windows command line.
(cd "$build" && printf '%s\0' "${present[@]}" | xargs -0 sha1sum --) | sed 's/ \*/  /' >> "$new_manifest"   # some builds mark binary files with *
echo "# Ende (${#present[@]} Dateien)" >> "$new_manifest"

code=() web=() last=()
declare -A keep=()
while read -r hash path; do
  keep["$path"]=1
  [ "${old[$path]:-}" = "$hash" ] && continue
  case "$path" in
    public/index.php|public/.htaccess|public/app/index.html) last+=("$path") ;;   # entry points last
    public/*) web+=("$path") ;;
    *) code+=("$path") ;;
  esac
done < <(grep -v '^#' "$new_manifest")

remove=()
for path in "${!old[@]}"; do [ -z "${keep[$path]:-}" ] && remove+=("$path"); done
# Brake for mass deletes (broken build, wrong branch).
if [ ${#remove[@]} -gt 10 ] && [ $((${#remove[@]} * 4)) -gt ${#old[@]} ] && [ $ALLOW_DELETE = 0 ]; then
  for f in "${remove[@]}"; do echo "  - $f"; done
  die "${#remove[@]} von ${#old[@]} Dateien würden auf dem Server gelöscht. Wenn das so gewollt ist: ./deploy.sh --allow-delete"
fi

# Code changes (or deletes outside the SPA) go up behind the maintenance page and are migrated.
backend=0
[ ${#code[@]} -gt 0 ] && backend=1
for f in "${remove[@]}"; do case "$f" in public/app/*) ;; *) backend=1 ;; esac; done
for f in "${last[@]}"; do case "$f" in public/index.php|public/.htaccess) backend=1 ;; esac; done

version="$tmp/version.txt"
write_version "$version"
upload=("${code[@]}" "${web[@]}" "${last[@]}")
echo "Ziel: $target  (curl $("$CURL_BIN" -V | head -1 | awk '{print $2}') $CURL_BIN${DEPLOY_TLS_MAX:+, TLS max $DEPLOY_TLS_MAX}, $DEPLOY_PARALLEL parallel)"
echo "${#upload[@]} hochladen, ${#remove[@]} löschen$([ ${#old[@]} = 0 ] && echo ' (vollständig)')$([ $PUSH_CONFIG = 1 ] && echo ', config.php ersetzen')"
show() { local n=0; for f in "$@"; do n=$((n + 1)); [ $n -le 40 ] && echo "  $f"; done; [ $n -le 40 ] || echo "  … und $((n - 40)) weitere"; }
show "${upload[@]/#/+ }"
show "${remove[@]/#/- }"
[ $backend = 1 ] && echo "Wartungsmodus während des Uploads, danach Migrationen."

[ $DRY = 1 ] && exit 0
if [ ${#upload[@]} = 0 ] && [ ${#remove[@]} = 0 ] && [ $PUSH_CONFIG = 0 ]; then
  echo "✓ Alles aktuell."
  live=$(live_version); [ -n "$live" ] && echo "Live:" && sed 's/^/  /' <<<"$live"
  exit 0
fi

# Uploads in one curl run per phase; DEPLOY_PARALLEL connections at a time.
# Batches of 400. After each batch of a large upload, the server manifest records what is up,
# so an aborted run (network, timeout) only uploads the rest next time.
declare -A server_hash=() new_hash=()
for p in "${!old[@]}"; do server_hash["$p"]="${old[$p]}"; done
while read -r hash path; do new_hash["$path"]="$hash"; done < <(grep -v '^#' "$new_manifest")
uploaded=0
# Transient errors (a data connection that times out) are retried per file.
retry="retry = 3"$'\n'"retry-delay = 2"$'\n'"retry-all-errors"

# curl's exit code is not proof: all-inkl answered uploads with 426 and dropped files that curl
# had counted as sent, so the manifest listed files the server never kept. After each upload,
# the folders are listed (LIST, in parallel) and only files that are there with their local size
# count as uploaded. Reads "<size> <remote path>" lines, prints the paths that are missing or
# have another size. (A dropped overwrite of a file with the same size slips through; then the
# old file is still complete, and the next --full fixes it.)
missing_on_server() {
  local lsdir="$tmp/ls" size path d line w n=0 conf
  local -A idx=() have=()
  local -a want=()
  rm -rf "$lsdir"; mkdir -p "$lsdir"
  while read -r size path; do
    want+=("$size $path")
    d="${path%/*}"; [ "$d" = "$path" ] && d="."
    [ -n "${idx[$d]:-}" ] || { n=$((n + 1)); idx["$d"]=$n; }
  done
  [ ${#want[@]} -gt 0 ] || return 0
  conf="retry = 2"$'\n'"parallel"$'\n'"parallel-max = $DEPLOY_PARALLEL"
  for d in "${!idx[@]}"; do
    if [ "$d" = . ]; then w="$base/"; else w="$base/$(urlenc "$d")/"; fi
    conf+=$'\n'"url = $(cfg "$w")"$'\n'"output = $(cfg "$(native "$lsdir/${idx[$d]}")")"
  done
  ftp_curl "$conf" >/dev/null 2>&1 || true   # a folder that is missing is simply not listed
  for d in "${!idx[@]}"; do
    [ -f "$lsdir/${idx[$d]}" ] || continue
    while IFS= read -r line; do
      line="${line%$'\r'}"
      # -rw-r--r--   1 owner group   1563 Nov  8 18:08 name
      [[ $line =~ ^-[^[:space:]]*[[:space:]]+[0-9]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+([0-9]+)[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]](.+)$ ]] || continue
      have["$d/${BASH_REMATCH[2]}"]="${BASH_REMATCH[1]}"
    done < "$lsdir/${idx[$d]}"
  done
  for w in "${want[@]}"; do
    size="${w%% *}"; path="${w#* }"
    d="${path%/*}"; [ "$d" = "$path" ] && d="."
    [ "${have[$d/${path##*/}]:-}" = "$size" ] || printf '%s\n' "$path"
  done
}
local_sizes() { (cd "$build" && printf '%s\0' "$@" | xargs -0 stat -c '%s %n' --); }   # "<size> <path>" per file

send() {   # send <parallel> <files...>: one curl run; returns curl's exit code
  local par="$1" f conf; shift
  conf="$retry"$'\n'"ftp-create-dirs"$'\n'"fail-early"$'\n'"parallel"$'\n'"parallel-max = $par"
  for f in "$@"; do
    conf+=$'\n'"upload-file = $(cfg "$(native "$build/$f")")"$'\n'"url = $(cfg "$base/$(urlenc "$f")")"
  done
  ftp_curl "$conf" >/dev/null
}
put() {
  [ $# -gt 0 ] || return 0
  local files=("$@") i f batch rc again
  local -A bad=()
  for ((i = 0; i < ${#files[@]}; i += 400)); do
    batch=("${files[@]:i:400}")
    rc=0; send "$DEPLOY_PARALLEL" "${batch[@]}" || rc=$?
    bad=()
    while IFS= read -r f; do [ -n "$f" ] && bad["$f"]=1; done < <(local_sizes "${batch[@]}" | missing_on_server)
    if [ ${#bad[@]} -gt 0 ]; then   # one more try for what is missing, one file at a time
      again=("${!bad[@]}")
      echo "  ${#again[@]} Dateien fehlen auf dem Server, zweiter Versuch einzeln …"
      send 1 "${again[@]}" || rc=$?
      bad=()
      while IFS= read -r f; do [ -n "$f" ] && bad["$f"]=1; done < <(local_sizes "${again[@]}" | missing_on_server)
    fi
    for f in "${batch[@]}"; do [ -n "${bad[$f]:-}" ] || server_hash["$f"]="${new_hash[$f]}"; done
    uploaded=$((uploaded + ${#batch[@]} - ${#bad[@]}))
    if [ ${#bad[@]} -gt 0 ]; then
      echo "! ${#bad[@]} von ${#batch[@]} Dateien sind danach nicht (vollständig) auf dem Server:" >&2
      show "${!bad[@]}" >&2
    elif [ $rc != 0 ]; then
      echo "  (curl meldete Fehler $rc, aber alle ${#batch[@]} Dateien sind vollständig auf dem Server.)"
    fi
    # The manifest only ever lists what was found on the server.
    if [ ${#upload[@]} -gt 400 ] || [ ${#bad[@]} -gt 0 ]; then
      { echo "$manifest_marker"; echo "# Deploy $stamp (läuft)"
        for f in "${!server_hash[@]}"; do echo "${server_hash[$f]}  $f"; done | LC_ALL=C sort -k2
        echo "# Ende (${#server_hash[@]} Dateien)"; } > "$tmp/progress"
      put_tmp "$tmp/progress" .deploy-manifest || return 1
      [ ${#bad[@]} -gt 0 ] && return 1
      echo "  $uploaded/${#upload[@]}"
    fi
  done
}
put_tmp() {   # put_tmp <local file> <remote path>: uploads one file and checks that it arrived
  local rc=0
  ftp_curl "$retry"$'\n'"ftp-create-dirs"$'\n'"upload-file = $(cfg "$(native "$1")")"$'\n'"url = $(cfg "$base/$(urlenc "$2")")" >/dev/null || rc=$?
  if [ -n "$(printf '%s %s\n' "$(stat -c %s "$1")" "$2" | missing_on_server || true)" ]; then
    echo "! $2 ist nach dem Upload nicht (vollständig) auf dem Server (curl $rc)." >&2
    return 1
  fi
}

if [ $PUSH_CONFIG = 1 ]; then
  put_tmp "$DEPLOY_CONFIG_FILE" config.php || die "Konnte config.php nicht hochladen. Es wurde sonst nichts verändert."
  echo "✓ config.php hochgeladen."
fi

maint=0
if [ $backend = 1 ]; then
  put_tmp "$tmp/flag" .maintenance || die "Konnte den Wartungsmodus nicht einschalten. Es wurde nichts verändert."
  maint=1
fi
aborted() {
  [ $maint = 1 ] && echo "! Die Seite bleibt im Wartungsmodus, bis ein Deploy durchläuft (oder ./deploy.sh --maintenance-off)." >&2
  die "$1"
}

started=$SECONDS
put "${code[@]}" || aborted "Upload abgebrochen. Beim nächsten Lauf wird alles Geänderte erneut hochgeladen."
put "${web[@]}" || aborted "Upload abgebrochen. Beim nächsten Lauf wird alles Geänderte erneut hochgeladen."
put "${last[@]}" || aborted "Upload abgebrochen. Beim nächsten Lauf wird alles Geänderte erneut hochgeladen."
echo "✓ ${#upload[@]} Dateien hochgeladen ($((SECONDS - started)) s)."

# ── Remove files that no longer exist locally, then their emptied folders ───
if [ ${#remove[@]} -gt 0 ]; then
  conf="url = $(cfg "$base/")"$'\n'"list-only"
  for f in "${remove[@]}"; do conf+=$'\n'"quote = $(cfg "*DELE $root/$f")"; done
  declare -A live_dirs=()
  for f in "${!keep[@]}"; do d="$f"; while [[ $d == */* ]]; do d="${d%/*}"; live_dirs["$d"]=1; done; done
  mapfile -t gone_dirs < <(for f in "${remove[@]}"; do d="$f"; while [[ $d == */* ]]; do d="${d%/*}";
      [ -z "${live_dirs[$d]:-}" ] && echo "$d"; done; done | sort -ru)
  for d in "${gone_dirs[@]}"; do conf+=$'\n'"quote = $(cfg "*RMD $root/$d")"; done
  ftp_curl "$conf" >/dev/null || aborted "Löschen fehlgeschlagen."
  echo "✓ ${#remove[@]} Dateien gelöscht."
fi

# ── Migrations (over HTTPS; /ops stays open during maintenance) ─────────────
if [ $backend = 1 ] || [ $PUSH_CONFIG = 1 ]; then
  if [ -n "$DEPLOY_URL" ] && [ ${#DEPLOY_OPS_TOKEN} -ge 32 ]; then
    echo "Migrationen:"
    ops migrate | sed 's/^/  /' || aborted "Migration fehlgeschlagen (Ausgabe oben)."
  else
    echo "! Ohne DEPLOY_URL und DEPLOY_OPS_TOKEN laufen keine Migrationen. Neue migrations/*.sql in phpMyAdmin ausführen."
  fi
fi

# ── version.txt and manifest last: they only describe a finished deploy ─────
put_tmp "$version" public/version.txt && put_tmp "$new_manifest" .deploy-manifest \
  || aborted "Dateien sind oben, aber version.txt/Manifest nicht. Lauf ./deploy.sh noch einmal."
if [ $maint = 1 ]; then
  maintenance_off || die "Alles ist oben, aber der Wartungsmodus ließ sich nicht ausschalten: ./deploy.sh --maintenance-off"
fi
echo "✓ Deploy fertig."
verify_live "$version"
