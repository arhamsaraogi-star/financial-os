/**
 * All date maths in the system works on `YYYY-MM-DD` strings in local time.
 * Using UTC Date objects here would shift every event by a day for IST users,
 * so every helper constructs dates explicitly from parts.
 */

export type ISODate = string

export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function today(): ISODate {
  return toISO(new Date())
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function addMonths(s: ISODate, n: number): ISODate {
  const d = fromISO(s)
  d.setMonth(d.getMonth() + n)
  return toISO(d)
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

/**
 * Resolve a day-of-month to a real date in the given month, clamping to the
 * last day. A bill due on the 31st is due on the 28th in February — not
 * silently rolled into March.
 */
export function dayOfMonthIn(year: number, month1: number, day: number): ISODate {
  const clamped = Math.min(day, daysInMonth(year, month1))
  return `${year}-${String(month1).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/**
 * The next occurrence of a day-of-month on or after `from`.
 *
 * Rolling the month by hand is where this goes wrong: December + 1 gives month
 * 13, which formats as an invalid `2026-13-08`. Going through a Date object
 * makes the year roll with it.
 */
export function nextDayOfMonth(day: number, from: ISODate = today()): ISODate {
  const d = fromISO(from)
  const thisMonth = dayOfMonthIn(d.getFullYear(), d.getMonth() + 1, day)
  if (thisMonth >= from) return thisMonth
  d.setMonth(d.getMonth() + 1)
  return dayOfMonthIn(d.getFullYear(), d.getMonth() + 1, day)
}

/** Every occurrence of a day-of-month strictly inside [from, to]. */
export function monthlyOccurrences(day: number, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  const start = fromISO(from)
  let y = start.getFullYear()
  let m = start.getMonth() + 1

  for (let guard = 0; guard < 500; guard++) {
    const d = dayOfMonthIn(y, m, day)
    if (d > to) break
    if (d >= from) out.push(d)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

/** Same, for a yearly event on a fixed month + day. */
export function yearlyOccurrences(
  month1: number,
  day: number,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const out: ISODate[] = []
  let y = fromISO(from).getFullYear()
  for (let guard = 0; guard < 60; guard++) {
    const d = dayOfMonthIn(y, month1, day)
    if (d > to) break
    if (d >= from) out.push(d)
    y += 1
  }
  return out
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(month1: number): string {
  return MONTHS[month1 - 1] ?? ''
}

/** `14 Aug` — the density-friendly form used across the dashboards. */
export function shortDate(s: ISODate): string {
  const d = fromISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

export function longDate(s: ISODate): string {
  const d = fromISO(s)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "in 6 days" / "today" / "9 days ago", relative to `base`. */
export function relativeDays(target: ISODate, base: ISODate = today()): string {
  const n = daysBetween(base, target)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`
}

export function monthKey(s: ISODate): string {
  return s.slice(0, 7)
}
