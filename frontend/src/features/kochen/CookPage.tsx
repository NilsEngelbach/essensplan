import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import { getRecipe } from '../../lib/api'
import { stepIngredients } from '../../lib/cooking'
import { formatAmount } from '../../lib/format'
import type { Ingredient, Recipe } from '../../lib/types'

const GUARD_MS = 350

type Wake = 'pending' | 'on' | 'off' | 'unsupported'

/** Keeps the screen on while cooking, and re-acquires it when the tab comes back. */
function useWakeLock(): Wake {
  const [state, setState] = useState<Wake>('pending')
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener: (e: 'release', f: () => void) => void }> } }).wakeLock
    if (!wl) {
      setState('unsupported')
      return
    }
    let sentinel: { release: () => Promise<void> } | null = null
    let alive = true
    const acquire = async () => {
      try {
        const s = await wl.request('screen')
        if (!alive) return void s.release()
        sentinel = s
        setState('on')
        s.addEventListener('release', () => alive && setState('off'))
      } catch {
        setState('off')
      }
    }
    const onVisible = () => document.visibilityState === 'visible' && acquire()
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [])
  return state
}

function Amount({ ing, factor }: { ing: Ingredient; factor: number }) {
  const a = formatAmount(ing.amount, ing.unit, factor)
  return (
    <span className="cook__qty num">
      {a}
      {a && ing.unit && <span className="cook__unit"> {ing.unit}</span>}
    </span>
  )
}

/**
 * Kochmodus: the recipe as an appliance program. One screen at a time,
 * readable from across the counter; a knuckle anywhere moves it on.
 */
export function CookPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined)
  const wake = useWakeLock()

  useEffect(() => {
    getRecipe(id).then(setRecipe)
  }, [id])

  const base = recipe?.servings ?? 4
  const servings = Math.min(12, Math.max(1, Number(params.get('portionen')) || base))
  const factor = servings / base
  const steps = recipe?.instructions ?? []
  const last = steps.length + 1 // 0 = Zutaten, 1..n = steps, n+1 = Fertig
  const index = Math.min(last, Math.max(0, Number(params.get('schritt')) || 0))

  // Position and servings live in the URL: a reload or a locked screen never loses the place.
  const set = useCallback(
    (patch: { schritt?: number; portionen?: number }) => {
      const next = new URLSearchParams(params)
      if (patch.schritt !== undefined) next.set('schritt', String(patch.schritt))
      if (patch.portionen !== undefined) next.set('portionen', String(patch.portionen))
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const lastNav = useRef(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const go = useCallback(
    (delta: number) => {
      const now = performance.now()
      if (now - lastNav.current < GUARD_MS) return
      const target = index + delta
      if (target < 0 || target > last) return
      lastNav.current = now
      setDir(delta > 0 ? 'next' : 'prev')
      set({ schritt: target })
    },
    [index, last, set],
  )

  const backToRecipe = `/rezepte/${id}`

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (/input|textarea|select/i.test(t.tagName)) return
      // Space/Enter on a real control (link, button, details) belongs to that control.
      const onControl = (e.key === ' ' || e.key === 'Enter') && !!t.closest('a, button, summary')
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key) && !onControl) {
        e.preventDefault()
        go(1)
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        go(-1)
      } else if (e.key === 'Escape') navigate(backToRecipe)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, navigate, backToRecipe])

  // Swipe: a clear horizontal move turns the page and swallows the click that follows.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
  const onPointerDown = (e: ReactPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY }
    swallowClick.current = false
  }
  const onPointerUp = (e: ReactPointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swallowClick.current = true
      go(dx < 0 ? 1 : -1)
    }
  }
  const zoneClick = (delta: number) => () => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    go(delta)
  }

  if (recipe === undefined) {
    return (
      <div className="cook" aria-busy="true" aria-label="Rezept wird geladen">
        <div className="cook__bar" />
        <div className="cook__stage">
          <div className="skel skel--title" />
          <div className="skel skel--panel" />
        </div>
      </div>
    )
  }
  if (recipe === null) {
    return (
      <div className="cook">
        <div className="empty cook__missing">
          <p className="empty__title">Dieses Rezept gibt es nicht (mehr).</p>
          <Link to="/rezepte" className="btn">
            Zu den Rezepten
          </Link>
        </div>
      </div>
    )
  }

  const groups = new Map<string, Ingredient[]>()
  for (const ing of recipe.ingredients) groups.set(ing.component ?? '', [...(groups.get(ing.component ?? '') ?? []), ing])
  const step = index >= 1 && index <= steps.length ? steps[index - 1] : null
  const uses = step ? stepIngredients(step.description, recipe.ingredients) : []
  const size = step ? (step.description.length > 260 ? 's' : step.description.length > 150 ? 'm' : 'l') : 'l'

  const usesIds = new Set(uses.map((u) => u.id))
  const allIngredients = (
    <div className="cook__all">
      {[...groups.entries()].map(([component, list]) => (
        <section key={component} className="cook__group">
          {component && <h3 className="label cook__component">{component}</h3>}
          <ul className="cook__list">
            {list.map((ing) => (
              <li key={ing.id} className="cook__ing" data-uses={usesIds.has(ing.id) || undefined}>
                <Amount ing={ing} factor={factor} />
                <span>
                  {ing.name}
                  {ing.notes && <span className="cook__note">, {ing.notes}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )

  return (
    <div className="cook">
      <p className="visually-hidden" aria-live="polite">
        {index === 0 ? `Zutaten für ${servings} Portionen` : step ? `Schritt ${index} von ${steps.length}: ${step.description}` : 'Fertig. Guten Appetit!'}
      </p>
      <div className="cook__head">
      <header className="cook__bar">
        <Link to={`${backToRecipe}`} className="iconbtn" aria-label="Kochmodus beenden">
          <X size={24} strokeWidth={2} aria-hidden="true" />
        </Link>
        <span className="cook__title">{recipe.title}</span>
        <div className="cook__servings" role="group" aria-label="Portionen">
          <button type="button" className="iconbtn" aria-label="Eine Portion weniger" disabled={servings <= 1} onClick={() => set({ portionen: servings - 1 })}>
            <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
          <span className="cook__portions" aria-live="polite">
            <span className="num">{servings}</span> <span className="label">Port.</span>
          </span>
          <button type="button" className="iconbtn" aria-label="Eine Portion mehr" disabled={servings >= 12} onClick={() => set({ portionen: servings + 1 })}>
            <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        </div>
        {wake !== 'pending' && (
          <span className="cook__wake" data-state={wake} title={wake === 'on' ? 'Bildschirm bleibt an' : 'Bildschirm kann ausgehen'}>
            <span className="cook__wake-window" aria-hidden="true">
              <span className="cook__wake-led" />
            </span>
            <span className="cook__wake-text">{wake === 'on' ? 'Bildschirm bleibt an' : 'Bildschirm kann ausgehen'}</span>
          </span>
        )}
      </header>
      {(wake === 'off' || wake === 'unsupported') && <p className="label cook__wakehint">Bildschirm kann ausgehen</p>}

      <ol className="cook__leds" aria-label={index === last ? 'Programm beendet' : `Schritt ${Math.min(index, steps.length)} von ${steps.length}`}>
        {Array.from({ length: last + 1 }, (_, i) => (
          // At the end the whole row is lit: the program is done, no pointer.
          <li key={i} className="cook__led" data-state={index === last || i < index ? 'done' : i === index ? 'current' : 'off'} />
        ))}
      </ol>
      </div>

      <main className="cook__stage" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <div className="cook__screen" key={index} data-dir={dir}>
          {index === 0 && (
            <div className="cook__intro">
              <h1 className="cook__heading">Zutaten</h1>
              <p className="label">für {servings} {servings === 1 ? 'Portion' : 'Portionen'}</p>
              {allIngredients}
              {steps.length === 0 && <p className="cook__nosteps">Für dieses Rezept sind keine Schritte notiert.</p>}
            </div>
          )}

          {step && (
            <div className="cook__step">
              <div className="cook__main">
                <p className="cook__count">
                  <span className="cook__num num">{index}</span>
                  <span className="label"> von {steps.length}</span>
                </p>
                <p className="cook__text" data-size={size}>
                  {step.description}
                </p>
              </div>
              <aside className="cook__side">
                {uses.length > 0 && (
                  <section className="panel cook__uses" aria-label="Für diesen Schritt">
                    <h2 className="cook__uses-title">Für diesen Schritt</h2>
                    <ul className="cook__list">
                      {uses.map((ing) => (
                        <li key={ing.id} className="cook__ing">
                          <Amount ing={ing} factor={factor} />
                          <span>{ing.name}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <details className="cook__more">
                  <summary>Alle Zutaten</summary>
                  {allIngredients}
                </details>
                <section className="cook__sideall" aria-label="Alle Zutaten">
                  <h2 className="cook__uses-title">Alle Zutaten</h2>
                  {allIngredients}
                </section>
              </aside>
            </div>
          )}

          {index === last && (
            <div className="cook__end">
              <p className="cook__heading">Fertig. Guten Appetit!</p>
              <div className="cook__end-actions">
                <Link to={backToRecipe} className="btn btn--primary btn--lg">
                  Zurück zum Rezept
                </Link>
                <button type="button" className="textbtn" onClick={() => set({ schritt: 0 })}>
                  Nochmal von vorn
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Whole-screen zones for knuckles; keyboard and screen readers use the buttons below. */}
        {index > 0 && <button type="button" className="cook__zone cook__zone--prev" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} onClick={zoneClick(-1)} />}
        {index < last && <button type="button" className="cook__zone cook__zone--next" tabIndex={-1} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} data-full={index === 0 || undefined} onClick={zoneClick(1)} />}
      </main>

      <footer className="cook__hint">
        {index > 0 ? (
          <button type="button" className="cook__nav" onClick={() => go(-1)}>
            <ChevronLeft size={18} strokeWidth={2.25} aria-hidden="true" />
            zurück
          </button>
        ) : (
          <span />
        )}
        {index < last && (
          <button type="button" className="cook__nav" onClick={() => go(1)}>
            {index === 0 ? 'Los geht’s' : 'weiter'}
            <ChevronRight size={18} strokeWidth={2.25} aria-hidden="true" />
          </button>
        )}
      </footer>
    </div>
  )
}
