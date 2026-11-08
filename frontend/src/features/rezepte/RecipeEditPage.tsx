import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from 'lucide-react'
import { Dialog, LedRatingInput, Segmented } from '../../components/controls'
import { useToast } from '../../components/toast'
import { getRecipe, saveRecipe } from '../../lib/api'
import { readPhoto } from '../../lib/photo'
import { CATEGORIES, DIFFICULTIES, TAGS, type Category, type Difficulty, type Ingredient, type RecipeDraft } from '../../lib/types'
import { EMPTY_DRAFT } from './CapturePage'

const uid = () => Math.random().toString(36).slice(2, 9)

function parseAmount(s: string): number | null {
  const t = s.trim().replace('½', '.5').replace('¼', '.25').replace('¾', '.75').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

function amountText(n: number | null): string {
  return n === null ? '' : n.toLocaleString('de-DE')
}

type AmountDrafts = Record<string, string>

function newIngredient(component: string | null): Ingredient {
  return { id: uid(), name: '', amount: null, unit: null, notes: null, component }
}

export function RecipeEditPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const passed = (location.state as { draft?: RecipeDraft; imported?: boolean } | null) ?? null
  const [draft, setDraft] = useState<RecipeDraft | null>(id ? null : passed?.draft ?? EMPTY_DRAFT)
  const [initial, setInitial] = useState<string>(JSON.stringify(draft))
  const [amounts, setAmounts] = useState<AmountDrafts>({})
  const [titleError, setTitleError] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [saving, setSaving] = useState(false)
  const imported = Boolean(passed?.imported)

  useEffect(() => {
    if (!id) return
    getRecipe(id).then((r) => {
      if (!r) return navigate('/rezepte', { replace: true })
      const { id: _i, createdAt: _c, updatedAt: _u, cookingStats: _s, ...rest } = r
      setDraft(rest)
      setInitial(JSON.stringify(rest))
    })
  }, [id, navigate])

  useEffect(() => {
    if (draft && draft.ingredients.length === 0 && draft.instructions.length === 0) {
      setDraft({ ...draft, ingredients: [newIngredient(null)], instructions: [{ id: uid(), stepNumber: 1, description: '' }] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft === null])

  const dirty = draft !== null && JSON.stringify(draft) !== initial

  const groups = useMemo(() => {
    const order: (string | null)[] = []
    for (const i of draft?.ingredients ?? []) if (!order.includes(i.component)) order.push(i.component)
    return order
  }, [draft?.ingredients])

  if (!draft) return <div className="focus" aria-busy="true" />

  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => setDraft({ ...draft, [k]: v })
  const setIng = (iid: string, patch: Partial<Ingredient>) => set('ingredients', draft.ingredients.map((i) => (i.id === iid ? { ...i, ...patch } : i)))
  const addIng = (component: string | null) => {
    // insert after the last ingredient of that group
    const list = [...draft.ingredients]
    const lastIdx = list.map((i) => i.component).lastIndexOf(component)
    list.splice(lastIdx === -1 ? list.length : lastIdx + 1, 0, newIngredient(component))
    set('ingredients', list)
  }
  const renameGroup = (from: string | null, to: string) =>
    set('ingredients', draft.ingredients.map((i) => (i.component === from ? { ...i, component: to.trim() === '' ? null : to } : i)))
  const moveStep = (idx: number, dir: -1 | 1) => {
    const list = [...draft.instructions]
    const [s] = list.splice(idx, 1)
    list.splice(idx + dir, 0, s)
    set('instructions', list)
  }

  const close = () => {
    if (dirty) setConfirmLeave(true)
    else leave()
  }
  const leave = () => navigate(id ? `/rezepte/${id}` : '/rezepte', { replace: true })

  const save = async () => {
    if (!draft.title.trim()) {
      setTitleError(true)
      document.getElementById('f-title')?.focus()
      return
    }
    setSaving(true)
    const clean: RecipeDraft = {
      ...draft,
      title: draft.title.trim(),
      ingredients: draft.ingredients.filter((i) => i.name.trim()),
      instructions: draft.instructions.filter((s) => s.description.trim()),
    }
    const saved = await saveRecipe(clean, id)
    setInitial(JSON.stringify(draft))
    toast.show(id ? 'Änderungen gespeichert.' : `„${saved.title}“ ist jetzt in deinen Rezepten.`)
    navigate(`/rezepte/${saved.id}`, { replace: true })
  }

  return (
    <div className="focus focus--form">
      <header className="focus__bar">
        <button type="button" className="iconbtn" aria-label="Schließen" onClick={close}>
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>
        <h1 className="focus__title">{id ? 'Rezept bearbeiten' : imported ? 'Import prüfen' : 'Neues Rezept'}</h1>
        <button type="button" className="btn btn--primary focus__save" onClick={save} disabled={saving}>
          Speichern
        </button>
      </header>

      <form
        className="editform"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        noValidate
      >
        {imported && (
          <p className="notice">
            <span className="led" data-on="true" aria-hidden="true" />
            Aus der Quelle gelesen. Schau kurz drüber, vor allem bei Mengen und Einheiten.
          </p>
        )}

        <section className="panel" aria-labelledby="sec-basics">
          <h2 id="sec-basics" className="panel__title">
            Grunddaten
          </h2>
          <div className="field">
            <label htmlFor="f-title" className="field__label">
              Titel
            </label>
            <input
              id="f-title"
              className="input"
              value={draft.title}
              aria-invalid={titleError || undefined}
              aria-describedby={titleError ? 'f-title-err' : undefined}
              onChange={(e) => {
                set('title', e.target.value)
                if (e.target.value.trim()) setTitleError(false)
              }}
            />
            {titleError && (
              <p id="f-title-err" className="field__error">
                Gib dem Rezept einen Namen, damit du es wiederfindest.
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="f-desc" className="field__label">
              Beschreibung <span className="label">optional</span>
            </label>
            <textarea id="f-desc" className="input" rows={2} value={draft.description ?? ''} onChange={(e) => set('description', e.target.value || null)} />
          </div>
          <div className="fieldrow">
            <div className="field">
              <label htmlFor="f-cat" className="field__label">
                Kategorie
              </label>
              <select id="f-cat" className="input" value={draft.category} onChange={(e) => set('category', e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="field field--narrow">
              <label htmlFor="f-time" className="field__label">
                Zeit <span className="label">min</span>
              </label>
              <input
                id="f-time"
                className="input num"
                inputMode="numeric"
                value={draft.cookingTime ?? ''}
                onChange={(e) => set('cookingTime', parseAmount(e.target.value))}
              />
            </div>
            <div className="field field--narrow">
              <label htmlFor="f-serv" className="field__label">
                Portionen
              </label>
              <input id="f-serv" className="input num" inputMode="numeric" value={draft.servings ?? ''} onChange={(e) => set('servings', parseAmount(e.target.value))} />
            </div>
          </div>
          <div className="fieldrow">
            <Segmented<Difficulty>
              label="Aufwand"
              value={draft.difficulty}
              onChange={(v) => set('difficulty', v)}
              options={DIFFICULTIES.map((d) => ({ value: d, label: d }))}
            />
            <div className="field">
              <span className="field__label" id="f-rating">
                Bewertung
              </span>
              <LedRatingInput value={draft.rating} onChange={(v) => set('rating', v)} />
            </div>
          </div>
          <fieldset className="field">
            <legend className="field__label">Merkmale</legend>
            <div className="chips">
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  aria-pressed={draft.tags.includes(t)}
                  onClick={() => set('tags', draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t])}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label htmlFor="f-src" className="field__label">
              Quelle <span className="label">optional</span>
            </label>
            <input id="f-src" className="input" type="url" inputMode="url" value={draft.sourceUrl ?? ''} onChange={(e) => set('sourceUrl', e.target.value || null)} />
          </div>
        </section>

        <section className="panel" aria-labelledby="sec-photo">
          <h2 id="sec-photo" className="panel__title">
            Foto
          </h2>
          <div className="photofield">
            {draft.imageUrl ? (
              <>
                <img src={draft.imageUrl} alt="" className="photofield__img" />
                <div className="photofield__actions">
                  <label className="btn btn--quiet">
                    <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />
                    Ersetzen
                    <input type="file" accept="image/*" className="visually-hidden" onChange={async (e) => e.target.files?.[0] && set('imageUrl', await readPhoto(e.target.files[0]))} />
                  </label>
                  <button type="button" className="textbtn textbtn--danger" onClick={() => set('imageUrl', null)}>
                    Foto entfernen
                  </button>
                </div>
              </>
            ) : (
              <label className="photo-pick photo-pick--inline">
                <ImagePlus size={24} strokeWidth={1.9} aria-hidden="true" />
                <span className="photo-pick__text">Foto hinzufügen</span>
                <span className="label">Ohne Foto sieht das Rezept trotzdem vollständig aus.</span>
                <input type="file" accept="image/*" className="visually-hidden" onChange={async (e) => e.target.files?.[0] && set('imageUrl', await readPhoto(e.target.files[0]))} />
              </label>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="sec-ing">
          <div className="panel__head">
            <h2 id="sec-ing" className="panel__title">
              Zutaten
            </h2>
            <span className="label">für {draft.servings ?? '–'} Portionen</span>
          </div>
          {groups.map((group, gi) => {
            const items = draft.ingredients.filter((i) => i.component === group)
            return (
              <div key={gi} className="inggroup">
                <div className="field inggroup__name">
                  <label htmlFor={`g-${gi}`} className="label">
                    gruppe
                  </label>
                  <input
                    id={`g-${gi}`}
                    className="input input--quiet"
                    placeholder="ohne Gruppe (z. B. Teig, Sauce)"
                    defaultValue={group ?? ''}
                    onBlur={(e) => e.target.value !== (group ?? '') && renameGroup(group, e.target.value)}
                  />
                </div>
                <ul className="ingedit">
                  {items.map((i, n) => {
                    const label = i.name || `Zutat ${n + 1}`
                    return (
                      <li key={i.id} className="ingedit__row">
                        <input
                          className="input num ingedit__amount"
                          inputMode="decimal"
                          aria-label={`Menge: ${label}`}
                          placeholder="Menge"
                          value={amounts[i.id] ?? amountText(i.amount)}
                          onChange={(e) => {
                            setAmounts({ ...amounts, [i.id]: e.target.value })
                            setIng(i.id, { amount: parseAmount(e.target.value) })
                          }}
                        />
                        <input className="input ingedit__unit" aria-label={`Einheit: ${label}`} placeholder="Einheit" value={i.unit ?? ''} onChange={(e) => setIng(i.id, { unit: e.target.value || null })} />
                        <input className="input ingedit__name" aria-label={`Zutat ${n + 1}`} placeholder="Zutat" value={i.name} onChange={(e) => setIng(i.id, { name: e.target.value })} />
                        <input className="input ingedit__note" aria-label={`Notiz: ${label}`} placeholder="Notiz" value={i.notes ?? ''} onChange={(e) => setIng(i.id, { notes: e.target.value || null })} />
                        <button
                          type="button"
                          className="iconbtn iconbtn--sm ingedit__del"
                          aria-label={`${label} entfernen`}
                          onClick={() => set('ingredients', draft.ingredients.filter((x) => x.id !== i.id))}
                        >
                          <Trash2 size={17} strokeWidth={2} aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
                <button type="button" className="textbtn" onClick={() => addIng(group)}>
                  <Plus size={16} strokeWidth={2.25} aria-hidden="true" /> Zutat
                </button>
              </div>
            )
          })}
          <button type="button" className="btn btn--quiet" onClick={() => addIng(`Gruppe ${groups.length + 1}`)}>
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" /> Gruppe hinzufügen
          </button>
        </section>

        <section className="panel" aria-labelledby="sec-steps">
          <h2 id="sec-steps" className="panel__title">
            Zubereitung
          </h2>
          <ol className="stepedit">
            {draft.instructions.map((s, idx) => (
              <li key={s.id} className="stepedit__row">
                <span className="step__num num" aria-hidden="true">
                  {idx + 1}
                </span>
                <textarea
                  className="input"
                  rows={3}
                  aria-label={`Schritt ${idx + 1}`}
                  value={s.description}
                  onChange={(e) => set('instructions', draft.instructions.map((x) => (x.id === s.id ? { ...x, description: e.target.value } : x)))}
                />
                <div className="stepedit__tools">
                  <button type="button" className="iconbtn iconbtn--sm" aria-label={`Schritt ${idx + 1} nach oben`} disabled={idx === 0} onClick={() => moveStep(idx, -1)}>
                    <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="iconbtn iconbtn--sm"
                    aria-label={`Schritt ${idx + 1} nach unten`}
                    disabled={idx === draft.instructions.length - 1}
                    onClick={() => moveStep(idx, 1)}
                  >
                    <ArrowDown size={16} strokeWidth={2.25} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="iconbtn iconbtn--sm"
                    aria-label={`Schritt ${idx + 1} entfernen`}
                    onClick={() => set('instructions', draft.instructions.filter((x) => x.id !== s.id))}
                  >
                    <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="textbtn"
            onClick={() => set('instructions', [...draft.instructions, { id: uid(), stepNumber: draft.instructions.length + 1, description: '' }])}
          >
            <Plus size={16} strokeWidth={2.25} aria-hidden="true" /> Schritt
          </button>
        </section>

        <div className="savebar">
          <span className="label savebar__state">{dirty ? 'Ungespeicherte Änderungen' : 'Alles gespeichert'}</span>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            Speichern
          </button>
        </div>
      </form>

      <Dialog open={confirmLeave} title="Änderungen verwerfen?" onClose={() => setConfirmLeave(false)}>
        <p className="dialog__text">Was du hier geändert hast, geht verloren.</p>
        <div className="dialog__actions">
          <button type="button" className="btn" autoFocus onClick={() => setConfirmLeave(false)}>
            Weiter bearbeiten
          </button>
          <button type="button" className="btn btn--danger" onClick={leave}>
            Verwerfen
          </button>
        </div>
      </Dialog>
    </div>
  )
}
