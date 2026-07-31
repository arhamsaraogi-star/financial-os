'use client'

import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import type { Transaction } from '@/lib/types'
import { TransactionSheet } from '@/components/TransactionSheet'

/* ------------------------------------------------------------------ *
 * Add-transaction is reachable from anywhere, so the sheet lives here
 * and pages open it through this context rather than each owning a copy.
 * ------------------------------------------------------------------ */

interface SheetControl {
  add: () => void
  edit: (tx: Transaction) => void
}

const SheetContext = createContext<SheetControl | null>(null)

export function useTransactionSheet(): SheetControl {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error('useTransactionSheet must be used inside Shell')
  return ctx
}

/* ------------------------------------------------------------------ *
 * Navigation
 * ------------------------------------------------------------------ */

interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

const Ic = ({ d }: { d: string }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const NAV: NavItem[] = [
  { href: '/', label: 'Home', icon: <Ic d="M3 11.2 12 4l9 7.2M5.4 10v9.4h13.2V10" /> },
  { href: '/transactions', label: 'Activity', icon: <Ic d="M4 7h16M4 12h16M4 17h10" /> },
  { href: '/spending', label: 'Spending', icon: <Ic d="M12 3a9 9 0 1 0 9 9h-9z M14 3.4A9 9 0 0 1 20.6 10H14z" /> },
  { href: '/accounts', label: 'Accounts', icon: <Ic d="M3 8.5 12 4l9 4.5M5 10v7M9.7 10v7M14.3 10v7M19 10v7M3 20h18" /> },
  { href: '/recurring', label: 'Bills', icon: <Ic d="M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4" /> },
  { href: '/forecast', label: 'Forecast', icon: <Ic d="M3 17c3 0 3.5-10 7-10s3 7 5.5 7c1.6 0 2.2-3 3.5-3M3 20h18" /> },
  { href: '/goals', label: 'Goals', icon: <Ic d="M12 21s7-4.4 7-10a7 7 0 1 0-14 0c0 5.6 7 10 7 10z M12 11.8a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z" /> },
  { href: '/advisor', label: 'Advice', icon: <Ic d="M12 3 14 9l6 .8-4.4 4.2 1.2 6L12 17.2 7.2 20l1.2-6L4 9.8 10 9z" /> },
  { href: '/settings', label: 'Settings', icon: <Ic d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /> },
]

/** The four that earn a permanent slot on a phone. */
const MOBILE_PRIMARY = ['/', '/transactions', '/spending', '/accounts']

function normalise(p: string) {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = normalise(usePathname() ?? '/')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  const add = useCallback(() => {
    setEditing(null)
    setSheetOpen(true)
  }, [])

  const edit = useCallback((tx: Transaction) => {
    setEditing(tx)
    setSheetOpen(true)
  }, [])

  return (
    <SheetContext.Provider value={{ add, edit }}>
      <div className="min-h-dvh lg:flex">
        <Sidebar pathname={pathname} onAdd={add} />

        <main className="min-w-0 flex-1 pb-[calc(76px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <div className="mx-auto w-full max-w-[840px] px-4 pt-5 sm:px-6 sm:pt-8">
            <Gate>{children}</Gate>
          </div>
        </main>

        <TabBar pathname={pathname} onAdd={add} onMore={() => setMenuOpen(true)} />

        <AnimatePresence>
          {menuOpen && <MoreMenu pathname={pathname} onClose={() => setMenuOpen(false)} />}
        </AnimatePresence>

        <TransactionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} editing={editing} />
      </div>
    </SheetContext.Provider>
  )
}

/* ------------------------------------------------------------------ *
 * Hydration gate
 *
 * Pages are prerendered at build time, but real state comes from
 * localStorage and every projection is anchored to *today*. Rendering
 * before both are known would hydrate build-day numbers into a client
 * showing a different date.
 * ------------------------------------------------------------------ */

function Gate({ children }: { children: ReactNode }) {
  const { ready } = useStore()
  if (ready) return <>{children}</>

  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="sheen h-8 w-44" />
      <div className="sheen h-[132px]" />
      <div className="sheen h-[92px]" />
      <div className="sheen h-[240px]" />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Desktop rail
 * ------------------------------------------------------------------ */

function Sidebar({ pathname, onAdd }: { pathname: string; onAdd: () => void }) {
  const { metrics, ready } = useStore()

  return (
    <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 flex-col border-r border-line-soft bg-surface/40 lg:flex">
      <div className="px-5 pb-4 pt-7">
        <Link href="/" className="display block text-[20px] leading-tight">
          Financial<span className="text-accent">.</span>OS
        </Link>
        <div className="mt-3">
          <div className="label mb-1">In the bank</div>
          <div className="tnum display text-[22px]">{ready ? money(metrics.netWorth.cash) : '—'}</div>
        </div>
      </div>

      <div className="px-3">
        <button
          onClick={onAdd}
          className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-accent/50 bg-accent-wash text-[15px] font-medium text-accent active:bg-accent/20"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add transaction
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-[44px] items-center gap-3 rounded-[var(--radius-control)] px-3 text-[14.5px] transition-colors ${
                  pathname === item.href ? 'bg-surface-2 text-text' : 'text-faint active:bg-surface-2'
                }`}
              >
                <span className={pathname === item.href ? 'text-accent' : 'text-ghost'}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * Mobile tab bar with a centre add button
 * ------------------------------------------------------------------ */

function TabBar({
  pathname,
  onAdd,
  onMore,
}: {
  pathname: string
  onAdd: () => void
  onMore: () => void
}) {
  const items = MOBILE_PRIMARY.map((h) => NAV.find((n) => n.href === h)!).filter(Boolean)
  const left = items.slice(0, 2)
  const right = items.slice(2)

  const Tab = ({ item }: { item: NavItem }) => {
    const active = pathname === item.href
    return (
      <Link
        href={item.href}
        className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${
          active ? 'text-accent' : 'text-ghost'
        }`}
      >
        {item.icon}
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/95 backdrop-blur-xl lg:hidden">
      <div className="relative flex items-stretch">
        {left.map((i) => (
          <Tab key={i.href} item={i} />
        ))}

        {/* The one action used every day gets the most reachable spot. */}
        <div className="flex w-[72px] shrink-0 items-center justify-center">
          <button
            onClick={onAdd}
            aria-label="Add transaction"
            className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full border border-accent/40 bg-accent text-ink shadow-[0_10px_28px_-8px_rgba(212,167,44,0.7)] active:scale-95 transition-transform"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {right.map((i) => (
          <Tab key={i.href} item={i} />
        ))}

        <button
          onClick={onMore}
          aria-label="More"
          className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-ghost"
        >
          <Ic d="M5 12h.01M12 12h.01M19 12h.01" />
          <span>More</span>
        </button>
      </div>
    </nav>
  )
}

function MoreMenu({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const rest = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.href))

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="sheet-backdrop absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div className="card-raised sheet-panel safe-bottom absolute inset-x-0 bottom-0 rounded-b-none p-4">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-surface-3" />
        <ul className="grid grid-cols-2 gap-2">
          {rest.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex min-h-[56px] items-center gap-3 rounded-[var(--radius-control)] border px-4 text-[15px] ${
                  pathname === item.href
                    ? 'border-accent/40 bg-accent-wash text-accent'
                    : 'border-line-soft bg-surface-2 text-muted'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
