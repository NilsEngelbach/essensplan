import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useToast } from '../../components/toast'
import { listActivity, markActivitySeen, subscribe, UndoBlocked, undoActivity, undoBlockedReason } from '../../lib/api'
// UndoBlocked is the API error: its message is the server's reason (e.g. „… wurde inzwischen geändert.“).
import { daysBetween, toIsoDate, todayIso, weekdayLong } from '../../lib/format'
import type { Activity } from '../../lib/types'

function dayHeading(iso: string, today: string): string {
  const diff = daysBetween(iso, today)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Gestern'
  return `${weekdayLong(iso)}, ${new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}`
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })

/** Everything agents changed, newest first, each with Rückgängig while that is still safe. */
export function ActivityPage() {
  const [, force] = useState(0)
  const [filter, setFilter] = useState<string | null>(null)
  const toast = useToast()
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  // New entries stay lit for this visit; leaving the page counts as seen (and clears the avatar dot).
  useEffect(() => () => markActivitySeen(), [])

  const all = listActivity()
  const keys = [...new Map(all.map((a) => [a.keyId, a.keyName])).entries()]
  const shown = filter ? all.filter((a) => a.keyId === filter) : all
  const today = todayIso()
  const days = new Map<string, Activity[]>()
  for (const a of shown) {
    const d = toIsoDate(new Date(a.at))
    days.set(d, [...(days.get(d) ?? []), a])
  }

  const undo = async (a: Activity) => {
    try {
      await undoActivity(a.id)
      toast.show('Rückgängig gemacht.')
    } catch (e) {
      toast.show(e instanceof UndoBlocked ? e.message : 'Das hat nicht geklappt.', { tone: 'error' })
    }
  }

  return (
    <div className="konto activity">
      <Link to="/konto" className="iconbtn iconbtn--text konto__back">
        <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        <span>Konto</span>
      </Link>
      <header className="pagehead">
        <h1 className="pagehead__title">Aktivität</h1>
      </header>
      <p className="agents__intro">
        Was Agenten mit ihren Schlüsseln geändert haben. Neues leuchtet, bis du die Seite verlässt. Einträge bleiben 90 Tage. <Link to="/konto/api">Schlüssel verwalten</Link>
      </p>

      {keys.length > 1 && (
        <div className="chips" role="group" aria-label="Nach Schlüssel filtern">
          <button type="button" className="chip" aria-pressed={filter === null} onClick={() => setFilter(null)}>
            Alle
          </button>
          {keys.map(([id, name]) => (
            <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(filter === id ? null : id)}>
              {name}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">
          <p className="empty__title">Noch keine Agenten-Aktivität.</p>
          <p className="empty__text">Sobald ein verbundenes Werkzeug etwas plant, speichert oder auf die Liste setzt, steht es hier.</p>
        </div>
      ) : (
        [...days.entries()].map(([day, items]) => (
          <section key={day} className="actday" aria-labelledby={`day-${day}`}>
            <h2 id={`day-${day}`} className="actday__head">
              {dayHeading(day, today)}
            </h2>
            <ul className="actlist">
              {items.map((a) => (
                <li key={a.id} className="actrow" data-undone={a.undoneAt ? true : undefined}>
                  <span className="ledwin" aria-hidden="true">
                    <span className="led" data-on={!a.seenAt || undefined} />
                  </span>
                  <div className="actrow__body">
                    <p className="actrow__text">
                      <strong>{a.keyName}</strong> {a.summary}
                      {!a.seenAt && <span className="visually-hidden"> (neu)</span>}
                    </p>
                    <p className="actrow__meta">
                      <span className="num">{time(a.at)}</span> · <Link to={a.target.href}>{a.target.label}</Link>
                    </p>
                    {!a.undoneAt && a.undo && undoBlockedReason(a.id) && <p className="label actrow__blocked">{undoBlockedReason(a.id)}</p>}
                  </div>
                  {a.undoneAt ? (
                    <span className="label actrow__done">rückgängig gemacht</span>
                  ) : a.undo && undoBlockedReason(a.id) ? (
                    <span />
                  ) : (
                    a.undo && (
                      <button type="button" className="textbtn actrow__undo" onClick={() => undo(a)}>
                        Rückgängig
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
