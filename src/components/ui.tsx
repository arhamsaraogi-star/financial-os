'use client'

import { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { money, pct } from '@/lib/format'

/* ------------------------------------------------------------------ *
 * Page scaffolding
 * ------------------------------------------------------------------ */

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string
  title: string
  lede?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-2">{eyebrow}</div>
          <h1 className="display text-[30px] leading-[1.1] sm:text-[38px]">{title}</h1>
          {lede && (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-dim">{lede}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="rule-gold mt-5 h-px w-full opacity-40" />
    </header>
  )
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  raised = false,
  padded = true,
}: {
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  raised?: boolean
  padded?: boolean
}) {
  return (
    <section className={`${raised ? 'panel-raised' : 'panel'} ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="eyebrow truncate">{title}</h2>}
            {subtitle && <p className="mt-1 truncate text-[11px] text-ghost">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  sub,
  tone = 'neutral',
  large = false,
}: {
  label: string
  value: string
  sub?: ReactNode
  tone?: 'neutral' | 'positive' | 'negative' | 'brass'
  large?: boolean
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-positive'
      : tone === 'negative'
        ? 'text-negative'
        : tone === 'brass'
          ? 'text-brass'
          : 'text-parchment'

  return (
    <div className="min-w-0">
      <div className="eyebrow mb-2 truncate">{label}</div>
      <div
        className={`tnum display truncate ${toneClass} ${
          large ? 'text-[30px] leading-none sm:text-[40px]' : 'text-[22px] leading-none sm:text-[26px]'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-2 text-[11px] leading-snug text-faint">{sub}</div>}
    </div>
  )
}

/** Signed change with the sign carried by colour as well as glyph. */
export function Delta({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const up = value >= 0
  return (
    <span className={`tnum text-[11px] ${up ? 'text-positive' : 'text-negative'}`}>
      {up ? '▲' : '▼'} {suffix === '%' ? pct(Math.abs(value)) : money(Math.abs(value))}
    </span>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'positive' | 'negative' | 'caution' | 'brass' | 'violet'
}) {
  const map = {
    neutral: 'border-line text-dim',
    positive: 'border-positive/35 text-positive',
    negative: 'border-negative/40 text-negative',
    caution: 'border-caution/40 text-caution',
    brass: 'border-brass/40 text-brass',
    violet: 'border-violet/40 text-violet',
  } as const
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-[3px] border px-1.5 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.1em] ${map[tone]}`}
    >
      {children}
    </span>
  )
}

/** Horizontal progress with an optional target notch. */
export function Meter({
  value,
  max,
  tone = 'brass',
  height = 5,
  notch,
}: {
  value: number
  max: number
  tone?: 'brass' | 'positive' | 'negative' | 'caution' | 'violet' | 'teal'
  height?: number
  notch?: number
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const colour = {
    brass: 'var(--color-brass)',
    positive: 'var(--color-positive)',
    negative: 'var(--color-negative)',
    caution: 'var(--color-caution)',
    violet: 'var(--color-violet)',
    teal: 'var(--color-teal)',
  }[tone]

  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-panel-3"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: colour }}
        initial={{ width: 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
      {notch != null && max > 0 && (
        <div
          className="absolute top-0 h-full w-px bg-parchment/45"
          style={{ left: `${Math.min(100, (notch / max) * 100)}%` }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Controls
 * ------------------------------------------------------------------ */

export function Button({
  children,
  onClick,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'brass' | 'danger'
  size?: 'sm' | 'md'
  type?: 'button' | 'submit'
  disabled?: boolean
  title?: string
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[4px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const sizing = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-[12px]'
  const variants = {
    ghost: 'border-line bg-panel-2 text-dim hover:border-brass-deep hover:text-parchment',
    brass: 'border-brass/50 bg-brass-wash text-brass hover:bg-brass/15',
    danger: 'border-negative/40 bg-negative/10 text-negative hover:bg-negative/20',
  } as const

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${sizing} ${variants[variant]}`}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] leading-snug text-ghost">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-[4px] border border-line bg-panel-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
            value === o.value
              ? 'bg-brass-wash text-brass'
              : 'text-faint hover:text-parchment'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Misc
 * ------------------------------------------------------------------ */

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[110px] items-center justify-center px-4 py-8 text-center text-[12px] text-ghost">
      {children}
    </div>
  )
}

/** Horizontally scrollable wrapper — dense tables must never break the page. */
export function ScrollX({ children }: { children: ReactNode }) {
  return <div className="-mx-4 overflow-x-auto px-4">{children}</div>
}

export function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`eyebrow whitespace-nowrap px-2 py-2 first:pl-0 last:pr-0 ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  )
}

export function Td({
  children,
  className = '',
  wrap = false,
}: {
  children: ReactNode
  className?: string
  wrap?: boolean
}) {
  return (
    <td
      className={`px-2 py-2.5 first:pl-0 last:pr-0 ${wrap ? '' : 'whitespace-nowrap'} ${className}`}
    >
      {children}
    </td>
  )
}

export function KeyHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-[3px] border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[9.5px] text-faint">
      {children}
    </kbd>
  )
}

export function RiskDial({ score, level }: { score: number; level: string }) {
  const tone =
    score >= 82
      ? 'var(--color-positive)'
      : score >= 62
        ? 'var(--color-brass)'
        : score >= 38
          ? 'var(--color-caution)'
          : 'var(--color-negative)'
  const r = 34
  const circumference = 2 * Math.PI * r
  const dash = (score / 100) * circumference

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
          <circle cx="42" cy="42" r={r} fill="none" stroke="var(--color-line)" strokeWidth="5" />
          <motion.circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - dash }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="tnum display text-[24px] leading-none">{score}</span>
          <span className="text-[8.5px] uppercase tracking-[0.14em] text-ghost">of 100</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="eyebrow mb-1">Cash-flow risk</div>
        <div className="display text-[19px] capitalize leading-tight" style={{ color: tone }}>
          {level}
        </div>
      </div>
    </div>
  )
}
