// Dates are always computed in Europe/Berlin, never via toISOString() (UTC).
const TZ = 'Europe/Berlin'

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function toIsoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12))
  return dt.toISOString().slice(0, 10)
}

function utcNoon(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 12)
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  return Math.round((utcNoon(toIsoStr) - utcNoon(fromIso)) / 86_400_000)
}

/** Monday of the week containing iso. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() // 0 = Sunday
  return addDays(iso, wd === 0 ? -6 : 1 - wd)
}

export const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
export const WEEKDAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTH = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
}

export function weekdayShort(iso: string): string {
  return WEEKDAY[weekdayIndex(iso)]
}

export function weekdayLong(iso: string): string {
  return WEEKDAY_LONG[weekdayIndex(iso)]
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

/** "Heute", "Morgen", or "Do 13." */
export function dayLabel(iso: string, today = todayIso()): string {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  return `${weekdayShort(iso)} ${dayOfMonth(iso)}.`
}

export function monthYear(iso: string): string {
  return `${MONTH[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

/** "vor 3 Wochen", "gestern", "noch nie" */
export function relativePast(iso: string | null, today = todayIso()): string {
  if (!iso) return 'noch nie'
  const diff = daysBetween(iso, today)
  if (diff <= 0) return 'heute'
  if (diff === 1) return 'gestern'
  if (diff < 7) return `vor ${diff} Tagen`
  if (diff < 14) return 'vor 1 Woche'
  if (diff < 60) return `vor ${Math.round(diff / 7)} Wochen`
  if (diff < 365) return `vor ${Math.round(diff / 30)} Monaten`
  const years = Math.round(diff / 365)
  return years === 1 ? 'vor 1 Jahr' : `vor ${years} Jahren`
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
]

const COUNT_UNITS = new Set(['', 'stk', 'stück', 'el', 'tl', 'prise', 'prisen', 'bund', 'zehe', 'zehen', 'dose', 'dosen', 'pck', 'päckchen', 'scheibe', 'scheiben', 'becher'])

/** Scales an amount and formats it the way a German recipe would print it. */
export function formatAmount(amount: number | null, unit: string | null, factor = 1): string {
  if (amount === null || amount === 0) return ''
  const v = amount * factor
  const u = (unit ?? '').trim().toLowerCase()
  if (COUNT_UNITS.has(u)) {
    // A pinch stays a pinch; everything else counted snaps to quarters.
    if (u === 'prise' || u === 'prisen') return String(Math.max(1, Math.round(v)))
    const snapped = Math.max(0.25, Math.round(v * 4) / 4)
    const whole = Math.floor(snapped + 1e-9)
    const rest = snapped - whole
    if (rest === 0) return String(whole)
    for (const [f, glyph] of FRACTIONS) {
      if (Math.abs(rest - f) < 0.01) return whole > 0 ? `${whole}${glyph}` : glyph
    }
    return snapped.toLocaleString('de-DE')
  }
  // Weights and volumes: sensible kitchen precision.
  let rounded: number
  if (v >= 500) rounded = Math.round(v / 10) * 10
  else if (v >= 50) rounded = Math.round(v / 5) * 5
  else if (v >= 10) rounded = Math.round(v)
  else rounded = Math.round(v * 10) / 10
  return rounded.toLocaleString('de-DE')
}

export function minutes(n: number | null): string {
  if (!n) return '–'
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const m = n % 60
  return m ? `${h} h ${m}` : `${h} h`
}

/** First day of the week containing iso, for a week that starts on weekStart (0 = So … 6 = Sa). */
export function weekStartOf(iso: string, weekStart: number): string {
  return addDays(iso, -((weekdayIndex(iso) - weekStart + 7) % 7))
}

/** "9.–15. Nov." or "30. Nov.–6. Dez." */
export function rangeLabel(start: string): string {
  const end = addDays(start, 6)
  const m1 = MONTH[Number(start.slice(5, 7)) - 1]
  const m2 = MONTH[Number(end.slice(5, 7)) - 1]
  return m1 === m2 ? `${dayOfMonth(start)}.–${dayOfMonth(end)}. ${m2}` : `${dayOfMonth(start)}. ${m1}–${dayOfMonth(end)}. ${m2}`
}
