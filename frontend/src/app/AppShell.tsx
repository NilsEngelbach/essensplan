import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BookOpen, CalendarDays, Plus, ShoppingBasket } from 'lucide-react'
import { Segmented } from '../components/controls'
import { resetDemo, subscribe, unseenActivityCount } from '../lib/api'
import { useToast } from '../components/toast'
import { getAccount, logout, subscribeAuth } from '../lib/auth'

type ThemeChoice = 'system' | 'light' | 'dark'
const THEME_KEY = 'essensplan.theme'

function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* storage unavailable */
  }
  return 'system'
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

const NAV = [
  { to: '/', label: 'Woche', icon: CalendarDays, end: true },
  { to: '/rezepte', label: 'Rezepte', icon: BookOpen, end: false },
  { to: '/einkauf', label: 'Einkauf', icon: ShoppingBasket, end: false },
]

/** The power button: the one green control that adds a recipe from anywhere. */
function PowerButton({ variant }: { variant: 'bar' | 'rail' }) {
  return (
    <NavLink to="/rezepte/neu" className={`power power--${variant}`} aria-label="Rezept hinzufügen">
      <span className="power__disc" aria-hidden="true">
        <Plus size={variant === 'bar' ? 26 : 20} strokeWidth={2.5} />
      </span>
      {variant === 'rail' && <span className="power__text">Rezept hinzufügen</span>}
    </NavLink>
  )
}

function AccountMenu({ placement }: { placement: 'header' | 'rail' }) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>(readTheme)
  const ref = useRef<HTMLDivElement>(null)
  const toast = useToast()
  const [, force] = useState(0)
  useEffect(() => subscribe(() => force((n) => n + 1)), [])
  useEffect(() => subscribeAuth(() => force((n) => n + 1)), [])
  const unseen = unseenActivityCount()
  const { name } = getAccount()
  const initial = name.trim().charAt(0).toLocaleUpperCase('de-DE') || '?'

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`account account--${placement}`} ref={ref}>
      <button type="button" className="account__btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <span className="account__avatar" aria-hidden="true">
          {initial}
          {unseen > 0 && <span className="account__dot" />}
        </span>
        {placement === 'rail' && <span className="account__name">{name}</span>}
        <span className="visually-hidden">Konto und Einstellungen{unseen > 0 ? `, ${unseen} neue Agenten-Aktivitäten` : ''}</span>
      </button>
      {open && (
        <div className="account__menu" role="menu">
          <div className="account__head">
            <span className="account__avatar account__avatar--lg" aria-hidden="true">
              {initial}
            </span>
            <div>
              <div className="account__who">{name}</div>
              <div className="label">Ein Konto für die ganze Familie</div>
            </div>
          </div>
          <Segmented<ThemeChoice>
            label="Darstellung"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Hell' },
              { value: 'dark', label: 'Dunkel' },
            ]}
          />
          <div className="account__links">
            <Link to="/konto" role="menuitem" className="account__link" onClick={() => setOpen(false)}>
              Einstellungen
            </Link>
            <Link to="/konto/api" role="menuitem" className="account__link" onClick={() => setOpen(false)}>
              API &amp; Agenten
            </Link>
            <Link to="/konto/aktivitaet" role="menuitem" className="account__link" onClick={() => setOpen(false)}>
              Aktivität
              {unseen > 0 && (
                <span className="account__new">
                  <span className="led" data-on="true" aria-hidden="true" />
                  {unseen} neu
                </span>
              )}
            </Link>
            <a className="account__link" href="/demo/credits.json" target="_blank" rel="noreferrer">
              Fotonachweis (Demo)
            </a>
            <button
              type="button"
              role="menuitem"
              className="account__link"
              onClick={() => {
                resetDemo()
                setOpen(false)
                toast.show('Demo-Daten zurückgesetzt.')
              }}
            >
              Demo-Daten zurücksetzen
            </button>
            {/* No confirmation: logging in again is the undo. */}
            <button type="button" role="menuitem" className="account__link account__logout" onClick={() => logout()}>
              Abmelden
            </button>
          </div>
          <p className="account__note label">Prototyp mit Demo-Daten, keine echten Rezepte.</p>
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  // "/" and "/woche/…" are both the week.
  const weekActive = (to: string) => to === '/' && location.pathname.startsWith('/woche/')

  // "/" focuses recipe search from anywhere on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== '/' || e.metaKey || e.ctrlKey || /input|textarea|select/i.test(t.tagName) || t.isContentEditable) return
      e.preventDefault()
      if (location.pathname === '/rezepte') document.getElementById('recipe-search')?.focus()
      else navigate('/rezepte?suche=1')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [location.pathname, navigate])

  return (
    <div className="shell">
      <aside className="rail" aria-label="Hauptnavigation">
        <div className="rail__brand">
          <span className="wordmark">essensplan</span>
        </div>
        <PowerButton variant="rail" />
        <nav className="rail__nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `rail__item${isActive || weekActive(to) ? ' active' : ''}`}>
              <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail__foot">
          <span className="label rail__hint">
            <kbd>/</kbd> sucht Rezepte
          </span>
          <AccountMenu placement="rail" />
        </div>
      </aside>

      <header className="topbar">
        <span className="wordmark">essensplan</span>
        <AccountMenu placement="header" />
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <nav className="bar" aria-label="Hauptnavigation">
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `bar__item${isActive || weekActive(to) ? ' active' : ''}`}>
            <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
        <PowerButton variant="bar" />
        {NAV.slice(2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="bar__item">
            <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
