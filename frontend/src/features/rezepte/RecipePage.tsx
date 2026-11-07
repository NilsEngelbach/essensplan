import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChefHat, ExternalLink, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react'
import { AgentMark, LedRamp, Segmented, ServingsDial } from '../../components/controls'
import { useToast } from '../../components/toast'
import {
  addPlanEntry,
  deleteRecipe,
  agentChangedRecipeIds,
  getRecipe,
  markRecipeSeen,
  planEntriesForRecipe,
  removePlanEntry,
  restorePlanEntry,
  restoreRecipe,
  subscribe,
} from '../../lib/api'
import { addDays, dayLabel, formatAmount, minutes, monthYear, relativePast, todayIso, weekdayLong } from '../../lib/format'
import { SLOTS, type Ingredient, type Recipe, type SlotKey } from '../../lib/types'

const SLOT_KEY = 'essensplan.lastSlot'

function readSlot(): SlotKey {
  try {
    const v = localStorage.getItem(SLOT_KEY) as SlotKey | null
    if (v && SLOTS.some((s) => s.key === v)) return v
  } catch {
    /* ignore */
  }
  return 'lunch'
}

export function RecipePage() {
  const { id = '' } = useParams()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const [version, setVersion] = useState(0)
  const [servings, setServings] = useState(4)
  const navigate = useNavigate()
  const toast = useToast()

  const servingsFor = useRef<string | null>(null)

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  // The agent mark stays for this visit; leaving the recipe counts as seen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agentChanged = useMemo(() => agentChangedRecipeIds().has(id), [id])
  useEffect(() => () => markRecipeSeen(id), [id])
  useEffect(() => {
    getRecipe(id).then((r) => {
      setRecipe(r)
      // Reset the dial only when a different recipe is shown, not on every store change.
      if (r && servingsFor.current !== r.id) {
        servingsFor.current = r.id
        setServings(r.servings ?? 4)
      }
    })
  }, [id, version])

  if (recipe === undefined)
    return (
      <div className="recipe recipe--loading" aria-busy="true" aria-label="Rezept wird geladen">
        <div className="skel skel--photo" />
        <div className="skel skel--title" />
        <div className="skel skel--panel" />
      </div>
    )
  if (recipe === null) {
    return (
      <div className="empty">
        <p className="empty__title">Dieses Rezept gibt es nicht (mehr).</p>
        <Link to="/rezepte" className="btn">
          Zu den Rezepten
        </Link>
      </div>
    )
  }

  const base = recipe.servings ?? 4
  const factor = servings / base

  const onDelete = async () => {
    const snapshot = await deleteRecipe(recipe.id)
    navigate('/rezepte')
    if (snapshot) toast.show(`„${recipe.title}“ gelöscht.`, { undo: () => restoreRecipe(snapshot) })
  }

  return (
    <article className="recipe">
      <div className="recipe__bar">
        <Link to="/rezepte" className="iconbtn iconbtn--text">
          <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
          <span>Rezepte</span>
        </Link>
        <div className="recipe__actions">
          <Link to={`/rezepte/${recipe.id}/bearbeiten`} className="iconbtn" aria-label="Rezept bearbeiten">
            <Pencil size={19} strokeWidth={2} aria-hidden="true" />
          </Link>
          <OverflowMenu onDelete={onDelete} />
        </div>
      </div>

      <header className="recipe__head" data-photo={recipe.imageUrl ? true : undefined}>
        {recipe.imageUrl && (
          <figure className="recipe__photo">
            <img src={recipe.imageUrl} alt={recipe.title} />
          </figure>
        )}
        <div className="recipe__titles">
          <h1 className="recipe__title">{recipe.title}</h1>
          {recipe.description && <p className="recipe__desc">{recipe.description}</p>}
          {agentChanged && (
            <p className="recipe__agent">
              <AgentMark /> <Link to="/konto/aktivitaet">Was hat sich geändert?</Link>
            </p>
          )}
          <Steckbrief recipe={recipe} />
        </div>
      </header>

      <div className="recipe__grid">
        <section className="panel ingredients" aria-labelledby="ing-h">
          <div className="panel__head">
            <h2 id="ing-h" className="panel__title">
              Zutaten
            </h2>
          </div>
          <ServingsDial value={servings} base={base} onChange={setServings} />
          <IngredientList ingredients={recipe.ingredients} factor={factor} />
        </section>

        <div className="recipe__side">
          <PlanPanel recipe={recipe} />

          <section className="steps" aria-labelledby="steps-h">
            <div className="panel__head">
              <h2 id="steps-h" className="panel__title">
                Zubereitung
              </h2>
              <Link to={`/rezepte/${recipe.id}/kochen?portionen=${servings}`} className="btn btn--quiet">
                <ChefHat size={18} strokeWidth={2} aria-hidden="true" />
                Kochen
              </Link>
            </div>
            <ol className="steps__list">
              {recipe.instructions.map((s) => (
                <li key={s.id} className="step">
                  <span className="step__num num" aria-hidden="true">
                    {s.stepNumber}
                  </span>
                  <p className="step__text">{s.description}</p>
                </li>
              ))}
            </ol>
            {recipe.sourceUrl && (
              <a className="source" href={recipe.sourceUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
                Quelle: {new URL(recipe.sourceUrl).hostname.replace(/^www\./, '')}
              </a>
            )}
          </section>
        </div>
      </div>
    </article>
  )
}

function Steckbrief({ recipe }: { recipe: Recipe }) {
  const s = recipe.cookingStats
  return (
    <dl className="steckbrief">
      <div className="steckbrief__item">
        <dt className="label">zeit</dt>
        <dd className="num">{minutes(recipe.cookingTime)}</dd>
      </div>
      <div className="steckbrief__item">
        <dt className="label">gekocht</dt>
        <dd className="num">{s.timesCooked === 0 ? 'noch nie' : `${s.timesCooked}×`}</dd>
      </div>
      <div className="steckbrief__item">
        <dt className="label">zuletzt</dt>
        <dd>{s.lastCooked ? relativePast(s.lastCooked) : '–'}</dd>
      </div>
      <div className="steckbrief__item">
        <dt className="label">bewertung</dt>
        <dd>
          <LedRamp rating={recipe.rating} size="md" />
        </dd>
      </div>
      <div className="steckbrief__item">
        <dt className="label">seit</dt>
        <dd>{monthYear(recipe.createdAt.slice(0, 10))}</dd>
      </div>
      {recipe.difficulty && (
        <div className="steckbrief__item">
          <dt className="label">aufwand</dt>
          <dd>{recipe.difficulty}</dd>
        </div>
      )}
      <div className="steckbrief__item steckbrief__item--wide">
        <dt className="label">einordnung</dt>
        <dd>{[recipe.category, ...recipe.tags].join(' · ')}</dd>
      </div>
    </dl>
  )
}

function IngredientList({ ingredients, factor }: { ingredients: Ingredient[]; factor: number }) {
  const groups = useMemo(() => {
    const map = new Map<string, Ingredient[]>()
    for (const i of ingredients) {
      const k = i.component ?? ''
      map.set(k, [...(map.get(k) ?? []), i])
    }
    return [...map.entries()]
  }, [ingredients])

  return (
    <div className="inglist">
      {groups.map(([group, items]) => (
        <div key={group || 'main'} className="inglist__group">
          {group && <h3 className="inglist__group-title label">{group}</h3>}
          <ul>
            {items.map((i) => {
              const amount = formatAmount(i.amount, i.unit, factor)
              return (
                <li key={i.id} className="ing">
                  <span className="ing__amount num">
                    {/* re-keyed on change so the new value lights up briefly */}
                    <span key={amount} className="ing__value">
                      {amount}
                    </span>
                    {amount && i.unit && <span className="ing__unit"> {i.unit}</span>}
                  </span>
                  <span className="ing__name">
                    {i.name}
                    {i.notes && <span className="ing__note">, {i.notes}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function PlanPanel({ recipe }: { recipe: Recipe }) {
  const [slot, setSlot] = useState<SlotKey>(readSlot)
  const [, force] = useState(0)
  const toast = useToast()
  const today = todayIso()
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i))
  const entries = planEntriesForRecipe(recipe.id)

  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  useEffect(() => {
    try {
      localStorage.setItem(SLOT_KEY, slot)
    } catch {
      /* ignore */
    }
  }, [slot])

  const slotName = (k: SlotKey) => SLOTS.find((s) => s.key === k)?.name ?? k

  const plan = (date: string) => {
    const entry = addPlanEntry({ date, slot, recipeId: recipe.id })
    toast.show(`Für ${dayLabel(date) === 'Heute' || dayLabel(date) === 'Morgen' ? dayLabel(date).toLowerCase() : weekdayLong(date)}, ${slotName(slot)} geplant.`, {
      undo: () => removePlanEntry(entry.id),
    })
  }

  return (
    <section className="panel plan" aria-labelledby="plan-h">
      <div className="panel__head">
        <h2 id="plan-h" className="panel__title">
          In den Plan
        </h2>
      </div>
      <Segmented<SlotKey> label="Mahlzeit" hideLabel value={slot} onChange={setSlot} options={SLOTS.map((s) => ({ value: s.key, label: s.short }))} />
      <div className="days" role="group" aria-label="Tag wählen, um zu planen">
        {days.map((d) => {
          const planned = entries.some((e) => e.date === d && e.slot === slot)
          return (
            <button key={d} type="button" className="day" data-planned={planned || undefined} onClick={() => plan(d)}>
              <span className="day__led" aria-hidden="true" />
              <span className="day__name">{dayLabel(d, today)}</span>
              <span className="visually-hidden">{planned ? ' (schon geplant)' : ''}</span>
            </button>
          )
        })}
      </div>
      {entries.length > 0 && (
        <ul className="planned">
          {entries.map((e) => (
            <li key={e.id} className="planned__item">
              <span className="led" data-on="true" aria-hidden="true" />
              <span>
                {dayLabel(e.date, today)} · {slotName(e.slot)}
              </span>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label={`Aus dem Plan nehmen: ${dayLabel(e.date, today)}, ${slotName(e.slot)}`}
                onClick={() => {
                  const removed = removePlanEntry(e.id)
                  if (removed) toast.show('Aus dem Plan genommen.', { undo: () => restorePlanEntry(removed) })
                }}
              >
                <X size={16} strokeWidth={2.25} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function OverflowMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div className="overflow" ref={ref}>
      <button type="button" className="iconbtn" aria-label="Weitere Aktionen" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={20} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && (
        <div className="overflow__menu" role="menu">
          <button type="button" role="menuitem" className="overflow__item overflow__item--danger" onClick={onDelete}>
            <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
            Rezept löschen
          </button>
        </div>
      )}
    </div>
  )
}
