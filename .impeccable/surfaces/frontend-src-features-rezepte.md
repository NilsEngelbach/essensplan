---
version: 1
slug: "frontend-src-features-rezepte"
primary_target: "frontend/src/features/rezepte"
related_targets: ["frontend/src/features/rezepte/RecipeListPage.tsx","frontend/src/features/rezepte/RecipePage.tsx","frontend/src/features/rezepte/CapturePage.tsx","frontend/src/features/rezepte/RecipeEditPage.tsx"]
---

# Surface brief: Rezepte (collection, recipe view, capture, edit)

Status: confirmed 2026-11-07 (`/impeccable shape rezepte`). Visual world chosen in the direction round (seed 36e859cd): **"Das Küchengerät"** (IMPECCABLE'S PICK, chosen over the assigned fridge Wochenplan, the Lexikon challenger and the canon). Build path: code-led. This world also governs the app shell and all later surfaces.

## 1. Job and audience
- **Who:** the planner (owner); the family uses the same login. Mode: **Operate**.
- **Intents:**
  - (a) **Finding a specific dish** by name or ingredient.
  - (b) **Looking for an idea**: favourites, quick, not cooked in a while, category.
  - Tidying the collection is secondary.
- **Devices:** phone, tablet, desktop.

## 2. Outcome
- (a) 2–3 typed letters surface the dish.
- (b) One switch flick yields 3–5 sensible ideas from the family's own history.
- **Recipe view, first screen:** ingredients with **live servings scaling**, history and rating, **"In den Plan" (day + slot) in ≤2 taps**. Cooking mode is one level below.
- **"＋ Rezept":** link or photo becomes an **editable** recipe, then the saved recipe.

## 3. Selected direction: "Das Küchengerät"
- **Thesis:** the app is a quiet, precise kitchen appliance (Braun/Rams, Ulm school). Few controls, each tactile and exactly labelled. Calm and utilitarian; the fun lives in the controls.
- **World:**
  - Matte appliance light grey; dark theme = the black appliance variant.
  - Charcoal ink; hairline seams instead of shadowed cards.
  - **Signal green** = on / primary action (＋ is the power button); **orange** = the single marker (favourite / active).
  - LED dots for status and "how loved"; tabular figures for times and amounts; a sober grotesk with small precise device labels.
  - **No faked material** (no plastic textures, bevels, embossing). The appliance lives in geometry, proportion and control behaviour.
- **Recipe list:**
  - Control strip: search slot + three **rocker switches** (Lieblinge · Schnell · Lange nicht gekocht), "Mehr" for category/tags/sort.
  - Phone: quiet rows (title, time right-aligned, LED ramp, zuletzt).
  - Tablet/desktop: photo recipes show the photo prominently; photo-less recipes get a **deliberate panel** (title set large on matte), never a placeholder.
- **Recipe view:**
  - Title (+ photo if any).
  - **Steckbrief** line: in der Sammlung seit · x-mal gekocht · zuletzt · rating LEDs.
  - **Servings dial** (signature interaction): rotary with detents, rescales every amount live with a readout; arrow keys; reduced motion snaps.
  - Plan control: day row (Heute, Morgen, …, calendar) + slot switch (Frühstück / Mittag / Abend / Snack).
  - Steps below; "Kochen" as a secondary button.
- **Capture ＋:**
  - One input slot (link or photo; iPhone: "Link aus Zwischenablage").
  - Progress as an LED sequence (lesen → Zutaten → Schritte → fertig).
  - Result opens in the edit form.
- **Edit form:** sections as panels, labelled fields, **sticky save bar**, ingredient groups ("Teig", "Sauce") kept.
- **Disciplines carried over from the round:**
  - Times are a first-class right-aligned figure.
  - Nothing is labelled twice.
  - **One "how loved" scale** (rating + times cooked), identical everywhere.
  - The Steckbrief always sits in the same place.

## 4. Scope and boundaries
- **In scope:** list, recipe view, capture/import, edit form. Woche, Einkauf and Kochmodus get their own briefs (entry points only).
- **Anti-goals:**
  - Depending on a photo grid.
  - Gradient placeholders.
  - Modal-in-modal.
  - Save only at the bottom.
  - Skeuomorphic kitsch.
  - The old stock blue.

## 5. States and ranges
- **Collection:** 0 / 68 / 500 recipes; titles up to ~60 chars; ~44% have photos.
- **Recipe size:** 3–30 ingredients in 0–4 groups; 1–20 steps.
- **Empty states:**
  - No search hits.
  - No hits with switches on (offer reset).
  - Empty collection (lead into capture).
- **Import:** 10–120 s; failure (no recipe found / site blocks) offers retry or manual entry.
- **Delete:** with undo.

## 6. Interaction and layout
- **Rows/cards are real links.**
- **Shortcuts:** `/` focuses search; arrow keys turn the dial.
- **Touch targets** ≥44px.
- **Layout per width:** phone list rows; tablet landscape and up: grid + filter side panel.
- **Switch states** are always visible; active-filter count when collapsed.

## 7. Constraints and open decisions
- **Constraints:** "du" voice; light + dark appliance; WCAG AA (green/orange as fills reach contrast; darker ink variants for text).
- **Backend impact:**
  - Search by name **and ingredients**.
  - Filters `minRating`, `maxTime`, `notCookedSince`, `category`, `tags`.
  - List returns `cookingStats` + thumbnail; recipe view returns `createdAt` + stats.
  - Planning from recipe: `POST /meal-plan/entries {date, slot}`.
  - Import progress states in `ai_jobs`.
- **Open:**
  - Concrete font faces (chosen at build, tabular figures).
  - App icon (power-button / dial motif).
  - Placement of image enhancement in the edit form (OpenAI only).
  - Whether the fixed tag/category set gets reviewed.

## Direction contract

THESIS: The app is a quiet kitchen appliance. A few precise, labelled controls (search slot, rocker switches, servings dial, the green ＋ power button) operate the family's own recipe collection. It refuses the category default of photo-card grids, shadowed cards and a stock-blue accent.

OWN-WORLD:
- Matte appliance-grey body; the dark theme is the black appliance variant.
- Charcoal ink; hairline panel seams.
- One signal green = on / primary; one orange = the single marker (favourite / active).
- LED dots for status and the "how loved" ramp.
- Device-label typography: one sober grotesk, small tracked labels, tabular figures.
- Round tactile controls.
- No bevels, textures, gradients or shadow-cards.

STORY: The planner opens Rezepte, types two letters or flicks a switch, scans calm rows by time and how loved, opens a recipe, turns the dial to the family's servings, plans it to a day and slot, or captures a new recipe with the green ＋.

FIRST VIEWPORT:
- **Phone (390):**
  - Device-label header "Rezepte" with a count readout.
  - Full-width search slot, then a row of three rocker switches.
  - Quiet list rows: title, time right-aligned in tabular figures, LED ramp, zuletzt; photo thumbs only where photos exist.
  - Bottom bar: Woche · Rezepte · green ＋ · Einkauf.
- **Desktop:**
  - Left rail; control strip on top.
  - Grid where photo recipes show the photo and photo-less ones are matte title panels.
- **Signature interaction:** the servings dial on the recipe view, with detents, rescaling every amount live with a readout.

FORM: "Das Küchengerät" (Braun/Rams appliance), position 1 on the ordered grounded list, chosen as IMPECCABLE'S PICK; seed key 36e859cd.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
