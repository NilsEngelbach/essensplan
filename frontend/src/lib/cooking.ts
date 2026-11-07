// Which ingredients a step uses. The backend will store this per step
// (instructions.ingredient_ids, filled by the AI import); until then it is
// derived from the step text.
import type { Ingredient } from './types'

const norm = (s: string) => s.toLocaleLowerCase('de-DE')

function words(text: string): string[] {
  return norm(text)
    .split(/[^a-zäöüß]+/)
    .filter((w) => w.length >= 4)
}

/** "Zwiebeln" → "zwiebel", "Tomaten" → "tomat": enough to match singular and plural. */
function stem(w: string): string {
  return w.replace(/(en|n|e)$/, '')
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * An ingredient belongs to a step when the step names it: the whole base name
 * ("Knoblauch"), its stem ("Zwiebeln"/"Zwiebel"), or the tail of a compound
 * ("Hack" for Rinderhack, "Mehl" for Dinkelmehl).
 */
export function stepIngredients(step: string, ingredients: Ingredient[]): Ingredient[] {
  const ws = words(step)
  const text = norm(step)
  // "Öl" is short but unambiguous; it stands for Olivenöl, Rapsöl …
  const saysOil = /(^|[^a-zäöüß])öl([^a-zäöüß]|$)/.test(text)
  return ingredients.filter((ing) => {
    const key = norm(ing.name.split(',')[0].trim())
    if (key.length < 3) return false
    // A whole word with its German endings: "Knoblauch" must not light "Lauch",
    // "Kreis" not "Reis", "Tomatenmark" not "Tomaten".
    if (new RegExp(`(^|[^a-zäöüß])${escape(stem(key))}(en|n|e|s)?([^a-zäöüß]|$)`).test(text)) return true
    const tail = key.split(' ').pop() ?? key
    if (saysOil && tail.endsWith('öl')) return true
    return ws.some((w) => {
      const s = stem(w)
      return s.length >= 4 && (stem(tail) === s || tail.endsWith(s) || tail.endsWith(w))
    })
  })
}
