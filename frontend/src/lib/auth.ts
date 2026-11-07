// Prototype auth layer. Same function surface the real client will expose
// against /api/v1/auth/* and /me; here backed by localStorage.
//
// One account for the whole family (D11). A session is one device. "Angemeldet
// bleiben" off keeps the session id in sessionStorage, so it ends with the
// browser, the way a session cookie would.

const AUTH_KEY = 'essensplan.prototype.auth.v1'
const CURRENT_KEY = 'essensplan.prototype.session'

export const DEMO_EMAIL = 'nils@familie.de'
export const DEMO_PASSWORD = 'essensplan'
/** Always accepted in code mode, so the pairing flow can be tried without a second device. */
export const DEMO_CODE = '482913'
/** The token the demo reset mail links to. */
export const DEMO_RESET_TOKEN = 'demo'

export const MIN_PASSWORD = 10
const LINK_MINUTES = 10
const MAX_CODE_ATTEMPTS = 5
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_MINUTES = 5

export interface Account {
  name: string
  email: string
}

export interface Session {
  id: string
  deviceLabel: string
  remember: boolean
  createdAt: string
  lastSeenAt: string
  via: 'password' | 'pairing' | 'reset'
}

export interface DeviceLink {
  id: string
  code: string
  token: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  usedByLabel: string | null
}

interface AuthStore {
  account: Account
  password: string
  sessions: Session[]
  links: DeviceLink[]
  resetToken: string | null
  failures: { count: number; lockedUntil: string | null }
  codeFailures: number
}

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'invalid_code'
  | 'code_spent'
  | 'link_expired'
  | 'reset_invalid'
  | 'weak_password'
  | 'wrong_password'
  | 'invalid_email'
  | 'offline'

export class AuthError extends Error {
  constructor(public code: AuthErrorCode, message: string) {
    super(message)
  }
}

const uid = () => Math.random().toString(36).slice(2, 10)
const delay = (ms = 450) => new Promise((r) => setTimeout(r, ms))
const iso = (msFromNow = 0) => new Date(Date.now() + msFromNow).toISOString()

/** "iPhone · Safari": what the server derives from the User-Agent. */
export function deviceLabel(ua = navigator.userAgent): string {
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    ? 'iPad'
    : /iPhone/.test(ua)
      ? 'iPhone'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Gerät'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  return `${os} · ${browser}`
}

function fresh(): AuthStore {
  const h = (n: number) => iso(-n * 3_600_000)
  return {
    account: { name: 'Nils', email: DEMO_EMAIL },
    password: DEMO_PASSWORD,
    // The family's other devices, so the list has something real to show.
    sessions: [
      { id: 'demo-iphone', deviceLabel: 'iPhone · Safari', remember: true, createdAt: h(24 * 140), lastSeenAt: h(2), via: 'password' },
      { id: 'demo-ipad', deviceLabel: 'iPad · Safari', remember: true, createdAt: h(24 * 61), lastSeenAt: h(26), via: 'pairing' },
      { id: 'demo-mac', deviceLabel: 'Mac · Safari', remember: true, createdAt: h(24 * 30), lastSeenAt: h(24 * 12), via: 'pairing' },
    ],
    links: [],
    resetToken: null,
    failures: { count: 0, lockedUntil: null },
    codeFailures: 0,
  }
}

// Read on every call, so a second tab (or the "new device" in another window) sees the same state.
function read(): AuthStore {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<AuthStore>) }
  } catch {
    /* storage unavailable or corrupt */
  }
  return fresh()
}

let memory: AuthStore | null = null
const listeners = new Set<() => void>()

function load(): AuthStore {
  return memory ?? read()
}

function write(s: AuthStore) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(s))
    memory = null
  } catch {
    memory = s // prototype keeps working in memory
  }
  listeners.forEach((l) => l())
}

export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function currentId(): string | null {
  try {
    return sessionStorage.getItem(CURRENT_KEY) ?? localStorage.getItem(CURRENT_KEY)
  } catch {
    return null
  }
}

function setCurrent(id: string | null, remember = true) {
  try {
    sessionStorage.removeItem(CURRENT_KEY)
    localStorage.removeItem(CURRENT_KEY)
    if (id) (remember ? localStorage : sessionStorage).setItem(CURRENT_KEY, id)
  } catch {
    /* ignore */
  }
}

export function currentSession(): Session | null {
  const id = currentId()
  return (id && load().sessions.find((s) => s.id === id)) || null
}

export function isLoggedIn(): boolean {
  return currentSession() !== null
}

export function getAccount(): Account {
  return load().account
}

function startSession(s: AuthStore, remember: boolean, via: Session['via']): Session {
  const session: Session = { id: uid(), deviceLabel: deviceLabel(), remember, createdAt: iso(), lastSeenAt: iso(), via }
  s.sessions.push(session)
  setCurrent(session.id, remember)
  return session
}

function online() {
  if (!navigator.onLine) throw new AuthError('offline', 'Keine Verbindung zum Server. Prüf dein WLAN oder die mobilen Daten.')
}

function lockText(until: string): string {
  const min = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000))
  return `Zu viele Versuche. Probier es in ${min === 1 ? 'einer Minute' : `${min} Minuten`} wieder.`
}

/* ── Login, logout ──────────────────────────────────────────────────────── */

export async function login(email: string, password: string, remember: boolean): Promise<Session> {
  online()
  await delay()
  const s = load()
  if (s.failures.lockedUntil && new Date(s.failures.lockedUntil).getTime() > Date.now()) {
    throw new AuthError('rate_limited', lockText(s.failures.lockedUntil))
  }
  if (email.trim().toLowerCase() !== s.account.email.toLowerCase() || password !== s.password) {
    const count = s.failures.count + 1
    s.failures = count >= MAX_LOGIN_ATTEMPTS ? { count: 0, lockedUntil: iso(LOCK_MINUTES * 60_000) } : { count, lockedUntil: null }
    write(s)
    if (s.failures.lockedUntil) throw new AuthError('rate_limited', lockText(s.failures.lockedUntil))
    throw new AuthError('invalid_credentials', 'E-Mail oder Passwort stimmt nicht.')
  }
  s.failures = { count: 0, lockedUntil: null }
  const session = startSession(s, remember, 'password')
  write(s)
  return session
}

let loggedOutAt = 0

/** True right after logging out on this device, so the login page can say so. */
export function justLoggedOut(): boolean {
  return Date.now() - loggedOutAt < 3000
}

export function logout() {
  loggedOutAt = Date.now()
  const id = currentId()
  const s = load()
  s.sessions = s.sessions.filter((x) => x.id !== id)
  setCurrent(null)
  write(s)
}

/* ── Sessions (Konto → Geräte) ──────────────────────────────────────────── */

export function listSessions(): Session[] {
  const id = currentId()
  const all = [...load().sessions]
  // This device first, then by last activity.
  return all.sort((a, b) => (a.id === id ? -1 : b.id === id ? 1 : b.lastSeenAt.localeCompare(a.lastSeenAt)))
}

export function revokeSession(id: string) {
  if (id === currentId()) return logout()
  const s = load()
  s.sessions = s.sessions.filter((x) => x.id !== id)
  write(s)
}

export function revokeOtherSessions(): number {
  const id = currentId()
  const s = load()
  const before = s.sessions.length
  s.sessions = s.sessions.filter((x) => x.id === id)
  write(s)
  return before - s.sessions.length
}

/* ── Pairing a new device ───────────────────────────────────────────────── */

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** On the trusted device: a code and a QR token, valid for 10 minutes, single use. */
export function createDeviceLink(): DeviceLink {
  const s = load()
  // One open code at a time: a new one replaces the old.
  s.links = s.links.filter((l) => l.usedAt)
  s.codeFailures = 0
  const link: DeviceLink = { id: uid(), code: randomCode(), token: randomToken(), createdAt: iso(), expiresAt: iso(LINK_MINUTES * 60_000), usedAt: null, usedByLabel: null }
  s.links.push(link)
  write(s)
  return link
}

export function getDeviceLink(id: string): DeviceLink | null {
  return load().links.find((l) => l.id === id) ?? null
}

export function cancelDeviceLink(id: string) {
  const s = load()
  s.links = s.links.filter((l) => l.id !== id)
  write(s)
}

const openLink = (l: DeviceLink) => !l.usedAt && new Date(l.expiresAt).getTime() > Date.now()

function consume(s: AuthStore, link: DeviceLink | null, label: string): Session {
  if (link) {
    link.usedAt = iso()
    link.usedByLabel = label
  }
  s.codeFailures = 0
  // Paired devices are family devices: always a lasting session.
  return startSession(s, true, 'pairing')
}

/** On the new device: the 6-digit code from the trusted device. */
export async function pairWithCode(code: string): Promise<Session> {
  online()
  await delay()
  const s = load()
  const link = s.links.find((l) => openLink(l) && l.code === code) ?? null
  if (!link && code !== DEMO_CODE) {
    // Wrong guesses count against every open code; five of them spend it.
    s.codeFailures += 1
    if (s.codeFailures >= MAX_CODE_ATTEMPTS) {
      s.links = s.links.filter((l) => !openLink(l))
      s.codeFailures = 0
      write(s)
      throw new AuthError('code_spent', 'Zu viele falsche Codes. Lass dir auf dem anderen Gerät einen neuen Code anzeigen.')
    }
    write(s)
    throw new AuthError('invalid_code', 'Der Code passt nicht. Schau noch einmal auf das andere Gerät.')
  }
  const session = consume(s, link, deviceLabel())
  write(s)
  return session
}

/** On the new device, after scanning the QR code: /koppeln/:token. */
export async function pairWithToken(token: string): Promise<Session> {
  online()
  await delay(700)
  const s = load()
  const link = s.links.find((l) => openLink(l) && l.token === token)
  if (!link) throw new AuthError('link_expired', 'Dieser Code ist abgelaufen oder schon benutzt.')
  const session = consume(s, link, deviceLabel())
  write(s)
  return session
}

/** Prototype only: pretend another device entered the code. */
export function simulatePairing(id: string, label = 'Android · Chrome') {
  const s = load()
  const link = s.links.find((l) => l.id === id)
  if (!link || !openLink(link)) return
  link.usedAt = iso()
  link.usedByLabel = label
  s.sessions.push({ id: uid(), deviceLabel: label, remember: true, createdAt: iso(), lastSeenAt: iso(), via: 'pairing' })
  write(s)
}

/* ── Password reset ─────────────────────────────────────────────────────── */

/** Always resolves the same way, whether or not the address exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  online()
  await delay()
  const s = load()
  if (email.trim().toLowerCase() === s.account.email.toLowerCase()) {
    s.resetToken = DEMO_RESET_TOKEN
    write(s)
  }
}

export function resetTokenValid(token: string | null): boolean {
  return !!token && load().resetToken === token
}

export async function resetPassword(token: string, password: string, revokeOthers: boolean): Promise<Session> {
  online()
  await delay()
  const s = load()
  if (s.resetToken !== token) throw new AuthError('reset_invalid', 'Dieser Link ist abgelaufen oder schon benutzt.')
  if (password.length < MIN_PASSWORD) throw new AuthError('weak_password', `Das Passwort braucht mindestens ${MIN_PASSWORD} Zeichen.`)
  s.password = password
  s.resetToken = null
  s.failures = { count: 0, lockedUntil: null }
  if (revokeOthers) s.sessions = []
  const session = startSession(s, true, 'reset')
  write(s)
  return session
}

/* ── Name and e-mail ────────────────────────────────────────────────────── */

export async function updateAccount(patch: { name: string; email: string; currentPassword?: string }): Promise<Account> {
  online()
  await delay(250)
  const s = load()
  const email = patch.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('invalid_email', 'Das sieht nicht nach einer E-Mail-Adresse aus.')
  if (email.toLowerCase() !== s.account.email.toLowerCase() && patch.currentPassword !== s.password) {
    throw new AuthError('wrong_password', 'Das Passwort stimmt nicht.')
  }
  s.account = { name: patch.name.trim() || s.account.name, email }
  write(s)
  return s.account
}

export function resetAuthDemo() {
  setCurrent(null)
  write(fresh())
}
