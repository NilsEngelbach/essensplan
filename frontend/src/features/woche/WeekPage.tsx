import { useCallback, useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useMediaQuery } from '../../components/controls'
import { useToast } from '../../components/toast'
import {
  addPlanEntry,
  defaultWeekStart,
  getSettings,
  listPlanEntries,
  markSeen,
  movePlanEntry,
  recipeById,
  removePlanEntry,
  restorePlanEntry,
  subscribe,
  weekDates,
} from '../../lib/api'
import { addDays, daysBetween, dayOfMonth, minutes, rangeLabel, todayIso, weekdayLong, weekdayShort, weekStartOf } from '../../lib/format'
import { SLOTS, type PlanEntry, type SlotKey } from '../../lib/types'
import { EntryMenu } from './EntryMenu'
import { DRAG_TYPE, PlanLibrary, type Pick } from './PlanLibrary'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const slotOf = (k: string | null): SlotKey => (SLOTS.some((s) => s.key === k) ? (k as SlotKey) : 'lunch')
const slotName = (k: SlotKey) => SLOTS.find((s) => s.key === k)?.name ?? k
const slotShort = (k: SlotKey) => SLOTS.find((s) => s.key === k)?.short ?? k

function useStoreVersion() {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribe(() => setVersion((v) => v + 1)), [])
  return version
}

function weekTitle(start: string, today: string, weekStart: number): string {
  const weeks = Math.round(daysBetween(weekStartOf(today, weekStart), start) / 7)
  if (weeks === 0) return 'Diese Woche'
  if (weeks === 1) return 'Nächste Woche'
  if (weeks === -1) return 'Letzte Woche'
  return weeks > 0 ? `In ${weeks} Wochen` : `Vor ${-weeks} Wochen`
}

function entryTitle(e: PlanEntry): string {
  return (e.recipeId ? recipeById(e.recipeId)?.title : null) ?? e.note ?? 'Eintrag'
}

/**
 * Home: the week as seven fixed day rows. "Woche planen" folds it into a row
 * of day keys with the library below; a pick fills the selected day and the
 * selection moves on to the next free one.
 */
export function WeekPage() {
  const { start: startParam } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const version = useStoreVersion()
  const wide = useMediaQuery('(min-width: 1024px)')
  const finePointer = useMediaQuery('(pointer: fine)')

  const settings = getSettings()
  const today = todayIso()
  const start = startParam && ISO.test(startParam) ? weekStartOf(startParam, settings.weekStart) : defaultWeekStart(today, settings)
  const days = weekDates(start)
  const selected = params.get('planen')
  const planning = selected !== null && days.includes(selected)
  const slot = slotOf(params.get('mahlzeit'))

  const [entries, setEntries] = useState<PlanEntry[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [todayEntries, setTodayEntries] = useState<PlanEntry[]>([])
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [lastPick, setLastPick] = useState<PlanEntry | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoadError(false)
    listPlanEntries(days[0], days[6])
      .then((e) => alive && setEntries(e))
      .catch(() => {
        if (!alive) return
        setLoadError(true)
        toast.show('Die Woche konnte nicht geladen werden.', { tone: 'error' })
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, version, retry])

  // Home may already show next week; today's lunch stays one glance away.
  const runningStart = weekStartOf(today, settings.weekStart)
  useEffect(() => {
    let alive = true
    if (start === runningStart) return
    listPlanEntries(today, today)
      .then((e) => alive && setTodayEntries(e.filter((x) => x.slot === 'lunch')))
      .catch(() => alive && setTodayEntries([]))
    return () => {
      alive = false
    }
  }, [start, runningStart, today, version])

  // Agent-planned entries stay lit for this visit; leaving the week marks them seen.
  const unseen = useRef<string[]>([])
  unseen.current = (entries ?? []).filter((e) => e.createdVia !== 'app' && !e.seenAt).map((e) => e.id)
  useEffect(() => () => markSeen(unseen.current), [start])

  useEffect(() => setLastPick(null), [start, planning])
  // Planning starts at the top: day keys, then the library. After the new layout has painted.
  useEffect(() => {
    if (!planning) return
    const id = requestAnimationFrame(() => window.scrollTo({ top: 0 }))
    return () => cancelAnimationFrame(id)
  }, [planning])

  const inSlot = (d: string, s: SlotKey = slot) => (entries ?? []).filter((e) => e.date === d && e.slot === s)
  const firstOpenDay = (s: SlotKey) => days.find((d) => d >= today && inSlot(d, s).length === 0) ?? days.find((d) => d >= today) ?? days[0]

  const setPlan = (patch: { planen?: string | null; mahlzeit?: SlotKey }, push = false) => {
    const next = new URLSearchParams(params)
    if (patch.planen !== undefined) patch.planen === null ? next.delete('planen') : next.set('planen', patch.planen)
    if (patch.mahlzeit) patch.mahlzeit === 'lunch' ? next.delete('mahlzeit') : next.set('mahlzeit', patch.mahlzeit)
    setParams(next, { replace: !push })
  }

  const startPlanning = (day?: string) => setPlan({ planen: day ?? firstOpenDay(slot) }, true)
  const finish = () => setPlan({ planen: null, mahlzeit: 'lunch' })

  const goWeek = (delta: number) => {
    const target = addDays(start, delta * 7)
    const q = new URLSearchParams(params)
    if (planning && selected) q.set('planen', addDays(selected, delta * 7))
    navigate({ pathname: `/woche/${target}`, search: q.toString() })
  }

  const pick = (p: Pick, date = selected) => {
    if (!date) return
    const wasEmpty = inSlot(date).length === 0
    const entry = addPlanEntry({ date, slot, ...p })
    setLastPick(entry)
    if (!wasEmpty || date !== selected) return
    // Move on to the next free day after this one (wrapping), past days skipped.
    const i = days.indexOf(date)
    for (let k = 1; k < 7; k++) {
      const d = days[(i + k) % 7]
      if (d >= today && d !== date && inSlot(d).length === 0) {
        setPlan({ planen: d })
        return
      }
    }
  }

  const remove = useCallback(
    (e: PlanEntry) => {
      setMenuFor(null)
      const removed = removePlanEntry(e.id)
      if (removed) toast.show(`„${entryTitle(e)}“ aus dem Plan genommen.`, { undo: () => restorePlanEntry(removed) })
    },
    [toast],
  )

  const move = (e: PlanEntry, date: string) => {
    setMenuFor(null)
    const before = movePlanEntry(e.id, date)
    if (before) toast.show(`Auf ${weekdayLong(date)} verschoben.`, { undo: () => restorePlanEntry(before) })
  }

  const onDrop = (ev: DragEvent, date: string) => {
    setDropOn(null)
    const raw = ev.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    ev.preventDefault()
    const data = JSON.parse(raw) as { recipeId?: string; entryId?: string }
    if (data.entryId) {
      const e = entries?.find((x) => x.id === data.entryId)
      if (e) move(e, date)
    } else if (data.recipeId) {
      if (planning) pick({ recipeId: data.recipeId }, date)
      else addPlanEntry({ date, slot: 'lunch', recipeId: data.recipeId })
    }
  }

  const dropProps = (date: string) =>
    finePointer
      ? {
          onDragOver: (ev: DragEvent) => {
            if (!ev.dataTransfer.types.includes(DRAG_TYPE)) return
            ev.preventDefault()
            if (dropOn !== date) setDropOn(date)
          },
          onDragLeave: () => setDropOn((d) => (d === date ? null : d)),
          onDrop: (ev: DragEvent) => onDrop(ev, date),
        }
      : {}

  const futureDays = days.filter((d) => d >= today)
  const done = planning && entries !== null && futureDays.length > 0 && futureDays.every((d) => inSlot(d).length > 0)
  const filledLunch = days.filter((d) => inSlot(d, 'lunch').length > 0).length

  return (
    <div className="week" data-planning={planning || undefined}>
      <header className="weekhead">
        <div className="weekhead__row">
          <h1 className="pagehead__title">{weekTitle(start, today, settings.weekStart)}</h1>
          <div className="weeknav">
            <button type="button" className="iconbtn" aria-label="Vorige Woche" onClick={() => goWeek(-1)}>
              <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
            </button>
            <button type="button" className="iconbtn" aria-label="Nächste Woche" onClick={() => goWeek(1)}>
              <ChevronRight size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
        {start !== runningStart && todayEntries.length > 0 && !planning && (
          <Link to={`/woche/${runningStart}`} className="todayline">
            <span className="label">heute</span>
            <span className="todayline__title">{todayEntries.map(entryTitle).join(' + ')}</span>
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </Link>
        )}
        <div className="weekhead__row weekhead__row--meta">
          <span className="readout num">{rangeLabel(start)}</span>
          {!planning && entries !== null && (
            <span className="weekleds" role="img" aria-label={`${filledLunch} von 7 Mittagessen geplant`}>
              {days.map((d) => (
                <span key={d} className="led" data-on={inSlot(d, 'lunch').length > 0 || undefined} />
              ))}
            </span>
          )}
          {planning ? (
            <button type="button" className="btn weekhead__action" onClick={finish}>
              Fertig
            </button>
          ) : (
            <button type="button" className="btn weekhead__action" onClick={() => startPlanning()}>
              Woche planen
            </button>
          )}
        </div>
      </header>

      {!planning && entries !== null && entries.length === 0 && (
        <div className="empty week__empty">
          <p className="empty__title">Noch nichts geplant.</p>
          <p className="empty__text">Tipp auf einen Tag oder auf „Woche planen“. Ein Rezept antippen trägt es ein, dann geht es zum nächsten freien Tag.</p>
        </div>
      )}

      {loadError && (
        <div className="alert" role="alert">
          <p>Die Woche konnte nicht geladen werden. Prüf die Verbindung.</p>
          <div className="alert__actions">
            <button type="button" className="btn" onClick={() => setRetry((n) => n + 1)}>
              Nochmal versuchen
            </button>
          </div>
        </div>
      )}

      {planning && selected && !wide && (
        <PlanBar
          days={days}
          today={today}
          selected={selected}
          slot={slot}
          entries={entries}
          lastPick={lastPick}
          onSelect={(d) => setPlan({ planen: d })}
          onRemove={remove}
          onUndoLast={() => {
            if (!lastPick) return
            removePlanEntry(lastPick.id)
            setPlan({ planen: lastPick.date })
            setLastPick(null)
          }}
        />
      )}

      <div className="week__body">
        {(!planning || wide) && !loadError && (
          <WeekRows
            days={days}
            today={today}
            entries={entries}
            planning={planning}
            selected={selected}
            slot={slot}
            menuFor={menuFor}
            dropOn={dropOn}
            lastPickId={lastPick?.id ?? null}
            draggable={finePointer}
            dropProps={dropProps}
            onMenu={(id) => setMenuFor((m) => (m === id ? null : id))}
            onCloseMenu={() => setMenuFor(null)}
            onMove={move}
            onRemove={remove}
            onPlanDay={(d) => (planning ? setPlan({ planen: d }) : startPlanning(d))}
          />
        )}

        {planning && (
          <PlanLibrary
            weekStart={start}
            slot={slot}
            onSlot={(s) => setPlan({ mahlzeit: s, planen: selected && inSlot(selected, s).length === 0 ? selected : firstOpenDay(s) })}
            entries={entries ?? []}
            version={version}
            draggable={finePointer}
            done={done}
            onPick={(p) => pick(p)}
            onFinish={finish}
          />
        )}
      </div>
    </div>
  )
}

/* ── The seven day rows ──────────────────────────────────────────────────── */

function WeekRows(props: {
  days: string[]
  today: string
  entries: PlanEntry[] | null
  planning: boolean
  selected: string | null
  slot: SlotKey
  menuFor: string | null
  dropOn: string | null
  lastPickId: string | null
  draggable: boolean
  dropProps: (date: string) => object
  onMenu: (id: string) => void
  onCloseMenu: () => void
  onMove: (e: PlanEntry, date: string) => void
  onRemove: (e: PlanEntry) => void
  onPlanDay: (date: string) => void
}) {
  const { days, today, entries, planning, selected, slot } = props
  if (entries === null) {
    return (
      <ol className="wdays" aria-busy="true" aria-label="Woche wird geladen">
        {days.map((d) => (
          <li key={d} className="wday wday--skeleton" />
        ))}
      </ol>
    )
  }
  // The row's main line is the slot being planned (lunch otherwise); other slots are small lines.
  const main: SlotKey = planning ? slot : 'lunch'
  // Only the first free day carries the hint; the others just read "frei".
  const firstFree = days.find((d) => d >= today && !entries.some((e) => e.date === d && e.slot === main))
  return (
    <ol className="wdays" aria-label="Tage der Woche">
      {days.map((d) => {
        const dayEntries = entries.filter((e) => e.date === d)
        const mains = dayEntries.filter((e) => e.slot === main)
        const others = SLOTS.filter((s) => s.key !== main).flatMap((s) => dayEntries.filter((e) => e.slot === s.key))
        const isToday = d === today
        const isSel = planning && d === selected
        const isFirstFree = d === firstFree
        return (
          <li
            key={d}
            className="wday"
            data-today={isToday || undefined}
            data-past={d < today || undefined}
            data-selected={isSel || undefined}
            data-drop={props.dropOn === d || undefined}
            {...props.dropProps(d)}
          >
            <button
              type="button"
              className="wday__date"
              aria-label={`${weekdayLong(d)} ${dayOfMonth(d)}.${isToday ? ', heute' : ''}: ${planning ? 'auswählen' : `${slotName(main)} planen`}`}
              aria-pressed={planning ? isSel : undefined}
              onClick={() => props.onPlanDay(d)}
            >
              <span className="wday__wd">{weekdayShort(d)}</span>
              <span className="wday__num num">{dayOfMonth(d)}</span>
            </button>
            <div className="wday__body">
              {mains.length === 0 && (
                <button type="button" className="wday__free" onClick={() => props.onPlanDay(d)}>
                  <span>frei</span>
                  {!planning && isFirstFree && <span className="wday__hint">{slotShort(main)} planen</span>}
                </button>
              )}
              {mains.map((e, i) => (
                <EntryLine key={e.id} entry={e} variant={i === 0 ? 'main' : 'side'} {...props} days={days} />
              ))}
              {others.map((e) => (
                <EntryLine key={e.id} entry={e} variant="other" {...props} days={days} />
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function EntryLine({
  entry: e,
  variant,
  days,
  menuFor,
  lastPickId,
  draggable,
  onMenu,
  onCloseMenu,
  onMove,
  onRemove,
}: {
  entry: PlanEntry
  variant: 'main' | 'side' | 'other'
  days: string[]
  menuFor: string | null
  lastPickId: string | null
  draggable: boolean
  onMenu: (id: string) => void
  onCloseMenu: () => void
  onMove: (e: PlanEntry, date: string) => void
  onRemove: (e: PlanEntry) => void
}) {
  const recipe = e.recipeId ? recipeById(e.recipeId) : undefined
  const title = entryTitle(e)
  const agent = e.createdVia !== 'app' && !e.seenAt
  const open = menuFor === e.id
  return (
    <div className={`went went--${variant}`} data-free={!recipe || undefined} data-flip={lastPickId === e.id || undefined}>
      <button
        type="button"
        className="went__btn"
        aria-expanded={open}
        aria-haspopup="true"
        data-menu-for={e.id}
        draggable={draggable || undefined}
        onDragStart={(ev) => {
          ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ entryId: e.id }))
          ev.dataTransfer.effectAllowed = 'move'
        }}
        onClick={() => onMenu(e.id)}
      >
        {variant === 'other' && <span className="label went__slot">{slotShort(e.slot).toLowerCase()}</span>}
        {variant === 'side' && <span className="went__plus" aria-hidden="true">+</span>}
        <span className="went__text">
          <span className="went__title">{title}</span>
          {agent && (
            <span className="went__agent">
              <span className="led" data-on="true" aria-hidden="true" />
              vom Agenten geplant
            </span>
          )}
        </span>
        {variant === 'main' && recipe?.imageUrl && (
          <span className="went__thumb" aria-hidden="true">
            <img src={recipe.imageUrl} alt="" loading="lazy" decoding="async" draggable={false} />
          </span>
        )}
        {variant !== 'other' && <span className="went__time num">{recipe ? minutes(recipe.cookingTime) : ''}</span>}
      </button>
      {open && <EntryMenu entry={e} title={title} days={days} onMove={(d) => onMove(e, d)} onRemove={() => onRemove(e)} onClose={onCloseMenu} />}
    </div>
  )
}

/* ── Phone planning: pinned day keys + the selected day ──────────────────── */

function PlanBar({
  days,
  today,
  selected,
  slot,
  entries,
  lastPick,
  onSelect,
  onRemove,
  onUndoLast,
}: {
  days: string[]
  today: string
  selected: string
  slot: SlotKey
  entries: PlanEntry[] | null
  lastPick: PlanEntry | null
  onSelect: (d: string) => void
  onRemove: (e: PlanEntry) => void
  onUndoLast: () => void
}) {
  const keysRef = useRef<HTMLDivElement>(null)
  const inSlot = (d: string) => (entries ?? []).filter((e) => e.date === d && e.slot === slot)
  const current = inSlot(selected)

  // The readout flips when the selected day changes, not on first paint.
  const [flip, setFlip] = useState(0)
  const prevSel = useRef(selected)
  useEffect(() => {
    if (prevSel.current !== selected) {
      prevSel.current = selected
      setFlip((n) => n + 1)
    }
  }, [selected])

  const onKeyNav = (ev: KeyboardEvent) => {
    const i = days.indexOf(selected)
    const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    ev.preventDefault()
    const next = days[(i + step + 7) % 7]
    onSelect(next)
    keysRef.current?.querySelector<HTMLElement>(`[data-date="${next}"]`)?.focus()
  }

  return (
    <div className="planbar">
      <div className="keys" role="radiogroup" aria-label={`Tag für ${slotName(slot)} wählen`} ref={keysRef} onKeyDown={onKeyNav}>
        {days.map((d) => {
          const filled = inSlot(d).length > 0
          const on = d === selected
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              data-date={d}
              className="key"
              data-filled={filled || undefined}
              data-past={d < today || undefined}
              data-today={d === today || undefined}
              aria-label={`${weekdayLong(d)} ${dayOfMonth(d)}.: ${filled ? inSlot(d).map(entryTitle).join(', ') : 'frei'}`}
              onClick={() => onSelect(d)}
            >
              <span className="key__wd">{weekdayShort(d)}</span>
              <span className="key__num num">{dayOfMonth(d)}</span>
              <span className="key__led" aria-hidden="true" />
            </button>
          )
        })}
      </div>

      <div className="planbar__day" key={flip} data-flip={flip > 0 || undefined} aria-live="polite">
        <span className="label planbar__label">
          {weekdayLong(selected)} {dayOfMonth(selected)}. · {slotName(slot)}
        </span>
        {current.length === 0 ? (
          <span className="planbar__free">Noch frei. Wähl unten ein Rezept oder eine Vorgabe.</span>
        ) : (
          <ul className="planbar__entries">
            {current.map((e) => (
              <li key={e.id} className="planbar__entry">
                <span className="planbar__title">{entryTitle(e)}</span>
                <button type="button" className="iconbtn iconbtn--sm" aria-label={`${entryTitle(e)} entfernen`} onClick={() => onRemove(e)}>
                  <X size={16} strokeWidth={2.25} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lastPick && lastPick.date !== selected && (
        <p className="planbar__last">
          <span className="led" data-on="true" aria-hidden="true" />
          <span className="planbar__lasttext">
            {weekdayShort(lastPick.date)}: {entryTitle(lastPick)}
          </span>
          <button type="button" className="textbtn planbar__undo" onClick={onUndoLast}>
            Rückgängig
          </button>
        </p>
      )}
    </div>
  )
}
