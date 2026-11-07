import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isLoggedIn, justLoggedOut, subscribeAuth } from '../lib/auth'

/**
 * Everything but the login screens needs a session. Without one, go to /login
 * and come back to this route afterwards (the real client does the same on a 401).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [, force] = useState(0)
  useEffect(() => subscribeAuth(() => force((n) => n + 1)), [])

  if (isLoggedIn()) return <>{children}</>
  if (justLoggedOut()) return <Navigate to="/login?grund=abgemeldet" replace />
  const here = location.pathname + location.search
  return <Navigate to={here === '/' ? '/login' : `/login?zurueck=${encodeURIComponent(here)}`} replace />
}
