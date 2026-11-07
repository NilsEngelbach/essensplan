# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary user: the household's planner.** One person (the owner) collects recipes, plans the family's meals and does the shopping.
- **The rest of the family** occasionally opens the app with the **same login** on their own device, e.g. to see what's planned or to cook from a recipe. There are no separate accounts, roles or permissions.
- **AI agents** (e.g. Claude Code) act on the owner's behalf through a generated API key (REST API and MCP server): searching recipes, planning meals, saving recipes, reading the grocery list.
- **Not a public product.** It serves one family. There's no marketing audience, no open sign-up funnel and no need to persuade strangers.

## Product Purpose

Essensplan is the family's own cookbook and meal planner. It exists so that:
- recipes from anywhere end up in one personal collection,
- deciding what to eat stops being a daily chore,
- the week is planned quickly,
- shopping and cooking follow directly from that plan.

**Recipes are the core** (confirmed by the owner, 2026-11-07). The collection comes first: capturing recipes (AI import or manual), searching and filtering them, and viewing a single recipe. Planning, shopping and cooking build on top of it.

**Success:** planning a week takes minutes; finding "something we like that fits today" is easy; the grocery list in the store and the recipe in the kitchen are always one tap away.

## Positioning

- A private, self-hosted family tool built around **its own** recipe collection and history (ratings, what was cooked when), not a recipe portal or a social platform.
- Recipes get in with almost no effort through **AI import from a URL or a photo** (website, cookbook page, screenshot).
- The planner is open to **AI agents via API keys and MCP**: an assistant can plan a week or save a recipe the same way the owner would.

## Operating Context

| Scene | What happens |
|---|---|
| **Collecting** | Spotting a recipe on a website, in social media or in a cookbook and saving it quickly via AI import (URL or photo), then reviewing and correcting the extracted result |
| **Planning the week** | Sitting down to fill the coming days. Each day has meal slots (Frühstück, Mittagessen, Abendessen, Snack); a slot can hold several dishes (e.g. main + side) |
| **Shopping** | Using the in-app grocery list **in the supermarket**: phone in hand, ticking items off |
| **Cooking** | Following a recipe in the kitchen on phone or tablet |
| **Evening use** | Dark mode is required |
| **Devices** | Phone, tablet and laptop/desktop; Android and iPhone. Installed as a web app on the phones (home-screen icon) |

The family also uses the app on their own devices with the owner's login.

## Capabilities and Constraints

**Existing functionality (to be preserved):**
- **Recipes:** title, description, image, category, tags, cooking time, servings, difficulty, star rating, source URL, ingredients (amount, unit, note, optional component group such as "Teig") and ordered steps.
- **Recipe list:** search, category and tag filters, sorting by recent, popular, last cooked and rating.
- **Plan and list:** meal plan by date, cooking statistics (times cooked, last cooked) derived from past plan entries, grocery list derived from planned recipes.
- **AI features:**
  - AI import from URL and photo/screenshot, with an editable preview before saving.
  - AI image enhancement for recipe photos (only available with OpenAI).

**Decided changes (migration in progress, see `docs/MIGRATION_PLAN.md`):**
- **Platform move:** from Next.js/Supabase/Vercel to self-hosted PHP (Slim 4) + MySQL on all-inkl webspace, with a React (Vite) single-page app.
- **Meal slots:** a fixed set: Frühstück, Mittagessen, Abendessen, Snack. Several entries per slot are allowed. Existing plan entries are imported as Mittagessen.
- **Agent access:** REST API `/api/v1` and MCP server `/mcp`, authenticated with generated, scoped, revocable API keys, plus an activity log of what agents changed. No OAuth for now.
- **AI providers:** switchable between OpenAI, Anthropic and OpenCode.
- **Grocery list:** used in the store, so check-off state must persist (saved on the server). Offline use is **not** required (confirmed 2026-11-07); the app may assume a connection.

**Terminology** (German UI): Rezepte, Wochenplan / Essensplan, Einkaufsliste, KI-Import, Kochmodus. Meal slots: Frühstück, Mittagessen, Abendessen, Snack. Categories: Hauptspeise, Salat, Dessert, Suppe, Beilage, Frühstück, Snack. Tags: Vegetarisch, Vegan, Glutenfrei, Laktosefrei, Schnell, Gesund, Würzig, Süß. Difficulty: Einfach, Mittel, Schwer.

**Undecided** (to be settled in `shape`):
- Free-text plan entries ("Reste", "Essen gehen").
- Per-entry servings.
- Whether the grocery list is persisted with manual extra items.
- How supermarket sections are grouped.

## Brand Commitments

- **Name:** "Essensplan".
- **Language:** German UI.
- **Voice:** address the user with **"du"** (casual, personal), not "Sie". The current "Sie" copy is to be replaced.
- **Sign-off:** the README's "Coded with ❤️ in THE LÄND." is the owner's sign-off.
- **No logo or other identity assets exist.**

## Evidence on Hand

- **Real content:** the family's existing recipes, ratings and meal plan history in Supabase (to be migrated).
- **Screenshots:** `docs/ai-import.png` (AI import) and `docs/enhance-image.jpg` (image enhancement before/after).
- **Absences:** no logo, brand assets, testimonials, user research or analytics exist. Do not fabricate any.

## Product Principles

1. **Deciding is the hard part.** Help answer "what do we eat?" from the family's own history: best-rated dishes, favourites not cooked in a while, and what fits the time and effort available today.
2. **A week in minutes.** Planning several meals per day must take few, fast interactions; slow planning is a known pain.
3. **Capture in seconds.** Getting a recipe in (URL, photo, or via an agent) should be faster than bookmarking it, with a quick review instead of manual typing.
4. **Works mid-task.** The grocery list in the store and the recipe at the stove are used in motion, so they must be immediately usable.
5. **Ours, not generic.** It is one family's personal tool. The current interface feels template-like, which is a known pain.

## Accessibility & Inclusion

- **Dark mode** is required (evening use).
- Otherwise, standard good accessibility (WCAG AA). No further specific needs were stated.
