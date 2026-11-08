#!/usr/bin/env bash
# Builds Essensplan locally and uploads it to all-inkl via FTP over TLS. Neither SSH nor
# Composer is needed on the server: vendor/ and the SPA are built here and uploaded,
# migrations and console commands run over HTTPS (/ops, guarded by OPS_TOKEN).
# Settings come from .env.deploy (see .env.deploy.example).
#
#   ./deploy.sh                  build, upload what changed, migrate
#   ./deploy.sh --dry-run        build and list what would change
#   ./deploy.sh --full           upload everything again
#   ./deploy.sh --no-build       skip composer/npm, use the last build in .deploy/build
#   ./deploy.sh --push-env       upload DEPLOY_ENV_FILE (.env.production) as the server's .env first
#   ./deploy.sh --check          only show what the server offers (PHP, limits, DB, mail, AI)
#   ./deploy.sh --console user:list            run a console command on the server
#   ./deploy.sh --console user:create --email=a@b.de --name=Familie
#   ./deploy.sh --maintenance-off             lift maintenance mode after an aborted deploy
#   ./deploy.sh --allow-delete   allow deleting more than a quarter of the files
#
# Runs in Git Bash (its curl speaks FTPS). Deploys the files git knows about in bin/, src/,
# migrations/, public/ and the root .htaccess, plus vendor/ (composer install --no-dev) and
# public/app (npm run build). .env, storage/ (photos, logs) and .maintenance on the server
# are never uploaded by a normal run and never deleted. .deploy-manifest on the server lists
# what was uploaded with its hash: only changed files go up, files deleted locally are
# removed. While code is uploaded and migrated, the site shows a maintenance page.
set -euo pipefail
cd "$(dirname "$0")"

DRY=0 FULL=0 BUILD=1 PUSH_ENV=0 CHECK=0 MAINT_OFF=0 ALLOW_DELETE=0 CONSOLE=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run|-n) DRY=1 ;;
    --full) FULL=1 ;;
    --no-build) BUILD=0 ;;
    --push-env) PUSH_ENV=1 ;;
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
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.production}"
DEPLOY_PARALLEL="${DEPLOY_PARALLEL:-4}"
DEPLOY_URL="${DEPLOY_URL%/}"

command -v curl >/dev/null || die "curl fehlt."

# Runs curl with options read from stdin, so passwords and tokens never show up in ps.
cfg() { local v="${1//\\/\\\\}"; printf '"%s"' "${v//\"/\\\"}"; }   # quote a curl config value

# ── HTTPS calls to /ops (migrate, check, console) ───────────────────────────
ops() {   # ops <action> [json-body] → prints the server's text answer, returns 1 on HTTP errors
  [ -n "$DEPLOY_URL" ] || die "DEPLOY_URL fehlt in .env.deploy."
  [ ${#DEPLOY_OPS_TOKEN} -ge 32 ] || die "DEPLOY_OPS_TOKEN fehlt in .env.deploy (mindestens 32 Zeichen, gleich OPS_TOKEN in der .env auf dem Server)."
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

if [ $CHECK = 1 ]; then
  ops check || exit 1
  exit 0
fi
if [ ${#CONSOLE[@]} -gt 0 ]; then
  args=""
  for a in "${CONSOLE[@]:1}"; do args+="${args:+,}$(json_str "$a")"; done
  ops console "{\"command\":$(json_str "${CONSOLE[0]}"),\"args\":[$args]}" || exit 1
  exit 0
fi

# ── FTP ──────────────────────────────────────────────────────────────────────
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

# Explicit TLS (AUTH TLS) is required: login, files and .env never travel in clear text.
ftp_curl() {
  local extra="$1"; shift
  printf 'user = %s\nssl-reqd\nssl-revoke-best-effort\nsilent\nshow-error\nconnect-timeout = 20\n%s\n' "$(cfg "$DEPLOY_USER:$DEPLOY_PASS")" "$extra" \
    | curl -K - "$@"
}

tmp=$(mktemp -d)
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
# Git Bash's curl is a Windows program: it can't open /tmp/… from a config file
# (only command-line arguments get translated), so hand it Windows paths.
native() { cygpath -m "$1" 2>/dev/null || printf '%s' "$1"; }
: > "$tmp/flag"

maintenance_off() {
  ftp_curl "url = $(cfg "$base/")"$'\n'"list-only"$'\n'"quote = $(cfg "*DELE $root/.maintenance")" >/dev/null
}
if [ $MAINT_OFF = 1 ]; then
  maintenance_off || die "Konnte .maintenance nicht löschen."
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
for f in "${present[@]}"; do
  [[ $f =~ ^[A-Za-z0-9._+@-]+(/[A-Za-z0-9._+@-]+)*$ ]] || die "Dateiname mit Sonderzeichen im Build: $f"
done

target="$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PORT $DEPLOY_PATH"

# ── Check login and target folder, fetch the server's manifest ──────────────
manifest_marker="# Essensplan deploy manifest"
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
# sha1 hashes, plain relative paths, never .env, storage/ or other runtime files.
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
      .env|.env.*|.maintenance|.deploy-manifest|storage/*|public/version.txt|public/media/*) die "Geschützte Datei im Manifest auf dem Server: $path" ;;
    esac
    [ $FULL = 1 ] || old["$path"]="$hash"
  done < <(grep -v '^#' <<<"$remote_manifest")
fi

# The app can't start without its .env. Either it is there, or --push-env brings it.
# (Reads its first byte only; SIZE answers differ between FTP servers. 56 = the byte came,
# the TLS close did not, see the manifest above.)
set +e
ftp_curl "range = 0-0"$'\n'"url = $(cfg "$base/.env")" >/dev/null 2>&1
estatus=$?
set -e
case $estatus in
  0|56) env_there=1 ;;
  78|19|9) env_there=0 ;;
  *) die "Konnte nicht prüfen, ob $DEPLOY_PATH/.env da ist (curl $estatus). Es wurde nichts verändert." ;;
esac
if [ $PUSH_ENV = 1 ]; then
  [ -f "$DEPLOY_ENV_FILE" ] || die "$DEPLOY_ENV_FILE fehlt (DEPLOY_ENV_FILE). Vorlage: der PHP-Teil von .env.example."
  envget() { grep -E "^$1=" "$DEPLOY_ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }
  [ "$(envget APP_ENV)" = production ] || die "$DEPLOY_ENV_FILE: APP_ENV muss production sein."
  secret=$(envget APP_SECRET); [ ${#secret} -ge 32 ] || die "$DEPLOY_ENV_FILE: APP_SECRET fehlt oder ist kürzer als 32 Zeichen."
  case "$(envget APP_URL)" in https://*) ;; *) die "$DEPLOY_ENV_FILE: APP_URL muss mit https:// beginnen." ;; esac
  for k in DB_HOST DB_NAME DB_USER DB_PASS; do [ -n "$(envget $k)" ] || die "$DEPLOY_ENV_FILE: $k fehlt."; done
  [ -z "$DEPLOY_OPS_TOKEN" ] || [ "$(envget OPS_TOKEN)" = "$DEPLOY_OPS_TOKEN" ] || die "$DEPLOY_ENV_FILE: OPS_TOKEN ist nicht gleich DEPLOY_OPS_TOKEN."
elif [ $env_there = 0 ] && [ $DRY = 1 ]; then
  echo "! Auf dem Server fehlt $DEPLOY_PATH/.env: der echte Lauf braucht --push-env."
elif [ $env_there = 0 ]; then
  die "Auf dem Server fehlt $DEPLOY_PATH/.env. Leg $DEPLOY_ENV_FILE an (Vorlage: PHP-Teil von .env.example, README → Deploy) und starte ./deploy.sh --push-env. Es wurde nichts verändert."
fi

# ── What changed ─────────────────────────────────────────────────────────────
new_manifest="$tmp/manifest"
stamp=$(date '+%Y-%m-%d %H:%M:%S')
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

dirty=""
if [ -n "$(git status --porcelain -- bin src migrations public frontend composer.json composer.lock .htaccess)" ]; then
  dirty=" (+ nicht committete Änderungen)"
  echo "! Es gibt Änderungen, die noch nicht committet sind. Sie werden mit hochgeladen."
fi
upload=("${code[@]}" "${web[@]}" "${last[@]}")
echo "Ziel: $target"
echo "${#upload[@]} hochladen, ${#remove[@]} löschen$([ ${#old[@]} = 0 ] && echo ' (vollständig)')$([ $PUSH_ENV = 1 ] && echo ', .env ersetzen')"
show() { local n=0; for f in "$@"; do n=$((n + 1)); [ $n -le 40 ] && echo "  $f"; done; [ $n -le 40 ] || echo "  … und $((n - 40)) weitere"; }
show "${upload[@]/#/+ }"
show "${remove[@]/#/- }"
[ $backend = 1 ] && echo "Wartungsmodus während des Uploads, danach Migrationen."

live_version() {
  [ -n "$DEPLOY_URL" ] || return 0
  curl -fsS --max-time 15 "$DEPLOY_URL/version.txt?$(date +%s)" 2>/dev/null | tr -d '\r' || true
}

[ $DRY = 1 ] && exit 0
if [ ${#upload[@]} = 0 ] && [ ${#remove[@]} = 0 ] && [ $PUSH_ENV = 0 ]; then
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
put() {
  [ $# -gt 0 ] || return 0
  local files=("$@") i f conf batch
  for ((i = 0; i < ${#files[@]}; i += 400)); do
    batch=("${files[@]:i:400}")
    conf="$retry"$'\n'"ftp-create-dirs"$'\n'"fail-early"$'\n'"parallel"$'\n'"parallel-max = $DEPLOY_PARALLEL"
    for f in "${batch[@]}"; do
      conf+=$'\n'"upload-file = $(cfg "$(native "$build/$f")")"$'\n'"url = $(cfg "$base/$(urlenc "$f")")"
    done
    ftp_curl "$conf" >/dev/null || return 1
    for f in "${batch[@]}"; do server_hash["$f"]="${new_hash[$f]}"; done
    uploaded=$((uploaded + ${#batch[@]}))
    if [ ${#upload[@]} -gt 400 ]; then
      { echo "$manifest_marker"; echo "# Deploy $stamp (läuft)"
        for f in "${!server_hash[@]}"; do echo "${server_hash[$f]}  $f"; done | LC_ALL=C sort -k2
        echo "# Ende (${#server_hash[@]} Dateien)"; } > "$tmp/progress"
      put_tmp "$tmp/progress" .deploy-manifest || return 1
      echo "  $uploaded/${#upload[@]}"
    fi
  done
}
put_tmp() {   # put_tmp <local file> <remote path>
  ftp_curl "$retry"$'\n'"ftp-create-dirs"$'\n'"upload-file = $(cfg "$(native "$1")")"$'\n'"url = $(cfg "$base/$(urlenc "$2")")" >/dev/null
}

if [ $PUSH_ENV = 1 ]; then
  put_tmp "$DEPLOY_ENV_FILE" .env || die "Konnte .env nicht hochladen. Es wurde sonst nichts verändert."
  echo "✓ .env hochgeladen."
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
if [ $backend = 1 ] || [ $PUSH_ENV = 1 ]; then
  if [ -n "$DEPLOY_URL" ] && [ ${#DEPLOY_OPS_TOKEN} -ge 32 ]; then
    echo "Migrationen:"
    ops migrate | sed 's/^/  /' || aborted "Migration fehlgeschlagen (Ausgabe oben)."
  else
    echo "! Ohne DEPLOY_URL und DEPLOY_OPS_TOKEN laufen keine Migrationen. Neue migrations/*.sql in phpMyAdmin ausführen."
  fi
fi

# ── version.txt and manifest last: they only describe a finished deploy ─────
version="$tmp/version.txt"
{
  echo "Commit: $(git log -1 --format='%h %s')$dirty"
  echo "Deploy: $stamp ($(git config user.name || echo unbekannt))"
} > "$version"
put_tmp "$version" public/version.txt && put_tmp "$new_manifest" .deploy-manifest \
  || aborted "Dateien sind oben, aber version.txt/Manifest nicht. Lauf ./deploy.sh noch einmal."
if [ $maint = 1 ]; then
  maintenance_off || die "Alles ist oben, aber der Wartungsmodus ließ sich nicht ausschalten: ./deploy.sh --maintenance-off"
fi
echo "✓ Deploy fertig."

if [ -n "$DEPLOY_URL" ]; then
  live=$(live_version)
  if [ "$live" = "$(cat "$version")" ]; then
    echo "✓ $DEPLOY_URL/version.txt zeigt diesen Deploy."
  else
    echo "! $DEPLOY_URL/version.txt zeigt nicht diesen Deploy. Zeigt die Domain auf $DEPLOY_PATH/public?"
    [ -n "$live" ] && sed 's/^/  /' <<<"$live"
  fi
  health=$(curl -sS --max-time 15 "$DEPLOY_URL/api/v1/health" 2>&1 || true)
  case "$health" in
    *'"status":"ok"'*) echo "✓ $DEPLOY_URL/api/v1/health: ok" ;;
    *) echo "! $DEPLOY_URL/api/v1/health antwortet: $(cut -c1-200 <<<"$health")" ;;
  esac
fi
