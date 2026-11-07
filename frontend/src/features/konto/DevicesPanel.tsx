import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useToast } from '../../components/toast'
import {
  cancelDeviceLink,
  createDeviceLink,
  currentSession,
  getDeviceLink,
  listSessions,
  loadSessions,
  pollDeviceLink,
  revokeOtherSessions,
  revokeSession,
  subscribeAuth,
  type Session,
} from '../../lib/auth'
import { agoText, dateText } from './ApiPage'

const WEEK = 7 * 86_400_000

/** Konto → Geräte: every device the family is logged in on, and adding a new one. */
export function DevicesPanel() {
  const toast = useToast()
  const [, force] = useState(0)
  useEffect(() => subscribeAuth(() => force((n) => n + 1)), [])
  const [linkId, setLinkId] = useState<string | null>(null)
  const [flipId, setFlipId] = useState<string | null>(null)

  useEffect(() => {
    loadSessions().catch(() => toast.show('Die Geräte konnten nicht geladen werden.', { tone: 'error' }))
  }, [toast])

  const sessions = listSessions()
  const me = currentSession()?.id
  const others = sessions.filter((s) => s.id !== me).length

  useEffect(() => {
    if (window.location.hash === '#geraete') document.getElementById('geraete')?.scrollIntoView({ block: 'start' })
  }, [])

  const fail = (e: unknown) => toast.show(e instanceof Error ? e.message : 'Das hat nicht geklappt.', { tone: 'error' })
  const addDevice = () => createDeviceLink().then((l) => setLinkId(l.id), fail)

  const revoke = (s: Session) => {
    revokeSession(s.id).then(() => {
      if (s.id !== me) toast.show(`„${s.deviceLabel}“ ist abgemeldet.`)
    }, fail)
  }

  return (
    <section className="panel konto__panel" id="geraete" aria-labelledby="geraete-h">
      <div>
        <h2 id="geraete-h" className="panel__title">
          Geräte
        </h2>
        <p className="konto__hint">Hier ist die Familie gerade angemeldet. Alle teilen sich dieses eine Konto.</p>
      </div>

      <ul className="keylist">
        {sessions.map((s) => (
          <DeviceRow key={s.id} s={s} isMe={s.id === me} flip={s.id === flipId} onRevoke={() => revoke(s)} />
        ))}
      </ul>

      {linkId ? (
        <Pairing
          id={linkId}
          onRenew={addDevice}
          onConnected={() => {
            // The device that just joined flips into the list.
            const newest = [...listSessions()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
            if (newest) setFlipId(newest.id)
          }}
          onClose={() => {
            const link = getDeviceLink(linkId)
            if (link && !link.usedAt) cancelDeviceLink(linkId).catch(() => undefined)
            setLinkId(null)
          }}
        />
      ) : (
        <div className="devices__actions">
          <button type="button" className="btn" onClick={addDevice}>
            Gerät hinzufügen
          </button>
          {others > 0 && (
            <button
              type="button"
              className="textbtn textbtn--danger"
              onClick={() => {
                revokeOtherSessions().then((n) => toast.show(n === 1 ? '1 Gerät abgemeldet.' : `${n} Geräte abgemeldet.`), fail)
              }}
            >
              Alle anderen abmelden
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function DeviceRow({ s, isMe, flip, onRevoke }: { s: Session; isMe: boolean; flip: boolean; onRevoke: () => void }) {
  const recent = isMe || Date.now() - new Date(s.lastSeenAt).getTime() < WEEK
  const meta = [isMe ? 'jetzt aktiv' : `zuletzt aktiv ${agoText(s.lastSeenAt)}`, `seit ${dateText(s.createdAt)}`]
  if (!s.remember) meta.push('bis Browser zu')
  return (
    <li className="keyrow" data-flip={flip || undefined}>
      <span className="ledwin" aria-hidden="true">
        <span className="led" data-on={recent || undefined} />
      </span>
      <div className="keyrow__body">
        <div className="keyrow__top">
          <span className="keyrow__name">{s.deviceLabel}</span>
          {isMe && <span className="devices__me">Dieses Gerät</span>}
        </div>
        <p className="keyrow__meta">{meta.join(' · ')}</p>
      </div>
      <button type="button" className="textbtn textbtn--danger keyrow__revoke" onClick={onRevoke} aria-label={isMe ? 'Dieses Gerät abmelden' : `${s.deviceLabel} abmelden`}>
        Abmelden
      </button>
    </li>
  )
}

/* ── Pairing: this device shows a code, the new one types or scans it ───── */

function Pairing({ id, onRenew, onConnected, onClose }: { id: string; onRenew: () => void; onConnected: () => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now())
  const headRef = useRef<HTMLHeadingElement>(null)
  // Re-read every second: the code runs down, and the server is asked whether a device joined.
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now())
      const l = getDeviceLink(id)
      if (l && !l.usedAt && new Date(l.expiresAt).getTime() > Date.now()) pollDeviceLink(id).catch(() => undefined)
    }, 1000)
    return () => window.clearInterval(t)
  }, [id])
  useEffect(() => headRef.current?.focus(), [id])

  const link = getDeviceLink(id)
  const left = link ? Math.max(0, new Date(link.expiresAt).getTime() - now) : 0
  const state = !link ? 'expired' : link.usedAt ? 'connected' : left === 0 || link.spent ? 'expired' : 'open'

  const wasConnected = useRef(false)
  useEffect(() => {
    if (state === 'connected' && !wasConnected.current) {
      wasConnected.current = true
      onConnected()
    }
  }, [state, onConnected])

  const url = link ? `${window.location.origin}/koppeln/${link.token}` : ''
  const qr = useMemo(() => (url ? qrPath(url) : null), [url])

  if (state === 'connected' && link) {
    return (
      <div className="pair" aria-labelledby="pair-h">
        <h3 id="pair-h" className="pair__title" tabIndex={-1} ref={headRef}>
          Neues Gerät verbunden
        </h3>
        <p className="pair__done" role="status">
          <span className="ledwin" aria-hidden="true">
            <span className="led" data-on="true" />
          </span>
          <span>
            Verbunden: <strong>{link.usedByLabel}</strong>
          </span>
        </p>
        <p className="konto__hint">Es bleibt angemeldet, bis du es hier abmeldest.</p>
        <div className="devices__actions">
          <button type="button" className="btn" onClick={onClose}>
            Fertig
          </button>
        </div>
      </div>
    )
  }

  const expired = state === 'expired'
  const mm = Math.floor(left / 60_000)
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')
  const code = link?.code ?? '······'
  const until = link ? new Date(link.expiresAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="pair" aria-labelledby="pair-h">
      <h3 id="pair-h" className="pair__title" tabIndex={-1} ref={headRef}>
        Neues Gerät verbinden
      </h3>

      <div className="pair__grid">
        <figure className="pair__qr" data-expired={expired || undefined}>
          {qr && (
            <svg viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="QR-Code zum Verbinden" shapeRendering="crispEdges">
              <path d={qr.d} />
            </svg>
          )}
          <figcaption className="label">mit der Kamera scannen</figcaption>
        </figure>

        <div className="pair__code">
          <p className="pair__how">Oder auf dem neuen Gerät „Mit Code von anderem Gerät“ wählen und das hier eintippen:</p>
          <div className="pair__slot" data-expired={expired || undefined}>
            <span className="ledwin" aria-hidden="true">
              {/* Blinks while waiting for the other device, like a pairing button. */}
              <span className="led" data-on={!expired || undefined} data-blink={!expired || undefined} />
            </span>
            <span className="pair__digits num" aria-label={`Code ${code.split('').join(' ')}`}>
              {code.slice(0, 3)} {code.slice(3)}
            </span>
          </div>
          <p className="label pair__left" aria-hidden="true">
            {expired ? 'abgelaufen' : `noch ${mm}:${ss}`}
          </p>
          <p className="visually-hidden" role="status">
            {expired ? 'Der Code ist abgelaufen.' : `Der Code gilt bis ${until} Uhr.`}
          </p>
        </div>
      </div>

      <div className="devices__actions">
        {expired && (
          <button type="button" className="btn" onClick={onRenew}>
            Neuer Code
          </button>
        )}
        <button type="button" className="textbtn" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

/** One SVG path of dark modules, with a 2-module quiet zone. */
function qrPath(text: string): { d: string; size: number } {
  const q = qrcode(0, 'M')
  q.addData(text)
  q.make()
  const n = q.getModuleCount()
  const pad = 2
  let d = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`
    }
  }
  return { d, size: n + pad * 2 }
}
