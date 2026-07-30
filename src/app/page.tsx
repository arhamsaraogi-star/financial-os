'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { money, moneyCompact, pct } from '@/lib/format'
import { longDate, relativeDays, shortDate, today } from '@/lib/dates'
import { creditSummary, portfolioSummary } from '@/lib/engine/analytics'
import { upcomingIncome, upcomingObligations } from '@/lib/engine/events'
import type { Advisory } from '@/lib/engine/advisor'
import { LiquidityChart, type FlowPoint } from '@/components/charts'
import {
  Badge,
  Meter,
  Panel,
  RiskDial,
  Segmented,
  Stat,
} from '@/components/ui'
import { IconChevron } from '@/components/icons'

export default function Overview() {
  const { state, forecast, metrics, health, advice, horizon, setHorizon } = useStore()
  const credit = creditSummary(state)
  const portfolio = portfolioSummary(state)
  const ef = state.goals.find((g) => g.kind === 'emergency_fund')

  const flow = useMemo<FlowPoint[]>(
    () => forecast.days.map((d) => ({ date: d.date, total: Math.round(d.total), ...d.byAccount })),
    [forecast.days],
  )

  const income = useMemo(() => upcomingIncome(state, 30).slice(0, 5), [state])
  const bills = useMemo(() => upcomingObligations(state, 30).slice(0, 7), [state])

  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="rise">
      {/* ---- Masthead ---------------------------------------------------- */}
      <header className="mb-8">
        <div className="eyebrow mb-2">
          {salutation}, {state.settings.ownerName} · {longDate(today())}
        </div>
        <h1 className="display text-[32px] leading-[1.05] sm:text-[44px]">
          {money(metrics.netWorth.total)}
        </h1>
        <p className="mt-2 text-[13px] text-dim">
          Net worth across {state.accounts.filter((a) => a.role !== 'credit').length} accounts,{' '}
          {state.holdings.length} holdings and {state.cards.filter((c) => c.active).length} cards.
        </p>
        <div className="rule-gold mt-5 h-px w-full opacity-40" />
      </header>

      {/* ---- Headline tiles ---------------------------------------------- */}
      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        {[
          {
            label: 'Liquid cash',
            value: money(metrics.netWorth.cash),
            sub: `${metrics.cashRunwayMonths.toFixed(1)} months of runway`,
          },
          {
            label: 'Investments',
            value: money(metrics.netWorth.investments),
            sub:
              portfolio.xirrPct != null
                ? `${pct(portfolio.xirrPct)} XIRR · ${pct(portfolio.absoluteReturnPct)} absolute`
                : `${pct(portfolio.absoluteReturnPct)} absolute`,
            tone: portfolio.absoluteGain >= 0 ? ('positive' as const) : ('negative' as const),
          },
          {
            label: 'Savings rate',
            value: `${metrics.savingsRate.toFixed(0)}%`,
            sub: `${money(metrics.surplus)} surplus after every commitment`,
            tone: metrics.savingsRate >= 20 ? ('positive' as const) : ('negative' as const),
          },
          {
            label: 'Credit used',
            value: `${credit.utilisation.toFixed(0)}%`,
            sub: `${money(credit.balance)} of ${moneyCompact(credit.limit)} · ${credit.band.label}`,
            tone: credit.utilisation <= 30 ? ('positive' as const) : ('negative' as const),
          },
        ].map((t, i) => (
          <motion.div
            key={t.label}
            className="bg-panel p-4"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <Stat label={t.label} value={t.value} sub={t.sub} tone={t.tone} />
          </motion.div>
        ))}
      </div>

      {/* ---- Risk + health ----------------------------------------------- */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <Panel title="Today's financial health">
          <RiskDial score={forecast.riskScore} level={forecast.riskLevel} />
          <div className="mt-5 space-y-3">
            {health.parts.map((p) => (
              <div key={p.key}>
                <div className="mb-1 flex items-center justify-between text-[11.5px]">
                  <span className="text-dim">{p.key}</span>
                  <span className="tnum text-faint">{Math.round(p.value)}</span>
                </div>
                <Meter
                  value={p.value}
                  max={100}
                  height={3}
                  tone={p.value >= 70 ? 'positive' : p.value >= 40 ? 'caution' : 'negative'}
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t border-line-soft pt-3">
            <span className="eyebrow">Composite score</span>
            <span className="tnum display text-[22px] text-brass">{health.total}</span>
          </div>
        </Panel>

        <Panel
          title="The CFO's read"
          subtitle="Ranked by what actually threatens the month"
          actions={
            <Link href="/cfo" className="flex items-center gap-1 text-[11px] text-faint hover:text-brass">
              Ask a question <IconChevron />
            </Link>
          }
        >
          <ul className="space-y-3">
            {advice.slice(0, 4).map((a, i) => (
              <AdvisoryRow key={a.id} advisory={a} index={i} />
            ))}
          </ul>
        </Panel>
      </div>

      {/* ---- Projection --------------------------------------------------- */}
      <Panel
        className="mb-4"
        title="Projected liquidity"
        subtitle={`Trough ${money(forecast.trough.total)} on ${longDate(forecast.trough.date)}`}
        actions={
          <Segmented
            value={horizon}
            onChange={setHorizon}
            options={[
              { label: '30d', value: 30 },
              { label: '60d', value: 60 },
              { label: '90d', value: 90 },
              { label: '1y', value: 365 },
            ]}
          />
        }
      >
        <LiquidityChart data={flow} troughDate={forecast.trough.date} height={250} />
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line-soft pt-3 sm:grid-cols-4">
          <MiniStat label="Inflow" value={money(forecast.totalInflow)} tone="positive" />
          <MiniStat label="Outflow" value={money(forecast.totalOutflow)} tone="negative" />
          <MiniStat
            label="Net"
            value={money(forecast.netFlow)}
            tone={forecast.netFlow >= 0 ? 'positive' : 'negative'}
          />
          <MiniStat label="Closing" value={money(forecast.closingTotal)} />
        </div>
      </Panel>

      {/* ---- Calendar ------------------------------------------------------ */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Expected income"
          subtitle="Next 30 days"
          actions={
            <Link href="/income" className="text-[11px] text-faint hover:text-brass">
              Manage
            </Link>
          }
        >
          <ul className="divide-y divide-line-soft">
            {income.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="min-w-0">
                  <div className="truncate text-[13px]">{e.label}</div>
                  <div className="text-[10.5px] text-ghost">
                    {shortDate(e.date)} · {relativeDays(e.date)} ·{' '}
                    {Math.round(e.confidence * 100)}% confidence
                  </div>
                </div>
                <span className="tnum shrink-0 text-[13px] text-positive">
                  +{money(e.amount)}
                </span>
              </li>
            ))}
            {!income.length && <li className="py-6 text-center text-[12px] text-ghost">Nothing expected</li>}
          </ul>
        </Panel>

        <Panel
          title="Upcoming obligations"
          subtitle="Next 30 days"
          actions={
            <Link href="/obligations" className="text-[11px] text-faint hover:text-brass">
              Manage
            </Link>
          }
        >
          <ul className="divide-y divide-line-soft">
            {bills.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{e.label}</div>
                    <div className="text-[10.5px] text-ghost">
                      {shortDate(e.date)} · {relativeDays(e.date)}
                    </div>
                  </div>
                  {e.priority === 'critical' && <Badge tone="negative">Critical</Badge>}
                </div>
                <span className="tnum shrink-0 text-[13px] text-dim">−{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ---- Accounts + reserve ------------------------------------------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        {state.accounts
          .filter((a) => a.role !== 'credit')
          .map((a) => {
            const projected = forecast.days[forecast.days.length - 1]?.byAccount[a.id] ?? a.balance
            const low = Math.min(...forecast.days.map((d) => d.byAccount[a.id] ?? a.balance))
            return (
              <Panel key={a.id}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ background: a.accent }}
                      />
                      <span className="truncate text-[13px]">{a.name}</span>
                    </div>
                    <div className="eyebrow mt-1.5">{a.role.replace('_', ' ')}</div>
                  </div>
                  {low < a.minBuffer && <Badge tone="caution">Dips low</Badge>}
                </div>
                <div className="tnum display mb-3 text-[24px]">{money(a.balance)}</div>
                <Meter
                  value={a.balance}
                  max={Math.max(a.targetBalance, a.balance)}
                  notch={a.minBuffer}
                  tone={a.balance < a.minBuffer ? 'negative' : 'brass'}
                />
                <dl className="mt-3 space-y-1 text-[10.5px] text-ghost">
                  <Row label="Target" value={money(a.targetBalance)} />
                  <Row label="Floor" value={money(a.minBuffer)} />
                  <Row label={`Low over ${horizon}d`} value={money(low)} />
                  <Row label="Projected close" value={money(projected)} />
                </dl>
              </Panel>
            )
          })}
      </div>

      {ef && (
        <Panel className="mt-4" title="Emergency fund">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="tnum display text-[26px]">{money(ef.current)}</div>
              <div className="mt-1 text-[11px] text-faint">
                of {money(ef.target)} · {metrics.emergencyMonthsCovered.toFixed(1)} months covered
              </div>
            </div>
            <Link href="/reserve" className="flex items-center gap-1 text-[11px] text-faint hover:text-brass">
              Detail <IconChevron />
            </Link>
          </div>
          <div className="mt-3">
            <Meter
              value={ef.current}
              max={ef.target}
              tone={ef.current >= ef.target ? 'positive' : 'brass'}
              height={6}
            />
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function AdvisoryRow({ advisory, index }: { advisory: Advisory; index: number }) {
  const tone = {
    critical: { bar: 'bg-negative', badge: 'negative' as const, label: 'Act now' },
    warning: { bar: 'bg-caution', badge: 'caution' as const, label: 'Watch' },
    opportunity: { bar: 'bg-brass', badge: 'brass' as const, label: 'Opportunity' },
    good: { bar: 'bg-positive', badge: 'positive' as const, label: 'Clear' },
  }[advisory.tone]

  return (
    <motion.li
      className="relative pl-3.5"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.35 }}
    >
      <span className={`absolute left-0 top-1 h-[calc(100%-8px)] w-[2px] rounded-full ${tone.bar}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] leading-snug">{advisory.title}</span>
        <Badge tone={tone.badge}>{tone.label}</Badge>
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">{advisory.detail}</p>
      {advisory.action && (
        <p className="mt-1.5 text-[11px] text-brass">→ {advisory.action}</p>
      )}
    </motion.li>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'positive' | 'negative'
}) {
  return (
    <div>
      <div className="eyebrow mb-1">{label}</div>
      <div
        className={`tnum text-[14px] ${
          tone === 'positive' ? 'text-positive' : tone === 'negative' ? 'text-negative' : 'text-parchment'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="truncate">{label}</dt>
      <dd className="tnum shrink-0 text-faint">{value}</dd>
    </div>
  )
}
