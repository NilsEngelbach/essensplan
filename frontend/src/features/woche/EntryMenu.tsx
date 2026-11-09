import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Minus, Plus, Trash2 } from 'lucide-react'
import { entryServings } from '../../lib/api'
import { dayOfMonth, weekdayShort } from '../../lib/format'
import { MAX_SERVINGS, MIN_SERVINGS, type PlanEntry } from '../../lib/types'

/**
 * The small menu behind a planned entry: open the recipe, cook it for other
 * servings (D24), move it to another day of this week (slot kept), or take
 * it out of the plan.
 */
export function EntryMenu({
  entry,
  title,
  days,
  onMove,
  onServings,
  onRemove,
  onClose,
}: {
  entry: PlanEntry
  title: string
  days: string[]
  onMove: (date: string) => void
  onServings: (servings: number) => void
  onRemove: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { servings: initial, own } = entryServings(entry)
  // Local, so quick taps count up at once while the writes queue behind.
  const [servings, setServings] = useState(initial)
  const step = (n: number) => {
    setServings(n)
    onServings(n)
  }

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node
      // The trigger toggles the menu itself; ignore it here.
      if (!ref.current?.contains(t) && !(t instanceof Element && t.closest(`[data-menu-for="${entry.id}"]`))) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [entry.id, onClose])

  return (
    <div className="emenu" ref={ref} role="group" aria-label={`${title}: Aktionen`}>
      {entry.recipeId && (
        <Link to={`/rezepte/${entry.recipeId}${servings !== own ? `?portionen=${servings}` : ''}`} className="emenu__item">
          <BookOpen size={18} strokeWidth={2} aria-hidden="true" />
          Rezept öffnen
        </Link>
      )}
      {entry.recipeId && (
        <div className="emenu__servings" role="group" aria-labelledby={`serv-${entry.id}`}>
          <span id={`serv-${entry.id}`} className="label">
            Portionen
          </span>
          {servings !== own && (
            <button type="button" className="textbtn emenu__reset" aria-label={`Zurück auf ${own} Portionen wie im Rezept`} onClick={() => step(own)}>
              zurück auf {own}
            </button>
          )}
          <div className="cook__servings">
            <button type="button" className="iconbtn" aria-label="Eine Portion weniger" disabled={servings <= MIN_SERVINGS} onClick={() => step(servings - 1)}>
              <Minus size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <span className="cook__portions" aria-live="polite">
              <span className="num">{servings}</span> <span className="label">Port.</span>
            </span>
            <button type="button" className="iconbtn" aria-label="Eine Portion mehr" disabled={servings >= MAX_SERVINGS} onClick={() => step(servings + 1)}>
              <Plus size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
      <div className="emenu__move" role="group" aria-labelledby={`move-${entry.id}`}>
        <span id={`move-${entry.id}`} className="label">
          Verschieben auf
        </span>
        <div className="emenu__days">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              className="emenu__day"
              disabled={d === entry.date}
              aria-label={`Auf ${weekdayShort(d)} ${dayOfMonth(d)}. verschieben`}
              onClick={() => onMove(d)}
            >
              <span>{weekdayShort(d)}</span>
              <span className="num">{dayOfMonth(d)}</span>
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="emenu__item emenu__item--danger" onClick={onRemove}>
        <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
        Aus dem Plan nehmen
      </button>
    </div>
  )
}
