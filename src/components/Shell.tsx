'use client'

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { longDate, today } from '@/lib/dates'
import { KeyHint } from '@/components/ui'
import {
  IconAccounts,
  IconAlert,
  IconBills,
  IconCfo,
  IconClose,
  IconCredit,
  IconFlow,
  IconIncome,
  IconInvest,
  IconMenu,
  IconOverview,
  IconReports,
  IconRules,
  IconSettings,
  IconShield,
  IconSubscriptions,
} from '@/components/icons'

interface NavItem {
  href: string
  label: string
  icon: (p: { className?: string }) => ReactNode
  group: 'Position' | 'Obligations' | 'Growth' | 'System'
  /** `g` then this key jumps here. */
  hotkey?: string
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', icon: IconOverview, group: 'Position', hotkey: 'o' },
  { href: '/cash-flow', label: 'Cash Flow', icon: IconFlow, group: 'Position', hotkey: 'f' },
  { href: '/accounts', label: 'Accounts', icon: IconAccounts, group: 'Position', hotkey: 'a' },
  { href: '/income', label: 'Income', icon: IconIncome, group: 'Position', hotkey: 'i' },

  { href: '/obligations', label: 'Obligations', icon: IconBills, group: 'Obligations', hotkey: 'b' },
  { href: '/subscriptions', label: 'Subscriptions', icon: IconSubscriptions, group: 'Obligations', hotkey: 's' },
  { href: '/credit', label: 'Credit', icon: IconCredit, group: 'Obligations', hotkey: 'c' },

  { href: '/investments', label: 'Investments', icon: IconInvest, group: 'Growth', hotkey: 'v' },
  { href: '/reserve', label: 'Reserve & Goals', icon: IconShield, group: 'Growth', hotkey: 'r' },
  { href: '/reports', label: 'Reports', icon: IconReports, group: 'Growth', hotkey: 'p' },

  { href: '/cfo', label: 'Ask the CFO', icon: IconCfo, group: 'System', hotkey: 'k' },
  { href: '/automation', label: 'Automation', icon: IconRules, group: 'System', hotkey: 'u' },
  { href: '/settings', label: 'Settings', icon: IconSettings, group: 'System', hotkey: ',' },
]

const GROUPS: NavItem['group'][] = ['Position', 'Obligations', 'Growth', 'System']

/** `/cash-flow/` and `/cash-flow` are the same page; trailingSlash export adds the slash. */
function normalise(p: string) {
  return p !== '/' && p.endsWith('/') ? p.slice(0, -1) : p
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = normalise(usePathname() ?? '/')
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    setDrawerOpen(false)
    setPaletteOpen(false)
  }, [pathname])

  // ⌘K opens the palette; `g` then a letter jumps directly.
  useEffect(() => {
    let awaitingGoto = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (typing) return

      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setDrawerOpen(false)
        return
      }

      if (awaitingGoto) {
        const match = NAV.find((n) => n.hotkey === e.key.toLowerCase())
        awaitingGoto = false
        if (match) {
          e.preventDefault()
          router.push(match.href)
        }
        return
      }

      if (e.key.toLowerCase() === 'g') {
        awaitingGoto = true
        clearTimeout(timer)
        timer = setTimeout(() => {
          awaitingGoto = false
        }, 1400)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [router])

  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar pathname={pathname} />

      <MobileBar onMenu={() => setDrawerOpen(true)} />

      <AnimatePresence>
        {drawerOpen && <Drawer pathname={pathname} onClose={() => setDrawerOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
      </AnimatePresence>

      <main className="min-w-0 flex-1 pb-24 lg:pb-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 pt-6 sm:px-7 sm:pt-9 lg:pt-11">
          <Gate>
            {children}
            <Footer />
          </Gate>
        </div>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Hydration gate
 *
 * The page is prerendered at build time, but the real state lives in
 * localStorage and every projection is anchored to *today*. Rendering the
 * dashboard before both are known would hydrate build-day numbers into a
 * client showing a different date. The skeleton is what the static HTML
 * contains; the real interface mounts once state has loaded.
 * ------------------------------------------------------------------ */

function Gate({ children }: { children: ReactNode }) {
  const { ready } = useStore()
  if (ready) return <>{children}</>

  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading your position">
      <div className="space-y-3">
        <div className="sheen h-2.5 w-28 rounded" />
        <div className="sheen h-9 w-72 max-w-full rounded" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="sheen h-[104px] rounded-[6px]" />
        ))}
      </div>
      <div className="sheen h-[300px] rounded-[6px]" />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Desktop rail
 * ------------------------------------------------------------------ */

function Sidebar({ pathname }: { pathname: string }) {
  const { state, forecast, ready } = useStore()

  return (
    <aside className="sticky top-0 hidden h-dvh w-[244px] shrink-0 flex-col border-r border-line-soft bg-panel/60 lg:flex">
      <div className="px-5 pb-5 pt-7">
        <Link href="/" className="block">
          <div className="display text-[19px] leading-tight tracking-tight">
            Financial<span className="text-brass">.</span>OS
          </div>
          <div className="eyebrow mt-1.5">{state.settings.ownerName}</div>
        </Link>
      </div>

      <div className="rule-gold mx-5 h-px opacity-30" />

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => (
          <div key={group} className="mb-5">
            <div className="eyebrow px-2 pb-2">{group}</div>
            <ul className="space-y-px">
              {NAV.filter((n) => n.group === group).map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={pathname === item.href} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line-soft px-5 py-4">
        <div className="eyebrow mb-1.5">Liquid position</div>
        <div className="tnum display text-[19px]">
          {ready ? money(forecast.openingTotal) : '—'}
        </div>
        <div className="mt-1 text-[10.5px] text-ghost">
          Trough {ready ? moneyCompact(forecast.trough.total) : '—'} · {forecast.days.length - 1}d
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[10px] text-ghost">
          <KeyHint>⌘K</KeyHint> command
        </div>
      </div>
    </aside>
  )
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-2.5 rounded-[4px] px-2 py-[7px] text-[12.5px] transition-colors ${
        active ? 'bg-panel-2 text-parchment' : 'text-faint hover:bg-panel-2/60 hover:text-dim'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute left-0 top-1/2 h-[15px] w-[2px] -translate-y-1/2 rounded-full bg-brass"
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
        />
      )}
      <Icon className={active ? 'text-brass' : 'text-ghost group-hover:text-faint'} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

/* ------------------------------------------------------------------ *
 * Mobile
 * ------------------------------------------------------------------ */

const MOBILE_PRIMARY = ['/', '/cash-flow', '/cfo', '/investments']

function MobileBar({ onMenu }: { onMenu: () => void }) {
  const pathname = normalise(usePathname() ?? '/')
  const items = MOBILE_PRIMARY.map((h) => NAV.find((n) => n.href === h)!).filter(Boolean)

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-ink/92 backdrop-blur-xl lg:hidden">
      <div className="flex items-stretch">
        {items.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[9.5px] tracking-wide transition-colors ${
                active ? 'text-brass' : 'text-ghost'
              }`}
            >
              <Icon />
              <span className="truncate px-0.5">{item.label.split(' ')[0]}</span>
            </Link>
          )
        })}
        <button
          onClick={onMenu}
          aria-label="All sections"
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[9.5px] tracking-wide text-ghost"
        >
          <IconMenu />
          <span>More</span>
        </button>
      </div>
    </nav>
  )
}

function Drawer({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const { state, forecast } = useStore()

  return (
    <motion.div
      className="fixed inset-0 z-50 lg:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto rounded-t-xl border-t border-line bg-panel pb-8"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line-soft bg-panel px-5 py-4">
          <div>
            <div className="display text-[17px]">
              Financial<span className="text-brass">.</span>OS
            </div>
            <div className="tnum mt-0.5 text-[11px] text-faint">
              {money(forecast.openingTotal)} liquid
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 text-faint">
            <IconClose />
          </button>
        </div>

        <div className="px-3 pt-3">
          {GROUPS.map((group) => (
            <div key={group} className="mb-4">
              <div className="eyebrow px-2 pb-2">{group}</div>
              <ul className="grid grid-cols-2 gap-1.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon
                  const active = pathname === item.href
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-[4px] border px-3 py-2.5 text-[12.5px] ${
                          active
                            ? 'border-brass/35 bg-brass-wash text-brass'
                            : 'border-line-soft bg-panel-2 text-dim'
                        }`}
                      >
                        <Icon />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <p className="px-2 pb-2 pt-1 text-[10.5px] text-ghost">
            {state.accounts.length} accounts · {state.bills.filter((b) => b.active).length} obligations ·{' '}
            {longDate(today())}
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 * Command palette
 * ------------------------------------------------------------------ */

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const { state } = useStore()
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)

  const results = useMemo(() => {
    const needle = q.toLowerCase().trim()
    const pages = NAV.map((n) => ({
      label: n.label,
      hint: n.group,
      href: n.href,
    }))
    const accounts = state.accounts.map((a) => ({
      label: a.name,
      hint: 'Account',
      href: '/accounts',
    }))
    const all = [...pages, ...accounts]
    if (!needle) return pages
    return all.filter((r) => r.label.toLowerCase().includes(needle) || r.hint.toLowerCase().includes(needle))
  }, [q, state.accounts])

  const go = useCallback(
    (href: string) => {
      router.push(href)
      onClose()
    },
    [router, onClose],
  )

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-ink/85 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="panel-raised relative w-full max-w-[520px] overflow-hidden"
        initial={{ y: -10, scale: 0.985 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: -10, scale: 0.985 }}
        transition={{ duration: 0.16 }}
      >
        <input
          autoFocus
          value={q}
          placeholder="Jump to…"
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setCursor((c) => Math.min(c + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setCursor((c) => Math.max(c - 1, 0))
            } else if (e.key === 'Enter' && results[cursor]) {
              go(results[cursor].href)
            } else if (e.key === 'Escape') {
              onClose()
            }
          }}
          className="!rounded-none !border-0 !border-b !border-line !bg-transparent !px-4 !py-3.5 !text-[14px]"
        />
        <ul className="max-h-[320px] overflow-y-auto py-1.5">
          {results.map((r, i) => (
            <li key={`${r.href}-${r.label}`}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r.href)}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-[12.5px] ${
                  i === cursor ? 'bg-panel-3 text-parchment' : 'text-dim'
                }`}
              >
                <span>{r.label}</span>
                <span className="text-[10px] uppercase tracking-[0.1em] text-ghost">{r.hint}</span>
              </button>
            </li>
          ))}
          {!results.length && (
            <li className="px-4 py-6 text-center text-[12px] text-ghost">Nothing matches</li>
          )}
        </ul>
        <div className="flex items-center gap-3 border-t border-line-soft px-4 py-2 text-[10px] text-ghost">
          <span className="flex items-center gap-1">
            <KeyHint>↑↓</KeyHint> navigate
          </span>
          <span className="flex items-center gap-1">
            <KeyHint>↵</KeyHint> open
          </span>
          <span className="flex items-center gap-1">
            <KeyHint>g</KeyHint> then a letter
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ *
 * Footer
 * ------------------------------------------------------------------ */

function Footer() {
  const { forecast, ready } = useStore()
  const breaches = forecast.flags.length

  return (
    <footer className="mt-14 border-t border-line-soft py-6 text-[10.5px] text-ghost">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {longDate(today())} · projection to {forecast.days.length - 1} days
        </span>
        <span className="flex items-center gap-2">
          {ready && breaches > 0 && (
            <span className="flex items-center gap-1 text-caution">
              <IconAlert /> {breaches} buffer event{breaches === 1 ? '' : 's'}
            </span>
          )}
          <span>Data stored on this device only</span>
        </span>
      </div>
    </footer>
  )
}
