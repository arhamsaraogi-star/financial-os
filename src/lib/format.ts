/** Indian-numbering currency + compact display helpers. */

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function money(n: number, precise = false): string {
  if (!Number.isFinite(n)) return '—'
  return precise ? inrPrecise.format(n) : inr.format(n)
}

/** ₹1,20,000 → ₹1.2L. For dense tiles where the exact rupee is noise. */
export function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)}Cr`
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K`
  return `${sign}₹${Math.round(abs)}`
}

export function signedMoney(n: number): string {
  return `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
}

export function pct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—'
  return `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(digits)}%`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}
