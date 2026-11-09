import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Copy } from 'lucide-react'
import { Segmented } from '../../components/controls'
import { useToast } from '../../components/toast'
import { aiImportEnabled, createApiKey, keyIsActive, listApiKeys, revokeApiKey, setApiKeyClient, subscribe, unrevokeApiKey, unseenActivityCount } from '../../lib/api'
import { SCOPES, type ApiClient, type ApiKey, type Scope } from '../../lib/types'

/** Where agents reach the app. The prototype shows its own origin; production uses the real domain. */
const BASE = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? window.location.origin

const GROUPS = [...new Set(SCOPES.map((s) => s.group))]
// Without a configured AI provider there is nothing to grant for the import (D25).
const offeredGroups = () => GROUPS.filter((g) => g !== 'KI-Import' || aiImportEnabled())

export function agoText(iso: string | null): string {
  if (!iso) return 'noch nie benutzt'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 2) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.round(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

export function dateText(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
}

/** One printed line per group: the group engraved as a label, its rights after it. */
function ScopeLines({ scopes }: { scopes: Scope[] }) {
  return (
    <ul className="keyrow__scopes" aria-label="Rechte">
      {GROUPS.map((g) => {
        const granted = SCOPES.filter((s) => s.group === g && scopes.includes(s.key))
        if (!granted.length) return null
        return (
          <li key={g}>
            <span className="label">{g}</span>{' '}
            {granted.map((s, i) => (
              <span key={s.key}>
                {i > 0 && ' · '}
                <span className={'warning' in s ? 'keyrow__danger' : undefined}>{s.label}</span>
              </span>
            ))}
          </li>
        )
      })}
    </ul>
  )
}

function useStore() {
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
}

export function ApiPage() {
  useStore()
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [reveal, setReveal] = useState<{ key: ApiKey; secret: string } | null>(null)
  const keys = listApiKeys()
  const active = keys.filter((k) => keyIsActive(k))
  const inactive = keys.filter((k) => !keyIsActive(k))
  const unseen = unseenActivityCount()

  return (
    <div className="konto agents">
      <Link to="/konto" className="iconbtn iconbtn--text konto__back">
        <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        <span>Konto</span>
      </Link>
      <header className="pagehead">
        <h1 className="pagehead__title">API &amp; Agenten</h1>
      </header>
      <p className="agents__intro">Mit einem Schlüssel kann ein KI-Werkzeug wie Claude Code Rezepte lesen, planen oder einkaufen, so weit du es erlaubst. Alles, was es ändert, steht in der Aktivität.</p>

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

      {reveal ? (
        <Reveal reveal={reveal} onDone={() => setReveal(null)} />
      ) : creating ? (
        <CreateKey
          onCancel={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false)
            setReveal(r)
          }}
        />
      ) : (
        <button type="button" className="btn agents__new" onClick={() => setCreating(true)}>
          Neuer Schlüssel
        </button>
      )}

      <section className="panel" aria-labelledby="keys-h">
        <h2 id="keys-h" className="panel__title">
          Schlüssel
        </h2>
        {active.length === 0 ? (
          <p className="konto__hint">Noch kein aktiver Schlüssel. Leg einen an, um ein KI-Werkzeug zu verbinden.</p>
        ) : (
          <ul className="keylist">
            {active.map((k) => (
              <KeyRow
                key={k.id}
                k={k}
                onRevoke={() => {
                  revokeApiKey(k.id)
                  toast.show(`„${k.name}“ widerrufen. Er funktioniert ab sofort nicht mehr.`, { undo: () => unrevokeApiKey(k.id) })
                }}
              />
            ))}
          </ul>
        )}
        {inactive.length > 0 && (
          <details className="keylist__old">
            <summary>Widerrufen oder abgelaufen ({inactive.length})</summary>
            <ul className="keylist">
              {inactive.map((k) => (
                <KeyRow key={k.id} k={k} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  )
}

function KeyRow({ k, onRevoke }: { k: ApiKey; onRevoke?: () => void }) {
  const recent = !!k.lastUsedAt && Date.now() - new Date(k.lastUsedAt).getTime() < 7 * 86_400_000
  const status = k.revokedAt ? `widerrufen am ${dateText(k.revokedAt)}` : k.expiresAt && !keyIsActive(k) ? `abgelaufen am ${dateText(k.expiresAt)}` : null
  return (
    <li className="keyrow" data-inactive={!onRevoke || undefined}>
      <span className="ledwin" aria-hidden="true">
        <span className="led" data-on={(recent && !status) || undefined} />
      </span>
      <div className="keyrow__body">
        <div className="keyrow__top">
          <span className="keyrow__name">{k.name}</span>
          <code className="keyrow__prefix">{k.prefix}…</code>
        </div>
        <ScopeLines scopes={k.scopes} />
        <p className="keyrow__meta">
          {status ?? (k.lastUsedAt ? `zuletzt benutzt ${agoText(k.lastUsedAt)}` : 'noch nie benutzt')}
          {!status && k.expiresAt && ` · gültig bis ${dateText(k.expiresAt)}`}
        </p>
      </div>
      {onRevoke && (
        <button type="button" className="textbtn textbtn--danger keyrow__revoke" onClick={onRevoke}>
          Widerrufen
        </button>
      )}
    </li>
  )
}

/* ── Creating a key: name, rights picked each time, validity ─────────────── */

function CreateKey({ onCancel, onCreated }: { onCancel: () => void; onCreated: (r: { key: ApiKey; secret: string }) => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>([])
  const [valid, setValid] = useState<'30' | '365' | 'never'>('never')
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => nameRef.current?.focus(), [])
  // Writing needs reading: a write right brings its group's "lesen" along, dropping "lesen" drops the rest.
  const toggle = (s: Scope) =>
    setScopes((cur) => {
      const [group, verb] = s.split(':')
      const read = `${group}:read` as Scope
      const hasRead = SCOPES.some((x) => x.key === read)
      if (cur.includes(s)) return verb === 'read' ? cur.filter((x) => !x.startsWith(`${group}:`)) : cur.filter((x) => x !== s)
      return hasRead && verb !== 'read' && !cur.includes(read) ? [...cur, read, s] : [...cur, s]
    })
  const warnings = SCOPES.filter((s) => 'warning' in s && scopes.includes(s.key)).map((s) => ('warning' in s ? s.warning : ''))

  return (
    <form
      className="panel createkey"
      aria-labelledby="create-h"
      onSubmit={(e) => {
        e.preventDefault()
        if (!scopes.length) return
        // Errors (none expected) surface as a toast through the data layer.
        createApiKey({ name, scopes, validDays: valid === 'never' ? null : Number(valid), client: 'claude-code' }).then(onCreated, () => undefined)
      }}
    >
      <h2 id="create-h" className="panel__title">
        Neuer Schlüssel
      </h2>
      <div className="field">
        <label htmlFor="key-name" className="field__label">
          Name <span className="label">wofür, wo</span>
        </label>
        <input ref={nameRef} id="key-name" className="input" maxLength={60} placeholder="z. B. Claude Code Laptop" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <fieldset className="rights">
        <legend className="field__label">Rechte</legend>
        {offeredGroups().map((g) => (
          <div key={g} className="rights__group">
            <span className="rights__name">{g}</span>
            <div className="chips">
              {SCOPES.filter((s) => s.group === g).map((s) => (
                <button key={s.key} type="button" className="chip" aria-pressed={scopes.includes(s.key)} onClick={() => toggle(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {warnings.length > 0 && (
          <ul className="rights__warn">
            {warnings.map((w) => (
              <li key={w}>Achtung: Dieser Schlüssel {w}.</li>
            ))}
          </ul>
        )}
      </fieldset>

      <Segmented
        label="Gültig"
        value={valid}
        onChange={setValid}
        options={[
          { value: '30', label: '30 Tage' },
          { value: '365', label: '1 Jahr' },
          { value: 'never', label: 'unbegrenzt' },
        ]}
      />

      <div className="createkey__actions">
        <button type="submit" className="btn" disabled={!scopes.length}>
          Schlüssel erstellen
        </button>
        <button type="button" className="textbtn" onClick={onCancel}>
          Abbrechen
        </button>
        {!scopes.length && <span className="label">Wähl mindestens ein Recht.</span>}
      </div>
    </form>
  )
}

/* ── Shown once: the secret and the setup for the chosen tool ────────────── */

const CLIENTS: { value: ApiClient; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'claude-desktop', label: 'Claude Desktop' },
  { value: 'mcp', label: 'Andere MCP-Clients' },
  { value: 'rest', label: 'REST' },
]

function snippet(client: ApiClient, secret: string): string {
  switch (client) {
    case 'claude-code':
      return `claude mcp add --transport http essensplan ${BASE}/mcp --header "Authorization: Bearer ${secret}"`
    case 'claude-desktop':
      return JSON.stringify(
        { mcpServers: { essensplan: { command: 'npx', args: ['-y', 'mcp-remote', `${BASE}/mcp`, '--header', 'Authorization:${AUTH_HEADER}'], env: { AUTH_HEADER: `Bearer ${secret}` } } } },
        null,
        2,
      )
    case 'mcp':
      return `URL:       ${BASE}/mcp\nTransport: Streamable HTTP\nHeader:    Authorization: Bearer ${secret}`
    default:
      return `curl -H "Authorization: Bearer ${secret}" "${BASE}/api/v1/recipes?limit=5"`
  }
}

const HINT: Record<ApiClient, string> = {
  'claude-code': 'Im Terminal ausführen. Danach kennt Claude Code das Werkzeug „essensplan“.',
  'claude-desktop': 'In die Datei claude_desktop_config.json einfügen und Claude Desktop neu starten.',
  mcp: 'Für MCP-Clients, die einen eigenen Header erlauben.',
  rest: 'Ein Beispielaufruf: fünf deiner Rezepte.',
}

function useCopy(): [string | null, (id: string, text: string, el: HTMLElement | null) => void] {
  const [copied, setCopied] = useState<string | null>(null)
  const toast = useToast()
  const copy = async (id: string, text: string, el: HTMLElement | null) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2400)
    } catch {
      // No clipboard (http, permissions): select it so a long-press or Strg+C works.
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
      toast.show('Kopieren geht hier nicht. Der Text ist markiert: lang drücken oder Strg+C.', { tone: 'error' })
    }
  }
  return [copied, copy]
}

const COPY_LABEL: Record<ApiClient, string> = {
  'claude-code': 'Befehl kopieren',
  'claude-desktop': 'Konfiguration kopieren',
  mcp: 'Angaben kopieren',
  rest: 'Befehl kopieren',
}

function Reveal({ reveal, onDone }: { reveal: { key: ApiKey; secret: string }; onDone: () => void }) {
  const [client, setClient] = useState<ApiClient>('claude-code')
  const [copied, copy] = useCopy()
  const secretRef = useRef<HTMLElement>(null)
  const snipRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => headRef.current?.focus(), [])
  const text = snippet(client, reveal.secret)

  return (
    <section className="panel reveal" aria-labelledby="reveal-h">
      <h2 id="reveal-h" className="panel__title" tabIndex={-1} ref={headRef}>
        „{reveal.key.name}“ ist bereit
      </h2>

      <div className="secret">
        <span className="ledwin" aria-hidden="true">
          <span className="led" data-on={copied === 'secret' || undefined} />
        </span>
        <code className="secret__value" ref={secretRef}>
          {reveal.secret}
        </code>
        <button type="button" className="btn secret__copy" onClick={() => copy('secret', reveal.secret, secretRef.current)}>
          {copied === 'secret' ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <p className="reveal__once">Nur jetzt sichtbar. Danach siehst du nur noch den Anfang ({reveal.key.prefix}…).</p>

      <div className="reveal__setup">
        <div className="clientpick">
          <span className="label" id="client-label">
            Einrichten für
          </span>
          <div className="chips" role="group" aria-labelledby="client-label">
            {CLIENTS.map((c) => (
              <button key={c.value} type="button" aria-pressed={client === c.value} className="chip" onClick={() => setClient(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <p className="konto__hint">{HINT[client]}</p>
        <pre className="snippet">
          <code ref={snipRef}>{text}</code>
        </pre>
        <button type="button" className="btn btn--quiet snippet__copy" onClick={() => copy('snippet', text, snipRef.current)}>
          <Copy size={16} strokeWidth={2} aria-hidden="true" />
          {copied === 'snippet' ? 'Kopiert' : COPY_LABEL[client]}
        </button>
        <p className="reveal__note">claude.ai im Browser und ChatGPT verbinden sich mit eigenen Servern nur über OAuth. Das kommt später; bis dahin gehen Claude Code, Claude Desktop, andere MCP-Clients und eigene Skripte.</p>
      </div>

      <div className="createkey__actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setApiKeyClient(reveal.key.id, client)
            onDone()
          }}
        >
          Fertig
        </button>
      </div>
    </section>
  )
}
