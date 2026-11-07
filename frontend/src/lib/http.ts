// The one door to /api/v1. JSON in and out, the session cookie rides along,
// unsafe requests carry X-CSRF-Token. Errors arrive as {"error":{code,message}}
// with German, user-facing messages; they surface here as ApiError.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: { path: string; message: string }[] = [],
  ) {
    super(message)
  }
}

const OFFLINE = 'Keine Verbindung zum Server. Prüf dein WLAN oder die mobilen Daten.'
const BROKEN = 'Da ist etwas schiefgelaufen. Versuch es gleich noch einmal.'

let csrf: string | null = null

export function setCsrf(token: string | null) {
  csrf = token
}

type Listener<T> = (value: T) => void
const unauthorized = new Set<Listener<void>>()
const failures = new Set<Listener<ApiError>>()

/** Called when the session is gone (401 outside the login calls). */
export function onUnauthorized(fn: Listener<void>): () => void {
  unauthorized.add(fn)
  return () => unauthorized.delete(fn)
}

/** Background writes report here; the shell shows them as a toast. */
export function onApiError(fn: Listener<ApiError>): () => void {
  failures.add(fn)
  return () => failures.delete(fn)
}

export function reportError(err: unknown) {
  const e = err instanceof ApiError ? err : new ApiError(0, 'client_error', BROKEN)
  if (e.status === 401) return // the login screen takes over
  failures.forEach((f) => f(e))
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export async function http<T>(method: Method, path: string, body?: unknown, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'offline', OFFLINE)
  }
  if (res.status === 204 || res.status === 202) return undefined as T
  const data = await res.json().catch(() => null)
  if (res.ok) return data as T

  const e = data?.error
  const err = new ApiError(res.status, e?.code ?? 'server_error', e?.message ?? BROKEN, e?.details ?? [])
  // Another tab logged in again: fetch the fresh token once and repeat.
  if (err.code === 'csrf_failed' && !retried) {
    const me = await http<{ csrfToken?: string }>('GET', '/me').catch(() => null)
    if (me?.csrfToken) {
      csrf = me.csrfToken
      return http<T>(method, path, body, true)
    }
  }
  if (res.status === 401 && !path.startsWith('/auth/')) unauthorized.forEach((f) => f())
  throw err
}

/** "?a=1&tags[]=x" from an object; undefined, null, false and '' are left out. */
export function qs(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === false || v === '') continue
    if (Array.isArray(v)) v.forEach((x) => p.append(`${k}[]`, x))
    else p.set(k, v === true ? '1' : String(v))
  }
  const s = p.toString()
  return s ? `?${s}` : ''
}
