'use client'

import { ReactNode, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/* ------------------------------------------------------------------ *
 * Page scaffolding
 * ------------------------------------------------------------------ */

export function PageHeader({
  title,
  lede,
  action,
}: {
  title: string
  lede?: string
  action?: ReactNode
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display text-[30px] leading-[1.1] sm:text-[36px]">{title}</h1>
        {lede && <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-muted">{lede}</p>}
      </div>
      {action && <div className="shrink-0 pt-1">{action}</div>}
    </header>
  )
}

export function Card({
  title,
  action,
  children,
  className = '',
  raised = false,
  padded = true,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  raised?: boolean
  padded?: boolean
}) {
  return (
    <section className={`${raised ? 'card-raised' : 'card'} ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-4">
          {title && <h2 className="label">{title}</h2>}
          {action}
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
  size = 'md',
}: {
  label: string
  value: string
  sub?: ReactNode
  tone?: 'neutral' | 'good' | 'bad' | 'accent'
  size?: 'md' | 'lg'
}) {
  const toneClass =
    tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'accent' ? 'text-accent' : 'text-text'
  return (
    <div className="min-w-0">
      <div className="label mb-1.5 truncate">{label}</div>
      <div
        className={`tnum display truncate ${toneClass} ${
          size === 'lg' ? 'text-[32px] leading-none sm:text-[40px]' : 'text-[23px] leading-none sm:text-[26px]'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] leading-snug text-faint">{sub}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'good' | 'bad' | 'warn' | 'accent' | 'info'
}) {
  const map = {
    neutral: 'border-line text-muted',
    good: 'border-good/40 text-good',
    bad: 'border-bad/45 text-bad',
    warn: 'border-warn/45 text-warn',
    accent: 'border-accent/45 text-accent',
    info: 'border-info/45 text-info',
  } as const
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-[3px] text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  )
}

export function Meter({
  value,
  max,
  tone = 'accent',
  height = 8,
}: {
  value: number
  max: number
  tone?: 'accent' | 'good' | 'bad' | 'warn' | 'info'
  height?: number
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const colour = {
    accent: 'var(--color-accent)',
    good: 'var(--color-good)',
    bad: 'var(--color-bad)',
    warn: 'var(--color-warn)',
    info: 'var(--color-info)',
  }[tone]

  return (
    <div
      className="w-full overflow-hidden rounded-full bg-surface-3"
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
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
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
  full,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'accent' | 'danger' | 'plain'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit'
  disabled?: boolean
  full?: boolean
  title?: string
}) {
  const sizing =
    size === 'sm'
      ? 'px-3 py-2 text-[13px] min-h-[38px]'
      : size === 'lg'
        ? 'px-5 py-3.5 text-[16px] min-h-[52px]'
        : 'px-4 py-2.5 text-[14px] min-h-[44px]'

  const variants = {
    ghost: 'border border-line bg-surface-2 text-muted active:bg-surface-3',
    accent: 'border border-accent/50 bg-accent-wash text-accent active:bg-accent/20',
    danger: 'border border-bad/45 bg-bad/10 text-bad active:bg-bad/20',
    plain: 'border border-transparent text-faint active:text-text',
  } as const

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-medium transition-colors disabled:opacity-40 ${sizing} ${
        variants[variant]
      } ${full ? 'w-full' : ''}`}
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
      <span className="label mb-2 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] leading-snug text-ghost">{hint}</span>}
    </label>
  )
}

/** Horizontally scrollable on small screens so options never wrap awkwardly. */
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
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
            value === o.value
              ? 'border-accent/50 bg-accent-wash text-accent'
              : 'border-line bg-surface-2 text-faint'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
    >
      <span className="text-[15px] text-text">{label}</span>
      <span
        className={`relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-surface-3'
        }`}
      >
        <motion.span
          className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-ink"
          animate={{ left: checked ? 23 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 34 }}
        />
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Bottom sheet — the primary modal on a phone
 * ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  // Lock the page behind the sheet so scrolling inside it doesn't move the list.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Mounted purely off `open` — no exit animation, and therefore no way for a
  // faded-out overlay to linger and swallow taps on the page beneath it. That
  // failure mode makes the whole app feel broken, which is a far worse trade
  // than losing a 200ms dismissal animation.
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="sheet-backdrop absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card-raised sheet-panel safe-bottom relative flex max-h-[92dvh] w-full flex-col rounded-b-none sm:max-w-[480px] sm:rounded-b-[var(--radius-card)]"
      >
        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-[21px]">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-faint active:bg-surface-3"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer && <div className="shrink-0 border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Lists
 * ------------------------------------------------------------------ */

/** A tappable list row. Used for transactions, bills, accounts — everything. */
export function Row({
  icon,
  title,
  subtitle,
  value,
  valueTone = 'neutral',
  valueSub,
  onClick,
  trailing,
}: {
  icon?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  value?: string
  valueTone?: 'neutral' | 'good' | 'bad' | 'muted'
  valueSub?: string
  onClick?: () => void
  trailing?: ReactNode
}) {
  const tone =
    valueTone === 'good' ? 'text-good' : valueTone === 'bad' ? 'text-bad' : valueTone === 'muted' ? 'text-faint' : 'text-text'

  const inner = (
    <>
      {icon && (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[17px]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-text">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[12.5px] text-faint">{subtitle}</span>}
      </span>
      {value && (
        <span className="shrink-0 text-right">
          <span className={`tnum block text-[15px] ${tone}`}>{value}</span>
          {valueSub && <span className="mt-0.5 block text-[11.5px] text-ghost">{valueSub}</span>}
        </span>
      )}
      {trailing}
    </>
  )

  const cls = 'flex w-full items-center gap-3 py-3 text-left'

  return onClick ? (
    <button onClick={onClick} className={`${cls} active:opacity-60`}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

export function Divider() {
  return <div className="h-px bg-line-soft" />
}

export function Empty({
  icon = '◦',
  title,
  detail,
  action,
}: {
  icon?: string
  title: string
  detail?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 text-[30px] opacity-50">{icon}</div>
      <p className="text-[15px] text-muted">{title}</p>
      {detail && <p className="mt-1.5 max-w-xs text-[13px] leading-relaxed text-ghost">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Wide content (tables, charts) scrolls inside this — the page never does. */
export function ScrollX({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar -mx-4 overflow-x-auto px-4">{children}</div>
}
