import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { AgentMark, LedRamp, Rocker, useMediaQuery } from '../../components/controls'
import { agentChangedRecipeIds, listRecipes, recipeCount, subscribe } from '../../lib/api'
import { minutes, relativePast } from '../../lib/format'
import { CATEGORIES, TAGS, type Category, type RecipeHit, type SortKey, type Tag } from '../../lib/types'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'loved', label: 'Am liebsten' },
  { value: 'lastCooked', label: 'Am längsten her' },
  { value: 'time', label: 'Am schnellsten' },
  { value: 'newest', label: 'Zuletzt hinzugefügt' },
  { value: 'title', label: 'A–Z' },
]

function useFilters() {
  const [params, setParams] = useSearchParams()
  const get = (k: string) => params.get(k)
  const filters = {
    q: get('q') ?? '',
    favourites: get('lieblinge') === '1',
    quick: get('schnell') === '1',
    notCookedSince: get('langeher') === '1',
    category: (get('kategorie') as Category | null) ?? null,
    tags: (params.getAll('tag') as Tag[]) ?? [],
    sort: (get('sort') as SortKey | null) ?? 'loved',
  }
  const update = (patch: Record<string, string | string[] | null | boolean>) => {
    const next = new URLSearchParams(params)
    next.delete('suche')
    for (const [k, v] of Object.entries(patch)) {
      next.delete(k)
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
      else if (v === true) next.set(k, '1')
      else if (v && v !== 'loved') next.set(k, v)
    }
    setParams(next, { replace: true })
  }
  return { filters, update, wantsSearchFocus: params.get('suche') === '1' }
}

export function RecipeListPage() {
  const { filters, update, wantsSearchFocus } = useFilters()
  const [hits, setHits] = useState<RecipeHit[] | null>(null)
  const [version, setVersion] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  const wide = useMediaQuery('(min-width: 1024px)')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  useEffect(() => {
    if (wantsSearchFocus) searchRef.current?.focus()
  }, [wantsSearchFocus])

  const key = JSON.stringify(filters)
  useEffect(() => {
    let alive = true
    listRecipes(filters).then((h) => alive && setHits(h))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])

  const total = recipeCount()
  const extraCount = (filters.category ? 1 : 0) + filters.tags.length + (filters.sort !== 'loved' ? 1 : 0)
  const switchesOn = filters.favourites || filters.quick || filters.notCookedSince
  const anyFilter = switchesOn || extraCount > 0 || filters.q !== ''

  const resetAll = () =>
    update({ q: null, lieblinge: null, schnell: null, langeher: null, kategorie: null, tag: [], sort: null })

  const panel = (
    <FilterPanel
      category={filters.category}
      tags={filters.tags}
      sort={filters.sort}
      onCategory={(c) => update({ kategorie: c })}
      onTags={(t) => update({ tag: t })}
      onSort={(s) => update({ sort: s })}
      onReset={anyFilter ? resetAll : undefined}
    />
  )

  return (
    <div className="recipes">
      <header className="pagehead">
        <h1 className="pagehead__title">Rezepte</h1>
        <span className="readout num" aria-live="polite">
          {hits === null ? '…' : anyFilter ? `${hits.length} von ${total}` : `${total} Rezepte`}
        </span>
      </header>

      <section className="controls" aria-label="Suchen und filtern">
        <div className="slot">
          <Search className="slot__icon" size={18} strokeWidth={2} aria-hidden="true" />
          <label htmlFor="recipe-search" className="visually-hidden">
            Rezepte durchsuchen
          </label>
          <input
            ref={searchRef}
            id="recipe-search"
            className="slot__input"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Name oder Zutat"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
            onKeyDown={(e) => e.key === 'Escape' && update({ q: null })}
          />
          {filters.q && (
            <button type="button" className="slot__clear" aria-label="Suche leeren" onClick={() => update({ q: null })}>
              <X size={16} strokeWidth={2.25} />
            </button>
          )}
          {wide && !filters.q && <kbd className="slot__kbd">/</kbd>}
        </div>
        <div className="rockers">
          <Rocker label="Lieblinge" description="Bewertung ab 4" checked={filters.favourites} onChange={(v) => update({ lieblinge: v })} />
          <Rocker label="Schnell" description="bis 30 Minuten" checked={filters.quick} onChange={(v) => update({ schnell: v })} />
          <Rocker label="Lange her" description="seit 6 Wochen nicht gekocht" checked={filters.notCookedSince} onChange={(v) => update({ langeher: v })} />
          {!wide && (
            <button type="button" className="morebtn" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <SlidersHorizontal size={18} strokeWidth={2} aria-hidden="true" />
              <span className="morebtn__text">Mehr</span>
              {extraCount > 0 && <span className="morebtn__count num">{extraCount}</span>}
            </button>
          )}
        </div>
        {!wide && moreOpen && <div className="controls__more">{panel}</div>}
      </section>

      <div className="recipes__body">
        {wide && <aside className="recipes__aside">{panel}</aside>}
        <RecipeResults hits={hits} q={filters.q} onReset={resetAll} switchesOn={switchesOn} total={total} agentIds={agentChangedRecipeIds()} />
      </div>
    </div>
  )
}

function FilterPanel(props: {
  category: Category | null
  tags: Tag[]
  sort: SortKey
  onCategory: (c: Category | null) => void
  onTags: (t: Tag[]) => void
  onSort: (s: SortKey) => void
  onReset?: () => void
}) {
  const toggleTag = (t: Tag) => props.onTags(props.tags.includes(t) ? props.tags.filter((x) => x !== t) : [...props.tags, t])
  return (
    <div className="filters">
      <fieldset className="filters__group">
        <legend className="label">sortierung</legend>
        <div className="chips">
          {SORTS.map((s) => (
            <button key={s.value} type="button" className="chip" aria-pressed={props.sort === s.value} onClick={() => props.onSort(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="filters__group">
        <legend className="label">kategorie</legend>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={props.category === null} onClick={() => props.onCategory(null)}>
            Alle
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={props.category === c} onClick={() => props.onCategory(props.category === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="filters__group">
        <legend className="label">merkmale</legend>
        <div className="chips">
          {TAGS.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={props.tags.includes(t)} onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
        </div>
      </fieldset>
      {props.onReset && (
        <button type="button" className="textbtn" onClick={props.onReset}>
          Alles zurücksetzen
        </button>
      )}
    </div>
  )
}

function RecipeResults({
  hits,
  q,
  onReset,
  switchesOn,
  total,
  agentIds,
}: {
  hits: RecipeHit[] | null
  q: string
  onReset: () => void
  switchesOn: boolean
  total: number
  agentIds: Set<string>
}) {
  const skeleton = useMemo(() => Array.from({ length: 6 }, (_, i) => i), [])
  if (hits === null) {
    return (
      <ul className="results" aria-busy="true" aria-label="Rezepte werden geladen">
        {skeleton.map((i) => (
          <li key={i} className="entry entry--skeleton" />
        ))}
      </ul>
    )
  }
  if (total === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Noch keine Rezepte.</p>
        <p className="empty__text">Füge dein erstes hinzu: Link einfügen oder Foto aus dem Kochbuch, den Rest erledigt die KI.</p>
        <Link to="/rezepte/neu" className="btn btn--primary">
          Rezept hinzufügen
        </Link>
      </div>
    )
  }
  if (hits.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">{q ? `Nichts zu „${q}“ gefunden.` : 'Nichts passt zu diesen Schaltern.'}</p>
        <p className="empty__text">{switchesOn ? 'Schalte einen Filter aus oder setze alles zurück.' : 'Probier einen anderen Namen oder eine Zutat.'}</p>
        <button type="button" className="btn" onClick={onReset}>
          Alles zurücksetzen
        </button>
      </div>
    )
  }
  return (
    <ul className="results">
      {hits.map(({ recipe: r, matchedIngredient }) => (
        <li key={r.id} className="entry" data-photo={r.imageUrl ? true : undefined}>
          <Link to={`/rezepte/${r.id}`} className="entry__link">
            <span className="entry__media" aria-hidden="true">
              {r.imageUrl ? (
                <img src={r.imageUrl} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="entry__plate">
                  <span className="entry__plate-title">{r.title}</span>
                </span>
              )}
            </span>
            <span className="entry__text">
              <span className="entry__title">{r.title}</span>
              <span className="entry__meta">
                <LedRamp rating={r.rating} timesCooked={r.cookingStats.timesCooked} />
                <span className="entry__last">
                  {r.cookingStats.lastCooked ? `zuletzt ${relativePast(r.cookingStats.lastCooked)}` : 'noch nie gekocht'}
                </span>
                {matchedIngredient && <span className="entry__match">mit {matchedIngredient}</span>}
                {agentIds.has(r.id) && <AgentMark />}
              </span>
            </span>
            <span className="entry__time num">{minutes(r.cookingTime)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
