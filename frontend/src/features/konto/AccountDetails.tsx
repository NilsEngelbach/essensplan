import { useEffect, useState, type FormEvent } from 'react'
import { useToast } from '../../components/toast'
import { AuthError, getAccount, requestPasswordReset, subscribeAuth, updateAccount } from '../../lib/auth'
import { PasswordInput } from '../login/AuthLayout'

/** Konto → Name und E-Mail. Changing the e-mail asks for the password; the password itself goes through the reset mail. */
export function AccountDetails() {
  const toast = useToast()
  const [account, setAccount] = useState(getAccount)
  useEffect(() => subscribeAuth(() => setAccount(getAccount())), [])
  const [name, setName] = useState(account.name)
  const [email, setEmail] = useState(account.email)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; field: 'email' | 'password' } | null>(null)

  const emailChanged = email.trim().toLowerCase() !== account.email.toLowerCase()
  const dirty = name.trim() !== account.name || emailChanged

  const discard = () => {
    setName(account.name)
    setEmail(account.email)
    setPassword('')
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!dirty || busy) return
    if (emailChanged && !password) {
      setError({ text: 'Gib dein aktuelles Passwort ein, um die E-Mail zu ändern.', field: 'password' })
      document.getElementById('acct-password')?.focus()
      return
    }
    setBusy(true)
    setError(null)
    try {
      const next = await updateAccount({ name, email, currentPassword: password })
      setName(next.name)
      setEmail(next.email)
      setPassword('')
      toast.show(emailChanged ? `Gespeichert. Du meldest dich jetzt mit ${next.email} an.` : 'Gespeichert.')
    } catch (err) {
      if (err instanceof AuthError) setError({ text: err.message, field: err.code === 'invalid_email' ? 'email' : 'password' })
      else setError({ text: 'Das hat nicht geklappt. Versuch es noch einmal.', field: 'password' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel konto__panel" aria-labelledby="acct-h">
      <div>
        <h2 id="acct-h" className="panel__title">
          Name und E-Mail
        </h2>
        <p className="konto__hint">Der Name steht im Menü. Mit der E-Mail meldest du dich an, und an sie geht der Link für ein neues Passwort.</p>
      </div>

      <form className="acct" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="acct-name">
            Name
          </label>
          <input id="acct-name" name="name" className="input" autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="acct-email">
            E-Mail
          </label>
          <input
            id="acct-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            className="input"
            value={email}
            aria-invalid={error?.field === 'email' || undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {emailChanged && (
          <div className="field" data-flip>
            <label className="field__label" htmlFor="acct-password">
              Aktuelles Passwort
            </label>
            <PasswordInput id="acct-password" autoComplete="current-password" value={password} onChange={setPassword} invalid={error?.field === 'password'} />
          </div>
        )}
        <p className="field__error auth__error" role="alert">
          {error?.text}
        </p>
        {dirty && (
          <div className="devices__actions">
            <button type="submit" className="btn" aria-disabled={busy || undefined}>
              {busy ? 'Wird gespeichert…' : 'Speichern'}
            </button>
            <button type="button" className="textbtn" onClick={discard}>
              Verwerfen
            </button>
          </div>
        )}
      </form>

      <p className="acct__pw">
        <span className="konto__hint">Neues Passwort? Du bekommst einen Link per Mail.</span>
        <button
          type="button"
          className="textbtn"
          onClick={async () => {
            try {
              await requestPasswordReset(account.email)
              toast.show(`Link ist unterwegs an ${account.email}.`)
            } catch (err) {
              toast.show(err instanceof AuthError ? err.message : 'Das hat nicht geklappt.', { tone: 'error' })
            }
          }}
        >
          Link schicken
        </button>
      </p>
    </section>
  )
}
