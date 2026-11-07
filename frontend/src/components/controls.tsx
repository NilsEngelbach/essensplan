import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

/* ── Rocker switch ───────────────────────────────────────────────────────── */

interface RockerProps {
  label: string
  description?: string
  checked: boolean
  onChange: (next: boolean) => void
}

/** A pill-shaped appliance rocker with an LED that lights orange when on. */
export function Rocker({ label, description, checked, onChange }: RockerProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={description}
      className="rocker"
      data-on={checked || undefined}
      onClick={() => onChange(!checked)}
    >
      <span className="rocker__window" aria-hidden="true">
        <span className="rocker__led" />
      </span>
      <span className="rocker__label">
        {label}
        {description && <span className="visually-hidden">: {description}</span>}
      </span>
    </button>
  )
}

/* ── LED ramp: the one "how loved" scale ─────────────────────────────────── */

export function LedRamp({ rating, timesCooked, size = 'sm' }: { rating: number | null; timesCooked?: number; size?: 'sm' | 'md' }) {
  const lit = rating ?? 0
  const text = rating ? `Bewertung ${rating} von 5` : 'Noch nicht bewertet'
  return (
    <span className={`ledramp ledramp--${size}`} title={text}>
      <span className="ledramp__dots" role="img" aria-label={text}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="led" data-on={n <= lit || undefined} />
        ))}
      </span>
      {timesCooked !== undefined && (
        <span className="ledramp__count num" aria-label={`${timesCooked}-mal gekocht`}>
          {timesCooked}×
        </span>
      )}
    </span>
  )
}

/** Clickable LED rating for the edit form. */
export function LedRatingInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="ledinput" role="radiogroup" aria-label="Bewertung">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} von 5`}
          className="ledinput__btn"
          onClick={() => onChange(value === n ? null : n)}
        >
          <span className="led led--lg" data-on={(value ?? 0) >= n || undefined} />
        </button>
      ))}
      <span className="label ledinput__text">{value ? `${value} von 5` : 'ohne'}</span>
    </div>
  )
}

/* ── Servings dial: the signature control ────────────────────────────────── */

interface DialProps {
  value: number
  min?: number
  max?: number
  base: number
  onChange: (v: number) => void
}

const SWEEP = 270 // degrees from min to max, like an appliance knob
const C = 84 // dial face centre in SVG units (face is 168 × 168)
const SCALE_MARKS = [2, 4, 6, 8, 10, 12]

export function ServingsDial({ value, min = 1, max = 12, base, onChange }: DialProps) {
  const knobRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const labelId = useId()

  const angleFor = (v: number) => -SWEEP / 2 + ((v - min) / (max - min)) * SWEEP

  const set = useCallback(
    (v: number) => {
      const next = Math.max(min, Math.min(max, Math.round(v)))
      if (next !== value) {
        onChange(next)
        if ('vibrate' in navigator) {
          try {
            navigator.vibrate(4) // a detent you can feel on Android
          } catch {
            /* not allowed */
          }
        }
      }
    },
    [min, max, value, onChange],
  )

  const fromPointer = (clientX: number, clientY: number) => {
    const el = knobRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    let deg = (Math.atan2(clientX - cx, cy - clientY) * 180) / Math.PI // 0 = up, clockwise positive
    deg = Math.max(-SWEEP / 2, Math.min(SWEEP / 2, deg))
    set(min + ((deg + SWEEP / 2) / SWEEP) * (max - min))
  }

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && fromPointer(e.clientX, e.clientY)
    const up = () => (dragging.current = false)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  })

  const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i)

  return (
    <div className="dial">
      <button type="button" className="dial__step" aria-label="Eine Portion weniger" disabled={value <= min} onClick={() => set(value - 1)}>
        <Minus size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <div className="dial__face">
        <svg className="dial__ticks" viewBox="0 0 168 168" aria-hidden="true">
          {ticks.map((t) => {
            const a = ((angleFor(t) - 90) * Math.PI) / 180
            const r1 = t === base ? 70 : 67
            const r2 = 59
            return (
              <line
                key={t}
                x1={C + r1 * Math.cos(a)}
                y1={C + r1 * Math.sin(a)}
                x2={C + r2 * Math.cos(a)}
                y2={C + r2 * Math.sin(a)}
                className="dial__tick"
                data-on={t <= value || undefined}
                data-base={t === base || undefined}
              />
            )
          })}
          {SCALE_MARKS.filter((m) => m >= min && m <= max).map((m) => {
            const a = ((angleFor(m) - 90) * Math.PI) / 180
            return (
              <text key={m} x={C + 79 * Math.cos(a)} y={C + 79 * Math.sin(a)} className="dial__numeral" data-base={m === base || undefined}>
                {m}
              </text>
            )
          })}
        </svg>
        <div
          ref={knobRef}
          className="dial__knob"
          role="slider"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} ${value === 1 ? 'Portion' : 'Portionen'}`}
          onPointerDown={(e) => {
            dragging.current = true
            ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
            fromPointer(e.clientX, e.clientY)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + 1)
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - 1)
            else if (e.key === 'Home') set(min)
            else if (e.key === 'End') set(max)
            else return
            e.preventDefault()
          }}
        >
          <span className="dial__pointer" style={{ transform: `rotate(${angleFor(value)}deg)` }} aria-hidden="true" />
          <span className="dial__readout num" aria-hidden="true">
            {value}
            <span className="dial__unit">{value === 1 ? 'portion' : 'portionen'}</span>
          </span>
        </div>
      </div>
      <button type="button" className="dial__step" aria-label="Eine Portion mehr" disabled={value >= max} onClick={() => set(value + 1)}>
        <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
      </button>
      <span id={labelId} className="visually-hidden">
        Portionen
      </span>
      {value !== base && (
        <span className="dial__label">
          <button type="button" className="dial__reset" onClick={() => onChange(base)}>
            Zurück auf {base}
          </button>
        </span>
      )}
    </div>
  )
}

/* ── Segmented switch (slot, difficulty, theme) ──────────────────────────── */

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  hideLabel,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
  hideLabel?: boolean
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {!hideLabel && <span className="label segmented__label">{label}</span>}
      <div className="segmented__track">
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="segmented__btn" onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Dialog: protected focus for genuinely destructive moments ──────────── */

export function Dialog({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className="dialog" aria-label={title} onClose={onClose} onCancel={onClose}>
      <h2 className="dialog__title">{title}</h2>
      {children}
    </dialog>
  )
}

/* ── Agent mark ──────────────────────────────────────────────────────────── */

/** Lit until you open the recipe: an agent changed it since you last looked. */
export function AgentMark() {
  return (
    <span className="agentmark">
      <span className="led" data-on="true" aria-hidden="true" />
      vom Agenten geändert
    </span>
  )
}

/* ── Small hooks ─────────────────────────────────────────────────────────── */

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const fn = () => setMatch(m.matches)
    m.addEventListener('change', fn)
    return () => m.removeEventListener('change', fn)
  }, [q])
  return match
}
