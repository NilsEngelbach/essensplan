# Essensplan – Familien-Essensplaner

Das eigene Kochbuch und der Essensplan der Familie: Rezepte sammeln, die Woche planen, aus dem Plan einkaufen und kochen. Selbst gehostet, für eine Familie gebaut.

## Funktionen

- **Rezepte:** die eigene Sammlung mit Zutaten, Schritten, Foto, Kategorie, Tags, Bewertung und Kochstatistik. Suche nach Titel und Zutat, Filter und Sortierung.
- **KI-Import:** ein Link oder ein Foto (Website, Kochbuchseite, Screenshot) wird zum Rezeptentwurf, den du vor dem Speichern prüfst. Anbieter umschaltbar: OpenCode Go, Anthropic oder OpenAI.
- **Wochenplan:** Frühstück, Mittagessen, Abendessen und Snack, mehrere Gerichte pro Mahlzeit. Vorschläge aus der eigenen Geschichte: lange nicht gekocht, Lieblinge, schnell gemacht.
- **Einkauf:** die Liste ergibt sich aus dem Plan, sortiert nach Bereichen im Laden, mit eigenen Einträgen.
- **Kochmodus:** Schritt für Schritt, mit den passenden Zutaten pro Schritt.
- **Geräte:** ein Login für die Familie. Neue Geräte werden per Code oder QR-Code gekoppelt.
- **Agenten:** REST-API (`/api/v1`) und MCP-Server (`/mcp`) mit eigenen, eingeschränkten API-Schlüsseln. Was ein Agent ändert, steht im Verlauf und lässt sich rückgängig machen.

## Technik

- **Backend:** PHP 8.2, Slim 4, PDO mit MySQL 8 (`src/`, `migrations/`, `bin/console`)
- **Frontend:** React 18 und TypeScript als Single-Page-App mit Vite (`frontend/`), gebaut nach `public/app`
- **Hosting:** all-inkl Webspace, Deploy per SSH mit `./deploy.sh`

## Lokal entwickeln

Voraussetzungen: die „Local“-Site `essen` (nginx, PHP 8.2, MySQL 8, Mailpit) mit dem Repo-Ordner `public/` als Docroot, Node 20+.

```sh
composer install
cp .env.example .env               # APP_SECRET setzen, Datenbank ist auf Local eingestellt
php bin/console migrate            # legt die Datenbank an
php bin/console user:create --email=du@familie.de --name=Familie --password=…

cd frontend && npm install
npm run dev                        # http://localhost:5173, API über http://essen.local
npm run build                      # baut die SPA nach public/app (dann http://essen.local)
```

Tests und statische Prüfung (brauchen MySQL, die Tests legen ihre eigene Datenbank an):

```sh
vendor/bin/phpunit
vendor/bin/phpstan analyse
cd frontend && npm run typecheck
```

## Deploy

```sh
./deploy.sh                        # bauen, per SSH austauschen, migrieren
./deploy.sh --console user:list    # beliebiger bin/console-Befehl auf dem Server
```

Einrichtung und Details: [docs/DEPLOY.md](docs/DEPLOY.md).

## Dokumentation

- [PRODUCT.md](PRODUCT.md): für wen und wozu
- [DESIGN.md](DESIGN.md): das visuelle System
- [docs/BACKEND_REQUIREMENTS.md](docs/BACKEND_REQUIREMENTS.md): Datenmodell, Endpunkte, MCP-Werkzeuge, Fehlercodes
- [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md): der Umzug von der alten Next.js-App und die Entscheidungen dazu

---

**Coded with ❤️ in THE LÄND.**
