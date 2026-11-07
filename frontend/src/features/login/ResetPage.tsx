import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Rocker } from '../../components/controls'
import { AuthError, checkResetToken, getAccount, MIN_PASSWORD, resetPassword } from '../../lib/auth'
import { AuthHead, PasswordInput, usePower } from './AuthLayout'

export function ResetPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  // undefined while the server checks the link, null when it is spent or expired.
  const [purpose, setPurpose] = useState<'reset' | 'invite' | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    checkResetToken(token)
      .then((p) => alive && setPurpose(p))
      .catch(() => alive && setPurpose(null))
    return () => {
      alive = false
    }
  }, [token])

  if (purpose === undefined) return <AuthHead title="Link wird geprüft…" />
  return purpose && token ? <NewPassword token={token} invite={purpose === 'invite'} onInvalid={() => setPurpose(null)} /> : <LinkSpent />
}

function NewPassword({ token, invite, onInvalid }: { token: string; invite: boolean; onInvalid: () => void }) {
  const { enter, lit } = usePower()
  const [password, setPassword] = useState('')
  const [revokeOthers, setRevokeOthers] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => ref.current?.focus(), [])

  const missing = Math.max(0, MIN_PASSWORD - password.length)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy || lit) return
    if (missing > 0) {
      setError(`Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`)
      ref.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password, revokeOthers)
      enter('/', invite ? 'Willkommen bei Essensplan.' : revokeOthers ? 'Neues Passwort gespeichert. Alle anderen Geräte sind abgemeldet.' : 'Neues Passwort gespeichert.')
    } catch (err) {
      if (err instanceof AuthError && err.code === 'reset_invalid') return onInvalid()
      setError(err instanceof AuthError ? err.message : 'Das hat nicht geklappt. Versuch es noch einmal.')
      setBusy(false)
    }
  }

  return (
    <>
      <AuthHead title={invite ? 'Willkommen' : 'Neues Passwort'}>
        <p className="auth__intro">
          {invite ? 'Leg ein Passwort für euer Familienkonto fest. Danach bist du auf diesem Gerät angemeldet.' : 'Danach bist du auf diesem Gerät angemeldet.'}
        </p>
      </AuthHead>

      <form className="panel auth__panel" onSubmit={submit} noValidate>
        {/* Lets password managers file the new password under the right account. */}
        <input type="email" name="email" autoComplete="username" value={getAccount().email} readOnly hidden />
        <div className="field">
          <label className="field__label" htmlFor="reset-password">
            {invite ? 'Passwort' : 'Neues Passwort'}
          </label>
          <PasswordInput id="reset-password" inputRef={ref} autoComplete="new-password" value={password} onChange={setPassword} invalid={!!error} describedBy="reset-rule" />
          <p id="reset-rule" className="label auth__rule" data-ok={missing === 0 || undefined}>
            <span className="led" data-on={missing === 0 || undefined} aria-hidden="true" />
            {missing === 0 ? `mindestens ${MIN_PASSWORD} Zeichen, passt` : password ? `mindestens ${MIN_PASSWORD} Zeichen, noch ${missing}` : `mindestens ${MIN_PASSWORD} Zeichen`}
          </p>
        </div>

        {!invite && (
        <div className="auth__toggle">
          <Rocker label="Alle anderen Geräte abmelden" checked={revokeOthers} onChange={setRevokeOthers} />
          <p className="auth__hint">
            {revokeOthers
              ? 'Die anderen Geräte müssen sich danach neu anmelden oder neu verbunden werden.'
              : 'Die Geräte der Familie bleiben angemeldet.'}
          </p>
        </div>
        )}

        <p className="field__error auth__error" role="alert">
          {error}
        </p>
        <button type="submit" className="btn btn--primary btn--lg auth__submit" aria-disabled={busy || undefined}>
          {busy || lit ? 'Wird gespeichert…' : invite ? 'Passwort festlegen' : 'Passwort speichern'}
        </button>
      </form>
    </>
  )
}

function LinkSpent() {
  return (
    <>
      <AuthHead title="Link abgelaufen" />
      <div className="panel auth__panel">
        <p>Dieser Link ist abgelaufen oder schon benutzt. Ein Link gilt 60 Minuten (eine Einladung 7 Tage) und nur einmal.</p>
        <Link to="/passwort-vergessen" className="btn auth__submit">
          Neuen Link anfordern
        </Link>
        <Link to="/login" className="textbtn">
          Zur Anmeldung
        </Link>
      </div>
    </>
  )
}
