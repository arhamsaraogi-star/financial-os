'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useTransactionSheet } from '@/components/Shell'
import { money, moneyCompact } from '@/lib/format'
import { longDate, relativeDays, shortDate, today } from '@/lib/dates'
import { budgetSummary, currentMonth, dailySpend, monthLabel } from '@/lib/engine/analytics'
import { upcoming } from '@/lib/engine/events'
import { DailyStrip } from '@/components/charts'
import { Badge, Card, Divider, Empty, Meter, Row } from '@/components/ui'

export default function Home() {
  const { state, metrics, forecast, advice, categoryOf, accountName } = useStore()
  const sheet = useTransactionSheet()

  const budget = useMemo(() => budgetSummary(state), [state])
  const strip = useMemo(() => dailySpend(state), [state])
  const bills = useMemo(() => upcoming(state, 14).filter((e) => e.kind !== 'income').slice(0, 4), [state])
  const income = useMemo(() => upcoming(state, 14).filter((e) => e.kind === 'income').slice(0, 2), [state])
  const recent = useMemo(() => state.transactions.slice(0, 6), [state.transactions])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const top = advice[0]

  const toneMap = {
    urgent: { badge: 'bad' as const, bar: 'bg-bad', word: 'Needs attention' },
    warning: { badge: 'warn' as const, bar: 'bg-warn', word: 'Worth a look' },
    idea: { badge: 'accent' as const, bar: 'bg-accent', word: 'Idea' },
    good: { badge: 'good' as const, bar: 'bg-good', word: 'All good' },
  }

  return (
    <div className="rise space-y-4 pb-4">
      {/* ---- Balance ------------------------------------------------------ */}
      <header>
        <p className="text-[13.5px] text-faint">
          {greeting}
          {state.settings.ownerName ? `, ${state.settings.ownerName}` : ''}
        </p>
        <h1 className="display mt-1 text-[40px] leading-none sm:text-[48px]">
          {money(metrics.netWorth.cash)}
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          across {state.accounts.filter((a) => a.kind !== 'credit' && !a.archived).length} accounts
          {metrics.netWorth.owed > 0 && (
            <>
              {' · '}
              <span className="text-bad">{money(metrics.netWorth.owed)} owed on cards</span>
            </>
          )}
        </p>
      </header>

      {/* ---- This month --------------------------------------------------- */}
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label mb-1.5">Spent in {monthLabel(currentMonth(), true)}</div>
            <div className="tnum display text-[30px] leading-none">{money(metrics.monthSpend)}</div>
          </div>
          {budget.budgeted > 0 && (
            <div className="text-right">
              <div className="label mb-1.5">Budget</div>
              <div className="tnum text-[16px] text-muted">{money(budget.budgeted)}</div>
            </div>
          )}
        </div>

        {budget.budgeted > 0 && (
          <div className="mt-4">
            <Meter
              value={budget.spent}
              max={budget.budgeted}
              tone={budget.spent > budget.budgeted ? 'bad' : budget.paceRatio > 1.05 ? 'warn' : 'good'}
            />
            <p className="mt-2.5 text-[13px] text-faint">
              {budget.spent > budget.budgeted ? (
                <>
                  <span className="text-bad">{money(budget.spent - budget.budgeted)} over</span> with{' '}
                  {budget.daysLeft} days to go
                </>
              ) : budget.daysLeft > 0 ? (
                <>
                  {money(budget.remaining)} left ·{' '}
                  <span className={budget.paceRatio > 1.05 ? 'text-warn' : 'text-good'}>
                    {money(budget.remaining / Math.max(1, budget.daysLeft))} a day
                  </span>{' '}
                  for {budget.daysLeft} days
                </>
              ) : (
                <>Month complete</>
              )}
            </p>
          </div>
        )}

        <div className="mt-4">
          <DailyStrip data={strip} />
          <div className="mt-1.5 flex justify-between text-[11px] text-ghost">
            <span>1 {monthLabel(currentMonth())}</span>
            <span>{strip.length} {monthLabel(currentMonth())}</span>
          </div>
        </div>
      </Card>

      {/* ---- Top advice ---------------------------------------------------- */}
      {top && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Link href={top.href ?? '/advisor'} className="block">
            <Card className="active:opacity-70">
              <div className="flex gap-3">
                <span className={`w-[3px] shrink-0 rounded-full ${toneMap[top.tone].bar}`} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge tone={toneMap[top.tone].badge}>{toneMap[top.tone].word}</Badge>
                    {advice.length > 1 && (
                      <span className="text-[12px] text-ghost">+{advice.length - 1} more</span>
                    )}
                  </div>
                  <p className="text-[15.5px] leading-snug text-text">{top.title}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-faint">{top.detail}</p>
                  {top.action && <p className="mt-2 text-[13px] text-accent">{top.action} →</p>}
                </div>
              </div>
            </Card>
          </Link>
        </motion.div>
      )}

      {/* ---- Coming up ------------------------------------------------------ */}
      <Card title="Coming up" action={<Link href="/recurring" className="text-[13px] text-faint">All</Link>}>
        {bills.length === 0 && income.length === 0 ? (
          <Empty icon="🗓" title="Nothing due in the next two weeks" />
        ) : (
          <div className="divide-y divide-line-soft">
            {income.map((e) => (
              <Row
                key={e.id}
                icon="↓"
                title={e.label}
                subtitle={`${shortDate(e.date)} · ${relativeDays(e.date)}`}
                value={`+${money(e.amount)}`}
                valueTone="good"
              />
            ))}
            {bills.map((e) => (
              <Row
                key={e.id}
                icon={e.kind === 'card_payment' ? '💳' : e.kind === 'subscription' ? '🔁' : '📄'}
                title={e.label}
                subtitle={`${shortDate(e.date)} · ${relativeDays(e.date)} · from ${accountName(e.fromAccountId)}`}
                value={`−${money(e.amount)}`}
                valueTone="muted"
              />
            ))}
          </div>
        )}
      </Card>

      {/* ---- Accounts -------------------------------------------------------- */}
      <Card title="Accounts" action={<Link href="/accounts" className="text-[13px] text-faint">Manage</Link>}>
        <div className="divide-y divide-line-soft">
          {state.accounts
            .filter((a) => !a.archived)
            .map((a) => {
              const low = Math.min(...forecast.days.map((d) => d.byAccount[a.id] ?? a.balance))
              const card = a.kind === 'credit'
              const owed = Math.abs(Math.min(0, a.balance))
              return (
                <Row
                  key={a.id}
                  icon={
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.accent }} />
                  }
                  title={a.name}
                  subtitle={
                    card
                      ? a.creditLimit
                        ? `${((owed / a.creditLimit) * 100).toFixed(0)}% of ${moneyCompact(a.creditLimit)} used`
                        : 'Credit card'
                      : low < a.minBuffer
                        ? `Dips to ${money(low)} — below your cushion`
                        : `${a.kind === 'savings' ? 'Savings' : a.kind === 'bills' ? 'Bills' : 'Spending'}`
                  }
                  value={card ? `−${money(owed)}` : money(a.balance)}
                  valueTone={card ? 'bad' : low < a.minBuffer ? 'bad' : 'neutral'}
                />
              )
            })}
        </div>
      </Card>

      {/* ---- Recent ---------------------------------------------------------- */}
      <Card
        title="Recent"
        action={<Link href="/transactions" className="text-[13px] text-faint">See all</Link>}
      >
        {recent.length === 0 ? (
          <Empty
            icon="📝"
            title="No transactions yet"
            detail="Tap the + button to log what you spend. It takes about five seconds."
          />
        ) : (
          <div className="divide-y divide-line-soft">
            {recent.map((t) => {
              const cat = categoryOf(t.categoryId)
              return (
                <Row
                  key={t.id}
                  icon={t.transfer ? '⇄' : (cat?.icon ?? '•')}
                  title={t.description}
                  subtitle={`${shortDate(t.date)} · ${accountName(t.accountId)}`}
                  value={`${t.amount >= 0 ? '+' : '−'}${money(Math.abs(t.amount))}`}
                  valueTone={t.transfer ? 'muted' : t.amount >= 0 ? 'good' : 'neutral'}
                  onClick={() => sheet.edit(t)}
                />
              )
            })}
          </div>
        )}
      </Card>

      {/* ---- Outlook ---------------------------------------------------------- */}
      <Link href="/forecast" className="block">
        <Card className="active:opacity-70">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="label mb-1.5">Next 90 days</div>
              <p className="text-[15px] text-text">
                Lowest point {money(forecast.trough.total)}
              </p>
              <p className="mt-1 text-[13px] text-faint">on {longDate(forecast.trough.date)}</p>
            </div>
            <div className="text-right">
              <div
                className={`tnum display text-[26px] ${
                  forecast.riskScore >= 82
                    ? 'text-good'
                    : forecast.riskScore >= 62
                      ? 'text-accent'
                      : 'text-bad'
                }`}
              >
                {forecast.riskScore}
              </div>
              <div className="text-[11.5px] text-ghost">out of 100</div>
            </div>
          </div>
        </Card>
      </Link>

      <p className="px-1 pt-2 text-center text-[12px] text-ghost">
        {longDate(today())} · saved on this device only
      </p>
      <Divider />
    </div>
  )
}
