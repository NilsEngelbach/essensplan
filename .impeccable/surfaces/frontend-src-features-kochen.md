---
version: 1
slug: "frontend-src-features-kochen"
primary_target: "frontend/src/features/kochen"
related_targets: ["frontend/src/features/kochen/CookPage.tsx"]
---

# Surface brief: Kochmodus (one step at a time, read from a distance)

Status: confirmed 2026-11-07 (`/impeccable shape kochmodus`). Built inside the established world "Das Küchengerät" (DESIGN.md). No concept round: "tap anywhere for next" and reading at a distance fix the structure as one step per screen. Build path: code-led.

## 1. Job and audience
- **Who:** the cook, the planner or a family member, with the phone or tablet **propped up on the counter, 50–80 cm away**, hands often wet or floury.
- **Mode:** Operate.

## 2. Outcome and proof
- The current step is readable from a distance at a glance.
- A knuckle tap moves on.
- The amounts for this step are right there, scaled.
- You never lose your place, and the screen stays on.

## 3. Selected direction: the appliance's program display
- **Top bar (thin):**
  - ✕ (back to the recipe) and the recipe title, small.
  - Servings with − / +, carried over from the recipe's dial via `?portionen=`.
  - A "Bildschirm bleibt an" LED (Wake Lock).
- **Program LEDs:** one per screen, lit up to the current one; the current one carries the orange pointer, like the import reader.
- **Screen 0 "Zutaten":** all ingredients, scaled and grouped by component, in the slip's tabular amount column.
- **Steps:** one screen per step, then a last screen: "Fertig. Guten Appetit!" with "Zurück zum Rezept".
- **Step screen:**
  - A large step number and the step text very large: about 1.75–2.25rem, at most about 30 characters per line. Long steps scale down to about 1.375rem.
  - Below it, **"Für diesen Schritt"**: the amounts this step uses, scaled, at about 1.25rem.
- **Moving:**
  - Tap the right two thirds for weiter and the left third for zurück. Swiping and the ←/→, space and Enter keys also work.
  - Quiet "‹ zurück" and "weiter ›" labels sit at the bottom edges.
  - A 350ms guard stops a double tap from skipping two steps.
- **Tablet landscape:** the step on the left (about 60%), with the step's ingredients and the full list on the right.
- Light and dark follow the setting.

## 4. Scope and boundaries
- **In scope:** the cook screen, opened from "Kochen" on the recipe; servings come along.
- **Anti-goals:**
  - timers;
  - mise en place;
  - marking dishes as cooked (that stays derived from the plan);
  - voice control;
  - one long scrolling page.

## 5. States and ranges
- **Typical recipe:** 3–10 steps of 40–300 characters, and 5–15 ingredients.
- **Recipe without steps:** ingredients only, with a note.
- **Very long step:** smaller type and scrolling inside the step.
- **Recipe not found.**
- **Loading:** a skeleton.
- **No Wake Lock:** the LED stays off, with the hint "Bildschirm kann ausgehen".

## 6. Backend consequences (→ docs/BACKEND.md)
- **Ingredients per step:** stored as `instructions.ingredient_ids` (JSON). The AI import fills it; later it becomes editable in the recipe form.
- **Fallback:** until then, and in the prototype, the links are derived by matching ingredient names in the step text.
- **No `cooked_events`:** "gekocht" stays derived from past plan entries.

## 7. Constraints
- Reading at a distance comes first: large type and very large tap zones.
- German "du" voice; light and dark themes.
- Wake Lock wherever the browser supports it.

## Direction contract

THESIS: The recipe runs as an appliance program, one step on the display at a time and readable from across the counter. A knuckle anywhere moves the program on. It refuses the long scrolling recipe page and the timer-and-checklist cockpit.

OWN-WORLD: "Das Küchengerät" (DESIGN.md), inherited unchanged:
- Matte body, a panel for the step's ingredients, tabular amounts.
- A program LED row (lit = done; the orange pointer marks the current step).
- One sober grotesk, scaled up for distance.
- No decoration.

STORY:
1. On the recipe the planner sets the dial to 6 and taps "Kochen".
2. The screen shows "Zutaten" for 6.
3. A knuckle tap shows step 1: "Zwiebel, Karotte und Knoblauch fein würfeln …", huge, with "1 Zwiebel · 1 Karotte · 2 Zehen Knoblauch" below.
4. Tap, tap, back once, tap, and at the end "Fertig. Guten Appetit!".

FIRST VIEWPORT (phone 390, propped up): a thin top bar (✕, title, servings − 6 +, the screen LED), the program LEDs, then the large step number and the step text filling the upper two thirds. Below them, the step's ingredients in a panel, and at the bottom edges "‹ zurück" and "weiter ›".

SIGNATURE INTERACTION: tap anywhere to advance. The next step slides in a short distance (220ms) while the program LED moves on, and a mis-tap is guarded for 350ms. A second motion is not owed.

FORM: one step per screen inside the established world; no concept round (structure fixed by the brief).

FINISH: unreviewed and undocumented means unfinished. This build ends with the finish review, the verdict and the DESIGN.md update.
