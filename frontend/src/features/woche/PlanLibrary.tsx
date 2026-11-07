import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { PenLine, Search, X } from 'lucide-react'
import { LedRamp, Segmented } from '../../components/controls'
import { listRecipes, planPresets, suggestions } from '../../lib/api'
import { minutes, relativePast, weekdayShort } from '../../lib/format'
import { useToast } from '../../components/toast'
import { SLOTS, type PlanEntry, type Recipe, type RecipeHit, type Shelf, type SlotKey } from '../../lib/types'

export const DRAG_TYPE = 'application/x-essensplan'

export type Pick = { recipeId: string } | { note: string }

/**
 * Everything that can fill a day: presets, suggestion shelves with their
 * reason, and the whole collection. One tap picks; nothing opens on top.
 */
export function PlanLibrary({
  weekStart,
  slot,
  onSlot,
  entries,
  version,
  draggable,
  done,
  onPick,
  onFinish,
}: {
  weekStart: string
  slot: SlotKey
  onSlot: (s: SlotKey) => void
  entries: PlanEntry[]
  version: number
  draggable: boolean
  done: boolean
  onPick: (p: Pick) => void
  onFinish: () => void
}) {
  const toast = useToast()
  const [shelves, setShelves] = useState<Shelf[] | null>(null)
  const [failed, setFailed] = useState<{ shelves?: boolean; list?: boolean }>({})
  const [retry, setRetry] = useState(0)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<RecipeHit[] | null>(null)
  const [ownOpen, setOwnOpen] = useState(false)
  const [own, setOwn] = useState('')
  const ownRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    suggestions(weekStart, slot)
      .then((s) => {
        if (!alive) return
        setShelves(s)
        setFailed((f) => ({ ...f, shelves: false }))
      })
      .catch(() => {
        if (!alive) return
        setShelves([])
        setFailed((f) => ({ ...f, shelves: true }))
        toast.show('Vorschläge konnten nicht geladen werden.', { tone: 'error' })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, slot, version, retry])

  useEffect(() => {
    let alive = true
    listRecipes({ q, sort: 'loved' })
      .then((h) => {
        if (!alive) return
        setHits(h)
        setFailed((f) => ({ ...f, list: false }))
      })
      .catch(() => {
        if (!alive) return
        setHits(null)
        setFailed((f) => ({ ...f, list: true }))
        toast.show('Die Rezepte konnten nicht geladen werden.', { tone: 'error' })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, version, retry])

  useEffect(() => {
    if (ownOpen) ownRef.current?.focus()
  }, [ownOpen])

  // Where a recipe already sits in this week, so repeats are visible before they happen.
  const plannedOn = new Map<string, string[]>()
  for (const e of entries) {
    if (!e.recipeId) continue
    plannedOn.set(e.recipeId, [...(plannedOn.get(e.recipeId) ?? []), weekdayShort(e.date)])
  }

  const dragProps = (recipeId: string) =>
    draggable
      ? {
          draggable: true,
          onDragStart: (ev: DragEvent) => {
            ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ recipeId }))
            ev.dataTransfer.effectAllowed = 'copyMove'
          },
        }
      : {}

  const submitOwn = () => {
    const text = own.trim()
    if (!text) return
    onPick({ note: text })
    setOwn('')
    setOwnOpen(false)
  }

  return (
    <div className="library">
      {done && (
        <section className="panel done" aria-live="polite">
          <p className="done__title">
            <span className="led" data-on="true" aria-hidden="true" />
            Woche steht.
          </p>
          <p className="done__text">Für jeden Tag steht etwas fest. Als Nächstes: einkaufen.</p>
          <div className="done__actions">
            <Link to="/einkauf" className="btn">
              Einkaufsliste ansehen
            </Link>
            <button type="button" className="btn btn--quiet" onClick={onFinish}>
              Fertig
            </button>
          </div>
        </section>
      )}

      <Segmented<SlotKey> label="Mahlzeit" hideLabel value={slot} onChange={onSlot} options={SLOTS.map((s) => ({ value: s.key, label: s.short }))} />

      <section className="presets" aria-label="Ohne Rezept eintragen">
        <div className="chips">
          {planPresets().map((p) => (
            <button key={p} type="button" className="chip" onClick={() => onPick({ note: p })}>
              {p}
            </button>
          ))}
          {!ownOpen && (
            <button type="button" className="chip chip--own" onClick={() => setOwnOpen(true)}>
              <PenLine size={15} strokeWidth={2} aria-hidden="true" />
              Eigener Text
            </button>
          )}
        </div>
        {ownOpen && (
          <form
            className="ownform"
            onSubmit={(e) => {
              e.preventDefault()
              submitOwn()
            }}
          >
            <label htmlFor="own-text" className="visually-hidden">
              Eigener Text für diesen Tag
            </label>
            <div className="slot">
              <input
                ref={ownRef}
                id="own-text"
                className="slot__input"
                maxLength={40}
                placeholder="z. B. Grillen bei Jana"
                value={own}
                onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setOwnOpen(false)}
              />
              <button type="button" className="slot__clear" aria-label="Abbrechen" onClick={() => setOwnOpen(false)}>
                <X size={16} strokeWidth={2.25} />
              </button>
            </div>
            <button type="submit" className="btn" disabled={!own.trim()}>
              Eintragen
            </button>
          </form>
        )}
      </section>

      {failed.shelves ? (
        <div className="alert" role="alert">
          <p>Die Vorschläge konnten nicht geladen werden. Prüf die Verbindung.</p>
          <div className="alert__actions">
            <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
              Nochmal versuchen
            </button>
          </div>
        </div>
      ) : shelves === null ? (
        <div className="shelf shelf--skeleton" aria-busy="true" aria-label="Vorschläge werden geladen" />
      ) : (
        shelves.map((s) => (
          <section key={s.key} className="shelf" aria-labelledby={`shelf-${s.key}`}>
            <header className="shelf__head">
              <h2 id={`shelf-${s.key}`} className="shelf__title">
                {s.title}
              </h2>
              <span className="label">{s.reason}</span>
            </header>
            <ul className="shelf__rail">
              {s.recipes.map((r) => (
                <li key={r.id}>
                  <button type="button" className="tile" data-photo={r.imageUrl ? true : undefined} onClick={() => onPick({ recipeId: r.id })} {...dragProps(r.id)}>
                    <span className="tile__media" aria-hidden="true">
                      {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="tile__plate">{r.title}</span>}
                    </span>
                    {r.imageUrl && <span className="tile__title">{r.title}</span>}
                    {!r.imageUrl && <span className="visually-hidden">{r.title}</span>}
                    <span className="tile__meta">
                      <LedRamp rating={r.rating} />
                      <span className="num">{minutes(r.cookingTime)}</span>
                    </span>
                    {s.key === 'langeher' && <span className="tile__why label">zuletzt {relativePast(r.cookingStats.lastCooked)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section className="allrecipes" aria-labelledby="all-h">
        <h2 id="all-h" className="shelf__title">
          Alle Rezepte
        </h2>
        <div className="slot">
          <Search className="slot__icon" size={18} strokeWidth={2} aria-hidden="true" />
          <label htmlFor="plan-search" className="visually-hidden">
            Rezepte zum Planen durchsuchen
          </label>
          <input
            id="plan-search"
            className="slot__input"
            type="search"
            autoComplete="off"
            placeholder="Name oder Zutat"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          />
          {q && (
            <button type="button" className="slot__clear" aria-label="Suche leeren" onClick={() => setQ('')}>
              <X size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
        {failed.list ? (
          <div className="alert" role="alert">
          <p>Die Rezepte konnten nicht geladen werden. Prüf die Verbindung.</p>
          <div className="alert__actions">
            <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
              Nochmal versuchen
            </button>
          </div>
        </div>
        ) : (
          <PickList hits={hits} q={q} plannedOn={plannedOn} onPick={(r) => onPick({ recipeId: r.id })} dragProps={dragProps} />
        )}
      </section>
    </div>
  )
}

function PickList({
  hits,
  q,
  plannedOn,
  onPick,
  dragProps,
}: {
  hits: RecipeHit[] | null
  q: string
  plannedOn: Map<string, string[]>
  onPick: (r: Recipe) => void
  dragProps: (id: string) => object
}) {
  if (hits === null) return <ul className="picklist" aria-busy="true" aria-label="Rezepte werden geladen" />
  if (hits.length === 0) {
    return (
      <p className="picklist__empty">
        Nichts zu „{q}“ gefunden. Trag es als eigenen Text ein oder <Link to="/rezepte/neu">füg das Rezept hinzu</Link>.
      </p>
    )
  }
  return (
    <ul className="picklist">
      {hits.map(({ recipe: r, matchedIngredient }) => {
        const on = plannedOn.get(r.id)
        return (
          <li key={r.id}>
            <button type="button" className="pick" onClick={() => onPick(r)} {...dragProps(r.id)}>
              <span className="pick__text">
                <span className="pick__title">{r.title}</span>
                <span className="pick__meta">
                  <LedRamp rating={r.rating} timesCooked={r.cookingStats.timesCooked} />
                  <span className="entry__last">{r.cookingStats.lastCooked ? `zuletzt ${relativePast(r.cookingStats.lastCooked)}` : 'noch nie gekocht'}</span>
                  {matchedIngredient && <span className="entry__match">mit {matchedIngredient}</span>}
                  {on && <span className="pick__planned">schon am {on.join(', ')}</span>}
                </span>
              </span>
              {r.imageUrl && (
                <span className="pick__thumb" aria-hidden="true">
                  <img src={r.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                </span>
              )}
              <span className="pick__time num">{minutes(r.cookingTime)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
