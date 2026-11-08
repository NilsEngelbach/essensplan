import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Camera, ClipboardPaste, Link2, X } from 'lucide-react'
import { IMPORT_STEPS, ImportError, importRecipe } from '../../lib/api'
import { photoBlob, readPhoto } from '../../lib/photo'
import type { RecipeDraft } from '../../lib/types'

type Phase = { kind: 'input' } | { kind: 'reading'; step: number } | { kind: 'error'; message: string }

export const EMPTY_DRAFT: RecipeDraft = {
  title: '',
  description: null,
  imageUrl: null,
  category: 'Hauptspeise',
  tags: [],
  cookingTime: null,
  servings: 4,
  difficulty: 'Einfach',
  rating: null,
  sourceUrl: null,
  ingredients: [],
  instructions: [],
}

export function CapturePage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Android share target lands here with ?url= or ?text=
  const shared = params.get('url') ?? params.get('text') ?? ''
  const [link, setLink] = useState(shared.match(/https?:\/\/\S+/)?.[0] ?? '')
  const [photo, setPhoto] = useState<{ name: string; preview: string } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'input' })
  const cancelled = useRef(false)
  const linkRef = useRef<HTMLInputElement>(null)
  const canPaste = typeof navigator.clipboard?.readText === 'function'

  useEffect(() => {
    linkRef.current?.focus()
    return () => {
      cancelled.current = true
    }
  }, [])

  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/rezepte'))

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const url = text.match(/https?:\/\/\S+/)?.[0]
      if (url) setLink(url)
      else setPhase({ kind: 'error', message: 'In der Zwischenablage ist kein Link.' })
    } catch {
      linkRef.current?.focus()
    }
  }

  const start = async () => {
    cancelled.current = false
    setPhase({ kind: 'reading', step: 0 })
    const url = link.trim() && !/^https?:\/\//i.test(link.trim()) ? `https://${link.trim()}` : link.trim()
    try {
      const source = url ? { url } : { photo: await photoBlob(photo?.preview ?? '') }
      const draft = await importRecipe(source, (step) => !cancelled.current && setPhase({ kind: 'reading', step }), () => cancelled.current)
      if (cancelled.current) return
      // A photo of a cookbook page becomes the recipe photo unless the web page brought one (uploaded on save).
      if (photo && !draft.imageUrl) draft.imageUrl = photo.preview
      navigate('/rezepte/neu/pruefen', { state: { draft, imported: true }, replace: true })
    } catch (e) {
      if (cancelled.current) return
      setPhase({ kind: 'error', message: e instanceof ImportError ? e.message : 'Das Lesen ist fehlgeschlagen. Prüf die Verbindung und versuch es noch einmal.' })
    }
  }

  const manual = () => navigate('/rezepte/neu/pruefen', { state: { draft: EMPTY_DRAFT, imported: false }, replace: true })

  const ready = Boolean(link.trim() || photo)

  return (
    <div className="focus">
      <header className="focus__bar">
        <button type="button" className="iconbtn" aria-label="Schließen" onClick={close}>
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>
        <h1 className="focus__title">Rezept hinzufügen</h1>
        <span className="focus__spacer" />
      </header>

      <div className="capture">
        {phase.kind === 'reading' ? (
          <section className="reader" aria-live="polite">
            <ol className="reader__steps">
              {IMPORT_STEPS.map((label, i) => (
                <li key={label} className="reader__step" data-state={i < phase.step ? 'done' : i === phase.step ? 'active' : 'off'}>
                  <span className="reader__led" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <p className="reader__hint">Das dauert meist 10 bis 60 Sekunden. Danach kannst du alles prüfen und korrigieren.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                cancelled.current = true
                setPhase({ kind: 'input' })
              }}
            >
              Abbrechen
            </button>
          </section>
        ) : (
          <>
            <section className="capture__slot" aria-labelledby="link-label">
              <label id="link-label" htmlFor="capture-link" className="label">
                Link zum Rezept
              </label>
              <div className="slot slot--lg">
                <Link2 className="slot__icon" size={20} strokeWidth={2} aria-hidden="true" />
                <input
                  ref={linkRef}
                  id="capture-link"
                  className="slot__input"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && ready && start()}
                />
              </div>
              {canPaste && (
                <button type="button" className="btn btn--quiet" onClick={paste}>
                  <ClipboardPaste size={18} strokeWidth={2} aria-hidden="true" />
                  Link aus Zwischenablage einfügen
                </button>
              )}
            </section>

            <div className="capture__or label" aria-hidden="true">
              oder
            </div>

            <section className="capture__slot">
              <label className="photo-pick">
                <input
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f)
                      readPhoto(f).then(
                        (preview) => setPhoto({ name: f.name, preview }),
                        () => setPhase({ kind: 'error', message: 'Dieses Foto lässt sich nicht öffnen. Versuch ein anderes.' }),
                      )
                  }}
                />
                {photo ? (
                  <img src={photo.preview} alt="Ausgewähltes Foto" className="photo-pick__preview" />
                ) : (
                  <Camera size={26} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span className="photo-pick__text">{photo ? 'Anderes Foto wählen' : 'Foto aufnehmen oder auswählen'}</span>
                <span className="label">Kochbuchseite, Screenshot, Notizzettel</span>
              </label>
            </section>

            {phase.kind === 'error' && (
              <div className="alert" role="alert">
                <p>{phase.message}</p>
                <div className="alert__actions">
                  <button type="button" className="btn" onClick={start} disabled={!ready}>
                    Nochmal versuchen
                  </button>
                  <button type="button" className="textbtn" onClick={manual}>
                    Selbst eingeben
                  </button>
                </div>
              </div>
            )}

            <div className="capture__go">
              <button type="button" className="btn btn--primary btn--lg" disabled={!ready} onClick={start}>
                Rezept lesen
              </button>
              <button type="button" className="textbtn" onClick={manual}>
                Ohne Link selbst eingeben
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
