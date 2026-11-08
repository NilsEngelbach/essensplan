---
version: 1
slug: "frontend-src-features-einkauf"
primary_target: "frontend/src/features/einkauf"
related_targets: ["frontend/src/features/einkauf/ShoppingPage.tsx"]
---

# Surface brief: Einkaufsliste (choose days, check at home, shop)

Status: confirmed 2026-11-07 (`/impeccable shape einkaufsliste`). The structure was chosen in the surface round (seed 7696813a): **"Kassenzettel"**, the dealt lead, picked over "Tagleiste + Liste" and "Gang für Gang". The world is "Das Küchengerät" (DESIGN.md). Build path: code-led.

## 1. Job and audience
- **Who:** the planner on the phone, on Friday or Saturday right after planning: first at home, then in the store.
- **The family:** sometimes shops with it, using the same login.
- **Mode:** Operate.

## 2. Outcome and proof
- The list is ready the moment the week is planned.
- At home, whatever is already in the house drops out in a few taps.
- In the store, one tap per item, in **your** store's order.
- **Success:** nothing is forgotten and nothing already at home is bought.

## 3. Selected direction: Kassenzettel
- **Header:** "Einkauf", plus a days readout ("Fr 13.–Mi 18. · 6 Tage") with "Tage ändern".
- **Tage ändern:** opens a day list inline (changed 2026-11-07 on owner feedback: show the dishes): one row per day from today (two weeks) with a recipe planned, an LED window (green = in this trip), the date and the planned dishes. Shopped days read "eingekauft".
  - LED green means something is planned that day; pressed means the day is in this trip; muted ("eingekauft") means a finished trip covered it.
  - **Pre-ticked:** the planned days from today on that haven't been shopped for yet.
- **Route rail:** one LED station per section that has items, in store order. Finished sections light green; the section you're in carries the orange pointer.
- **The slip:** one narrow strip on the panel tone.
  - Each section starts with a dashed rule and its count ("Obst & Gemüse ··· 4").
  - **Lines:** amount (a tabular column) | item.
  - **Totals:** the same ingredient is added up across recipes (g/kg and ml/l converted). Mixed units print as "200 g + 2 EL".
  - **Ticking:** a tap strikes the line through, and it **stays where it is**.
  - **A finished section** folds to one line ("Obst & Gemüse · alles im Wagen") that you can open again.
- **Own items:**
  - **Adding:** a "＋ Artikel" slot at the end of the slip, with your recent items as suggestions. Each item lands in its section automatically.
  - **Changing the section:** "Abschnitt ändern" is remembered for that item name.
  - **Keeping:** own items stay until they're bought.
- **"haben wir" on every line** (changed 2026-11-07 on owner feedback: always available, no mode switch): a quiet text button next to each open line marks it "da" (muted, off the count); items marked "da" at least twice read "meist da" in green, so one tap confirms.
- **Live list:**
  - When the plan changes, new lines print into their section with a short paper-feed motion and a "neu" mark until seen.
  - Lines from a removed dish drop out. Ticks and "da" stay.
- **Finishing:** when everything is ticked, "Alles im Wagen." appears with "Einkauf abschließen". That marks the trip's days "eingekauft", so the next list pre-ticks only the rest.
- **Section order:** "Mein Laden" in Konto (and in the list's menu), reordered with ↑↓.
  - Default order: Obst & Gemüse · Brot & Backwaren · Kühlung · Fleisch & Fisch · Tiefkühl · Trockenware · Konserven & Saucen · Gewürze & Öl · Süßes & Snacks · Getränke · Drogerie & Haushalt · Sonstiges.
- **Desktop:** the slip in the centre (about 520px), with the days and section order in a side column.

## 4. Scope and boundaries
- **In scope:** the Einkauf screen, "haben wir" per line, own items, section order (Konto) and finishing a trip.
- **Linked:** "Einkaufsliste ansehen" from the week.
- **Anti-goals:**
  - a list grouped by recipe;
  - reordering lines while you tick;
  - modal confirms;
  - several stores (one store);
  - offline mode;
  - showing which recipe needs an item (not chosen).

## 5. States and ranges
- **Typical size:** 25–45 lines across 8–10 sections.
- **Nothing planned for the chosen days:** "Für diese Tage ist nichts geplant", with own items still possible.
- **Loading:** a skeleton slip.
- **Errors:** shown inline plus a toast.
- **Free-text plan entries** never go on the list.

## 6. Backend consequences (→ docs/BACKEND.md)
- **`shopping_trips`:** id, user_id, days JSON, created_at, completed_at NULL.
- **`shopping_item_state`:** trip_id, name_key, checked_at NULL, at_home BOOL, seen_at NULL.
- **`shopping_manual_items`:** id, user_id, name, section, created_at, bought_at NULL.
- **Plan-derived lines** are computed live from the trip's days and never stored. Aggregation runs on the ingredient's base name (the part before a comma), with unit families g/kg and ml/l.
- **`ingredients.section`:** set when a recipe is saved, from a word list with AI as the fallback.
- **Section overrides and order:** `section_overrides` (user_id, name_key → section) and `users.section_order` as JSON.
- **"Meist da":** a per-name_key count of "da" marks.
- **REST:**
  - `GET /shopping/current`
  - `POST /shopping/trips {days}`
  - `PATCH /shopping/items/{key}`
  - `POST /shopping/manual-items`
  - `POST /shopping/trips/{id}/complete`
  - `GET/PUT /shopping/section-order`
- **MCP:** `get_grocery_list`, `add_grocery_item`.

## 7. Constraints and open decisions
- The phone comes first; rows are ≥44px.
- German "du" voice; light and dark themes; no offline mode.
- Finishing a trip is an explicit step.
- "Meist da" learns from your "da" marks; there is no separate pantry list.

## Direction contract

THESIS: The appliance prints the family's shopping slip. One narrow strip lists the sections in the store's own order, and every line is struck through in place. It refuses the recipe-grouped list, the reordering checklist and the shopping-app card stack.

OWN-WORLD: "Das Küchengerät" (DESIGN.md), inherited unchanged:
- The slip is the panel tone on the matte body.
- Dashed hairline rules between sections.
- Tabular amounts.
- Green LEDs mark the stations of finished sections.
- Orange only for the current-section pointer and the selected state.
- No faked paper texture.

STORY:
1. Right after "Woche steht." the planner opens Einkauf. The days are pre-ticked.
2. **At home:** tap "haben wir" on salt, oil and flour (they read "meist da").
3. **In the store:** the route rail shows the sections ahead. Tap lines in Obst & Gemüse until the section folds to "alles im Wagen" and its station lights.
4. **At the checkout:** "Alles im Wagen.", then "Einkauf abschließen".

FIRST VIEWPORT:
- **Phone (390):**
  - Title "Einkauf" with an overflow menu.
  - Days readout with "Tage ändern" (day list with dishes).
  - The route rail (station LEDs).
  - The slip: the first section rule, then lines (amount column | item) of at least 44px.
  - Bottom bar.
- **Desktop:** the slip centred at about 520px, with a side column for the days keys and "Mein Laden".
- **Signature interaction:** strike in place. A tap draws the strike line across the item (180ms), and the line stays where it is. A finished section folds to one line and its station lights.
- **Second motion:** a plan change feeds new lines into the slip.

FORM: structure "Kassenzettel", the dealt lead in surface round 7696813a.
- **Raise from the transit diagram:** the route rail of section stations.
- **Raise from the split-flap board:** new lines print into place with a "neu" mark until seen.

FINISH: unreviewed and undocumented means unfinished. This build ends with the finish review, the verdict and the DESIGN.md update.
