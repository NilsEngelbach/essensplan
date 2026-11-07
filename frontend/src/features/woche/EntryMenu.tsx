import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Trash2 } from 'lucide-react'
import { dayOfMonth, weekdayShort } from '../../lib/format'
import type { PlanEntry } from '../../lib/types'

/**
 * The small menu behind a planned entry: open the recipe, move it to another
 * day of this week (slot kept), or take it out of the plan.
 */
export function EntryMenu({
  entry,
  title,
  days,
  onMove,
  onRemove,
  onClose,
}: {
  entry: PlanEntry
  title: string
  days: string[]
  onMove: (date: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

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
        <Link to={`/rezepte/${entry.recipeId}`} className="emenu__item">
          <BookOpen size={18} strokeWidth={2} aria-hidden="true" />
          Rezept öffnen
        </Link>
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
