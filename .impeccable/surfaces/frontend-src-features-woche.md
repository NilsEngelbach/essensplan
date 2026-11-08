---
version: 1
slug: "frontend-src-features-woche"
primary_target: "frontend/src/features/woche"
related_targets: ["frontend/src/features/woche/WeekPage.tsx"]
---

# Surface brief: Wochenplan (home week, planning mode)

Status: confirmed 2026-11-07 (`/impeccable shape wochenplan`, one correction: the week start is configurable too). The structure was chosen in the surface round (seed c7d5c322): **"Tagleiste + Rezepte"**, picked over "Wochenuhr" (ring) and "Erst sammeln, dann verteilen". The world is "Das Küchengerät" (DESIGN.md). Build path: code-led.

## 1. Job and audience
- **Who:** the planner, **on the phone**. One sit-down on Friday or Saturday fills the **coming week**, then they go shopping.
- **The family:** opens home to see what's for lunch today and this week.
- **What gets planned:** mostly **Mittagessen**. Frühstück, Abendessen and Snack are rare.
- **Mode:** Operate.

## 2. Outcome and proof
- Seven lunches planned in about 2 minutes: no sheet per pick, no confirm dialogs.
- Today's lunch is readable at a glance on home.
- A full week hands off to Einkauf ("Einkaufsliste ansehen").
- **Product truth:** suggestions come from the family's own history (ratings, last cooked, cooking time). Nothing generic.

## 3. Selected direction: Tagleiste + Rezepte
- **Home (view):**
  - Title "Diese Woche" or "Nächste Woche", plus the date range and ‹ › to switch weeks.
  - **Seven fixed day rows.**
    - **Lunch** fills the row: thumb or title plate, title, time. An empty day reads "frei".
    - **Frühstück, Abendessen and Snack** appear as small lines under the day, only when filled.
    - **Today** gets the orange marker.
    - **Past days** are muted, and their recipe entries count as "gekocht".
- **Planning mode:**
  - **Entering:** tap a day row or "Woche planen" (a secondary button; the power ＋ stays the one green control).
  - **Key row:** the week folds into a pinned row of **seven day keys**.
    - Each key shows the weekday, the day number, an LED (green = filled) and a short title.
    - The selected key is pressed in and carries the orange marker.
  - **Below the key row, top to bottom:**
    1. **Slot switch** (segmented): Mittag is the default, then Früh · Abend · Snack.
    2. **Preset chips:** Reste · Essen gehen · Auswärts · Bestellen, the last few distinct own texts, and "Eigener Text…" (an inline field, not a dialog).
    3. **Suggestion shelves.** Each shelf is a horizontal rail with one reason: "Lange nicht gegessen" (loved, not cooked for 6+ weeks), "Lieblinge", "Schnell" (≤30 min).
       - Recipes planned within ±14 days are excluded.
    4. **Search slot plus the full recipe list**, using the same rows as Rezepte.
  - **Picking:**
    - **Empty day:** the pick fills the selected day and slot. The key's title flips in place, the LED lights, and the selection **jumps to the next empty day**.
    - **Filled day:** its entries are listed above the presets, each with ✕. A new pick is **added** (main + side), and the selection stays put.
  - **Finishing:**
    - When all seven days are filled, the screen shows "Woche steht" with "Einkaufsliste ansehen".
    - "Fertig" returns to the view at any time.
- **Changing an entry (view mode):**
  - Tap an entry for a small menu: Rezept öffnen · Verschieben (seven day keys; slot kept) · Entfernen (toast with undo).
  - Desktop also supports drag and drop between days.
  - **Rows never move; only their content flips** (split-flap discipline). Under reduced motion the flip is instant.
- **Agent-planned entries** (created via API/MCP) keep a lit LED marker until seen.
- **≥1024px:** the week is a pinned left column of seven day rows, and the recipe library (presets, shelves, search, list) sits on the right.
  - Clicking fills the selected day.
  - Dragging a recipe onto any day row fills that day.

## 4. Scope and boundaries
- **In scope:**
  - Home week (view) and planning mode.
  - Moving and removing entries.
  - Week navigation.
  - The **Planungstag** and **Wochenbeginn** settings in Konto.
  - Empty, loading and error states.
- **Out of scope:** the Einkauf contents (own brief) and Kochmodus.
- **Untouched:** the shell, the Rezepte surfaces, and the recipe row component (reused as is).
- **Anti-goals:**
  - A 7 × 4 calendar grid.
  - A bottom sheet per pick.
  - A toast per pick (the key flip is the feedback).
  - Drag as the only way to move entries on the phone.
  - Suggestions without a stated reason.

## 5. States and ranges
- **Typical week:** 1 lunch per day, sometimes a side; at most 3 entries per slot. Other slots are rare.
- **Free text:** up to about 40 characters. Presets: 4 fixed plus up to 4 recents.
- **First run:** an empty week with "Noch nichts geplant" and "Woche planen".
- **Partial week, full week, past week:** past weeks stay editable.
- **Loading:** skeleton rows, no spinner.
- **Error:** inline at the source plus a toast.
- **Deleted recipe:** the entry keeps the recipe's title as free text.

## 6. Settings (Konto)
- **Wochenbeginn:** a weekday, default Montag. A week runs from Wochenbeginn through the following six days.
- **Planungstag:** a weekday, default Freitag. From this day until the end of the running week, home opens on the **next** week, with the running week one tap away (‹).
- **Route:** `/woche/<start date>` (e.g. `/woche/2026-11-16`) instead of ISO week numbers, because the start is configurable. `/` resolves the default week from both settings.

## 7. Backend consequences (→ docs/BACKEND.md)
- **`meal_plan_entries`:**
  - Holds **either** `recipe_id` **or** free text (`note`), CHECK exactly one.
  - **No `servings` column.** The grocery list scales by each recipe's base servings.
  - Add `seen_at` NULL, set when an api/mcp-created entry has been viewed in the app.
- **On recipe delete:** copy the title into the entry's `note` and set `recipe_id` NULL.
- **Cooked statistics:** only past entries with a recipe count. Free text never counts and never reaches the grocery list.
- **Presets:**
  - The fixed list lives in code.
  - Recents come from `SELECT DISTINCT note … ORDER BY created_at DESC LIMIT 4` (or `GET /meal-plan/presets`).
- **Suggestions:** `GET /suggestions?date&slot` returns shelves `[{reason, recipes[]}]` with the ±14-day exclusion; it backs the MCP `suggest_meals` as well.
- **User settings:** `week_start` (0–6, default 1 = Montag) and `planning_weekday` (0–6, default 5 = Freitag). Both are exposed to agents so `plan_week` targets the right days.
- **Moving entries:** `PATCH /meal-plan/entries/{id}` `{date, slot, position}`.

## 8. Constraints and open decisions
- The phone comes first; touch targets are ≥44px.
- The day keys must fit seven across at 360px wide, or scroll edge to edge with the selected key kept in view.
- German "du" voice; light and dark themes.
- Settled here, not open: the preset list is not user-editable (fixed plus recents).

## Direction contract

THESIS: The week is the appliance's program panel. There are seven fixed day rows. Planning folds them into a row of seven day keys, and one tap on anything in the library sets the selected day and moves on to the next free one. It refuses the 7 × 4 calendar grid, the bottom sheet per pick and the toast per pick.

OWN-WORLD: "Das Küchengerät" (DESIGN.md), inherited unchanged:
- Matte body, raised panels and recessed slots.
- One green for "on" (LEDs) and the primary action (the power ＋).
- Orange only as the marker: today and the selected-day pointer.
- Hairline rows, tabular figures, lowercase device labels.

STORY:
1. On Friday or Saturday the planner opens the app on the phone. Home already shows "Nächste Woche", with seven rows and an LED strip showing what's planned.
2. "Woche planen" pins the day keys.
3. Tap a tile from "Lange nicht gegessen", then a row from "Alle Rezepte", then "Reste". Each tap lights the day's LED and the pointer jumps to the next free day.
4. "Woche steht." appears, then "Einkaufsliste ansehen".

FIRST VIEWPORT:
- **Phone, view (390):**
  - Title "Nächste Woche" with ‹ ›.
  - A range readout, a 7-LED strip and the secondary "Woche planen".
  - Seven hairline day rows: date column, lunch title, thumb, right-aligned time. Other slots appear as small lines. The first free day says "Mittag planen".
- **Phone, planning:**
  - A pinned block: seven day keys (weekday, number, LED; selected = pressed in with an orange pointer bar), the selected day's readout, and the last pick with "Rückgängig".
  - Below it: the slot switch, preset chips, suggestion shelves with a stated reason, and the searchable recipe list.
- **Desktop:** the week rows in a pinned left column (selected row pressed, orange pointer), with the library on the right. Drag and drop works in both directions.

SIGNATURE INTERACTION: pick and advance. One tap fills the selected day: its LED lights, the readout flips like a split-flap (320 ms ease-out, instant under reduced motion), and the pointer moves to the next free day.

FORM: structure "Tagleiste + Rezepte", a dealt structure in surface round c7d5c322 (chosen over Wochenuhr and Erst sammeln, dann verteilen).
- **Raise from the split-flap board:** rows never move; only their content flips.
- **Raise from the gate board:** an agent-planned entry stays lit until it has been seen.

FINISH: unreviewed and undocumented means unfinished. This build ends with the finish review, the verdict and the DESIGN.md update.
