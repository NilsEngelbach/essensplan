---
version: 1
slug: "frontend-src-features-konto"
primary_target: "frontend/src/features/konto"
related_targets: ["frontend/src/features/konto/AccountPage.tsx"]
---

# Surface brief: API & Agenten (keys, setup, activity log)

Status: confirmed 2026-11-07 (`/impeccable shape api-agenten`). Built inside "Das Küchengerät" (DESIGN.md). No concept round: this is a settings and log surface with a conventional structure. Build path: code-led.

## 1. Job and audience
- **Who:** the planner, connecting an AI tool now and then (rarely, carefully) and later checking what it did, undoing it if needed.
- **Mode:** Operate.

## 2. Outcome and proof
- From "Neuer Schlüssel" to a working connection in under 2 minutes, with copy-ready setup.
- Nothing an agent does goes unnoticed: the log, a mark where it happened, and a dot on the avatar.
- Mistakes can be undone with one tap.

## 3. Direction
- **Konto:** gets the panels "API & Agenten" (`/konto/api`) and "Aktivität" (`/konto/aktivitaet`). The "folgt" entries in the avatar menu become links.
- **Key list:**
  - **Each row shows:**
    - the name;
    - the prefix `esp_ab12…`;
    - rights as small labels;
    - "zuletzt benutzt …";
    - an LED: green means used in the last 7 days.
  - **Widerrufen:** takes effect immediately, with a toast to undo.
  - **Revoked or expired keys** fold away below.
- **Neuer Schlüssel:** an inline panel, not a dialog.
  - **Name.**
  - **Rights, picked each time with nothing pre-ticked** (owner's choice: no presets):
    - Rezepte: lesen · speichern · löschen
    - Wochenplan: lesen · planen
    - Einkauf: lesen · ändern
    - KI-Import
  - At least one right is required.
  - **Warning lines:** "löschen" warns "kann Rezepte löschen"; "KI-Import" warns "verursacht KI-Kosten".
  - **Gültig:** 30 Tage · 1 Jahr · unbegrenzt.
- **Shown once:**
  - The key appears in a recessed slot (monospace, since it is code), with "Kopieren" and the note "Nur jetzt sichtbar. Danach siehst du nur noch den Anfang."
  - **Setup tabs, each with Kopieren:**
    - **Claude Code:** `claude mcp add`.
    - **Claude Desktop:** JSON config via `mcp-remote`.
    - **Andere MCP-Clients:** URL + header.
    - **REST:** a curl example.
  - **Honest note:** claude.ai in the browser and ChatGPT connect to their own MCP servers only via OAuth, which is out of scope for now (D4).
- **Aktivität:**
  - Grouped by day, with filter chips per key.
  - **Each row:**
    - an LED (green = new since the last visit);
    - the key's name;
    - one sentence;
    - the time;
    - a link to the target;
    - **"Rückgängig"** where possible:
      - planned → remove;
      - put on the list → strike;
      - changed → previous version;
      - deleted → restore;
      - moved → move back.
  - Undone rows read "rückgängig gemacht".
  - When undo is no longer safe: "Nicht mehr rückgängig: … wurde inzwischen geändert."
- **Marks where it happened:**
  - **Plan entries:** already have one.
  - **Recipes** (list row and recipe page): "vom Agenten geändert" with an LED until seen.
  - **Shopping lines:** the flag "Agent".
- **Avatar dot:** a small `led-green` LED on the account button (header and rail) while unseen agent activity exists. Visiting Aktivität clears it.

## 4. Scope and boundaries
- **In scope:**
  - keys (create, show once, revoke);
  - setup snippets;
  - the activity log with undo;
  - the marks and the avatar dot.
- **Anti-goals:**
  - OAuth;
  - roles and teams;
  - usage graphs;
  - AI cost tracking here;
  - a modal for creating a key.

## 5. States and ranges
- **Keys:** typically 1–4.
- **Activity:** 0–50 entries a week, kept 90 days.
- **No key yet:** an explanation plus "Neuer Schlüssel".
- **Clipboard unavailable:** the text is selected, with "Markieren und kopieren".
- **Other states:** an expired key, an empty log, and undo that is blocked.

## 6. Backend consequences (→ BACKEND_REQUIREMENTS.md)
- **Scopes:**
  - `recipes:read|write|delete`
  - `mealplan:read|write`
  - `shopping:read|write` (new: the shopping list now has write actions)
  - `ai:use`
  - `profile:read` stays implicit.
- **`api_keys`:** add `client` (a snippet label only) and `expires_at`.
- **`agent_activity`:** add `undo_payload` JSON (the previous version or the reverse operation), `undone_at` and `seen_at`.
- **Endpoints (session only):**
  - `POST /agent-activity/{id}/undo` checks whether undoing is still safe (the target's `updated_at` matches what the activity recorded).
  - `GET /agent-activity/unseen-count`.
  - `POST /agent-activity/seen`.
- **Recipe mark:** derived from unseen activity on that recipe.
- **Shopping items:** get `created_via`.
- **Retention:** 90 days.

## 7. Constraints
- The phone comes first.
- German "du" voice; light and dark themes.
- Monospace only for the key and the snippets (they are code).

## Direction contract

THESIS: Agent access is a set of labelled keys on the appliance. Each key has its rights printed beside it and a lamp that shows use, and every action an agent takes is logged with a "Rückgängig". It refuses the developer-console look of dense tables, token graphs and hidden settings.

OWN-WORLD: "Das Küchengerät" (DESIGN.md), inherited unchanged:
- Panels on the matte body, hairline rows and LEDs for use and "new".
- A recessed slot for the one-time secret; monospace only for code.
- Orange only for focus and the single current marker.
- Konto keeps the shell, so the power ＋ stays the one green control; "Neuer Schlüssel" and "Schlüssel erstellen" are secondary buttons.

STORY:
1. The planner opens the avatar and goes to Einstellungen, then API & Agenten, and taps "Neuer Schlüssel".
2. They name it "Claude Code Laptop" and tick Wochenplan lesen + planen and Rezepte lesen.
3. "Schlüssel erstellen" shows the key once with the Claude Code command. They copy it, paste it into the terminal, and tap "Fertig".
4. Later a green dot on the avatar leads to Aktivität: "Claude Code Laptop hat Do 12. Mittag: Gnocchi-Pfanne geplant". They tap "Rückgängig".

FIRST VIEWPORT (phone 390, `/konto/api`):
- The title "API & Agenten" and a one-line explanation.
- The key rows (name, prefix, rights labels, last-used LED).
- "Neuer Schlüssel" as a secondary button.
- A link row "Aktivität" with the unseen count.

SIGNATURE INTERACTION: show once. Creating a key reveals the secret in a recessed slot with "Kopieren". The copy action lights the slot's LED green ("Kopiert"). After "Fertig" the slot collapses to the prefix and never shows the secret again.

FORM: inside the established world; no concept round.

FINISH: unreviewed and undocumented means unfinished. This build ends with the finish review, the verdict and the DESIGN.md update.
