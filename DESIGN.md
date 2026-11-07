---
name: Essensplan
description: The family's own cookbook and meal planner, built as a quiet kitchen appliance.
colors:
  body: "#e8e9e6"
  panel: "#f4f5f2"
  slot: "#dcddd9"
  slot-strong: "#d0d2cd"
  seam: "#c6c8c3"
  ink: "#1f2022"
  ink-2: "#45484b"
  label: "#5b5e61"
  green: "#2f7a43"
  on-green: "#ffffff"
  green-ink: "#276a39"
  led-green: "#3fae5c"
  orange: "#e0661f"
  on-orange: "#1f2022"
  orange-ink: "#a3420b"
  led-off: "#c2c4bf"
  danger-ink: "#a12a1f"
  qr-paper: "#f4f5f2"
  qr-ink: "#1f2022"
  dark-body: "#161718"
  dark-panel: "#1f2022"
  dark-slot: "#0f1011"
  dark-slot-strong: "#2a2c2e"
  dark-seam: "#303235"
  dark-ink: "#ecedea"
  dark-ink-2: "#b9bcb7"
  dark-label: "#9a9d99"
  dark-green: "#4cb065"
  dark-green-ink: "#6cc883"
  dark-led-green: "#5ccf78"
  dark-orange: "#f07a2e"
  dark-orange-ink: "#f59a5c"
  dark-led-off: "#3a3c3f"
  dark-danger-ink: "#f08a7e"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 2.4vw, 2.75rem)"
    fontWeight: 720
    lineHeight: 1.15
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 94"
  plate:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 720
    lineHeight: 1.04
    letterSpacing: "-0.03em"
    fontVariation: "'wdth' 88"
  plate-small:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.1875rem"
    fontWeight: 720
    lineHeight: 1.04
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 88"
  day-number:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  step-number:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 760
    lineHeight: 1
    letterSpacing: "-0.03em"
    fontFeature: "'tnum' 1"
  step-text:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.2rem + 2.6vw, 2.25rem)"
    fontWeight: 620
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  cook-ingredient:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  readout:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum' 1"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  entry:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 620
    lineHeight: 1.25
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 100"
  small:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.5
  label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 560
    letterSpacing: "0.04em"
    fontVariation: "'wdth' 88"
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', 'Cascadia Mono', Consolas, monospace"
    fontSize: "0.8125rem"
    lineHeight: 1.5
rounded:
  panel: "14px"
  tile: "12px"
  slot: "10px"
  rocker: "9px"
  pointer: "2px"
  pill: "999px"
spacing:
  gap-1: "4px"
  gap-2: "8px"
  gap-3: "12px"
  gap-4: "16px"
  gap-5: "24px"
  gap-6: "32px"
  gap-7: "48px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 24px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.slot}"
  power-button:
    backgroundColor: "{colors.green}"
    textColor: "{colors.on-green}"
    rounded: "{rounded.pill}"
    size: "58px"
  rocker:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.rocker}"
    height: "44px"
  rocker-on:
    backgroundColor: "{colors.slot-strong}"
    textColor: "{colors.ink}"
  chip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "36px"
  chip-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.body}"
  segmented-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.body}"
    rounded: "{rounded.pill}"
    height: "38px"
  slot-input:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slot}"
    padding: "0 12px 0 16px"
    height: "48px"
  field-input:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slot}"
    padding: "10px 12px"
    height: "44px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "16px"
  readout:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    padding: "3px 10px"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.body}"
    rounded: "{rounded.tile}"
    padding: "8px 8px 8px 16px"
    height: "52px"
  day-row:
    textColor: "{colors.ink}"
    typography: "{typography.entry}"
    height: "76px"
  day-row-selected:
    backgroundColor: "{colors.slot}"
  day-row-date:
    textColor: "{colors.ink}"
    typography: "{typography.day-number}"
    width: "52px"
  day-key:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slot}"
    padding: "6px 0 10px"
    height: "60px"
  day-key-selected:
    backgroundColor: "{colors.slot-strong}"
    textColor: "{colors.ink}"
  day-key-past:
    backgroundColor: "{colors.body}"
    textColor: "{colors.ink-2}"
  day-pointer:
    backgroundColor: "{colors.orange}"
    rounded: "{rounded.pointer}"
    width: "14px"
    height: "3px"
  plan-bar:
    backgroundColor: "{colors.body}"
    textColor: "{colors.ink}"
    padding: "8px 16px"
  shelf-tile:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.plate-small}"
    rounded: "{rounded.tile}"
    width: "148px"
  pick-row:
    textColor: "{colors.ink}"
    typography: "{typography.entry}"
    padding: "10px 0"
    height: "72px"
  entry-menu:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slot}"
    padding: "4px"
    width: "312px"
  slip:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "2px 16px 16px"
    width: "520px"
  slip-line:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "6px 0"
    height: "44px"
  slip-line-checked:
    textColor: "{colors.ink-2}"
  slip-line-home:
    textColor: "{colors.label}"
  route-rail:
    backgroundColor: "{colors.body}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "8px 16px"
  route-station-led:
    backgroundColor: "{colors.led-off}"
    rounded: "{rounded.pill}"
    size: "10px"
  route-station-led-done:
    backgroundColor: "{colors.led-green}"
  shop-day-row:
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    padding: "6px 0"
    height: "52px"
  shop-day-row-off:
    textColor: "{colors.label}"
  shop-day-window:
    backgroundColor: "{colors.slot}"
    size: "24px"
  home-button:
    textColor: "{colors.label}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "32px"
  home-button-pressed:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
  home-button-likely:
    textColor: "{colors.green-ink}"
  store-order-row:
    textColor: "{colors.ink}"
    height: "48px"
  cook-bar:
    backgroundColor: "{colors.body}"
    textColor: "{colors.ink-2}"
    typography: "{typography.small}"
    padding: "0 8px 0 4px"
    height: "60px"
  cook-servings:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  program-led:
    backgroundColor: "{colors.led-off}"
    rounded: "{rounded.pill}"
    size: "10px"
  program-led-done:
    backgroundColor: "{colors.led-green}"
  program-led-current:
    backgroundColor: "{colors.ink}"
  cook-step-number:
    textColor: "{colors.ink}"
    typography: "{typography.step-number}"
  cook-step-text:
    textColor: "{colors.ink}"
    typography: "{typography.step-text}"
    width: "30ch"
  cook-ingredient-row:
    textColor: "{colors.ink}"
    typography: "{typography.cook-ingredient}"
    padding: "6px 0"
  cook-uses-panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
  cook-nav:
    textColor: "{colors.label}"
    typography: "{typography.small}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "44px"
  avatar-dot:
    backgroundColor: "{colors.led-green}"
    rounded: "{rounded.pill}"
    size: "10px"
  link-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0 4px"
    height: "52px"
  led-window:
    backgroundColor: "{colors.slot}"
    size: "24px"
  key-row:
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    padding: "12px 0"
  secret-slot:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
    rounded: "{rounded.slot}"
    padding: "12px"
  snippet:
    backgroundColor: "{colors.slot}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.slot}"
    padding: "12px"
  activity-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "8px 0"
    height: "64px"
  agent-mark:
    textColor: "{colors.green-ink}"
    typography: "{typography.label}"
---

# Design System: Essensplan

## Overview

**Creative North Star: "Das Küchengerät"**

Essensplan is a quiet, precise kitchen appliance in the Braun/Rams line. A matte grey body carries a few controls, and each one is tactile and exactly labelled: a recessed search slot, rocker switches with an LED window, a servings dial with a printed scale, and one green power button that adds a recipe from anywhere. The tone is calm and utilitarian. The controls are where the fun lives.

The appliance comes from geometry, proportion and control behaviour. There is no faked material. Surfaces are flat tones separated by 1px hairline seams. Depth comes from tone: panels sit raised and slots sit recessed. Status is shown with LED dots. Times and amounts use tabular figures. One sober grotesk (Archivo, with variable width) does all the work, from large condensed titles down to small engraved device labels. The dark theme is the black version of the same appliance. It uses the same geometry with the tones inverted.

Content stays dense and calm. The phone gets quiet hairline rows. Wider screens get a grid in which photos show as photos, and a recipe without a photo gets a deliberate title plate instead of a placeholder. The week is the appliance's program panel: seven fixed day rows that fold into a row of seven day keys while planning. The shopping list is the slip the appliance prints: one narrow strip in the store's order, struck through line by line where it stands. Kochmodus runs a recipe as the appliance's program: one step on the display at a time, set large enough to read from across the counter. The system rejects the category default of photo-card grids, shadowed cards and a stock-blue accent.

**Key Characteristics:**
- Matte grey body, raised panels, recessed slots, hairline seams (1px).
- One signal green for "on" and the primary action. One orange for the single active or favourite marker.
- LED dots for status and the single "how loved" scale.
- One grotesk on the width axis: condensed display titles, small tracked device labels, tabular figures.
- Round, tactile controls with touch targets of at least 44px.
- Content changes in place: rows and lines never move. A day's entry flips like a split-flap, and a bought item is struck through where it stands.

## Colors

The palette is appliance grey with two signal colours. Green means on. Orange marks the one thing you are looking at.

### Primary
- **Signal Green** (`green`): the colour of "on" and of the primary action. It fills the power button, the primary button (in Kochmodus, which has no shell, "Zurück zum Rezept" on the end screen) and the base mark on the dial. In dark mode it becomes Dark Signal Green (`dark-green`).
- **Green Ink** (`green-ink`): green for text, such as text buttons, the base numeral on the dial, the brief highlight on a rescaled amount the "Mittag planen" hint on the first free day of the week, the "neu" mark on a freshly printed slip line, the "n neu" count on links to the activity log, the "vom Agenten geändert" mark, and the "meist da" state of a line's "haben wir" button. Use it instead of `green` on light grounds to reach AA contrast.
- **LED Green** (`led-green`): a lit LED. It is used in the rating ramp, on planned days (the week LED strip and the day-key LEDs), on finished import steps, on the info toast, on the "Woche steht." and "Alles im Wagen." panels, on the last-pick line, on route stations of finished sections, beside "alles im Wagen" and "neu" on the slip, in the day-list window of a day in this trip, on finished screens of the Kochmodus program row, on the wake LED while the screen is kept on, on the avatar dot while agent activity is unseen, beside "n neu" and "vom Agenten geändert", in the LED window of a key used in the last seven days, of an unseen activity row and of a just-copied secret, and in the wordmark dot.

### Secondary
- **Marker Orange** (`orange`): the single marker. It is used for the active nav dot, a rocker LED that is on, the dial pointer, the active import step, the today dot (6px, after the weekday in a day row), the pointer bar (14×3px: under the selected day key, under the date of the selected row, under the current station of the route rail, and under the current screen in the Kochmodus program row), the active-filter count and the focus ring.
- **Orange Ink** (`orange-ink`): orange for text. It is used for search-match hints in result rows and for the weekday of today on a day key.

### Neutral
- **Appliance Body** (`body`): the page ground, the sticky top bars, the pinned plan bar and route rail, the Kochmodus ground with its sticky head and footer, and day keys that are past.
- **Panel Grey** (`panel`): raised surfaces such as panels, the shopping slip, the bottom bar, the rail, buttons, chips, day keys, shelf tiles, menus and dialogs.
- **Slot Grey** (`slot`): recessed surfaces such as inputs, the search slot, the dial knob, the rocker LED window, readouts, the selected day row while planning, the pressed "haben wir" button ("da") on a slip line, the day-list LED window, the Kochmodus servings pill and wake window, LED windows, the secret slot and setup snippets on the API page, and the hover and press state on quiet controls.
- **Pressed Grey** (`slot-strong`): anything pressed in: the pressed half of a rocker that is on, the selected day key (fill and border), a day key under the finger, and the entry's own day in the entry menu's move row (disabled).
- **Seam** (`seam`): every hairline border and divider, solid or dashed, and the line between route stations.
- **Charcoal Ink** (`ink`), **Ink 2** (`ink-2`), **Label Grey** (`label`): primary text, secondary text, and device labels and placeholders.
- **LED Off** (`led-off`): unlit LEDs, inactive dial ticks and disabled icon steps.
- **Danger Ink** (`danger-ink`): destructive text and the borders of errors, including "Widerrufen" on a key, rights that can do harm (Rezepte löschen, KI-Import nutzen) wherever they are listed, and the "Achtung: …" warnings while a key is created.

### Named Rules
**The One Marker Rule.** Orange marks state only: what is active, selected, favoured or focused. It is never an action colour. No button, link or fill that triggers an action is orange.

**The Power Rule.** Green means "on" and the primary action. Each view has one green filled control. In the shell that control is the power ＋.

**The Ink Variant Rule.** Green and orange reach contrast as fills. When text needs either colour, use `green-ink` or `orange-ink`.

**The Pointer Rule.** The one current thing carries exactly one orange pointer: a 14×3px bar with 2px corners. It sits under the selected day (key or row) while planning, under the current station of the route rail, and under the current screen of the Kochmodus program row. When a program is finished, every LED is lit and the pointer disappears. Today is a different mark (an orange dot in rows, `orange-ink` weekday text on keys), so "current" and "today" never read as the same signal.

**The Multi-Select Rule.** When a control chooses several things at once (chips, the days of a shopping trip), "chosen" is shown by the pressed or lit state alone. Multi-select controls never carry the pointer, because there is no single current one.

## Typography

**Display Font:** Archivo Variable (with Archivo, system-ui, Segoe UI)
**Body Font:** Archivo Variable
**Label Font:** Archivo Variable, condensed on the width axis

**Character:** One sober grotesk set the way the lettering on an appliance is set. Display titles are heavy and slightly condensed. Labels are small, tracked and narrow, like engraving next to a control.

### Hierarchy
- **Display** (720, clamp(1.75rem → 2.75rem), 1.15, width 94 for page titles and 92 for recipe titles): page and recipe titles, including the week title ("Diese Woche", "Nächste Woche"). Kochmodus screen headings ("Zutaten", "Fertig. Guten Appetit!") use a tighter cut: clamp(1.75rem → 2.5rem), line-height 1.1, letter-spacing -0.02em, width 94.
- **Plate** (720, 1.875rem, 1.04, width 88, balanced, hyphenated, up to 4 lines): the title on a recipe tile that has no photo.
- **Plate small** (720, 1.1875rem, 1.04, letter-spacing -0.02em, width 88, balanced, up to 3 lines): the title plate on a suggestion-shelf tile without a photo.
- **Day number** (700, 1.5rem, 1, tabular): the day of the month in a week day row. On a day key the number is 1.125rem/700. The weekday above it is 0.875rem/650 in a row and 0.75rem/600 on a key, both in `ink-2`.
- **Step number** (760, 3rem, 1, letter-spacing -0.03em, tabular): the step number in Kochmodus, followed by a Label "von n".
- **Step text** (620, line-height 1.3, letter-spacing -0.01em, pretty wrapping, hyphenated): the step in Kochmodus, sized by its length so it stays readable at 50–80cm. Up to 150 characters: clamp(1.75rem → 2.25rem) at most 30ch; up to 260: clamp(1.5rem → 1.875rem) at most 34ch; longer: 1.375rem at line-height 1.38, at most 38ch. On a tablet the first two grow to clamp(2rem → 2.75rem) and clamp(1.75rem → 2.25rem).
- **Cook ingredient** (600, 1.25rem, 1.3): ingredient rows in Kochmodus; the amount is 750 in `ink`, the unit 600 in `ink-2`, a note 500 in `ink-2`. The full list beside a tablet step uses 1.0625rem.
- **Readout** (700, 2rem, 1, tabular): the servings number in the dial.
- **Title** (700, 1.125rem): panel titles, dialog titles, focus-bar titles, empty-state titles, suggestion-shelf titles, "Alle Rezepte" and "Woche steht.".
- **Entry** (620, 1.0625rem, 1.25, clamped to 2 lines): titles in list rows, pick rows, the main line of a day row and tiles.
- **Body** (400, 1rem, 1.5): running text. Descriptions stop at 62ch and steps at 68ch. A slip line's item name is 1rem/560 at line-height 1.3.
- **Small** (560–700, 0.875rem): metadata, controls and field labels. On the slip, the section name is 0.875rem/700 (letter-spacing 0.01em) and the amount column 0.875rem/650 in `ink-2`.
- **Label** (560, 0.75rem, letter-spacing 0.04em, width 88, `label` colour): device labels beside or above a control or value.
- **Mono** (system monospace stack): only for machine text the user copies or compares. The secret key is 0.9375rem/600, a key prefix 0.875rem in `ink-2`, and setup snippets 0.8125rem at line-height 1.5.

### Named Rules
**The Device Label Rule.** A device label names a control or a value: zeit, gekocht, zuletzt, bewertung, sortierung, kategorie, portionen, folgt, optional, heute, and the short slot names (früh, abend, snack) that lead secondary entry lines. A single-word device label is lowercase. Every other label, hint or sentence uses normal German orthography ("Link zum Rezept", "Ein Konto für die ganze Familie"). Never use uppercase or small caps.

**The Mono Rule.** Monospace appears only for an API key, its prefix and setup snippets. Everything a person reads stays in Archivo.

**The No Kicker Rule.** Never put a label above a heading. Headings stand alone. Labels belong to controls, fields, Steckbrief values and ingredient groups. A shelf's reason sits under its title, never above it.

**The Figure Rule.** Times, amounts, counts, day numbers, step numbers, section counts on the slip and the dial readout use tabular figures (`tnum`). Shopping amounts and Kochmodus amounts sit in a right-aligned 5.5em column. A time is a first-class figure, right-aligned and set at 650 weight.

## Layout

The design is mobile-first and changes at 760px and 1024px. On the spacing scale, `gap-4` (16px) is the main gutter, and `gap-5` and `gap-6` (24px, 32px) separate sections.

- **Phone and tablet portrait (<1024px):** a sticky top bar (56px) holds the wordmark and the account button. A fixed bottom bar (68px plus the safe area) holds Woche · Rezepte · power ＋ · Einkauf. The power disc sits 22px above the bar and is ringed with a 5px panel-coloured outline. Content has 16px side padding. The recipe list is **one row structure**: hairline rows at least 76px tall with the title and meta on the left, a 56px photo thumb only when a photo exists, and the time right-aligned. Rocker rows and suggestion shelves scroll horizontally from edge to edge.
- **760px and up:** the edit form moves its save button into the focus bar, and the sticky save bar stops being sticky.
- **1024px and up:** a fixed left rail (236px) replaces both bars. Content has 32px/48px padding and a 1320px maximum width. The recipe list becomes a 220px filter aside plus a grid of auto-fill columns at least 232px wide. The recipe view splits into a 340–420px column for ingredients and the dial next to the steps. When the recipe has a photo, the head becomes a two-column photo/title split.
- **Week (home):** always seven hairline day rows, each a 52px date column plus the entry body. The head holds the title with ‹ ›, an optional today line, then the range readout, the week LED strip and "Woche planen" (or "Fertig") pushed to the right.
- **Week planning, phone (<1024px):** the rows give way to the plan bar, pinned under the 56px top bar. It bleeds to the screen edges (−16px margins with 16px padding; 12px below 390px, where the key gap also tightens from 4px to 3px) on the `body` tone with a seam under it. The library follows with sections 24px apart: slot switch, preset chips, suggestion shelves, then search and the pick list.
- **Week, 1024px and up:** outside planning, the week body and its head stop at 760px. While planning, the body splits into a pinned week column (minmax(360px, 420px), sticky 32px from the top) and the library (minmax(0, 1fr)), 32px apart. In planning every row's date takes the same 12px inset, so selecting a row never moves its text. Shelves stop bleeding to the edge.
- **Einkauf, phone:** the controls stack first (days readout with "Tage ändern", the inline day list when open), then the route rail, pinned under the 56px top bar and bleeding to the screen edges on the `body` tone with a seam under it, then the slip. Sections scroll to sit below the pinned rail.
- **Einkauf, 1024px and up:** a centred grid of a 300px control column (sticky 32px from the top, the day list always open, "Mein Laden: Reihenfolge" as a text button) and the slip column (minmax(0, 520px)), 48px apart. The head shares the same centred width. The route rail pins to the top of the slip column without bleeding.
- **Logged out (login, code, password reset, `/koppeln`):** no shell at all. A 56px bar with only the wordmark (32px padding from 1024px), then one column of at most 400px on `body`, 32px from the top (10vh when the window is at least 760px wide and tall), sections 24px apart. The owner's sign-off "Coded with ❤️ in THE LÄND." sits as a centred Label at the foot.
- **Konto:** a single column of panels, 24px apart and at most 640px wide: Woche, Mein Laden, Geräte, Agenten, then Name und E-Mail. The subpages "API & Agenten" and "Aktivität" use the same column (up to 760px from 1024px). Each starts with a "Konto" back link (arrow icon and text) above the page title, then an intro of at most 62ch in `ink-2`.
- Focus tasks (capture, edit) replace the shell with a 60px focus bar and a centred column (capture 560px, edit 820px).
- **Kochmodus** is a focus surface with no shell at all: a full-height column on the `body` tone. A sticky head (the 60px cook bar with a seam under it, then the program LED row) sits on top. The stage takes the remaining height with 16px padding, and a sticky footer with a seam on top holds the two navigation buttons above the safe area. Below 560px the wake text is hidden in the bar, and a right-aligned Label line ("Bildschirm kann ausgehen") appears under it only when the screen may turn off.
- **Kochmodus, tablet landscape (900px and up in landscape) and 1024px and up:** the stage padding grows to 24px/48px/12px. A step splits into the step (3fr) and its ingredients (minmax(280px, 2fr)), 48px apart. The ingredient screen stops at 720px.

## Elevation & Depth

The system is flat and tonal. Panels (`panel`) are raised above the body by tone and a 1px seam. Slots (`slot`) are recessed below the body by a darker tone and have no border. Cards never carry a shadow. Only one shadow exists. It is used on floating menus that leave the page plane: the account menu, the overflow menus (including the Einkauf page menu), the entry menu on a planned day and the line menu on the slip. The dialog backdrop dims the page to 45% black.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 12px 32px -12px rgb(0 0 0 / 0.28)`): popover menus only (account, overflow, entry menu, slip line menu).

### Named Rules
**The Seam Not Shadow Rule.** Separate surfaces with a 1px `seam` hairline and a change of tone. A shadow is allowed only on something that actually floats above the page.

A solid ring in the ground colour around an LED (2px on the avatar dot, 4px on route stations) is a knock-out that separates the LED from the line or edge behind it. It is not a shadow.

## Shapes

Corners are generous but measured. Panels and recipe tiles use 14px. Suggestion-shelf tiles and the toast use 12px. Slots, inputs, rail items, day keys, the hover fill on day-row entries, and the overflow and entry menus use 10px. Rockers and photo thumbs (48px in day rows and pick rows) use 9px. Buttons, chips, segmented tracks, day buttons and the power button are pills or discs. The selected-day pointer is a 14×3px bar with 2px corners. LED windows are small recessed squares around a lit dot: 24px in the rocker, the Einkauf day list, key rows, activity rows and the secret slot (where the window drops to the `body` tone inside the slot), and 20px for the Kochmodus wake LED. Functional round parts are true circles: LEDs (6–14px), step numbers (28px), dial steppers (44px), the dial knob and the avatars. Borders are always 1px `seam`. A dashed seam marks something printed or provisional rather than built: the rule between slip sections, the top of the own-item area on the slip, and the LED window of a day that has already been shopped. Photos are clipped to their container radius and use `object-fit: cover`.

## Components

### Buttons
Pill-shaped and confident, with nothing ornamental.
- **Shape:** pill (999px). Minimum height 44px, horizontal padding 24px. The large version is 56px tall and set at 1.125rem.
- **Primary:** `green` fill and `on-green` text, weight 620. On hover it mixes 12% ink into the green.
- **Secondary:** `panel` fill with a 1px seam. On hover it changes to `slot`. When pressed it scales to 0.98. "Woche planen", "Fertig" and "Einkaufsliste ansehen" are secondary, so the power ＋ stays the one green control.
- **Quiet:** transparent with 16px padding. **Danger:** transparent, with `danger-ink` text and a 45% danger border.
- **Icon button:** a 44px transparent pill that becomes `slot` on hover. The small version is 36px.
- **Text button:** `green-ink` text, underlined at 35% of the text colour, with a 44px hit area.

### Power Button (signature)
The one green control. It is a 58px green disc with a white ＋ (26px, stroke 2.5). It lifts out of the bottom bar with a 5px panel ring and scales to 0.94 when pressed. Its focus state is a 3px orange ring. In the rail it becomes a full-width 52px green pill that holds a 36px translucent disc and the text "Rezept hinzufügen".

### Rocker Switch (signature)
Rockers are their own control family. They are not chips. A rocker has three parts in a 44px-tall body with a 9px radius and a seam border: an LED **window** (24px, `slot`), a **seam**, and the **label half**. When the rocker is on, the label half is pressed in (`slot-strong`), the text turns `ink`, and the LED lights orange. The rocker uses `role="switch"` and is used for binary filters such as Lieblinge, Schnell and Lange her.

### Chips
- **Style:** a 36px pill with a `panel` fill, a seam border and `ink-2` text at 0.875rem/560. Under a coarse pointer it grows to 44px.
- **State:** a pressed chip fills with `ink` and uses `body` text. Use chips for multi-select and sort choices such as sortierung, kategorie and merkmale. The ink fill is what separates them from rockers.
- **Action chips:** in planning, the preset chips (Reste, Essen gehen, Auswärts, Bestellen, recent own texts) and "Eigener Text" are one-tap actions with the same chip form. "Eigener Text" opens an inline slot with an "Eintragen" button, not a dialog.

### Segmented Switch
A pill track in `slot` with 3px padding. The 38px segments are transparent with `ink-2` text, and the selected segment fills with `ink` and uses `body` text. Use it for one-of-n choices such as meal slot, difficulty and theme. The Konto week settings (Wochenbeginn, Planungstag) use a seven-segment version, Mo to So, with the segment padding removed so that seven fit across.

### Inputs / Fields
- **Search slot:** a recessed 48px `slot` (58px for the large version) with a leading icon and no border. The text inside is at least 16px.
- **Field input:** `slot` fill, a transparent 1px border, a 10px radius, at least 44px tall and 10px/12px padding. The **quiet** version is a bare underline (seam bottom border, weight 650) for ingredient group names.
- **Focus:** a 2px `orange` outline. Slots use an offset of 2px and fields an offset of 1px.
- **Error:** a `danger-ink` border with a `danger-ink` message at 0.875rem/560.
- **Field label:** 0.875rem/650. A lowercase device label may follow it ("Zeit min", "Quelle optional").

### Cards / Containers
- **Panel:** `panel` fill, 1px seam, 14px radius, 16px padding, 16px internal gap, and a title at 1.125rem/700.
- **Recipe tile (≥1024px):** a panel with a 4:3 media area. A recipe with a photo shows the photo. A recipe without one gets a **title plate**: the same `panel` tone, a seam under it, and the title set in Plate type at the bottom left. On hover the border darkens to `label`.
- **Shadow strategy:** none (see Elevation & Depth).

### LED Ramp (signature)
The single "how loved" scale is five LEDs (8px, or 10px in the medium size, 3px apart) plus a tabular "n×" count of times cooked. It is identical everywhere. In the edit form, a clickable version uses 14px LEDs in 36×44px hit areas.

### Servings Dial (signature)
A 168px face with a 270° sweep from 1 to 12. Round ticks use `led-off` and turn `ink` up to the current value. A **printed scale** of 2·4·6·8·10·12 is set as 10px/650 numerals in `label`. The recipe's base servings carry a **green base mark**: a longer 4px green tick and a `green-ink` numeral. The recessed knob (`slot`, seam) holds an orange 4×14px pointer that turns with a 220ms ease-out, and a 2rem tabular readout with the lowercase unit "portion/portionen" under it. It has 44px round ± steppers on both sides. A "Zurück auf n" reset pill appears only when the value differs from the base. Arrow keys, Home and End are supported. On Android each detent vibrates for 4ms. Rescaled amounts flash `green-ink` and rise 2px over 700ms.

### Week Day Rows (signature)
Seven fixed hairline rows, each at least 76px tall, with a 52px date column and an entry body. The date column holds the short weekday (0.875rem/650, `ink-2`) over the day number (Day number type). The body has three kinds of line:
- **Main line:** the first entry of the main slot (lunch, or the slot being planned) in Entry type. It has a 48px photo thumb when the recipe has one, and the time right-aligned at 650. Free text is set at 560.
- **Side line:** further entries in the same slot, each led by a `label`-coloured "+", at 0.9375rem/560 in `ink-2` on one line, with a small time.
- **Other-slot lines:** entries from other slots, each led by the lowercase short slot name as a device label (früh, abend, snack), at the same small size and with no time.

Side and other-slot lines are 36px tall on a fine pointer and 44px under `pointer: coarse`. An empty main slot reads "frei" in `label`. Outside planning, only the first free day from today on adds a hint ("Mittag planen", or the slot being planned) in `green-ink` at 0.875rem/620, right-aligned. Today gets a 6px orange dot after the weekday. Past rows mute the number, titles and times to `ink-2` and photos to 72% opacity. In planning, the selected row fills with `slot` and carries the orange pointer under its date. On desktop, a row that is a drop target fills with `slot` and gets a 1px inset `label` outline. An entry created by an agent shows "vom Agenten geplant" with a lit LED until it has been seen, in `green-ink` at 0.75rem/620, the same voice as the agent mark on recipes. Tapping an entry opens the entry menu. Hovering an entry, or opening its menu, fills the line with `slot`. Loading shows seven skeleton rows, not a spinner.

### Day Keys (signature)
Seven keys sit across an equal grid with 4px gaps. Each key is a `panel` key with a seam and 10px corners, at least 60px tall. It shows the weekday (0.75rem/600, `ink-2`), the number (1.125rem/700) and a 7px LED. The LED is `led-off` and turns `led-green` over 260ms when the day's slot is filled. The selected key is pressed in (`slot-strong` fill and border) and carries the orange pointer bar 3px from its bottom. Today's weekday turns `orange-ink`. Past keys drop to the `body` tone with `ink-2` text. The keys form a radio group, and the arrow keys move the selection.

On Einkauf the days of a trip are chosen in a **day list**, not with keys (changed 2026-11-07 on the owner's feedback: the dishes must be visible next to the days). One hairline row per day from today on (two weeks) that has a recipe planned, as a group of checkboxes: a 24px `slot` LED window (lit `led-green` = in this trip, no pointer: The Multi-Select Rule), the date (weekday Label over the bold day number), then the planned dishes in Small `ink-2`, clamped to two lines. Days not in the trip turn date and dishes to `label`. A day a finished trip already covered shows a dashed window and the label "eingekauft". Rows are at least 52px tall.

### Plan Bar
The phone's planning block, pinned under the 56px top bar. It holds three things in order:
1. The day keys.
2. A readout of the selected day: a Label line ("Montag 16. · Mittagessen"), then either "Noch frei. Wähl unten ein Rezept oder eine Vorgabe." in `label` or the day's entries in Entry type, each with a ✕ that is 36px on a fine pointer and 44px under `pointer: coarse` (as are "Rückgängig" and the today line).
3. A last-pick line, shown after a pick has moved the pointer on: a lit LED, the short weekday and the title ("Mo: …"), and a "Rückgängig" text button.

### Pick and Advance
This is the planning interaction the week components serve. One tap on a preset chip, a shelf tile or a pick row fills the selected day and slot:
- **Empty day:** the pointer moves to the next free day from today on. It wraps around the week and skips past days.
- **Day that already has an entry:** the pick is added, and the pointer stays.

There is no confirmation, no sheet and no toast per pick. The flap and the lit LED are the feedback, and the last-pick line holds the undo. Moving and removing an entry do show a toast with "Rückgängig". When every day from today on is filled, a "Woche steht." panel (lit LED, Title type) offers "Einkaufsliste ansehen" as a secondary button.

### Flap (motion)
The Woche surface's signature moment. It runs on a newly picked entry's title, and on the plan-bar readout when the selected day changes. The element flips down into place over 320ms with the standard ease-out. It starts at `perspective(420px) rotateX(-72deg)` and 0.35 opacity, hinged at its top edge. It does not run on first paint. Under reduced motion it is instant.

### Slip Motion
- **Strike in place** (the Einkauf signature): ticking a line draws a 1.5px `currentColor` line across the item name, from 0 to full width over 180ms (ease-out), at 58% of the text height and across wrapped lines. The text turns `ink-2`, and the line stays where it is.
- **Feed:** a line printed since the last visit enters with a paper-feed: it unclips from the top (`clip-path: inset(0 0 100% 0)` to none) while settling 6px down, over 420ms.
- **Fold:** a section whose last line is done waits about 520ms, so the last strike can play, then its lines collapse to nothing under the rule (grid rows 1fr to 0fr, 340ms). Sections that are already finished when the page opens arrive folded, with no motion.

All of these are instant under reduced motion.

**The Split-Flap Rule.** Rows and lines never move, reorder or slide. Change happens in place: an entry flips, a bought line is struck through, a new line feeds in where it belongs, and a finished section folds under its own rule. Only the element that changed moves. Kochmodus is a pager, not a list: there the whole screen turns (see Kochmodus).

### Entry Menu
A floating `panel` menu with a seam, 10px corners, 4px padding and the Float shadow. It is up to 312px wide, and below 1024px it is the full width minus 32px. It contains:
- "Rezept öffnen", when the entry is a recipe.
- A move row under a Label line, then seven 44px day buttons with a seam, each showing the weekday over the number. The entry's own day is pressed in and disabled.
- "Aus dem Plan nehmen" in `danger-ink`.

Items are 44px tall. Escape or a tap outside closes the menu.

### Suggestion Shelf and Tile
A shelf is a heading in Title type with its reason as a Label line under it, followed by a horizontal rail. The rail snaps to the start of each tile and hides its scrollbar. On the phone it bleeds to the screen edges. A tile is a `panel` button with a seam and 12px corners, 148px wide (168px from 1024px), with a 4:3 media area. The media area shows the photo, or a title plate on the panel tone in Plate small type with a seam under it. Below the media area are the title (0.875rem/650, photo tiles only), the LED ramp and the time. Tiles on the "Lange nicht gegessen" shelf add a "zuletzt vor …" label. On hover the border darkens to `label`, and when pressed the tile scales to 0.97.

### Pick Rows
Hairline rows, each at least 72px tall, in a three-column grid: the title (Entry type, 2 lines) over the meta, an optional 48px thumb, and the time right-aligned at 650. The meta is a stack of:
- The LED ramp with the cooked count.
- "zuletzt vor …", or "noch nie gekocht".
- An `orange-ink` "mit Zutat" match during a search.
- "schon am Mo, Mi" in `ink` at 650 when the recipe is already planned in this week.

On hover the title is underlined in `seam`. When pressed the row fills with `slot`.

### Week Head Readouts
- **Week LED strip:** seven 8px LEDs, 4px apart, after the range readout. Each one lights `led-green` when that day's lunch is planned. The strip is labelled as one image ("n von 7 Mittagessen geplant").
- **Today line:** appears on home only when home shows a week other than the running one and today has a lunch planned. It holds the device label "heute", the lunch title (several titles joined with " + ") and a chevron, at 0.875rem/600 in `ink-2`. It links to the running week. On hover the title is underlined in `seam`.

### Shopping Slip (signature)
One narrow strip on the panel tone: a `panel` panel with a seam, 14px corners and 2px/16px/16px padding, at most 520px wide on desktop. It holds the sections in the store's order, then the own-item area. Loading shows a skeleton slip.
- **Section rule:** the section name (0.875rem/700), a dashed `seam` leader filling the space, and the count of open lines (0.875rem/650, `ink-2`, tabular). When every line is done, the count becomes "alles im Wagen" with a lit LED (0.75rem/600, `label`).
- **Fold:** a finished section's rule is a button inside its h2 with `aria-expanded`. It folds to that one line and opens again on a tap. While checking at home nothing folds.
- **Empty states:** "Noch keine Tage gewählt.", "Für diese Tage ist nichts geplant." or "Alles eingekauft." in 650 weight, each with a Small `ink-2` explanation and a link to the week. Own items can always be added.

### Slip Line
A line is a 44px-minimum checkbox button with a three-column grid: the amount in a right-aligned 5.5em tabular column, the item name, then flags. A ⋯ button (36px wide on a fine pointer, 44px under `pointer: coarse`, `label` colour) sits at the end. Pressing the line fills it with `slot`.
- **Checked:** struck through in place (see Slip Motion). The amount turns `label`.
- **At home ("da"):** the name and amount turn `label`, the "haben wir" button reads "da" (see Zuhause prüfen), and the line can't be ticked until "da" is released.
- **Flags:** "neu" in `green-ink` with a lit LED for lines printed since the last visit; "eigen" (Label type) for own items, or "Agent" when an agent put the item on the list. The "haben wir" state lives on its own button (see Zuhause prüfen).
- **Line menu:** the ⋯ opens an entry-menu-style popover (up to 340px, Float shadow) with the label "Abschnitt ändern", the twelve sections as chips (the current one pressed) and, for own items, "Von der Liste streichen" in `danger-ink`. It opens upwards when there is no room above the bottom bar.

### Route Rail
One station per section that has lines, in the store's order, pinned under the top bar on the `body` tone with a seam under it. Each station is a 44px link: a 10px LED over the short section name (Obst, Brot, Kühlung, Fleisch, TK, Trocken, Konserven, Gewürze, Süßes, Getränke, Drogerie, Sonstiges) at 0.75rem/600 in `ink-2`, joined to its neighbours by a 1px `seam` line. A finished section's LED lights `led-green` over 260ms. The first section with open lines is current: its name turns `ink` and it carries the orange pointer, and the rail scrolls to keep it centred. When the rail overflows, its right edge fades out over 28px as a scroll cue. Tapping a station scrolls to its section.

### Zuhause prüfen
There is no mode switch (changed 2026-11-07 on the owner's feedback: "haben wir" must always be at hand). Every open line carries a quiet **"haben wir"** text button between the item and the ⋯: Label size, `label` colour, no border, 32px tall (44px hit area under `pointer: coarse`), `slot` on hover. Pressed, it reads **"da"** on a `slot` fill in `ink`, the line mutes to `label` and leaves the open count, and the tick tap is disabled until "da" is released. A line marked "da" at least twice before reads **"meist da"** in `green-ink`, so one tap confirms it. Ticked lines hide the button.

### Own Items
At the end of the slip, under a dashed seam: a search-style slot with a leading ＋ ("Artikel, z. B. Milch", up to 60 characters). With text, a secondary "Auf die Liste" button appears. Without text, up to five recent own items appear as chips that add with one tap.

### Finishing a Trip
When every line is done, an "Alles im Wagen." panel (lit LED, Title type) follows the slip with a secondary "Einkauf abschließen" button. The same action sits in the page's overflow menu. Finishing shows a toast ("Einkauf abgeschlossen: n Tage erledigt.") with "Rückgängig". There is no confirmation dialog.

### Store Order
"Mein Laden" in Konto is a panel with a hint and an ordered list of the twelve sections: 48px hairline rows with the position number (2ch, `label`, tabular), the section name at 600, and small ↑ and ↓ icon buttons (36px, 44px under `pointer: coarse`). The ends disable the button that would move out of range.

### Sections
The twelve default sections, in default order: Obst & Gemüse · Brot & Backwaren · Kühlung · Fleisch & Fisch · Tiefkühl · Trockenware · Konserven & Saucen · Gewürze & Öl · Süßes & Snacks · Getränke · Drogerie & Haushalt · Sonstiges. Full names appear on the slip and in menus. Short names appear on the route rail.

### Kochmodus (signature)
The recipe as an appliance program: screen 0 is "Zutaten", then one screen per step, then "Fertig. Guten Appetit!". The step and the servings live in the URL (`?schritt=`, `?portionen=`), so a reload or a locked screen never loses the place.
- **Cook bar:** a 60px bar on `body` with a seam under it. It holds a 44px ✕ icon button (back to the recipe), the recipe title (0.875rem/650, `ink-2`, one line) and the servings control: a `slot` pill holding − and + icon buttons around "6 Port." (the number at 700, tabular, with a Label unit), from 1 to 12. Last comes the wake LED: an 8px LED in a 20px `slot` window, `led-green` while the screen is kept on, with "Bildschirm bleibt an" or "Bildschirm kann ausgehen" as Label text beside it (hidden below 560px).
- **Program LEDs:** one 10px LED per screen, 10px apart, centred under the bar. Finished screens are `led-green`, the current one is `ink` with the orange pointer 15px below its top, and the rest are `led-off`, changing over 260ms. On the end screen every LED is lit and there is no pointer: the program is done.
- **Step screen:** the step number (Step number type) with a Label "von n", then the step text (Step text type), 24px above the step's ingredients. These sit in a **"Für diesen Schritt"** panel (12px/16px padding, a 0.875rem/700 `ink-2` title) of Cook ingredient rows. On the phone, "Alle Zutaten" follows as a disclosure styled like a text button. On a tablet the full list sits under the panel instead, behind a seam, with this step's rows at 720.
- **Ingredient rows:** a 5.5em right-aligned tabular amount column and the name, baseline-aligned, 6px vertical padding, grouped by component under Label headings. The ingredients screen adds a Label "für n Portionen" under its heading.
- **End screen:** the heading, then the green primary "Zurück zum Rezept" at the large size and a "Nochmal von vorn" text button, vertically centred.
- **States:** a skeleton while loading; "Dieses Rezept gibt es nicht (mehr)." with a way back; a recipe without steps shows the ingredients with a note.

### Kochmodus Navigation
- **Tap zones:** the stage is covered by two invisible buttons: the right two thirds go on, the left third goes back. On screen 0 the forward zone covers the full width. The zones are not focusable and are hidden from assistive technology. The content's real controls (the disclosure, the end-screen actions) sit above them.
- **Footer buttons:** the real navigation for keyboards and screen readers. These are 44px quiet pills in `label` at 0.875rem/650, each with an 18px chevron icon on its outer side ("zurück", "weiter", and "Los geht’s" on screen 0), turning `slot` and `ink` on hover.
- **Also:** a horizontal swipe of more than 60px (and 1.5 times the vertical movement) turns the page, and swallows the click that follows. → / PageDown / Space / Enter go on, ← / PageUp go back, Escape leaves. A 350ms guard ignores a second turn, so a double tap never skips a step.
- **Slide (motion):** the new screen slides in 24px from the side it comes from, starting at 0.4 opacity, over 220ms with the standard ease-out, while the program LED moves on. It is instant under reduced motion.

### Agent Activity Marks
- **Avatar dot:** while agents did something you have not seen, the account avatar carries a 10px `led-green` dot at its top-right corner, ringed 2px in `body`. The account menu's "Aktivität" link adds "n neu" (Label size, 600, `green-ink`, with a lit LED). Leaving the activity page counts as seen.
- **Agent mark:** a lit LED plus "vom Agenten geändert" (Label size, 620, `green-ink`), on recipe rows an agent changed. On the recipe page it is followed by a link "Was hat sich geändert?" to the activity log.

### Link Rows
Hairline rows at least 52px tall that lead to a subpage: the text at 620, optional state on the right (a Label such as "1 Schlüssel aktiv", or "n neu" in `green-ink` at 0.875rem/620 with a lit LED), then an 18px chevron. On hover the text is underlined in `seam`. They are used in the Konto "Agenten" panel and at the top of the API page.

### LED Window
The rocker's recessed 24px window, used on its own: an 8px LED centred in a `slot` square. It leads key rows (lit when the key was used in the last seven days), activity rows (lit while unseen) and the secret slot (lit after copying, on the `body` tone because the slot itself is `slot`).

### Key Rows
Hairline rows with 12px vertical padding in a three-column grid: LED window, body, action.
- **Body:** the name at 650 and the prefix in Mono with "…". Then one line per right group: the group as a Label, followed by its rights in `ink` at 0.875rem/560, joined with " · ", with rights that can do harm in `danger-ink`. Last, a Label-size meta line in `label`: "zuletzt benutzt vor …" or "noch nie benutzt", then "gültig bis …".
- **Action:** "Widerrufen" as a danger text button at 0.875rem. Revoking shows a toast with "Rückgängig"; there is no dialog.
- **Inactive keys** fold into a disclosure "Widerrufen oder abgelaufen (n)" (44px, 0.875rem/620, `ink-2`). Their names turn `ink-2`, they have no action, and the meta line says when they were revoked or expired.

### Creating a Key
A "Neuer Schlüssel" secondary button opens a panel inline (24px internal gap):
- A Name field with the device label "wofür, wo".
- **Rechte:** one row per group, with the group name (0.875rem/650) in a 6.5em column and its rights as chips. Choosing a write right also chooses that group's "lesen"; dropping "lesen" drops the group's other rights. Each harmful right adds an "Achtung: Dieser Schlüssel …" line in `danger-ink` at 0.875rem/600.
- **Gültig:** a segmented switch (30 Tage · 1 Jahr · unbegrenzt).
- **Actions:** a secondary "Schlüssel erstellen" button, disabled until at least one right is chosen (a Label says so), and an "Abbrechen" text button.

### Shown Once
After creation the panel becomes "„Name“ ist bereit", with focus on the title.
- **Secret slot:** a recessed `slot` (10px corners, 12px padding) holding an LED window, the key in Mono (selectable as a whole, wrapping anywhere) and a secondary "Kopieren" button that reads "Kopiert" for a moment while the LED lights. Under it, "Nur jetzt sichtbar. …" at 0.875rem/600 in `ink-2`.
- **Setup:** behind a seam, the Label "Einrichten für" and one chip per client (Claude Code, Claude Desktop, Andere MCP-Clients, REST), exactly one pressed. Then a one-line hint, the setup snippet in a recessed `slot` block in Mono, and a quiet copy button with a copy icon whose label names what it copies ("Befehl kopieren", "Konfiguration kopieren", "Angaben kopieren").
- **Honest note:** a Small `ink-2` line says which clients cannot connect yet (OAuth).
- **Copy failure:** if the clipboard is unavailable, the text is selected instead and an error toast explains how to copy it.
- **Done:** a secondary "Fertig".

### Activity Log
Day groups ("Heute", "Gestern", "Montag, 9. November") with a 0.875rem/700 `ink-2` heading over a hairline list. When more than one key has activity, filter chips sit above it ("Alle", then one per key). Each row is at least 64px tall, in the same three-column grid as key rows:
- **LED window:** lit while the entry is unseen.
- **Sentence:** the key name at 680, then the summary, at line-height 1.35.
- **Meta:** the tabular time · a link to the changed thing, at 0.875rem in `ink-2`.
- **Right side:** a "Rückgängig" text button at 0.875rem. When the entry has been undone, a Label "rückgängig gemacht" appears instead and the sentence turns `label`. When undo is blocked, a Label gives the reason, right-aligned, at most 11em wide.

The empty state is "Noch keine Agenten-Aktivität." with an explanation.

### Standby (signature)
Logged out, the app is the appliance on standby: the wordmark's LED is `led-off`. On a successful login (password, code, QR or new password) it switches on with a short double flick (`led-off` → `led-green` → off → on over 520ms, linear), and the app opens about 560ms later. Under reduced motion the LED is simply lit and the app opens at once. This is the only motion on the logged-out screens apart from the flap when the login panel swaps to code mode.
- **Login panel:** E-Mail, Passwort with "Passwort vergessen?" as a Small text button right of the label (its 44px hit area overlaps the label row), the rocker "Angemeldet bleiben" (on by default, with an `ink-2` hint when off), the error line, and a large green "Anmelden" across the full width. While a request runs the button keeps its size and reads "Anmelden…".
- **Code slot:** the 6-digit code goes into one recessed field, 64px tall, in 2rem/700 tabular figures with 0.16em tracking, shown as "482 913". The placeholder "6 Ziffern" is set at 1.125rem/560 without tracking. It submits by itself at six digits.
- **Status line:** under a page title, an unlit LED window and a Small line at 600 in `ink-2` ("Du bist abgemeldet.", "Melde dich wieder an. Danach geht es dort weiter, wo du warst."). It is never a kicker above the title.
- **Waiting primary:** a green button that cannot act yet (`aria-disabled`, still focusable) mixes 62% green into `panel`.

### Devices and Pairing
- **Device rows** use the key-row grammar: an LED window (lit when active in the last seven days), the device label ("iPhone · Safari") at 650 with a recessed "Dieses Gerät" pill (`slot`, Label size, 620, `ink-2`), and a Label meta line "jetzt aktiv" / "zuletzt aktiv vor …" · "seit …" · "bis Browser zu". "Abmelden" is a danger text button with no dialog and no undo. A device that just joined flips into the list.
- **Pairing panel** (inside the Geräte panel, behind no extra card): a 168px QR code beside the code. The QR is always `qr-ink` on `qr-paper` with 10px corners, in both themes, so every camera reads it. The code sits in a recessed slot (`slot`) with an LED window on the `body` tone and 2rem/700 tabular digits. While waiting, that LED blinks slowly (1200ms), like the pairing button on a device; under reduced motion it stays lit. A Label counts down ("noch 9:41"). Expired: the QR fades to 18%, the digits turn `label`, and "Neuer Code" appears. Connected: a recessed line with a lit LED, "Verbunden: Android · Chrome".

### Navigation
- **Bottom bar:** a `panel` bar with a seam on top and four equal columns of a 22px icon over a 0.75rem/560 label. The active item turns `ink` and gets a 6px orange dot above it.
- **Rail:** 44px items with a 10px radius in `ink-2`. Hover and active fill with `slot`, and the active item also gets a 6px orange dot at its far right. The rail footer holds the `/` shortcut hint and the account menu.
- **Wordmark:** "essensplan" in lowercase at 1.125rem/720, width 92, followed by a 6px `led-green` dot.

### Toast
An `ink` bar with `body` text, a 12px radius and a minimum height of 52px. It starts with an 8px LED and can end with an underlined "Rückgängig" action. It sits above the bottom bar and slides up 8px over 260ms.

## Do's and Don'ts

### Do:
- **Do** separate surfaces with 1px `seam` hairlines and tone. Panels are raised and slots are recessed.
- **Do** keep every interactive target at least 44px (`tap`). Controls that are smaller on fine pointers grow to 44px under `pointer: coarse`.
- **Do** give a recipe without a photo a deliberate title plate on the panel tone, set in Plate type (Plate small on shelf tiles).
- **Do** use the LED ramp as the only rating and "how loved" display, and use the same ramp everywhere.
- **Do** set times, amounts and counts in tabular figures, with times right-aligned.
- **Do** use lowercase only for single-word device labels, and normal German orthography everywhere else.
- **Do** honour `prefers-reduced-motion`. Every transition and animation drops to 0ms.
- **Do** keep the week as seven fixed rows or seven keys. Show a change by flipping the content in place, never by moving rows.
- **Do** mark the one current thing (the selected day, the current route station) with the orange pointer bar, and today with the orange dot or the `orange-ink` weekday.
- **Do** show a multi-select choice by pressing the key alone, without the pointer.
- **Do** strike a bought line through where it stands, and fold a finished section under its own rule.
- **Do** set Kochmodus for reading at 50–80cm: step numbers at 3rem, step text never below 1.375rem, ingredient rows at 1.25rem.
- **Do** keep real, focusable navigation buttons wherever a whole-screen tap zone moves the content.
- **Do** light an LED for what an agent did that you have not seen yet (avatar dot, "n neu", activity rows), and offer "Rückgängig" in the log instead of asking for confirmation up front.
- **Do** list rights that can do harm in `danger-ink`, wherever they appear.

### Don't:
- **Don't** put kicker or eyebrow labels above headings.
- **Don't** use orange for an action. It marks the single active, favourite or focused thing.
- **Don't** draw rockers as ink-filled pills. A rocker is LED window, seam and pressed label half. Ink fill belongs to chips and segments.
- **Don't** put shadows on cards or panels. The Float shadow is only for popover menus.
- **Don't** fake material: no bevels, textures, embossing, or decorative or placeholder gradients on surfaces.
- **Don't** use the old stock blue, or any accent other than green and orange.
- **Don't** use a gradient or icon placeholder in place of a missing photo.
- **Don't** confirm a pick with a toast, sheet or dialog. The flap, the LED and the last-pick line are the feedback.
- **Don't** animate position. Rows and lines never move, reorder or slide; motion only flips, strikes, feeds or folds content in place. The one exception is a whole Kochmodus screen, which turns with a 24px slide.
- **Don't** set anything a person reads in monospace. Mono is for the key, its prefix and setup snippets only.
- **Don't** fake paper on the slip: no texture, torn edges or receipt font. It is the panel tone with dashed seams.
