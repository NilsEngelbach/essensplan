import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Plus } from 'lucide-react'
import { useMediaQuery } from '../../components/controls'
import { useToast } from '../../components/toast'
import {
  addManualItem,
  allShopped,
  completeTrip,
  getShoppingList,
  plannedDishes,
  markLinesSeen,
  plannedShopDays,
  recentManualNames,
  removeManualItem,
  reopenTrip,
  restoreManualItem,
  setLineAtHome,
  setLineChecked,
  setLineSection,
  setTripDays,
  shoppedDays,
  subscribe,
} from '../../lib/api'
import { addDays, dayOfMonth, todayIso, weekdayLong, weekdayShort } from '../../lib/format'
import { SECTIONS } from '../../lib/shopping'
import type { ShoppingLine, ShoppingList } from '../../lib/types'

const SHORT: Record<string, string> = {
  'Obst & Gemüse': 'Obst',
  'Brot & Backwaren': 'Brot',
  Kühlung: 'Kühlung',
  'Fleisch & Fisch': 'Fleisch',
  Tiefkühl: 'TK',
  Trockenware: 'Trocken',
  'Konserven & Saucen': 'Konserven',
  'Gewürze & Öl': 'Gewürze',
  'Süßes & Snacks': 'Süßes',
  Getränke: 'Getränke',
  'Drogerie & Haushalt': 'Drogerie',
  Sonstiges: 'Sonstiges',
}

const done = (l: ShoppingLine) => l.checked || l.atHome
const sectionId = (s: string) => `abschnitt-${s.replace(/[^a-zäöüß]+/gi, '-').toLowerCase()}`

/**
 * While a finished section collapses, keep the next section's rule exactly
 * where it was on screen, so what is under the thumb stays put.
 */
function holdNextRule(section: string) {
  const sec = document.getElementById(sectionId(section))
  const next = sec?.nextElementSibling?.querySelector<HTMLElement>('.slip__rule') ?? sec?.parentElement?.querySelector<HTMLElement>('.additem')
  if (!next) return
  const target = next.getBoundingClientRect().top
  const end = performance.now() + 460
  const step = () => {
    const delta = next.getBoundingClientRect().top - target
    if (Math.abs(delta) >= 1) window.scrollBy(0, delta)
    if (performance.now() < end) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

const dayShort = (d: string) => `${weekdayShort(d)} ${dayOfMonth(d)}.`

/**
 * "Sa 7.–Fr 13. · 6 Tage" only when no planned day in between is left out;
 * otherwise the days themselves ("Sa 7., Do 12. · 2 Tage").
 */
function daysText(days: string[], planned: Set<string>): string {
  if (days.length === 0) return 'Keine Tage gewählt'
  const count = `${days.length} ${days.length === 1 ? 'Tag' : 'Tage'}`
  const first = days[0]
  const last = days[days.length - 1]
  if (days.length === 1) return `${dayShort(first)} · ${count}`
  const chosen = new Set(days)
  let gapless = true
  for (let d = first; d <= last; d = addDays(d, 1)) if (!chosen.has(d) && planned.has(d)) gapless = false
  if (gapless) return `${dayShort(first)}–${dayShort(last)} · ${count}`
  if (days.length <= 3) return `${days.map(dayShort).join(', ')} · ${count}`
  return `${dayShort(first)} … ${dayShort(last)} · ${count}`
}

/**
 * Einkauf: the appliance prints the shopping slip. Sections in the store's
 * order, lines struck through in place, own items at the end.
 */
export function ShoppingPage() {
  const toast = useToast()
  const wide = useMediaQuery('(min-width: 1024px)')
  const [list, setList] = useState<ShoppingList | null>(null)
  const [error, setError] = useState(false)
  const [version, setVersion] = useState(0)
  const [retry, setRetry] = useState(0)
  const [daysOpen, setDaysOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // A finished section folds only after its last strike has played.
  const [foldReady, setFoldReady] = useState<Set<string> | null>(null)
  const [foldMotion, setFoldMotion] = useState(false)
  // Sections mid-animation clip their lines; open sections do not (menus must escape).
  const [clipping, setClipping] = useState<Set<string>>(new Set())
  // Clip while a section animates; the timeout also covers reduced motion, where no transitionend fires.
  const clip = (sections: string[]) => {
    if (!sections.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setClipping((c) => new Set([...c, ...sections]))
    window.setTimeout(() => setClipping((c) => new Set([...c].filter((s) => !sections.includes(s)))), 420)
  }
  const routeRef = useRef<HTMLOListElement>(null)
  const [routeOverflow, setRouteOverflow] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [pageMenu, setPageMenu] = useState(false)

  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  useEffect(() => {
    let alive = true
    getShoppingList()
      .then((l) => {
        if (!alive) return
        setList(l)
        setError(false)
      })
      .catch(() => {
        if (!alive) return
        setError(true)
        toast.show('Die Einkaufsliste konnte nicht geladen werden.', { tone: 'error' })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, retry])

  // Lines printed since the last visit keep their "neu" mark for this visit only.
  const shownKeys = useRef<string[]>([])
  shownKeys.current = list?.sections.flatMap((s) => s.lines.map((l) => l.key)) ?? []
  useEffect(() => () => markLinesSeen(shownKeys.current), [])

  const lines = list?.sections.flatMap((s) => s.lines) ?? []
  const open = lines.filter((l) => !done(l))
  const allDone = lines.length > 0 && open.length === 0
  const current = list?.sections.find((s) => s.lines.some((l) => !done(l)))?.section ?? null
  const hasPlanned = lines.some((l) => !l.manualId)
  const finishedKey = (list?.sections ?? []).filter((s) => s.lines.every(done)).map((s) => s.section).join('|')

  useEffect(() => {
    if (!list) return
    const finished = new Set(finishedKey ? finishedKey.split('|') : [])
    // Sections already finished on arrival are folded at once, without motion.
    if (foldReady === null) {
      setFoldReady(finished)
      const id = window.setTimeout(() => setFoldMotion(true), 50)
      return () => window.clearTimeout(id)
    }
    const gone = [...foldReady].filter((s) => !finished.has(s))
    if (gone.length) {
      clip(gone)
      setFoldReady((r) => new Set([...(r ?? [])].filter((s) => finished.has(s))))
      setExpanded((e) => new Set([...e].filter((s) => finished.has(s))))
    }
    const fresh = [...finished].filter((s) => !foldReady.has(s))
    if (!fresh.length) return
    const id = window.setTimeout(() => {
      holdNextRule(fresh[fresh.length - 1])
      setFoldReady((r) => new Set([...(r ?? []), ...fresh]))
    }, 520)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey, list === null])

  // The rail follows you through the store: the current station stays in view.
  useEffect(() => {
    const el = routeRef.current
    if (!el) return
    setRouteOverflow(el.scrollWidth > el.clientWidth + 1)
    el.querySelector<HTMLElement>('[aria-current="step"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [current, list?.sections.length])

  const finish = () => {
    setPageMenu(false)
    const snapshot = completeTrip()
    if (!snapshot) return
    const n = snapshot.trip.days.length
    toast.show(n ? `Einkauf abgeschlossen: ${n} ${n === 1 ? 'Tag' : 'Tage'} erledigt.` : 'Einkauf abgeschlossen.', { undo: () => reopenTrip(snapshot) })
    setExpanded(new Set())
  }

  const tap = (l: ShoppingLine) => {
    if (!l.atHome) setLineChecked(l.key, !l.checked)
  }

  const daysPanel = list && <DayList selected={list.trip.days} />

  return (
    <div className="shop">
      <header className="pagehead shop__head">
        <h1 className="pagehead__title">Einkauf</h1>
        <div className="overflow">
          <button type="button" className="iconbtn" aria-label="Weitere Aktionen" aria-expanded={pageMenu} onClick={() => setPageMenu((o) => !o)}>
            <MoreHorizontal size={22} strokeWidth={2} aria-hidden="true" />
          </button>
          {pageMenu && (
            <div className="overflow__menu" role="menu">
              <Link to="/konto#laden" role="menuitem" className="overflow__item">
                Mein Laden: Reihenfolge
              </Link>
              <button type="button" role="menuitem" className="overflow__item" onClick={finish}>
                Einkauf abschließen
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="shop__layout">
        <aside className="shop__controls">
          <div className="shop__days">
            {!(list && list.trip.days.length === 0 && allShopped()) && <span className="readout num">{list ? daysText(list.trip.days, new Set(plannedShopDays())) : '…'}</span>}
            {!wide && (
              <button type="button" className="textbtn" aria-expanded={daysOpen} onClick={() => setDaysOpen((o) => !o)}>
                {daysOpen ? 'Fertig' : 'Tage ändern'}
              </button>
            )}
          </div>
          {(wide || daysOpen) && daysPanel}
          {wide && (
            <Link to="/konto#laden" className="textbtn shop__store">
              Mein Laden: Reihenfolge
            </Link>
          )}
        </aside>

        <div className="shop__main">
          {error && (
            <div className="alert" role="alert">
              <p>Die Einkaufsliste konnte nicht geladen werden. Prüf die Verbindung.</p>
              <div className="alert__actions">
                <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
                  Nochmal versuchen
                </button>
              </div>
            </div>
          )}

          {!error && list === null && <div className="slip slip--skeleton" aria-busy="true" aria-label="Einkaufsliste wird geladen" />}

          {list && (
            <>
              {list.sections.length > 0 && (
                <ol className="route" ref={routeRef} data-overflow={routeOverflow || undefined} aria-label="Abschnitte in Ladenreihenfolge">
                  {list.sections.map((s) => {
                    const finished = s.lines.every(done)
                    return (
                      <li key={s.section}>
                        <a
                          href={`#${sectionId(s.section)}`}
                          className="route__stop"
                          data-done={finished || undefined}
                          aria-current={s.section === current ? 'step' : undefined}
                          onClick={(e) => {
                            e.preventDefault()
                            document.getElementById(sectionId(s.section))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }}
                        >
                          <span className="route__led" aria-hidden="true" />
                          <span className="route__name">{SHORT[s.section] ?? s.section}</span>
                          {finished && <span className="visually-hidden"> (erledigt)</span>}
                        </a>
                      </li>
                    )
                  })}
                </ol>
              )}

              <div className="slip" data-motion={foldMotion || undefined}>
                {!hasPlanned && (
                  <div className="slip__empty">
                    {list.trip.days.length === 0 && allShopped() ? (
                      <>
                        <p className="slip__empty-title">Alles eingekauft.</p>
                        <p className="slip__empty-text">
                          Für die geplanten Tage hast du schon eingekauft. Neue Gerichte im <Link to="/">Wochenplan</Link> landen hier von selbst, eigene Artikel kannst du jederzeit notieren.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="slip__empty-title">{list.trip.days.length ? 'Für diese Tage ist nichts geplant.' : 'Noch keine Tage gewählt.'}</p>
                        <p className="slip__empty-text">
                          Wähl oben die Tage für diesen Einkauf oder <Link to="/">plan die Woche</Link>. Eigene Artikel kannst du trotzdem notieren.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {list.sections.map((s) => {
                  const finished = s.lines.every(done)
                  const openCount = s.lines.filter((l) => !done(l)).length
                  const folded = finished && !!foldReady?.has(s.section) && !expanded.has(s.section)
                  const toggle = () => {
                    if (foldMotion) clip([s.section])
                    setExpanded((e) => {
                      const n = new Set(e)
                      if (n.has(s.section)) n.delete(s.section)
                      else n.add(s.section)
                      return n
                    })
                  }
                  const ruleInner = (
                    <>
                      <span className="slip__name">{s.section}</span>
                      <span className="slip__dots" aria-hidden="true" />
                      {finished ? (
                        <span className="slip__count slip__count--done">
                          alles im Wagen <span className="led" data-on="true" aria-hidden="true" />
                        </span>
                      ) : (
                        <span className="slip__count num">
                          {openCount}
                          <span className="visually-hidden"> offen</span>
                        </span>
                      )}
                    </>
                  )
                  return (
                    <section key={s.section} id={sectionId(s.section)} className="slip__sec" aria-labelledby={`${sectionId(s.section)}-h`}>
                      <h2 id={`${sectionId(s.section)}-h`} className="slip__head">
                        {finished ? (
                          <button type="button" className="slip__rule slip__rule--btn" aria-expanded={!folded} onClick={toggle}>
                            {ruleInner}
                          </button>
                        ) : (
                          <span className="slip__rule">{ruleInner}</span>
                        )}
                      </h2>
                      <div
                        className="slip__body"
                        data-folded={folded || undefined}
                        data-clip={clipping.has(s.section) || undefined}
                        onTransitionEnd={(e) => {
                          if (e.target === e.currentTarget && e.propertyName === 'grid-template-rows')
                            setClipping((c) => {
                              const n = new Set(c)
                              n.delete(s.section)
                              return n
                            })
                        }}
                      >
                        <ul className="slip__lines">
                          {s.lines.map((l) => (
                            <Line
                              key={l.key}
                              line={l}
                              onHome={() => setLineAtHome(l.key, !l.atHome)}
                              menuOpen={menuFor === l.key}
                              onTap={() => tap(l)}
                              onMenu={() => setMenuFor((m) => (m === l.key ? null : l.key))}
                              onCloseMenu={() => setMenuFor(null)}
                              onSection={(sec) => {
                                setMenuFor(null)
                                setLineSection(l, sec)
                                toast.show(`„${l.name}“ steht jetzt unter ${sec}.`)
                              }}
                              onRemove={
                                l.manualId
                                  ? () => {
                                      setMenuFor(null)
                                      const removed = removeManualItem(l.manualId!)
                                      if (removed) toast.show(`„${removed.name}“ gestrichen.`, { undo: () => restoreManualItem(removed) })
                                    }
                                  : undefined
                              }
                            />
                          ))}
                        </ul>
                      </div>
                    </section>
                  )
                })}

                <AddItem />
              </div>

              {allDone && (
                <section className="panel shop__done" aria-live="polite">
                  <p className="done__title">
                    <span className="led" data-on="true" aria-hidden="true" />
                    Alles im Wagen.
                  </p>
                  <p className="done__text">Schließ den Einkauf ab, dann zählen {list.trip.days.length ? 'diese Tage' : 'deine Artikel'} als erledigt.</p>
                  <div className="done__actions">
                    <button type="button" className="btn" onClick={finish}>
                      Einkauf abschließen
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── One printed line ────────────────────────────────────────────────────── */

function Line({
  line: l,
  onHome,
  menuOpen,
  onTap,
  onMenu,
  onCloseMenu,
  onSection,
  onRemove,
}: {
  line: ShoppingLine
  onHome: () => void
  menuOpen: boolean
  onTap: () => void
  onMenu: () => void
  onCloseMenu: () => void
  onSection: (s: string) => void
  onRemove?: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [up, setUp] = useState(false)
  useEffect(() => {
    if (!menuOpen) return setUp(false)
    const m = menuRef.current
    if (m) {
      // Never over the bottom bar: open upwards when there is no room below.
      const r = m.getBoundingClientRect()
      const bar = window.matchMedia('(min-width: 1024px)').matches ? 16 : 96
      if (r.bottom > window.innerHeight - bar) setUp(true)
    }
    menuRef.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true })
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Element
      if (!menuRef.current?.contains(t) && !t.closest?.(`[data-line-menu="${l.key}"]`)) onCloseMenu()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseMenu()
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen, l.key, onCloseMenu])

  const label = `${l.name}${l.qty ? `, ${l.qty}` : ''}: im Wagen`
  return (
    <li className="sline" data-checked={l.checked || undefined} data-home={l.atHome || undefined} data-new={l.isNew || undefined}>
      <button
        type="button"
        role="checkbox"
        aria-checked={l.checked}
        aria-label={label}
        aria-disabled={l.atHome ? true : undefined}
        className="sline__tap"
        onClick={onTap}
      >
        <span className="sline__qty num">{l.qty}</span>
        <span className="sline__name">
          <span className="sline__text">{l.name}</span>
        </span>
        <span className="sline__flags">
          {l.isNew && (
            <span className="sline__new">
              <span className="led" data-on="true" aria-hidden="true" />
              neu
            </span>
          )}
          {l.manualId && !l.isNew && <span className="label">{l.agent ? 'Agent' : 'eigen'}</span>}
        </span>
      </button>
      {/* Always at hand: "haben wir" takes a line off the list without ticking it. */}
      {!l.checked && (
        <button
          type="button"
          className="sline__home"
          aria-pressed={l.atHome}
          data-likely={l.likelyHome || undefined}
          aria-label={l.atHome ? `${l.name}: doch kaufen` : `${l.name}: haben wir da`}
          onClick={onHome}
        >
          {l.atHome ? 'da' : l.likelyHome ? 'meist da' : 'haben wir'}
        </button>
      )}
      <button type="button" className="sline__more" aria-label={`${l.name}: mehr`} aria-expanded={menuOpen} data-line-menu={l.key} onClick={onMenu}>
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {menuOpen && (
        <div className="emenu sline__menu" ref={menuRef} data-up={up || undefined} role="group" aria-label={`${l.name}: Abschnitt ändern`}>
          <span className="label emenu__head">Abschnitt ändern</span>
          <div className="sline__sections">
            {SECTIONS.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={s === l.section} onClick={() => onSection(s)}>
                {s}
              </button>
            ))}
          </div>
          {onRemove && (
            <button type="button" className="emenu__item emenu__item--danger" onClick={onRemove}>
              Von der Liste streichen
            </button>
          )}
        </div>
      )}
    </li>
  )
}

/* ── Own items ───────────────────────────────────────────────────────────── */

function AddItem() {
  const [text, setText] = useState('')
  const recent = recentManualNames().slice(0, 5)
  const add = (name: string) => {
    if (addManualItem(name)) setText('')
  }
  return (
    <form
      className="additem"
      onSubmit={(e) => {
        e.preventDefault()
        add(text)
      }}
    >
      <div className="slot">
        <Plus className="slot__icon" size={18} strokeWidth={2.25} aria-hidden="true" />
        <label htmlFor="add-item" className="visually-hidden">
          Eigenen Artikel hinzufügen
        </label>
        <input id="add-item" className="slot__input" maxLength={60} autoComplete="off" placeholder="Artikel, z. B. Milch" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {text.trim() ? (
        <button type="submit" className="btn">
          Auf die Liste
        </button>
      ) : (
        recent.length > 0 && (
          <div className="chips additem__recent" aria-label="Zuletzt notiert">
            {recent.map((n) => (
              <button key={n} type="button" className="chip" onClick={() => add(n)}>
                {n}
              </button>
            ))}
          </div>
        )
      )}
    </form>
  )
}

/* ── Days of this trip, with the dishes behind them ───────────────────────── */

function DayList({ selected }: { selected: string[] }) {
  const today = todayIso()
  const dishes = plannedDishes(today)
  const shopped = shoppedDays()
  const sel = new Set(selected)
  const days = [...dishes.keys()]
  const toggle = (d: string) => setTripDays(sel.has(d) ? selected.filter((x) => x !== d) : [...selected, d])
  if (days.length === 0) {
    return (
      <p className="shopdays__none">
        In den nächsten zwei Wochen ist kein Rezept geplant. <Link to="/">Woche planen</Link>
      </p>
    )
  }
  return (
    <ul className="shopdays" aria-label="Tage für diesen Einkauf">
      {days.map((d) => {
        const on = sel.has(d)
        const done = shopped.has(d)
        const titles = dishes.get(d) ?? []
        return (
          <li key={d}>
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              className="shopday"
              data-shopped={done || undefined}
              aria-label={`${weekdayLong(d)} ${dayOfMonth(d)}.: ${titles.join(', ')}${done ? ', schon eingekauft' : ''}`}
              onClick={() => toggle(d)}
            >
              <span className="shopday__window" aria-hidden="true">
                <span className="shopday__led" />
              </span>
              <span className="shopday__date">
                <span className="shopday__wd">{weekdayShort(d)}</span>
                <span className="num">{dayOfMonth(d)}.</span>
              </span>
              <span className="shopday__dishes">{titles.join(' · ')}</span>
              {done && <span className="label shopday__done">eingekauft</span>}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
