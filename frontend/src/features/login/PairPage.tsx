import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuthError, isLoggedIn, pairWithToken } from '../../lib/auth'
import { AuthHead, usePower } from './AuthLayout'

/** /koppeln/:token, opened by scanning the QR code on a logged-in device. */
export function PairPage() {
  const { token = '' } = useParams()
  const { enter } = usePower()
  const [state, setState] = useState<'connecting' | 'done' | 'spent' | 'already' | 'error'>(() => (isLoggedIn() ? 'already' : 'connecting'))
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (state !== 'connecting' || started.current) return
    started.current = true
    pairWithToken(token)
      .then(() => {
        setState('done')
        enter('/')
      })
      .catch((err) => {
        if (err instanceof AuthError && err.code === 'link_expired') setState('spent')
        else {
          setMessage(err instanceof AuthError ? err.message : 'Das hat nicht geklappt.')
          setState('error')
        }
      })
  }, [state, token, enter])

  if (state === 'already') {
    return (
      <>
        <AuthHead title="Schon angemeldet" />
        <div className="panel auth__panel">
          <p>Dieses Gerät ist schon angemeldet. Den Code brauchst du hier nicht.</p>
          <Link to="/" className="btn auth__submit">
            Zur Woche
          </Link>
        </div>
      </>
    )
  }

  if (state === 'spent' || state === 'error') {
    return (
      <>
        <AuthHead title={state === 'spent' ? 'Code abgelaufen' : 'Nicht verbunden'} />
        <div className="panel auth__panel">
          <p>{state === 'spent' ? 'Dieser Code ist abgelaufen oder schon benutzt. Lass dir auf dem anderen Gerät einen neuen anzeigen.' : message}</p>
          <Link to="/login?mit=code" className="btn auth__submit">
            Code eintippen
          </Link>
          <Link to="/login" className="textbtn">
            Mit E-Mail und Passwort anmelden
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <AuthHead title={state === 'done' ? 'Verbunden' : 'Gerät wird verbunden…'} />
      <div className="panel auth__panel">
        <p className="auth__sent" role="status">
          <span className="ledwin" aria-hidden="true">
            <span className="led" data-on="true" data-blink={state === 'connecting' || undefined} />
          </span>
          {state === 'done' ? 'Dieses Gerät ist jetzt angemeldet.' : 'Einen Moment, der Code wird geprüft.'}
        </p>
      </div>
    </>
  )
}
