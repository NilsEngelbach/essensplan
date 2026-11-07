import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronRight } from 'lucide-react'
import { Segmented } from '../../components/controls'
import { defaultWeekStart, getSectionOrder, getSettings, keyIsActive, listApiKeys, saveSectionOrder, saveSettings, subscribe, unseenActivityCount } from '../../lib/api'
import { dayOfMonth, rangeLabel, todayIso, WEEKDAY, WEEKDAY_LONG, weekdayShort, weekStartOf } from '../../lib/format'

// Monday first, the way a German calendar prints the week.
const ORDER = [1, 2, 3, 4, 5, 6, 0]
const OPTIONS = ORDER.map((d) => ({ value: String(d), label: WEEKDAY[d] }))

/** Konto: the week settings and the store's section order (the rest of Konto is its own brief). */
export function AccountPage() {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  const s = getSettings()
  const today = todayIso()
  const opens = defaultWeekStart(today, s)
  const flipped = opens !== weekStartOf(today, s.weekStart)

  return (
    <div className="konto">
      <header className="pagehead">
        <h1 className="pagehead__title">Konto</h1>
      </header>

      <section className="panel konto__panel" aria-labelledby="woche-h">
        <h2 id="woche-h" className="panel__title">
          Woche
        </h2>

        <div className="konto__setting">
          <Segmented label="Wochenbeginn" value={String(s.weekStart)} onChange={(v) => saveSettings({ weekStart: Number(v) })} options={OPTIONS} />
          <p className="konto__hint">Eine Woche läuft von {WEEKDAY_LONG[s.weekStart]} bis {WEEKDAY_LONG[(s.weekStart + 6) % 7]}.</p>
        </div>

        <div className="konto__setting">
          <Segmented label="Planungstag" value={String(s.planningWeekday)} onChange={(v) => saveSettings({ planningWeekday: Number(v) })} options={OPTIONS} />
          <p className="konto__hint">
            {s.planningWeekday === s.weekStart
              ? 'Du planst am ersten Tag der Woche, die Startseite zeigt immer die laufende Woche.'
              : `Ab ${WEEKDAY_LONG[s.planningWeekday]} zeigt die Startseite schon die nächste Woche.`}
          </p>
        </div>

        <p className="konto__now">
          <span className="led" data-on="true" aria-hidden="true" />
          Heute ({weekdayShort(today)} {dayOfMonth(today)}.) öffnet die Startseite {flipped ? 'die nächste Woche' : 'diese Woche'}: <span className="num">{rangeLabel(opens)}</span>
        </p>
      </section>

      <StoreOrder />
      <AgentsPanel />
    </div>
  )
}

/** "Mein Laden": the sections in the order you walk through your supermarket. */
function StoreOrder() {
  const order = getSectionOrder()
  const move = (i: number, by: number) => {
    const next = [...order]
    const [s] = next.splice(i, 1)
    next.splice(i + by, 0, s)
    saveSectionOrder(next)
  }
  useEffect(() => {
    if (window.location.hash === '#laden') document.getElementById('laden')?.scrollIntoView({ block: 'start' })
  }, [])
  return (
    <section className="panel konto__panel" id="laden" aria-labelledby="laden-h">
      <div>
        <h2 id="laden-h" className="panel__title">
          Mein Laden
        </h2>
        <p className="konto__hint">Die Einkaufsliste folgt dieser Reihenfolge. Stell sie so ein, wie du durch deinen Supermarkt läufst.</p>
      </div>
      <ol className="storeorder">
        {order.map((s, i) => (
          <li key={s} className="storeorder__row">
            <span className="storeorder__pos num">{i + 1}</span>
            <span className="storeorder__name">{s}</span>
            <button type="button" className="iconbtn iconbtn--sm" aria-label={`${s} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button type="button" className="iconbtn iconbtn--sm" aria-label={`${s} nach unten`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={16} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Agents in one glance: active keys and what is new in the log. */
function AgentsPanel() {
  const active = listApiKeys().filter((k) => keyIsActive(k)).length
  const unseen = unseenActivityCount()
  return (
    <section className="panel konto__panel" aria-labelledby="agents-h">
      <h2 id="agents-h" className="panel__title">
        Agenten
      </h2>
      <div className="linkrows">
        <Link to="/konto/api" className="linkrow">
          <span className="linkrow__text">API &amp; Agenten</span>
          <span className="label">{active === 0 ? 'kein Schlüssel' : active === 1 ? '1 Schlüssel aktiv' : `${active} Schlüssel aktiv`}</span>
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
        <Link to="/konto/aktivitaet" className="linkrow">
          <span className="linkrow__text">Aktivität</span>
          {unseen > 0 && (
            <span className="linkrow__new">
              <span className="led" data-on="true" aria-hidden="true" />
              {unseen} neu
            </span>
          )}
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>
    </section>
  )
}
