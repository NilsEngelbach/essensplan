import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'info' | 'error'
  undo?: () => void
}

interface ToastApi {
  show: (message: string, opts?: { undo?: () => void; tone?: 'info' | 'error' }) => void
}

const Ctx = createContext<ToastApi | null>(null)

/** One message channel for the whole app; destructive actions carry Undo. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const show = useCallback<ToastApi['show']>(
    (message, opts) => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-2), { id, message, tone: opts?.tone ?? 'info', undo: opts?.undo }])
      window.setTimeout(() => dismiss(id), opts?.undo ? 7000 : 4000)
    },
    [dismiss],
  )

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" data-tone={t.tone}>
            <span className="toast__led" aria-hidden="true" />
            <span className="toast__msg">{t.message}</span>
            {t.undo && (
              <button
                type="button"
                className="toast__undo"
                onClick={() => {
                  t.undo?.()
                  dismiss(t.id)
                }}
              >
                Rückgängig
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(Ctx)
  if (!api) throw new Error('useToast outside ToastProvider')
  return api
}
