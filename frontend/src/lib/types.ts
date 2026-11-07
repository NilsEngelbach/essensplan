// Shapes mirror the planned REST API (/api/v1, camelCase).

export const CATEGORIES = ['Hauptspeise', 'Salat', 'Suppe', 'Beilage', 'Frühstück', 'Dessert', 'Snack'] as const
export type Category = (typeof CATEGORIES)[number]

export const TAGS = ['Vegetarisch', 'Vegan', 'Glutenfrei', 'Laktosefrei', 'Schnell', 'Gesund', 'Würzig', 'Süß'] as const
export type Tag = (typeof TAGS)[number]

export const DIFFICULTIES = ['Einfach', 'Mittel', 'Schwer'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

export const SLOTS = [
  { key: 'breakfast', name: 'Frühstück', short: 'Früh' },
  { key: 'lunch', name: 'Mittagessen', short: 'Mittag' },
  { key: 'dinner', name: 'Abendessen', short: 'Abend' },
  { key: 'snack', name: 'Snack', short: 'Snack' },
] as const
export type SlotKey = (typeof SLOTS)[number]['key']

export interface Ingredient {
  id: string
  name: string
  amount: number | null
  unit: string | null
  notes: string | null
  component: string | null
}

export interface Instruction {
  id: string
  stepNumber: number
  description: string
}

export interface CookingStats {
  timesCooked: number
  lastCooked: string | null // YYYY-MM-DD (Europe/Berlin)
}

export interface Recipe {
  id: string
  title: string
  description: string | null
  imageUrl: string | null
  category: Category
  tags: Tag[]
  cookingTime: number | null
  servings: number | null
  difficulty: Difficulty | null
  rating: number | null
  sourceUrl: string | null
  createdAt: string // ISO
  updatedAt: string
  ingredients: Ingredient[]
  instructions: Instruction[]
  cookingStats: CookingStats
}

export type RecipeDraft = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'cookingStats'>

/** A plan entry is a recipe or free text, never both. No per-entry servings (D15). */
export interface PlanEntry {
  id: string
  date: string // YYYY-MM-DD
  slot: SlotKey
  recipeId: string | null
  note: string | null // free text ("Reste", "Essen gehen"), or the title of a deleted recipe
  position: number
  createdVia: 'app' | 'api' | 'mcp'
  seenAt: string | null // set once an agent-created entry has been seen in the app
}

/** Fixed free-text presets; the user's recent own texts are added after them. */
export const PRESETS = ['Reste', 'Essen gehen', 'Auswärts', 'Bestellen'] as const

/** Weekdays as in Date.getUTCDay(): 0 = Sonntag … 6 = Samstag. */
export interface Settings {
  weekStart: number // default 1 (Montag)
  planningWeekday: number // default 5 (Freitag): from this day home opens on next week
}

/** One shopping trip: the days it covers and the state of each line. */
export interface Trip {
  id: string
  days: string[] // YYYY-MM-DD, sorted
  daysChosen: boolean // false = still the pre-ticked default, refreshed while untouched
  createdAt: string
  completedAt: string | null
  seen: string[] // line keys already shown once; others print as "neu"
  state: Record<string, { checked: boolean; atHome: boolean }>
}

export interface ManualItem {
  id: string
  name: string
  section: string
  createdAt: string
  createdVia?: 'app' | 'api' | 'mcp'
}

/* ── API keys and agent activity ─────────────────────────────────────────── */

export const SCOPES = [
  { key: 'recipes:read', group: 'Rezepte', label: 'lesen' },
  { key: 'recipes:write', group: 'Rezepte', label: 'speichern' },
  { key: 'recipes:delete', group: 'Rezepte', label: 'löschen', warning: 'kann Rezepte löschen' },
  { key: 'mealplan:read', group: 'Wochenplan', label: 'lesen' },
  { key: 'mealplan:write', group: 'Wochenplan', label: 'planen' },
  { key: 'shopping:read', group: 'Einkauf', label: 'lesen' },
  { key: 'shopping:write', group: 'Einkauf', label: 'ändern' },
  { key: 'ai:use', group: 'KI-Import', label: 'nutzen', warning: 'verursacht KI-Kosten' },
] as const
export type Scope = (typeof SCOPES)[number]['key']

export type ApiClient = 'claude-code' | 'claude-desktop' | 'mcp' | 'rest'

export interface ApiKey {
  id: string
  name: string
  prefix: string // first 12 characters, the only part ever shown again
  scopes: Scope[]
  client: ApiClient
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
}

/** How to reverse one agent action; checked against the target before applying. */
export type UndoPayload =
  | { kind: 'plan.remove'; entryId: string }
  | { kind: 'shopping.remove'; itemId: string }
  | { kind: 'recipe.restore'; before: Recipe; afterUpdatedAt: string }

export interface Activity {
  id: string
  keyId: string
  keyName: string
  at: string
  summary: string // "hat Do 12. Mittag: Gnocchi-Pfanne geplant"
  target: { type: 'plan' | 'shopping' | 'recipe'; id: string; href: string; label: string }
  undo: UndoPayload | null
  undoneAt: string | null
  seenAt: string | null
}

export interface ShoppingLine {
  key: string
  name: string
  qty: string
  section: string
  checked: boolean
  atHome: boolean
  likelyHome: boolean // marked "da" often before
  isNew: boolean
  manualId: string | null
  agent: boolean // put on the list by an agent
}

export interface ShoppingList {
  trip: Trip
  sections: { section: string; lines: ShoppingLine[] }[]
}

export interface Shelf {
  key: 'langeher' | 'lieblinge' | 'schnell'
  title: string
  reason: string
  recipes: Recipe[]
}

export type SortKey = 'loved' | 'title' | 'lastCooked' | 'newest' | 'time'

export interface RecipeQuery {
  q?: string
  favourites?: boolean // rating >= 4
  quick?: boolean // <= 30 min
  notCookedSince?: boolean // not cooked in the last 6 weeks
  category?: Category | null
  tags?: Tag[]
  sort?: SortKey
}

export interface RecipeHit {
  recipe: Recipe
  matchedIngredient: string | null
}
