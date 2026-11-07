import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Rocker } from '../../components/controls'
import { AuthError, DEMO_CODE, DEMO_EMAIL, DEMO_PASSWORD, login, pairWithCode } from '../../lib/auth'
import { AuthHead, PasswordInput, safeBack, usePower } from './AuthLayout'

/** "482913" → "482 913": easier to read off one screen and type on another. */
const groupCode = (digits: string) => (digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits)

export function LoginPage() {
  const [params, setParams] = useSearchParams()
  const back = safeBack(params.get('zurueck'))
  const mode = params.get('mit') === 'code' ? 'code' : 'password'

  const note =
    params.get('grund') === 'abgemeldet'
      ? 'Du bist abgemeldet.'
      : back !== '/'
        ? 'Melde dich wieder an. Danach geht es dort weiter, wo du warst.'
        : null

  const setMode = (m: 'password' | 'code') => {
    const next = new URLSearchParams(params)
    next.delete('grund')
    if (m === 'code') next.set('mit', 'code')
    else next.delete('mit')
    setParams(next, { replace: true })
  }

  return mode === 'code' ? (
    <CodeLogin back={back} onPassword={() => setMode('password')} />
  ) : (
    <PasswordLogin back={back} note={note} onCode={() => setMode('code')} />
  )
}

/* ── E-mail and password ────────────────────────────────────────────────── */

function PasswordLogin({ back, note, onCode }: { back: string; note: string | null; onCode: () => void }) {
  const { enter, lit } = usePower()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; field: 'email' | 'password' | 'both' } | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const pwRef = useRef<HTMLInputElement>(null)

  useEffect(() => emailRef.current?.focus(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || lit) return
    if (!email.trim() || !password) {
      setError({ text: !email.trim() ? 'Gib deine E-Mail-Adresse ein.' : 'Gib dein Passwort ein.', field: !email.trim() ? 'email' : 'password' })
      ;(!email.trim() ? emailRef : pwRef).current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await login(email, password, remember)
      enter(back)
    } catch (err) {
      const text = err instanceof AuthError ? err.message : 'Das hat nicht geklappt. Versuch es noch einmal.'
      setError({ text, field: err instanceof AuthError && err.code === 'invalid_credentials' ? 'both' : 'password' })
      setPassword('')
      setBusy(false)
      pwRef.current?.focus()
    }
  }

  const invalid = (f: 'email' | 'password') => !!error && (error.field === f || error.field === 'both')

  return (
    <>
      <AuthHead title="Anmelden" note={note} />

      <form className="panel auth__panel" onSubmit={submit} noValidate aria-describedby={error ? 'login-error' : undefined}>
        <div className="field">
          <label className="field__label" htmlFor="login-email">
            E-Mail
          </label>
          <input
            ref={emailRef}
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            className="input"
            value={email}
            aria-invalid={invalid('email') || undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <div className="field__labelrow">
            <label className="field__label" htmlFor="login-password">
              Passwort
            </label>
            <Link className="textbtn" to="/passwort-vergessen" state={{ email }}>
              Passwort vergessen?
            </Link>
          </div>
          <PasswordInput id="login-password" inputRef={pwRef} autoComplete="current-password" value={password} onChange={setPassword} invalid={invalid('password')} />
        </div>

        <div className="auth__toggle">
          <Rocker label="Angemeldet bleiben" checked={remember} onChange={setRemember} />
          {!remember && <p className="auth__hint">Die Anmeldung endet, wenn du den Browser schließt.</p>}
        </div>

        <p id="login-error" className="field__error auth__error" role="alert">
          {error?.text}
        </p>

        <button type="submit" className="btn btn--primary btn--lg auth__submit" aria-disabled={busy || undefined}>
          {busy || lit ? 'Anmelden…' : 'Anmelden'}
        </button>
      </form>

      <div className="auth__alt">
        <p className="auth__hint">Neues Gerät in der Familie? Ein Gerät, das schon angemeldet ist, zeigt dir einen Code.</p>
        <button type="button" className="btn" onClick={onCode}>
          Mit Code von anderem Gerät
        </button>
      </div>

      <p className="auth__demo label">
        Prototyp. Demo-Zugang: {DEMO_EMAIL} · {DEMO_PASSWORD}
        <button
          type="button"
          className="textbtn"
          onClick={() => {
            setEmail(DEMO_EMAIL)
            setPassword(DEMO_PASSWORD)
            setError(null)
          }}
        >
          Einsetzen
        </button>
      </p>
    </>
  )
}

/* ── Code from a device that is already logged in ───────────────────────── */

function CodeLogin({ back, onPassword }: { back: string; onPassword: () => void }) {
  const { enter, lit } = usePower()
  const [digits, setDigits] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => ref.current?.focus(), [])

  const check = async (code: string) => {
    if (busy || lit) return
    setBusy(true)
    setError(null)
    try {
      await pairWithCode(code)
      enter(back)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Das hat nicht geklappt. Versuch es noch einmal.')
      setDigits('')
      setBusy(false)
      ref.current?.focus()
    }
  }

  const change = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, 6)
    setDigits(next)
    if (error) setError(null)
    // Six digits are the whole code: no extra tap needed.
    if (next.length === 6) void check(next)
  }

  return (
    <>
      <AuthHead title="Mit Code anmelden" />

      <form
        className="panel auth__panel"
        data-flip
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (digits.length === 6) void check(digits)
          else {
            setError('Der Code hat 6 Ziffern.')
            ref.current?.focus()
          }
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="login-code">
            Code
          </label>
          <input
            ref={ref}
            id="login-code"
            name="one-time-code"
            className="input codeslot num"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            placeholder="6 Ziffern"
            value={groupCode(digits)}
            aria-invalid={!!error || undefined}
            aria-describedby="code-how"
            readOnly={busy}
            onChange={(e) => change(e.target.value)}
          />
        </div>
        <p id="code-how" className="auth__hint">
          Den Code zeigt ein angemeldetes Gerät unter Konto, Geräte, „Gerät hinzufügen“. Er gilt 10 Minuten.
        </p>

        <p className="field__error auth__error" role="alert">
          {error}
        </p>
        <p className="visually-hidden" role="status">
          {busy ? 'Code wird geprüft.' : ''}
        </p>

        <button type="submit" className="btn btn--primary btn--lg auth__submit" aria-disabled={busy || digits.length < 6 || undefined}>
          {busy || lit ? 'Verbinden…' : 'Verbinden'}
        </button>
        <p className="auth__hint">Dieses Gerät bleibt danach angemeldet, bis es jemand unter Konto abmeldet.</p>
      </form>

      <div className="auth__alt">
        <button type="button" className="textbtn auth__back" onClick={onPassword}>
          Mit E-Mail und Passwort anmelden
        </button>
      </div>

      <p className="auth__demo label">
        Prototyp. Demo-Code: {groupCode(DEMO_CODE)}
        <button type="button" className="textbtn" onClick={() => change(DEMO_CODE)}>
          Einsetzen
        </button>
      </p>
    </>
  )
}
