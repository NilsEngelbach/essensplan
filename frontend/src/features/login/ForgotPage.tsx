import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AuthError, requestPasswordReset } from '../../lib/auth'
import { AuthHead } from './AuthLayout'

export function ForgotPage() {
  const location = useLocation()
  const [email, setEmail] = useState(((location.state as { email?: string } | null)?.email ?? '').trim())
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => ref.current?.focus(), [])
  useEffect(() => {
    if (sent) doneRef.current?.focus()
  }, [sent])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(email.trim() ? 'Das sieht nicht nach einer E-Mail-Adresse aus.' : 'Gib deine E-Mail-Adresse ein.')
      ref.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Das hat nicht geklappt. Versuch es noch einmal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Link to="/login" className="iconbtn iconbtn--text konto__back">
        <ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />
        Anmelden
      </Link>
      <AuthHead title="Passwort vergessen">
        {!sent && <p className="auth__intro">Wir schicken dir einen Link. Mit ihm setzt du ein neues Passwort.</p>}
      </AuthHead>

      {sent ? (
        <div className="panel auth__panel" data-flip>
          <p className="auth__sent" tabIndex={-1} ref={doneRef}>
            <span className="ledwin" aria-hidden="true">
              <span className="led" data-on="true" />
            </span>
            <span>
              Wenn es ein Konto mit <strong>{email.trim()}</strong> gibt, ist jetzt eine Mail unterwegs. Der Link gilt 60 Minuten.
            </span>
          </p>
          <p className="auth__hint">Nichts angekommen? Schau im Spam-Ordner nach, oder prüf die Adresse.</p>
          <button type="button" className="textbtn" onClick={() => setSent(false)}>
            Andere Adresse eingeben
          </button>
        </div>
      ) : (
        <form className="panel auth__panel" onSubmit={submit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="forgot-email">
              E-Mail
            </label>
            <input
              ref={ref}
              id="forgot-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              className="input"
              value={email}
              aria-invalid={!!error || undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <p className="field__error auth__error" role="alert">
            {error}
          </p>
          <button type="submit" className="btn btn--primary btn--lg auth__submit" aria-disabled={busy || undefined}>
            {busy ? 'Link wird geschickt…' : 'Link schicken'}
          </button>
        </form>
      )}

    </>
  )
}
