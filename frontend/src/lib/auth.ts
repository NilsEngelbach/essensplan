// Auth against /api/v1/auth/* and /me (D19, D20). One account for the whole
// family (D11); a session is one device. The server keeps the sessions; this
// module caches who is logged in, the device list and open pairing links so
// components can read them synchronously, and notifies on change.
import { ApiError, http, onUnauthorized, setCsrf } from './http'
import type { Settings } from './types'

export { ApiError as AuthError }

export const MIN_PASSWORD = 10

export interface Account {
  name: string
  email: string
}

export interface Me extends Account {
  id: string
  settings: Settings
  today: string
  defaultWeekStart: string
  csrfToken?: string
}

export interface Session {
  id: string
  deviceLabel: string
  remember: boolean
  createdAt: string
  lastSeenAt: string
  via: 'password' | 'pairing' | 'reset' | 'invite' | 'register'
  current: boolean
}

export interface DeviceLink {
  id: string
  code: string | null // only known on the device that created it
  token: string | null
  url?: string
  createdAt: string
  expiresAt: string
  usedAt: string | null
  usedByLabel: string | null
  spent?: boolean
}

interface Started {
  account: Account
  session: Session
  csrfToken: string
}

let me: Me | null = null
let sessions: Session[] = []
const links = new Map<string, DeviceLink>()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

export function subscribeAuth(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let loggedOutAt = 0

// A 401 anywhere means the session is gone (expired, revoked on another device, family locked).
onUnauthorized(() => {
  if (!me) return
  me = null
  sessions = []
  setCsrf(null)
  notify()
})

/** Asks the server who this device is. Called once before the app renders. */
export async function bootstrapAuth(): Promise<void> {
  try {
    await refreshMe()
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e
    me = null
  }
}

async function refreshMe(): Promise<Me> {
  const next = await http<Me>('GET', '/me')
  me = next
  if (next.csrfToken) setCsrf(next.csrfToken)
  notify()
  return next
}

/** Fresh login, pairing or reset: the server set the cookie; load the account. */
async function started(r: Started): Promise<Session> {
  setCsrf(r.csrfToken)
  await refreshMe()
  return r.session
}

export function isLoggedIn(): boolean {
  return me !== null
}

export function getAccount(): Account {
  return me ? { name: me.name, email: me.email } : { name: '', email: '' }
}

/** The cached /me (settings, today, default week); null when logged out. */
export function getMe(): Me | null {
  return me
}

export function setMe(next: Me) {
  me = { ...next, csrfToken: next.csrfToken ?? me?.csrfToken }
  notify()
}

/* ── Login, logout ──────────────────────────────────────────────────────── */

export async function login(email: string, password: string, remember: boolean): Promise<Session> {
  return started(await http<Started>('POST', '/auth/login', { email: email.trim(), password, remember }))
}

/** True right after logging out on this device, so the login page can say so. */
export function justLoggedOut(): boolean {
  return Date.now() - loggedOutAt < 3000
}

export async function logout(): Promise<void> {
  loggedOutAt = Date.now()
  try {
    await http('POST', '/auth/logout')
  } finally {
    me = null
    sessions = []
    setCsrf(null)
    notify()
  }
}

/* ── Sessions (Konto → Geräte) ──────────────────────────────────────────── */

/** The last loaded list, this device first. Call loadSessions() to refresh. */
export function listSessions(): Session[] {
  return sessions
}

export async function loadSessions(): Promise<Session[]> {
  sessions = (await http<{ items: Session[] }>('GET', '/auth/sessions')).items
  notify()
  return sessions
}

export function currentSession(): Session | null {
  return sessions.find((s) => s.current) ?? null
}

export async function revokeSession(id: string): Promise<void> {
  const mine = sessions.find((s) => s.id === id)?.current
  if (mine) return logout()
  await http('DELETE', `/auth/sessions/${encodeURIComponent(id)}`)
  await loadSessions()
}

export async function revokeOtherSessions(): Promise<number> {
  const { revoked } = await http<{ revoked: number }>('POST', '/auth/sessions/revoke-others')
  await loadSessions()
  return revoked
}

/* ── Pairing a new device ───────────────────────────────────────────────── */

/** On the trusted device: a code and a QR token, valid for 10 minutes, single use. */
export async function createDeviceLink(): Promise<DeviceLink> {
  const link = await http<DeviceLink>('POST', '/auth/device-links')
  links.set(link.id, link)
  notify()
  return link
}

/** The cached link (with the code this device created). Refresh with pollDeviceLink(). */
export function getDeviceLink(id: string): DeviceLink | null {
  return links.get(id) ?? null
}

/** Asks whether a device joined; keeps the code and token, which only creation returns. */
export async function pollDeviceLink(id: string): Promise<DeviceLink | null> {
  const known = links.get(id)
  try {
    const fresh = await http<DeviceLink>('GET', `/auth/device-links/${encodeURIComponent(id)}`)
    const merged = { ...fresh, code: known?.code ?? null, token: known?.token ?? null, url: known?.url }
    links.set(id, merged)
    if (merged.usedAt && !known?.usedAt) await loadSessions()
    else notify()
    return merged
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      links.delete(id)
      notify()
      return null
    }
    throw e
  }
}

export async function cancelDeviceLink(id: string): Promise<void> {
  links.delete(id)
  notify()
  await http('DELETE', `/auth/device-links/${encodeURIComponent(id)}`)
}

/** On the new device: the 6-digit code from the trusted device. */
export async function pairWithCode(code: string): Promise<Session> {
  return started(await http<Started>('POST', '/auth/pair', { code }))
}

/** On the new device, after scanning the QR code: /koppeln/:token. */
export async function pairWithToken(token: string): Promise<Session> {
  return started(await http<Started>('POST', '/auth/pair', { token }))
}

/* ── Password reset and invites ─────────────────────────────────────────── */

/** Always resolves the same way, whether or not the address exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  await http('POST', '/auth/forgot-password', { email: email.trim() })
}

/** 'reset' or 'invite' while the mailed link is valid, null once it is spent or expired. */
export async function checkResetToken(token: string | null): Promise<'reset' | 'invite' | null> {
  if (!token) return null
  try {
    return (await http<{ purpose: 'reset' | 'invite' }>('POST', '/auth/reset-password/check', { token })).purpose
  } catch (e) {
    if (e instanceof ApiError && e.code === 'reset_invalid') return null
    throw e
  }
}

export async function resetPassword(token: string, password: string, revokeOthers: boolean): Promise<Session> {
  return started(await http<Started>('POST', '/auth/reset-password', { token, password, revokeOthers }))
}

/* ── Name and e-mail ────────────────────────────────────────────────────── */

export async function updateAccount(patch: { name: string; email: string; currentPassword?: string }): Promise<Account> {
  const body: Record<string, string> = { name: patch.name.trim(), email: patch.email.trim() }
  if (patch.currentPassword) body.currentPassword = patch.currentPassword
  setMe(await http<Me>('PATCH', '/me', body))
  return getAccount()
}
