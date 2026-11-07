import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { isLoggedIn } from '../../lib/auth'
import { useToast } from '../../components/toast'

interface Power {
  lit: boolean
  /** The appliance switches on: the wordmark LED lights, then the app opens. */
  enter: (to: string, message?: string) => void
}

const PowerCtx = createContext<Power | null>(null)

export function usePower(): Power {
  const p = useContext(PowerCtx)
  if (!p) throw new Error('usePower outside AuthLayout')
  return p
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Only for paths inside the app; anything else falls back to the week. */
export function safeBack(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/'
  if (/^\/(login|passwort-|koppeln)/.test(path)) return '/'
  return path
}

/**
 * The logged-out app: the appliance on standby. Only the wordmark, its LED dark,
 * and one narrow column. No shell, no navigation.
 */
export function AuthLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [lit, setLit] = useState(false)
  const timer = useRef<number>()
  // Checked once on arrival: a fresh login must not bounce before the LED moment.
  const [arrivedLoggedIn] = useState(isLoggedIn)

  const enter = useCallback(
    (to: string, message?: string) => {
      setLit(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(
        () => {
          navigate(to, { replace: true })
          if (message) toast.show(message)
        },
        reducedMotion() ? 0 : 560,
      )
    },
    [navigate, toast],
  )

  const guestOnly = location.pathname === '/login' || location.pathname === '/passwort-vergessen'
  if (arrivedLoggedIn && guestOnly) return <Navigate to="/" replace />

  return (
    <PowerCtx.Provider value={{ lit, enter }}>
      <div className="auth">
        <header className="authbar">
          <span className="wordmark" data-standby={!lit || undefined} data-power={lit || undefined}>
            essensplan
          </span>
          <span className="visually-hidden" role="status">
            {lit ? 'Angemeldet.' : ''}
          </span>
        </header>
        <main className="auth__main" id="main">
          <Outlet />
        </main>
        <footer className="auth__foot label">Coded with ❤️ in THE LÄND.</footer>
      </div>
    </PowerCtx.Provider>
  )
}

/** The page title plus an optional status line under it (never a kicker above it). */
export function AuthHead({ title, note, children }: { title: string; note?: string | null; children?: ReactNode }) {
  return (
    <div className="auth__head">
      <h1 className="pagehead__title">{title}</h1>
      {note && (
        <p className="auth__note">
          <span className="ledwin" aria-hidden="true">
            <span className="led" />
          </span>
          {note}
        </p>
      )}
      {children}
    </div>
  )
}

interface PasswordInputProps {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  invalid?: boolean
  describedBy?: string
  inputRef?: React.Ref<HTMLInputElement>
}

/** A password field with a show/hide eye; stays a real password input for managers. */
export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy, inputRef }: PasswordInputProps) {
  const [show, setShow] = useState(false)
  return (
    <div className="pwfield">
      <input
        ref={inputRef}
        id={id}
        name={autoComplete === 'new-password' ? 'new-password' : 'password'}
        type={show ? 'text' : 'password'}
        className="input pwfield__input"
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="iconbtn pwfield__eye" aria-label={show ? 'Passwort verbergen' : 'Passwort zeigen'} aria-pressed={show} onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff size={20} strokeWidth={1.9} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.9} aria-hidden="true" />}
      </button>
    </div>
  )
}
