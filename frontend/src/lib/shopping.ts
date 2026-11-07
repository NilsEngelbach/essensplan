// Grocery list logic: supermarket sections, ingredient → section, and adding
// up the same ingredient across recipes. Pure functions; the store lives in api.ts.
import { formatAmount } from './format'
import type { Ingredient } from './types'

export const SECTIONS = [
  'Obst & Gemüse',
  'Brot & Backwaren',
  'Kühlung',
  'Fleisch & Fisch',
  'Tiefkühl',
  'Trockenware',
  'Konserven & Saucen',
  'Gewürze & Öl',
  'Süßes & Snacks',
  'Getränke',
  'Drogerie & Haushalt',
  'Sonstiges',
] as const
export type Section = (typeof SECTIONS)[number]

/** "Paprika, rot" and "Paprika, gelb" are one thing to buy: Paprika. */
export function baseName(name: string): string {
  return name.split(',')[0].trim()
}

export function nameKey(name: string): string {
  return baseName(name).toLocaleLowerCase('de-DE')
}

// Checked in order: the specific multi-word cases come before the generic ones.
const RULES: [RegExp, Section][] = [
  [/tiefk|^tk[ -]/, 'Tiefkühl'],
  [/sojahack|linsen|couscous|haferflocken|reis$|^reis|spaghetti|makkaroni|nudel|lasagneplatten|mehl|grieß|backpulver|hefe|zucker|walnüss|nüsse|mandeln/, 'Trockenware'],
  [/kokosmilch|passierte|stückige|tomatenmark|brühe|sauce|soße|kichererbsen|bohnen|mais|sauerkirschen|currypaste|sirup|essig|senf|ketchup|dose|glas/, 'Konserven & Saucen'],
  [/pulver|salz|pfeffer|öl$|^öl|olivenöl|rapsöl|kreuzkümmel|majoran|muskat|oregano|zimt|curry|gewürz|vanille/, 'Gewürze & Öl'],
  [/hack|hähnchen|huhn|pute|rind|schwein|fleisch|fisch|lachs|thunfisch|garnelen/, 'Fleisch & Fisch'],
  [/käse|cheddar|emmentaler|gouda|feta|mozzarella|parmesan|milch|quark|sahne|schmand|butter|^eier|^ei$|joghurt|gnocchi|würstchen|speck|tofu/, 'Kühlung'],
  [/wraps|brot|brötchen|toast|tortilla|baguette/, 'Brot & Backwaren'],
  [/wein|bier|saft$|wasser|kaffee|tee$|limo/, 'Getränke'],
  [/schokolade|kekse|chips|gummi|süßigkeit/, 'Süßes & Snacks'],
  [/klopapier|toilettenpapier|spül|seife|zahnpasta|shampoo|waschmittel|müllbeutel|küchenrolle|schwamm/, 'Drogerie & Haushalt'],
  [/apfel|äpfel|aubergine|spinat|banane|blumenkohl|brokkoli|dill|zwiebel|gurke|ingwer|karotte|möhre|kartoffel|tomate|knoblauch|koriander|limette|zitrone|paprika|petersilie|rosmarin|thymian|basilikum|suppengrün|zucchini|salat|lauch|pilz|champignon|kürbis|beeren|obst|gemüse|avocado|sellerie/, 'Obst & Gemüse'],
]

/** Word-list classification; the real backend falls back to AI for unknown names. */
export function classify(name: string): Section {
  const k = nameKey(name)
  for (const [re, section] of RULES) if (re.test(k)) return section
  return 'Sonstiges'
}

/** Things nobody buys. */
const SKIP = new Set(['wasser', 'leitungswasser'])

type Family = { kind: 'mass' | 'volume' | 'count'; label: string }

function family(unit: string | null): Family {
  const u = (unit ?? '').trim()
  const l = u.toLocaleLowerCase('de-DE')
  if (l === 'g' || l === 'kg') return { kind: 'mass', label: 'g' }
  if (l === 'ml' || l === 'l') return { kind: 'volume', label: 'ml' }
  if (l === 'zehe' || l === 'zehen') return { kind: 'count', label: 'Zehen' }
  if (l === 'prise' || l === 'prisen') return { kind: 'count', label: 'Prise' }
  return { kind: 'count', label: u }
}

function toBase(amount: number, unit: string | null): number {
  const l = (unit ?? '').trim().toLocaleLowerCase('de-DE')
  return l === 'kg' || l === 'l' ? amount * 1000 : amount
}

function formatPart(f: Family, v: number): string {
  if (f.kind === 'mass') return v >= 1000 ? `${(Math.round(v / 100) / 10).toLocaleString('de-DE')} kg` : `${formatAmount(v, 'g')} g`
  if (f.kind === 'volume') return v >= 1000 ? `${(Math.round(v / 100) / 10).toLocaleString('de-DE')} l` : `${formatAmount(v, 'ml')} ml`
  const n = formatAmount(v, f.label || null)
  // "1 Zehe", "3 Zehen"
  const label = f.label === 'Zehen' && v <= 1 ? 'Zehe' : f.label
  return label ? `${n} ${label}` : n
}

export interface Aggregate {
  key: string
  name: string
  qty: string // "1,1 kg", "3", "200 g + 2 EL", or "" when no amount is known
}

/** Adds up the ingredients of all planned recipes by base name and unit family. */
export function aggregate(ingredients: Ingredient[]): Aggregate[] {
  const groups = new Map<string, { name: string; parts: Map<string, { f: Family; v: number }> }>()
  for (const ing of ingredients) {
    const key = nameKey(ing.name)
    if (!key || SKIP.has(key)) continue
    const g = groups.get(key) ?? { name: baseName(ing.name), parts: new Map() }
    groups.set(key, g)
    if (ing.amount === null || ing.amount === 0) continue
    const f = family(ing.unit)
    const id = `${f.kind}:${f.label}`
    const p = g.parts.get(id) ?? { f, v: 0 }
    p.v += toBase(ing.amount, ing.unit)
    g.parts.set(id, p)
  }
  // "Zwiebel" and "Zwiebeln" are one line: plural keys fold into their singular.
  for (const key of [...groups.keys()]) {
    const single = [key.slice(0, -1), key.slice(0, -2)].find((k) => k.length > 2 && k !== key && groups.has(k) && (key.endsWith('n') || key.endsWith('en')))
    if (!single) continue
    const from = groups.get(key)!
    const into = groups.get(single)!
    for (const [id, p] of from.parts) {
      const q = into.parts.get(id) ?? { f: p.f, v: 0 }
      q.v += p.v
      into.parts.set(id, q)
    }
    into.name = from.name // the plural reads right on a shopping list
    groups.delete(key)
  }
  return [...groups.entries()].map(([key, g]) => ({
    key,
    name: g.name,
    qty: [...g.parts.values()].map((p) => formatPart(p.f, p.v)).join(' + '),
  }))
}
