// Data layer against /api/v1 (docs/BACKEND_REQUIREMENTS.md §4). Same function
// surface the prototype had, so the screens stay as they were:
// - async reads (listRecipes, getRecipe, listPlanEntries, suggestions,
//   getShoppingList) fetch every time and never notify;
// - sync reads (settings, presets, keys, activity, shopping extras …) come
//   from a small cache that loads on first use and after writes;
// - writes go to the server one after another, then refresh the cache and
//   notify subscribers, which re-read. Failed background writes surface as a
//   toast through onApiError (see AppShell).
import { demoImport } from './demo-data'
import { addDays, todayIso, weekdayIndex, weekStartOf } from './format'
import { ApiError, http, qs, reportError } from './http'
import { getMe, setMe, subscribeAuth, type Me } from './auth'
import {
  type Activity,
  type ApiClient,
  type ApiKey,
  type ManualItem,
  type PlanEntry,
  type Recipe,
  type RecipeDraft,
  type RecipeHit,
  type RecipeQuery,
  type RecipeSummary,
  type Scope,
  type Settings,
  type Shelf,
  type ShoppingLine,
  type ShoppingList,
  type SlotKey,
  type Trip,
} from './types'

export { ApiError as UndoBlocked }

export const DEFAULT_SETTINGS: Settings = { weekStart: 1, planningWeekday: 5 }

const NOT_COOKED_DAYS = 42

/* ── Change notification ─────────────────────────────────────────────────── */

const listeners = new Set<() => void>()
let queued = false

/** Coalesced: several cache updates in one tick cause one re-render. */
function notify() {
  if (queued) return
  queued = true
  queueMicrotask(() => {
    queued = false
    listeners.forEach((l) => l())
  })
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/* ── Writes: one after another, so an undo never overtakes its action ───── */

let chain: Promise<unknown> = Promise.resolve()

function write<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn)
  chain = run.catch(() => undefined)
  run.catch(reportError)
  return run
}

/** Fire and forget: errors become a toast. */
function fire(fn: () => Promise<unknown>) {
  write(fn).catch(() => undefined)
}

/* ── Lazy cache slots ────────────────────────────────────────────────────── */

interface Slot<T> {
  value: T | undefined
  stale: boolean
  loading: boolean
  load: () => Promise<T>
}

function slot<T>(load: () => Promise<T>): Slot<T> {
  return { value: undefined, stale: true, loading: false, load }
}

/** The cached value (or the fallback), loading it in the background when missing or stale. */
function read<T>(s: Slot<T>, fallback: T): T {
  if (s.stale && !s.loading) {
    s.loading = true
    s.load()
      .then((v) => {
        s.value = v
        s.stale = false
        notify()
      })
      .catch((e) => {
        s.stale = false // don't hammer a failing endpoint; the next write retries
        reportError(e)
      })
      .finally(() => {
        s.loading = false
      })
  }
  return s.value ?? fallback
}

function invalidate(...slots: Slot<unknown>[]) {
  slots.forEach((s) => (s.stale = true))
  notify()
}

/* ── Recipes ─────────────────────────────────────────────────────────────── */

// Titles and photos of recipes seen in any list, so the week can print them synchronously.
const recipeIndex = new Map<string, RecipeSummary>()

function remember(r: RecipeSummary) {
  recipeIndex.set(r.id, r)
}

interface RecipePage {
  items: RecipeHit[]
  nextCursor: string | null
  total: number
}

const recipeTotal = slot(async () => (await http<RecipePage>('GET', '/recipes?limit=1')).total)
const unseen = slot(() => http<{ count: number; recipeIds: string[] }>('GET', '/agent-activity/unseen-count'))

/** "How loved": rating first, times cooked as tie-breaker. One scale everywhere. */
export function lovedScore(r: Pick<RecipeSummary, 'rating' | 'cookingStats'>): number {
  return (r.rating ?? 0) * 100 + Math.min(r.cookingStats.timesCooked, 99)
}

export async function listRecipes(query: RecipeQuery = {}): Promise<RecipeHit[]> {
  const page = await http<RecipePage>(
    'GET',
    '/recipes' +
      qs({
        q: query.q?.trim(),
        favourites: query.favourites,
        quick: query.quick,
        notCookedSince: query.notCookedSince ? addDays(todayIso(), -NOT_COOKED_DAYS) : undefined,
        category: query.category ?? undefined,
        tags: query.tags?.length ? query.tags : undefined,
        sort: query.sort ?? 'loved',
        limit: 200,
      }),
  )
  page.items.forEach((h) => remember(h.recipe))
  return page.items
}

export function recipeCount(): number {
  return read(recipeTotal, 0)
}

export async function getRecipe(id: string): Promise<Recipe | null> {
  try {
    const r = await http<Recipe>('GET', `/recipes/${encodeURIComponent(id)}`)
    remember(r)
    return r
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export function recipeById(id: string): RecipeSummary | undefined {
  return recipeIndex.get(id)
}

/** The draft as the server's recipe schema wants it (null fields allowed, extras ignored). */
function draftBody(draft: RecipeDraft) {
  return {
    ...draft,
    description: draft.description?.trim() ? draft.description : null,
    ingredients: draft.ingredients.map((i) => ({ id: i.id, name: i.name, amount: i.amount, unit: i.unit, notes: i.notes, component: i.component })),
    instructions: draft.instructions.map((s) => ({ description: s.description, ingredientIds: s.ingredientIds ?? null })),
  }
}

export async function saveRecipe(draft: RecipeDraft, id?: string): Promise<Recipe> {
  return write(async () => {
    const saved = id
      ? await http<Recipe>('PUT', `/recipes/${encodeURIComponent(id)}`, draftBody(draft))
      : await http<Recipe>('POST', '/recipes', draftBody(draft))
    remember(saved)
    invalidate(recipeTotal, presets, upcoming)
    return saved
  })
}

/**
 * Removes a recipe. Its plan entries stay and keep the title as free text,
 * so the week does not silently lose a day. Returns what is needed to undo.
 */
export async function deleteRecipe(id: string): Promise<{ recipe: Recipe; entries: PlanEntry[] } | null> {
  return write(async () => {
    try {
      const r = await http<{ recipe: Recipe; detachedEntries: number }>('DELETE', `/recipes/${encodeURIComponent(id)}`)
      recipeIndex.delete(id)
      invalidate(recipeTotal, presets, upcoming, shopping)
      return { recipe: r.recipe, entries: [] }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  })
}

export function restoreRecipe(snapshot: { recipe: Recipe }) {
  fire(async () => {
    remember(await http<Recipe>('POST', `/recipes/${encodeURIComponent(snapshot.recipe.id)}/restore`))
    invalidate(recipeTotal, presets, upcoming, shopping)
  })
}

/** Recipes an agent changed that you have not looked at since. */
export function agentChangedRecipeIds(): Set<string> {
  return new Set(read(unseen, { count: 0, recipeIds: [] }).recipeIds)
}

/** Opening a recipe counts as seeing what an agent did to it. */
export function markRecipeSeen(recipeId: string) {
  if (!agentChangedRecipeIds().has(recipeId)) return
  fire(async () => {
    await http('POST', '/agent-activity/seen', { recipeId })
    invalidate(unseen, activity)
  })
}

/* ── Plan entries ────────────────────────────────────────────────────────── */

// Every entry the screens have seen, for the synchronous move/remove/undo calls.
const entryIndex = new Map<string, PlanEntry>()
const removedEntries = new Set<string>()

function rememberEntries(entries: PlanEntry[]) {
  for (const e of entries) {
    entryIndex.set(e.id, e)
    if (e.recipe) {
      const known = recipeIndex.get(e.recipe.id)
      if (!known) recipeIndex.set(e.recipe.id, { ...e.recipe, cookingStats: { timesCooked: 0, lastCooked: null } } as unknown as RecipeSummary)
    }
  }
}

const UPCOMING_DAYS = 62
const upcoming = slot(async () => {
  const today = todayIso()
  const entries = await fetchEntries(today, addDays(today, UPCOMING_DAYS - 1))
  return entries
})

async function fetchEntries(from: string, to: string): Promise<PlanEntry[]> {
  const { entries } = await http<{ entries: PlanEntry[] }>('GET', `/meal-plan${qs({ from, to })}`)
  rememberEntries(entries)
  return entries
}

const byDatePosition = (a: PlanEntry, b: PlanEntry) => a.date.localeCompare(b.date) || a.position - b.position

export async function listPlanEntries(from: string, to: string): Promise<PlanEntry[]> {
  return (await fetchEntries(from, to)).sort(byDatePosition)
}

export function planEntriesForRecipe(recipeId: string): PlanEntry[] {
  const today = todayIso()
  return read(upcoming, [])
    .filter((e) => e.recipeId === recipeId && e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function planChanged() {
  invalidate(upcoming, presets, shopping)
}

/** Adds a recipe or a free-text entry at the end of that day's slot. */
export async function addPlanEntry(input: { date: string; slot: SlotKey; recipeId?: string; note?: string }): Promise<PlanEntry> {
  const note = input.note?.trim().slice(0, 80) || undefined
  const body = note ? { date: input.date, slot: input.slot, note } : { date: input.date, slot: input.slot, recipeId: input.recipeId }
  return write(async () => {
    const entry = await http<PlanEntry>('POST', '/meal-plan/entries', body)
    rememberEntries([entry])
    planChanged()
    return entry
  })
}

/** Moves an entry to another day; the slot is kept, it goes to the end of that slot. Returns the entry as it was. */
export function movePlanEntry(id: string, date: string): PlanEntry | null {
  const entry = entryIndex.get(id)
  if (!entry || entry.date === date) return null
  fire(async () => {
    rememberEntries([await http<PlanEntry>('PATCH', `/meal-plan/entries/${encodeURIComponent(id)}`, { date })])
    planChanged()
  })
  return entry
}

/** Puts an entry back exactly as it was (undo for move and remove). */
export function restorePlanEntry(entry: PlanEntry) {
  fire(async () => {
    const path = `/meal-plan/entries/${encodeURIComponent(entry.id)}`
    if (removedEntries.delete(entry.id)) await http('POST', `${path}/restore`)
    await http('PATCH', path, { date: entry.date, slot: entry.slot, position: entry.position })
    planChanged()
  })
}

export function removePlanEntry(id: string): PlanEntry | null {
  const entry = entryIndex.get(id) ?? null
  removedEntries.add(id)
  fire(async () => {
    await http('DELETE', `/meal-plan/entries/${encodeURIComponent(id)}`)
    planChanged()
  })
  return entry
}

/** Marks agent-created entries as seen (their LED goes out). */
export function markSeen(ids: string[]) {
  if (!ids.length) return
  fire(async () => {
    await http('POST', '/meal-plan/seen', { ids })
    notify()
  })
}

const presets = slot(async () => (await http<{ items: string[] }>('GET', '/meal-plan/presets')).items)

/** Fixed presets plus the four most recent own free texts. */
export function planPresets(): string[] {
  return read(presets, ['Reste', 'Essen gehen', 'Auswärts', 'Bestellen'])
}

/**
 * Suggestion shelves for a slot in the week starting at weekStart. Every
 * shelf states its reason; recipes planned within 14 days of the week are left out.
 */
export async function suggestions(weekStart: string, slot: SlotKey): Promise<Shelf[]> {
  const { shelves } = await http<{ shelves: Shelf[] }>('GET', `/suggestions${qs({ weekStart, slot })}`)
  shelves.forEach((s) => s.recipes.forEach(remember))
  return shelves
}

/* ── Settings (part of /me) ──────────────────────────────────────────────── */

export function getSettings(): Settings {
  return getMe()?.settings ?? DEFAULT_SETTINGS
}

export function saveSettings(patch: Partial<Settings>) {
  const me = getMe()
  if (me) setMe({ ...me, settings: { ...me.settings, ...patch } })
  notify()
  fire(async () => {
    setMe(await http<Me>('PATCH', '/me', { settings: patch }))
    notify()
  })
}

/**
 * The week home opens on: the running week, or the next one from the
 * planning day on. A planning day equal to the week start never flips.
 * (The server computes the same as /me.defaultWeekStart.)
 */
export function defaultWeekStart(today = todayIso(), settings = getSettings()): string {
  const start = weekStartOf(today, settings.weekStart)
  const planOffset = (settings.planningWeekday - settings.weekStart + 7) % 7
  const todayOffset = (weekdayIndex(today) - settings.weekStart + 7) % 7
  return planOffset > 0 && todayOffset >= planOffset ? addDays(start, 7) : start
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/* ── Import (Phase 6: the AI import runs on the server later) ───────────── */

export const IMPORT_STEPS = ['Quelle lesen', 'Zutaten erkennen', 'Schritte ordnen', 'Fertig'] as const

export class ImportError extends Error {}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Still a demo: returns a sample draft. The real import comes with /ai/import (MIGRATION_PLAN §8). */
export async function importRecipe(source: string, onStep: (index: number) => void): Promise<RecipeDraft> {
  for (let i = 0; i < IMPORT_STEPS.length - 1; i++) {
    onStep(i)
    await delay(900)
    if (i === 0 && /fehler|error/i.test(source)) throw new ImportError('Auf dieser Seite wurde kein Rezept gefunden.')
  }
  onStep(IMPORT_STEPS.length - 1)
  await delay(300)
  return demoImport(source)
}

/* ── Einkauf ─────────────────────────────────────────────────────────────── */

interface ShoppingCurrent extends ShoppingList {
  planDays: { date: string; dishes: string[]; shopped: boolean }[]
  allShopped: boolean
  recentManualNames: string[]
}

const shopping = slot(() => http<ShoppingCurrent>('GET', '/shopping/current'))

/** The open trip with its lines. Also refreshes the day list and suggestions below. */
export async function getShoppingList(): Promise<ShoppingList> {
  const list = await http<ShoppingCurrent>('GET', '/shopping/current')
  shopping.value = list
  shopping.stale = false
  return list
}

function shoppingNow(): ShoppingCurrent | undefined {
  return read(shopping, undefined as unknown as ShoppingCurrent)
}

/** Days a finished trip already covered (of the next two weeks). */
export function shoppedDays(): Set<string> {
  return new Set((shoppingNow()?.planDays ?? []).filter((d) => d.shopped).map((d) => d.date))
}

/** Days from today on (two weeks) that have a recipe planned. */
export function plannedShopDays(): string[] {
  return (shoppingNow()?.planDays ?? []).map((d) => d.date)
}

/** The dishes behind each plannable shopping day: date → recipe titles, in meal order. */
export function plannedDishes(_today?: string): Map<string, string[]> {
  return new Map((shoppingNow()?.planDays ?? []).map((d) => [d.date, d.dishes]))
}

/** True when every planned day of the next two weeks is already shopped for. */
export function allShopped(): boolean {
  return shoppingNow()?.allShopped ?? false
}

/** Own items bought before and not on the list now, for quick re-adding. */
export function recentManualNames(): string[] {
  return shoppingNow()?.recentManualNames ?? []
}

function shoppingWrite(fn: () => Promise<unknown>) {
  fire(async () => {
    await fn()
    invalidate(shopping)
  })
}

const itemPath = (key: string) => `/shopping/items/${encodeURIComponent(key)}`

export function setTripDays(days: string[]) {
  shoppingWrite(() => http('POST', '/shopping/trips', { days: [...days].sort() }))
}

export function setLineChecked(key: string, checked: boolean) {
  shoppingWrite(() => http('PATCH', itemPath(key), { checked }))
}

/** "haben wir da": leaves the store count, and teaches "meist da" for next time. */
export function setLineAtHome(key: string, atHome: boolean) {
  shoppingWrite(() => http('PATCH', itemPath(key), { atHome }))
}

export function markLinesSeen(keys: string[]) {
  const list = shopping.value
  if (!keys.length || (list && keys.every((k) => list.trip.seen.includes(k)))) return
  fire(() => http('POST', '/shopping/seen', { keys }))
}

/** Own items stay until bought. Returns the cleaned name, or null when there was none. */
export function addManualItem(name: string): string | null {
  const clean = name.trim().slice(0, 60)
  if (!clean) return null
  shoppingWrite(() => http('POST', '/shopping/manual-items', { name: clean }))
  return clean
}

export function removeManualItem(id: string): ManualItem | null {
  const line = shopping.value?.sections.flatMap((s) => s.lines).find((l) => l.manualId === id)
  shoppingWrite(() => http('DELETE', `/shopping/manual-items/${encodeURIComponent(id)}`))
  return line ? { id, key: line.key, name: line.name, section: line.section, createdAt: '' } : null
}

export function restoreManualItem(item: ManualItem) {
  shoppingWrite(() => http('POST', `/shopping/manual-items/${encodeURIComponent(item.id)}/restore`))
}

/** "Abschnitt ändern": remembered for this name from now on. */
export function setLineSection(line: ShoppingLine, section: string) {
  shoppingWrite(() => http('PATCH', itemPath(line.key), { section }))
}

const sectionOrder = slot(async () => (await http<{ sections: string[] }>('GET', '/shopping/section-order')).sections)

export function getSectionOrder(): string[] {
  return read(sectionOrder, [])
}

export function saveSectionOrder(order: string[]) {
  sectionOrder.value = order
  notify()
  fire(async () => {
    sectionOrder.value = (await http<{ sections: string[] }>('PUT', '/shopping/section-order', { sections: order })).sections
    invalidate(shopping)
  })
}

/** Closes the trip: its days count as shopped, bought own items are gone. Returns what undo needs. */
export function completeTrip(): { trip: Trip; manual: ManualItem[] } | null {
  const trip = shopping.value?.trip
  if (!trip) return null
  shoppingWrite(() => http('POST', `/shopping/trips/${encodeURIComponent(trip.id)}/complete`))
  return { trip, manual: [] }
}

/** Undo for completeTrip: the trip is open again, an untouched follow-up trip goes away. */
export function reopenTrip(snapshot: { trip: Trip }) {
  shoppingWrite(() => http('POST', `/shopping/trips/${encodeURIComponent(snapshot.trip.id)}/reopen`))
}

/* ── API keys and agent activity ─────────────────────────────────────────── */

const apiKeys = slot(async () => (await http<{ items: ApiKey[] }>('GET', '/api-keys')).items)
const activity = slot(async () => (await http<{ items: Activity[] }>('GET', '/agent-activity?limit=200')).items)

export function listApiKeys(): ApiKey[] {
  return read(apiKeys, [])
}

export function keyIsActive(k: ApiKey, now = new Date().toISOString()): boolean {
  return !k.revokedAt && (!k.expiresAt || new Date(k.expiresAt).toISOString() > now)
}

/**
 * Creates a key. The secret is returned exactly once; the server keeps only
 * a sha256 hash and the prefix.
 */
export async function createApiKey(input: { name: string; scopes: Scope[]; validDays: number | null; client: ApiClient }): Promise<{ key: ApiKey; secret: string }> {
  return write(async () => {
    const r = await http<{ key: ApiKey; secret: string }>('POST', '/api-keys', { ...input, name: input.name.trim() || null })
    invalidate(apiKeys)
    return r
  })
}

/** The setup tab last used for a key (only a label for the list). */
export function setApiKeyClient(id: string, client: ApiClient) {
  fire(async () => {
    await http('PATCH', `/api-keys/${encodeURIComponent(id)}`, { client })
    invalidate(apiKeys)
  })
}

export function revokeApiKey(id: string) {
  const k = apiKeys.value?.find((x) => x.id === id)
  if (k) k.revokedAt = new Date().toISOString()
  notify()
  fire(async () => {
    await http('DELETE', `/api-keys/${encodeURIComponent(id)}`)
    invalidate(apiKeys)
  })
}

export function unrevokeApiKey(id: string) {
  fire(async () => {
    await http('POST', `/api-keys/${encodeURIComponent(id)}/unrevoke`)
    invalidate(apiKeys)
  })
}

export function listActivity(): Activity[] {
  return read(activity, [])
}

export function unseenActivityCount(): number {
  startUnseenPolling()
  return read(unseen, { count: 0, recipeIds: [] }).count
}

export function markActivitySeen(ids?: string[]) {
  if (!read(unseen, { count: 0, recipeIds: [] }).count) return
  fire(async () => {
    await http('POST', '/agent-activity/seen', ids ? { ids } : {})
    invalidate(unseen, activity)
  })
}

/** Why an agent action can no longer be undone, or null while it still can (the server decides). */
export function undoBlockedReason(id: string): string | null {
  const a = listActivity().find((x) => x.id === id)
  if (!a || a.undoneAt || !a.undo) return 'Das lässt sich nicht rückgängig machen.'
  return a.undoBlocked ?? null
}

/** Reverses one agent action, only while that is still safe; throws with the reason otherwise. */
export async function undoActivity(id: string): Promise<void> {
  try {
    await http('POST', `/agent-activity/${encodeURIComponent(id)}/undo`)
  } finally {
    invalidate(activity, unseen, upcoming, presets, shopping, recipeTotal)
  }
}

/**
 * Agents act while the app is open: the avatar dot (and the marks that come
 * with it) refresh every minute and when the tab comes back.
 */
let polling = false
function startUnseenPolling() {
  if (polling) return
  polling = true
  const refresh = () => {
    if (document.visibilityState === 'visible' && getMe()) invalidate(unseen)
  }
  window.setInterval(refresh, 60_000)
  document.addEventListener('visibilitychange', refresh)
}

/** After login or logout everything cached belongs to someone else. */
let cachedFor: string | null | undefined
subscribeAuth(() => {
  const id = getMe()?.id ?? null
  if (cachedFor !== undefined && id !== cachedFor) resetCache()
  cachedFor = id
})

export function resetCache() {
  for (const s of [recipeTotal, unseen, upcoming, presets, shopping, sectionOrder, apiKeys, activity]) {
    s.value = undefined
    s.stale = true
  }
  recipeIndex.clear()
  entryIndex.clear()
  removedEntries.clear()
  notify()
}
