---
version: 1
slug: "frontend-src-app-appshell-tsx"
primary_target: "frontend/src/app/AppShell.tsx"
related_targets: []
---

# Surface brief: App shell (navigation, screen map, global patterns)

Status: confirmed 2026-11-07 (`/impeccable shape app-shell`, one correction: no Profil tab). Structure only. The visual world is chosen in `shape rezepte` and then also governs the shell (direction contract follows there).

## 1. Job and audience
- **Who:** the planner (owner); the family uses the same login. Mode: **Operate**.
- **Scenes:** planning, collecting, cooking, shopping, on phone, tablet and desktop.
- **Install:** installed as a web app on Android and iPhone.
- **The shell's job:** stay out of the way, and keep the week, any recipe and "Rezept hinzufügen" within one tap at all times.

## 2. Outcome
- Opening the app shows **this week** immediately (Mon–Sun, today in focus).
- Any recipe is reachable in ≤2 taps (search included).
- **New recipe from anywhere in one tap**, or via the share sheet on Android.
- The grocery list is one tap away.
- No full-screen spinners, ever.

## 3. Structural direction
- **Destinations:** **Woche** (home) · **Rezepte** · **Einkauf**, plus the always-present **"＋ Rezept"** capture action.
- **Account menu:** account, theme, API & Agenten, activity log and logout sit behind an **avatar in the header** (on desktop/rail: at the bottom of the rail). This is not a tab.
- **Phone + tablet portrait:** bottom bar in the thumb zone: **Woche · Rezepte · ＋ · Einkauf**.
- **Tablet landscape + desktop:** a left rail with the same destinations, a prominent "Rezept hinzufügen", recipe search with a keyboard shortcut (`/` or ⌘K), and the avatar/account at the bottom.
- **Focused tasks hide the shell:** capture/import, recipe edit and cooking mode run full screen with a clear close/back.
- **Recipe detail** is a pushed screen with back; the shell stays visible.
- **Capture flow "Rezept hinzufügen":** one smart field: paste link · take/choose photo · "manuell" as the fallback.
  - On Android, the share target opens it pre-filled.
  - On iPhone, it offers "Link aus Zwischenablage einfügen".
  - The result always lands in the **editable** form, then on the saved recipe.
- **Global patterns:**
  - One message channel (toast/snackbar above the bottom bar) with **undo** for destructive actions; no `alert()`, no confirm dialogs for reversible things.
  - Skeletons inside the shell instead of page spinners.
  - Accessible dialogs/sheets (focus trap, Escape, `role="dialog"`); Android back closes a sheet instead of leaving the app.

## 4. Scope and boundaries
- **In scope:** destinations, navigation, routes, the capture entry point, global feedback and states, PWA behaviour.
- **Out of scope:** the visual world (`shape rezepte`), and the inner layout of Woche, Rezepte and Einkauf (own briefs).
- **Anti-goals:**
  - A top-right hamburger as the only navigation.
  - Duplicate "Neues Rezept" CTAs.
  - A landing page or sign-up page.
  - Full-screen loading.
  - Modal-in-modal.

## 5. States and ranges
- **Logged out:** login screen only (+ password reset). After session expiry, logging in returns to the previous route.
- **First run:** empty week and empty collection, each with a capture prompt.
- **Errors:** inline at the source plus a toast; never `alert()`.
- **AI import:** takes 10–120 s, so show progress steps.
- **Data:** ~68 recipes today, design for 500. A week = 7 days × 4 slots × 0–3 entries.

## 6. Routes (German)
- `/` → Woche (current week)
- `/woche/2026-11-16` (week start date; the start weekday is a setting, see the Wochenplan brief)
- `/rezepte`
- `/rezepte/neu` (capture)
- `/rezepte/:id`
- `/rezepte/:id/bearbeiten`
- `/rezepte/:id/kochen`
- `/einkauf`
- `/konto`
- `/konto/api`
- `/konto/aktivitaet`
- `/login`
- `/passwort-vergessen`
- `/passwort-zuruecksetzen`

## 7. Constraints and open decisions
- **Constraints:** React SPA (Vite) served by PHP; "du" voice; light + dark theme (system default, switch in the account menu); WCAG AA; touch targets ≥44px; week starts Monday.
- **Backend impact:**
  - `POST /teilen` (share target, handled server-side: session cookie, temporary upload, redirect into the capture flow).
  - `401` triggers a login redirect with a return path.
  - Web manifest + app icon.
  - Minimal service worker for installability only (no offline, D12).
- **Open:**
  - App icon (no brand assets exist; made with the visual world).
  - Quiet agent-activity marker on the avatar (candidate "fun little detail", undecided).
  - Week layout on Home: decided in `shape wochenplan`.
