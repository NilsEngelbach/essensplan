// Prototype data layer. Same function surface the real client will expose
// against /api/v1; here backed by demo data persisted in localStorage.
import { demoImport, demoPlan, demoRecipes } from './demo-data'
import { addDays, daysBetween, todayIso, weekdayIndex, weekdayShort, weekStartOf } from './format'
import { aggregate, classify, nameKey, SECTIONS } from './shopping'
import {
  PRESETS,
  type ManualItem,
  type PlanEntry,
  type Recipe,
  type RecipeDraft,
  type RecipeHit,
  type RecipeQuery,
  type Settings,
  type Shelf,
  type ShoppingLine,
  type ShoppingList,
  type SlotKey,
  type Trip,
  type Activity,
  type ApiClient,
  type ApiKey,
  type Scope,
} from './types'

// v3: adds API keys and agent activity (v2: plan entries became recipe-or-text, D15).
const STORE_KEY = 'essensplan.prototype.v3'

export const DEFAULT_SETTINGS: Settings = { weekStart: 1, planningWeekday: 5 }

interface Store {
  recipes: Recipe[]
  plan: PlanEntry[]
  settings: Settings
  trips: Trip[]
  manual: ManualItem[]
  sectionOrder: string[]
  sectionOverrides: Record<string, string> // name key → section, set by "Abschnitt ändern"
  homeCounts: Record<string, number> // how often a name was marked "da"
  apiKeys: ApiKey[]
  activity: Activity[]
}

const AGENT_DEFAULTS = () => ({ apiKeys: [] as ApiKey[], activity: [] as Activity[] })

const SHOPPING_DEFAULTS = () => ({
  trips: [] as Trip[],
  manual: [{ id: 'demo-kaffee', name: 'Kaffee', section: 'Getränke', createdAt: new Date().toISOString() }] as ManualItem[],
  sectionOrder: [...SECTIONS] as string[],
  sectionOverrides: {} as Record<string, string>,
  // Staples this family usually has at home: they come pre-flagged "meist da".
  homeCounts: { salz: 3, olivenöl: 3, mehl: 2, zucker: 2 } as Record<string, number>,
})

function fresh(): Store {
  const recipes = demoRecipes()
  const plan = demoPlan(DEFAULT_SETTINGS.weekStart)
  const shopping = SHOPPING_DEFAULTS()
  return { recipes, plan, settings: { ...DEFAULT_SETTINGS }, ...shopping, ...demoAgents(recipes, plan, shopping.manual) }
}

/**
 * One connected agent and what it did, so the log, the marks and the avatar
 * dot have something real to show. The recipe change is applied here too.
 */
function demoAgents(recipes: Recipe[], plan: PlanEntry[], manual: ManualItem[]): { apiKeys: ApiKey[]; activity: Activity[] } {
  const now = Date.now()
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString()
  const key: ApiKey = {
    id: 'demo-key',
    name: 'Claude Code Laptop',
    prefix: 'esp_k7Qm2xVa',
    scopes: ['recipes:read', 'recipes:write', 'mealplan:read', 'mealplan:write', 'shopping:read', 'shopping:write'],
    client: 'claude-code',
    createdAt: ago(24 * 12),
    lastUsedAt: ago(2),
    expiresAt: null,
    revokedAt: null,
  }
  const activity: Activity[] = []
  const agentEntry = plan.find((e) => e.createdVia === 'mcp')
  const gnocchi = recipes.find((r) => r.id === agentEntry?.recipeId)
  if (agentEntry && gnocchi) {
    activity.push({
      id: 'demo-act-plan', keyId: key.id, keyName: key.name, at: ago(2),
      summary: `hat ${weekdayShort(agentEntry.date)} ${Number(agentEntry.date.slice(8))}. Mittag: ${gnocchi.title} geplant`,
      target: { type: 'plan', id: agentEntry.id, href: '/', label: 'Wochenplan' },
      undo: { kind: 'plan.remove', entryId: agentEntry.id }, undoneAt: null, seenAt: null,
    })
  }
  const paper: ManualItem = { id: 'demo-backpapier', name: 'Backpapier', section: 'Drogerie & Haushalt', createdAt: ago(2), createdVia: 'mcp' }
  manual.push(paper)
  activity.push({
    id: 'demo-act-shop', keyId: key.id, keyName: key.name, at: ago(2),
    summary: 'hat „Backpapier“ auf die Einkaufsliste gesetzt',
    target: { type: 'shopping', id: paper.id, href: '/einkauf', label: 'Einkauf' },
    undo: { kind: 'shopping.remove', itemId: paper.id }, undoneAt: null, seenAt: null,
  })
  const idx = recipes.findIndex((r) => r.id === 'linsensuppe')
  if (idx !== -1) {
    const before = recipes[idx]
    const after: Recipe = { ...before, tags: [...before.tags, 'Gesund'], updatedAt: ago(3) }
    recipes[idx] = after
    activity.push({
      id: 'demo-act-recipe', keyId: key.id, keyName: key.name, at: ago(3),
      summary: `hat bei „${before.title}“ das Merkmal Gesund ergänzt`,
      target: { type: 'recipe', id: before.id, href: `/rezepte/${before.id}`, label: before.title },
      undo: { kind: 'recipe.restore', before, afterUpdatedAt: after.updatedAt }, undoneAt: null, seenAt: null,
    })
  }
  activity.push({
    id: 'demo-act-old', keyId: key.id, keyName: key.name, at: ago(24 * 3 + 5),
    summary: 'hat „Kaffee“ auf die Einkaufsliste gesetzt',
    target: { type: 'shopping', id: 'demo-kaffee', href: '/einkauf', label: 'Einkauf' },
    undo: { kind: 'shopping.remove', itemId: 'demo-kaffee' }, undoneAt: null, seenAt: ago(24 * 3),
  })
  return { apiKeys: [key], activity }
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Partial<Store>
      if (s.recipes && s.plan) return { ...SHOPPING_DEFAULTS(), ...AGENT_DEFAULTS(), ...s, recipes: s.recipes, plan: s.plan, settings: { ...DEFAULT_SETTINGS, ...s.settings } }
    }
  } catch {
    // storage unavailable or corrupt: fall back to fresh demo data
  }
  return fresh()
}

let store = load()
const listeners = new Set<() => void>()

function commit() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    // ignore: prototype keeps working in memory
  }
  listeners.forEach((l) => l())
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function resetDemo() {
  store = fresh()
  commit()
}

const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const uid = () => Math.random().toString(36).slice(2, 10)

const NOT_COOKED_DAYS = 42

function norm(s: string) {
  return s.toLocaleLowerCase('de-DE').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** "How loved": rating first, times cooked as tie-breaker. One scale everywhere. */
export function lovedScore(r: Recipe): number {
  return (r.rating ?? 0) * 100 + Math.min(r.cookingStats.timesCooked, 99)
}

export async function listRecipes(query: RecipeQuery = {}): Promise<RecipeHit[]> {
  await delay(60)
  const today = todayIso()
  const q = norm(query.q?.trim() ?? '')
  const hits: RecipeHit[] = []
  for (const r of store.recipes) {
    let matchedIngredient: string | null = null
    if (q) {
      const inTitle = norm(r.title).includes(q)
      if (!inTitle) {
        const ing = r.ingredients.find((i) => norm(i.name).includes(q))
        if (!ing) continue
        matchedIngredient = ing.name
      }
    }
    if (query.favourites && (r.rating ?? 0) < 4) continue
    if (query.quick && (r.cookingTime ?? 999) > 30) continue
    if (query.notCookedSince) {
      const last = r.cookingStats.lastCooked
      if (last && daysBetween(last, today) < NOT_COOKED_DAYS) continue
    }
    if (query.category && r.category !== query.category) continue
    if (query.tags?.length && !query.tags.every((t) => r.tags.includes(t))) continue
    hits.push({ recipe: r, matchedIngredient })
  }
  const sort = query.sort ?? 'loved'
  hits.sort((a, b) => {
    const x = a.recipe
    const y = b.recipe
    switch (sort) {
      case 'title':
        return x.title.localeCompare(y.title, 'de')
      case 'newest':
        return y.createdAt.localeCompare(x.createdAt)
      case 'time':
        return (x.cookingTime ?? 999) - (y.cookingTime ?? 999)
      case 'lastCooked':
        // longest ago (or never) first: the "what haven't we had" order
        return (x.cookingStats.lastCooked ?? '0000').localeCompare(y.cookingStats.lastCooked ?? '0000')
      default:
        return lovedScore(y) - lovedScore(x) || x.title.localeCompare(y.title, 'de')
    }
  })
  return hits
}

export function recipeCount(): number {
  return store.recipes.length
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  await delay(40)
  return store.recipes.find((r) => r.id === id) ?? null
}

export async function saveRecipe(draft: RecipeDraft, id?: string): Promise<Recipe> {
  await delay(200)
  const now = new Date().toISOString()
  const instructions = draft.instructions.map((s, i) => ({ ...s, stepNumber: i + 1 }))
  if (id) {
    const idx = store.recipes.findIndex((r) => r.id === id)
    if (idx === -1) throw new Error('Rezept nicht gefunden')
    const updated: Recipe = { ...store.recipes[idx], ...draft, instructions, updatedAt: now }
    store.recipes = store.recipes.map((r) => (r.id === id ? updated : r))
    commit()
    return updated
  }
  const created: Recipe = {
    ...draft,
    instructions,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    cookingStats: { timesCooked: 0, lastCooked: null },
  }
  store.recipes = [created, ...store.recipes]
  commit()
  return created
}

/**
 * Removes a recipe. Its plan entries stay and keep the title as free text,
 * so the week does not silently lose a day. Returns what is needed to undo.
 */
export async function deleteRecipe(id: string): Promise<{ recipe: Recipe; entries: PlanEntry[] } | null> {
  const recipe = store.recipes.find((r) => r.id === id)
  if (!recipe) return null
  const entries = store.plan.filter((e) => e.recipeId === id)
  store.recipes = store.recipes.filter((r) => r.id !== id)
  store.plan = store.plan.map((e) => (e.recipeId === id ? { ...e, recipeId: null, note: recipe.title } : e))
  commit()
  return { recipe, entries }
}

export function restoreRecipe(snapshot: { recipe: Recipe; entries: PlanEntry[] }) {
  const ids = new Set(snapshot.entries.map((e) => e.id))
  store.recipes = [snapshot.recipe, ...store.recipes]
  store.plan = [...store.plan.filter((e) => !ids.has(e.id)), ...snapshot.entries]
  commit()
}

const byDatePosition = (a: PlanEntry, b: PlanEntry) => a.date.localeCompare(b.date) || a.position - b.position

export async function listPlanEntries(from: string, to: string): Promise<PlanEntry[]> {
  await delay(40)
  return store.plan.filter((e) => e.date >= from && e.date <= to).sort(byDatePosition)
}

export function planEntriesForRecipe(recipeId: string): PlanEntry[] {
  const today = todayIso()
  return store.plan.filter((e) => e.recipeId === recipeId && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))
}

/** Adds a recipe or a free-text entry at the end of that day's slot. */
export function addPlanEntry(input: { date: string; slot: SlotKey; recipeId?: string; note?: string }): PlanEntry {
  const note = input.note?.trim().slice(0, 80) || null
  const recipeId = note ? null : (input.recipeId ?? null)
  if (!recipeId && !note) throw new Error('Ein Eintrag braucht ein Rezept oder einen Text.')
  const position = store.plan.filter((e) => e.date === input.date && e.slot === input.slot).length
  const entry: PlanEntry = { id: uid(), date: input.date, slot: input.slot, recipeId, note, position, createdVia: 'app', seenAt: null }
  store.plan = [...store.plan, entry]
  commit()
  return entry
}

/** Moves an entry to another day; the slot is kept, it goes to the end of that slot. */
export function movePlanEntry(id: string, date: string): PlanEntry | null {
  const entry = store.plan.find((e) => e.id === id)
  if (!entry || entry.date === date) return null
  const position = store.plan.filter((e) => e.date === date && e.slot === entry.slot).length
  store.plan = store.plan.map((e) => (e.id === id ? { ...e, date, position } : e))
  commit()
  return entry
}

/** Puts an entry back exactly as it was (undo for move and remove). */
export function restorePlanEntry(entry: PlanEntry) {
  store.plan = [...store.plan.filter((e) => e.id !== entry.id), entry]
  commit()
}

/** Marks agent-created entries as seen (their LED goes out). */
export function markSeen(ids: string[]) {
  if (!ids.length) return
  const now = new Date().toISOString()
  const set = new Set(ids)
  store.plan = store.plan.map((e) => (set.has(e.id) && !e.seenAt ? { ...e, seenAt: now } : e))
  commit()
}

/** Fixed presets plus the four most recent own free texts. */
export function planPresets(): string[] {
  const fixed: readonly string[] = PRESETS
  const titles = new Set(store.recipes.map((r) => r.title))
  const recent: string[] = []
  const own = store.plan.filter((e) => e.note && e.createdVia === 'app' && !titles.has(e.note) && !fixed.includes(e.note))
  for (const e of [...own].reverse()) {
    if (e.note && !recent.includes(e.note)) recent.push(e.note)
    if (recent.length === 4) break
  }
  return [...PRESETS, ...recent]
}

const SLOT_CATEGORIES: Record<SlotKey, string[]> = {
  breakfast: ['Frühstück'],
  lunch: ['Hauptspeise', 'Suppe', 'Salat'],
  dinner: ['Hauptspeise', 'Suppe', 'Salat'],
  snack: ['Snack', 'Dessert'],
}

/**
 * Suggestion shelves for a slot in the week starting at weekStart. Every
 * shelf states its reason; recipes planned within 14 days of the week are left out.
 */
export async function suggestions(weekStart: string, slot: SlotKey): Promise<Shelf[]> {
  await delay(60)
  const today = todayIso()
  const from = addDays(weekStart, -14)
  const to = addDays(weekStart, 6 + 14)
  const planned = new Set(store.plan.filter((e) => e.recipeId && e.date >= from && e.date <= to).map((e) => e.recipeId))
  const fits = store.recipes.filter((r) => SLOT_CATEGORIES[slot].includes(r.category) && !planned.has(r.id))
  const used = new Set<string>()
  const take = (list: Recipe[]) => {
    const out = list.filter((r) => !used.has(r.id)).slice(0, 8)
    out.forEach((r) => used.add(r.id))
    return out
  }
  const byLoved = (a: Recipe, b: Recipe) => lovedScore(b) - lovedScore(a)
  const longAgo = (r: Recipe) => {
    const last = r.cookingStats.lastCooked
    return last !== null && daysBetween(last, today) >= NOT_COOKED_DAYS
  }
  const shelves: Shelf[] = [
    {
      key: 'langeher',
      title: 'Lange nicht gegessen',
      reason: 'Gut bewertet, seit 6 Wochen nicht gekocht',
      recipes: take(
        fits
          .filter((r) => (r.rating ?? 0) >= 4 && longAgo(r))
          .sort((a, b) => (a.cookingStats.lastCooked ?? '').localeCompare(b.cookingStats.lastCooked ?? '')),
      ),
    },
    { key: 'lieblinge', title: 'Lieblinge', reason: 'Am besten bewertet und oft gekocht', recipes: take(fits.filter((r) => (r.rating ?? 0) >= 4).sort(byLoved)) },
    { key: 'schnell', title: 'Schnell', reason: 'Bis 30 Minuten', recipes: take(fits.filter((r) => (r.cookingTime ?? 999) <= 30).sort(byLoved)) },
  ]
  return shelves.filter((s) => s.recipes.length > 0)
}

export function getSettings(): Settings {
  return store.settings
}

export function saveSettings(patch: Partial<Settings>) {
  store.settings = { ...store.settings, ...patch }
  commit()
}

/**
 * The week home opens on: the running week, or the next one from the
 * planning day on. A planning day equal to the week start never flips.
 */
export function defaultWeekStart(today = todayIso(), settings = store.settings): string {
  const start = weekStartOf(today, settings.weekStart)
  const planOffset = (settings.planningWeekday - settings.weekStart + 7) % 7
  const todayOffset = (weekdayIndex(today) - settings.weekStart + 7) % 7
  return planOffset > 0 && todayOffset >= planOffset ? addDays(start, 7) : start
}

export function removePlanEntry(id: string): PlanEntry | null {
  const entry = store.plan.find((e) => e.id === id) ?? null
  store.plan = store.plan.filter((e) => e.id !== id)
  commit()
  return entry
}

export function recipeById(id: string): Recipe | undefined {
  return store.recipes.find((r) => r.id === id)
}

export const IMPORT_STEPS = ['Quelle lesen', 'Zutaten erkennen', 'Schritte ordnen', 'Fertig'] as const

export class ImportError extends Error {}

/** Simulates the AI import (10–120 s in production) with visible progress steps. */
export async function importRecipe(source: string, onStep: (index: number) => void): Promise<RecipeDraft> {
  for (let i = 0; i < IMPORT_STEPS.length - 1; i++) {
    onStep(i)
    await delay(1100)
    if (i === 0 && /fehler|error/i.test(source)) {
      throw new ImportError('Auf dieser Seite wurde kein Rezept gefunden.')
    }
  }
  onStep(IMPORT_STEPS.length - 1)
  await delay(500)
  return demoImport(source)
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}


/* ── Einkauf ─────────────────────────────────────────────────────────────── */

const SHOP_HORIZON = 14

/** Days a finished trip already covered. */
export function shoppedDays(): Set<string> {
  return new Set(store.trips.filter((t) => t.completedAt).flatMap((t) => t.days))
}

/** Days from today on (two weeks) that have a recipe planned. */
export function plannedShopDays(today = todayIso()): string[] {
  const end = addDays(today, SHOP_HORIZON - 1)
  return [...new Set(store.plan.filter((e) => e.recipeId && e.date >= today && e.date <= end).map((e) => e.date))].sort()
}

/** The dishes behind each plannable shopping day: date → recipe titles, in meal order. */
export function plannedDishes(today = todayIso()): Map<string, string[]> {
  const end = addDays(today, SHOP_HORIZON - 1)
  const slotOrder = ['breakfast', 'lunch', 'dinner', 'snack']
  const out = new Map<string, string[]>()
  store.plan
    .filter((e) => e.recipeId && e.date >= today && e.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date) || slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot) || a.position - b.position)
    .forEach((e) => {
      const title = store.recipes.find((r) => r.id === e.recipeId)?.title
      if (title) out.set(e.date, [...(out.get(e.date) ?? []), title])
    })
  return out
}

function defaultTripDays(): string[] {
  const done = shoppedDays()
  return plannedShopDays().filter((d) => !done.has(d))
}

function buildLines(trip: Trip): ShoppingLine[] {
  const days = new Set(trip.days)
  const ingredients = store.plan
    .filter((e) => e.recipeId && days.has(e.date))
    .flatMap((e) => store.recipes.find((r) => r.id === e.recipeId)?.ingredients ?? [])
  const seen = new Set(trip.seen)
  const line = (key: string, name: string, qty: string, section: string, manualId: string | null): ShoppingLine => {
    const st = trip.state[key]
    const checked = st?.checked ?? false
    const atHome = st?.atHome ?? false
    return { key, name, qty, section, checked, atHome, likelyHome: !checked && !atHome && (store.homeCounts[key] ?? 0) >= 2, isNew: !seen.has(key), manualId, agent: false }
  }
  const planned = aggregate(ingredients).map((a) => line(a.key, a.name, a.qty, store.sectionOverrides[a.key] ?? classify(a.name), null))
  const manual = store.manual.map((m) => ({
    ...line(`m:${m.id}`, m.name, '', store.sectionOverrides[nameKey(m.name)] ?? m.section, m.id),
    agent: !!m.createdVia && m.createdVia !== 'app',
  }))
  return [...planned, ...manual]
}

/** The open trip, created with the pre-ticked days when there is none. */
function openTrip(): Trip {
  let trip = store.trips.find((t) => !t.completedAt)
  if (!trip) {
    trip = { id: uid(), days: defaultTripDays(), daysChosen: false, createdAt: new Date().toISOString(), completedAt: null, seen: [], state: {} }
    trip.seen = buildLines(trip).map((l) => l.key)
    store.trips = [...store.trips, trip]
    commit()
    return trip
  }
  // Untouched trips follow the plan: days planned since then are pre-ticked too.
  if (!trip.daysChosen && Object.keys(trip.state).length === 0) {
    const days = defaultTripDays()
    if (days.join() !== trip.days.join()) {
      const id = trip.id
      trip = { ...trip, days }
      store.trips = store.trips.map((t) => (t.id === id ? trip! : t))
      commit()
    }
  }
  return trip
}

function updateTrip(fn: (t: Trip) => Trip) {
  const open = openTrip()
  store.trips = store.trips.map((t) => (t.id === open.id ? fn(t) : t))
  commit()
}

export async function getShoppingList(): Promise<ShoppingList> {
  await delay(80)
  const trip = openTrip()
  const lines = buildLines(trip).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const order = store.sectionOrder
  const sections = order
    .map((section) => ({ section, lines: lines.filter((l) => l.section === section) }))
    .filter((s) => s.lines.length > 0)
  return { trip, sections }
}

export function setTripDays(days: string[]) {
  updateTrip((t) => ({ ...t, days: [...days].sort(), daysChosen: true }))
}

export function setLineChecked(key: string, checked: boolean) {
  updateTrip((t) => ({ ...t, state: { ...t.state, [key]: { atHome: t.state[key]?.atHome ?? false, checked } } }))
}

/** "haben wir da": leaves the store count, and teaches "meist da" for next time. */
export function setLineAtHome(key: string, atHome: boolean) {
  const was = openTrip().state[key]?.atHome ?? false
  if (was !== atHome && !key.startsWith('m:')) store.homeCounts = { ...store.homeCounts, [key]: Math.max(0, (store.homeCounts[key] ?? 0) + (atHome ? 1 : -1)) }
  updateTrip((t) => ({ ...t, state: { ...t.state, [key]: { checked: t.state[key]?.checked ?? false, atHome } } }))
}

export function markLinesSeen(keys: string[]) {
  const trip = store.trips.find((t) => !t.completedAt)
  if (!trip || keys.every((k) => trip.seen.includes(k))) return
  updateTrip((t) => ({ ...t, seen: [...new Set([...t.seen, ...keys])] }))
}

/** Own items stay until bought. Returns the new line key. */
export function addManualItem(name: string): string | null {
  const clean = name.trim().slice(0, 60)
  if (!clean) return null
  const item: ManualItem = { id: uid(), name: clean, section: store.sectionOverrides[nameKey(clean)] ?? classify(clean), createdAt: new Date().toISOString() }
  store.manual = [...store.manual, item]
  const key = `m:${item.id}`
  updateTrip((t) => ({ ...t, seen: [...t.seen, key] }))
  return key
}

export function removeManualItem(id: string): ManualItem | null {
  const item = store.manual.find((m) => m.id === id) ?? null
  store.manual = store.manual.filter((m) => m.id !== id)
  commit()
  return item
}

export function restoreManualItem(item: ManualItem) {
  store.manual = [...store.manual.filter((m) => m.id !== item.id), item]
  commit()
}

/** Recent own items not on the list right now, for suggestions. */
export function recentManualNames(): string[] {
  const now = new Set(store.manual.map((m) => nameKey(m.name)))
  const names = ['Milch', 'Brot', 'Klopapier', 'Spülmittel', 'Joghurt', 'Äpfel', 'Kaffee', 'Butter']
  return names.filter((n) => !now.has(nameKey(n)))
}

/** "Abschnitt ändern": remembered for this name from now on. */
export function setLineSection(line: ShoppingLine, section: string) {
  const key = line.manualId ? nameKey(line.name) : line.key
  store.sectionOverrides = { ...store.sectionOverrides, [key]: section }
  commit()
}

export function getSectionOrder(): string[] {
  return store.sectionOrder
}

export function saveSectionOrder(order: string[]) {
  store.sectionOrder = order
  commit()
}

/** Closes the trip: its days count as shopped, bought own items are gone. Returns what undo needs. */
export function completeTrip(): { trip: Trip; manual: ManualItem[] } | null {
  const trip = store.trips.find((t) => !t.completedAt)
  if (!trip) return null
  const before = store.manual
  const bought = new Set(Object.entries(trip.state).filter(([k, s]) => k.startsWith('m:') && (s.checked || s.atHome)).map(([k]) => k.slice(2)))
  store.manual = store.manual.filter((m) => !bought.has(m.id))
  store.trips = store.trips.map((t) => (t.id === trip.id ? { ...t, completedAt: new Date().toISOString() } : t))
  commit()
  return { trip, manual: before }
}

/** Undo for completeTrip: the trip is open again, an untouched follow-up trip goes away. */
export function reopenTrip(snapshot: { trip: Trip; manual: ManualItem[] }) {
  store.trips = store.trips
    .filter((t) => t.completedAt || t.id === snapshot.trip.id || Object.keys(t.state).length > 0)
    .map((t) => (t.id === snapshot.trip.id ? snapshot.trip : t))
  store.manual = snapshot.manual
  commit()
}

/** True when every planned day of the next two weeks is already shopped for. */
export function allShopped(): boolean {
  const done = shoppedDays()
  const planned = plannedShopDays()
  return done.size > 0 && planned.every((d) => done.has(d))
}


/* ── API keys and agent activity ─────────────────────────────────────────── */

export function listApiKeys(): ApiKey[] {
  return [...store.apiKeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function keyIsActive(k: ApiKey, now = new Date().toISOString()): boolean {
  return !k.revokedAt && (!k.expiresAt || k.expiresAt > now)
}

function randomSecret(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return 'esp_' + [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

/**
 * Creates a key. The secret is returned exactly once; the store keeps only
 * the prefix (the backend keeps a sha256 hash).
 */
export function createApiKey(input: { name: string; scopes: Scope[]; validDays: number | null; client: ApiClient }): { key: ApiKey; secret: string } {
  const secret = randomSecret()
  const now = new Date()
  const key: ApiKey = {
    id: uid(),
    name: input.name.trim().slice(0, 60) || `Schlüssel vom ${now.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' })}`,
    prefix: secret.slice(0, 12),
    scopes: input.scopes,
    client: input.client,
    createdAt: now.toISOString(),
    lastUsedAt: null,
    expiresAt: input.validDays ? new Date(now.getTime() + input.validDays * 86_400_000).toISOString() : null,
    revokedAt: null,
  }
  store.apiKeys = [...store.apiKeys, key]
  commit()
  return { key, secret }
}

/** The setup tab last used for a key (only a label for the list). */
export function setApiKeyClient(id: string, client: ApiClient) {
  store.apiKeys = store.apiKeys.map((k) => (k.id === id ? { ...k, client } : k))
  commit()
}

export function revokeApiKey(id: string) {
  store.apiKeys = store.apiKeys.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k))
  commit()
}

export function unrevokeApiKey(id: string) {
  store.apiKeys = store.apiKeys.map((k) => (k.id === id ? { ...k, revokedAt: null } : k))
  commit()
}

export function listActivity(): Activity[] {
  return [...store.activity].sort((a, b) => b.at.localeCompare(a.at))
}

export function unseenActivityCount(): number {
  return store.activity.filter((a) => !a.seenAt).length
}

export function markActivitySeen(ids?: string[]) {
  const now = new Date().toISOString()
  const set = ids ? new Set(ids) : null
  if (!store.activity.some((a) => !a.seenAt && (!set || set.has(a.id)))) return
  store.activity = store.activity.map((a) => (!a.seenAt && (!set || set.has(a.id)) ? { ...a, seenAt: now } : a))
  commit()
}

/** Recipes an agent changed that you have not looked at since. */
export function agentChangedRecipeIds(): Set<string> {
  return new Set(store.activity.filter((a) => !a.seenAt && !a.undoneAt && a.target.type === 'recipe').map((a) => a.target.id))
}

/** Opening a recipe counts as seeing what an agent did to it. */
export function markRecipeSeen(recipeId: string) {
  markActivitySeen(store.activity.filter((a) => a.target.type === 'recipe' && a.target.id === recipeId).map((a) => a.id))
}

export class UndoBlocked extends Error {}

/** Why an agent action can no longer be undone, or null while it still can. */
export function undoBlockedReason(id: string): string | null {
  const act = store.activity.find((a) => a.id === id)
  if (!act || act.undoneAt || !act.undo) return 'Das lässt sich nicht rückgängig machen.'
  const u = act.undo
  if (u.kind === 'plan.remove') return store.plan.some((e) => e.id === u.entryId) ? null : 'Nicht mehr rückgängig: Der Eintrag ist schon weg.'
  if (u.kind === 'shopping.remove') return store.manual.some((m) => m.id === u.itemId) ? null : 'Nicht mehr rückgängig: Der Artikel ist schon von der Liste.'
  const current = store.recipes.find((r) => r.id === u.before.id)
  if (!current) return 'Nicht mehr rückgängig: Das Rezept gibt es nicht mehr.'
  if (current.updatedAt !== u.afterUpdatedAt) return `Nicht mehr rückgängig: „${current.title}“ wurde inzwischen geändert.`
  return null
}

/** Reverses one agent action, only while that is still safe. */
export function undoActivity(id: string) {
  const blocked = undoBlockedReason(id)
  if (blocked) throw new UndoBlocked(blocked)
  const u = store.activity.find((a) => a.id === id)!.undo!
  if (u.kind === 'plan.remove') store.plan = store.plan.filter((e) => e.id !== u.entryId)
  else if (u.kind === 'shopping.remove') store.manual = store.manual.filter((m) => m.id !== u.itemId)
  else store.recipes = store.recipes.map((r) => (r.id === u.before.id ? { ...u.before, updatedAt: new Date().toISOString() } : r))
  store.activity = store.activity.map((a) => (a.id === id ? { ...a, undoneAt: new Date().toISOString(), seenAt: a.seenAt ?? new Date().toISOString() } : a))
  commit()
}
