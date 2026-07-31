'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { longDate, relativeDays, shortDate } from '@/lib/dates'
import { simulate } from '@/lib/engine/forecast'
import { BalanceChart } from '@/components/charts'
import { Badge, Button, Card, Field, PageHeader, Row, Segmented } from '@/components/ui'

const KIND_ICON: Record<string, string> = {
  income: '↓',
  bill: '📄',
  subscription: '🔁',
  card_payment: '💳',
  everyday: '🛒',
  transfer: '⇄',
}

export default function ForecastPage() {
  const { state, forecast, horizon, setHorizon, accountName } = useStore()
  const [delayDays, setDelayDays] = useState(0)
  const incomes = state.recurring.filter((r) => r.kind === 'income' && r.active)
  const [source, setSource] = useState(incomes[0]?.id ?? '')

  const chart = useMemo(
    () => forecast.days.map((d) => ({ date: d.date, total: Math.round(d.total) })),
    [forecast.days],
  )

  const stressed = useMemo(
    () =>
      delayDays > 0 && source
        ? simulate(state, { horizonDays: horizon, delayIncome: { recurringId: source, days: delayDays } })
        : null,
    [state, horizon, delayDays, source],
  )

  const busyDays = forecast.days.filter((d) => d.events.length > 0).slice(0, 40)

  const tone =
    forecast.riskScore >= 82
      ? { text: 'text-good', label: 'Comfortable' }
      : forecast.riskScore >= 62
        ? { text: 'text-accent', label: 'Manageable' }
        : forecast.riskScore >= 38
          ? { text: 'text-warn', label: 'Tight' }
          : { text: 'text-bad', label: 'Trouble ahead' }

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader
        title="Forecast"
        lede="Your balance day by day, based on what comes in, what goes out and how you actually spend."
      />

      <Segmented
        value={horizon}
        onChange={setHorizon}
        options={[
          { label: '30 days', value: 30 },
          { label: '60 days', value: 60 },
          { label: '90 days', value: 90 },
          { label: '1 year', value: 365 },
        ]}
      />

      <Card>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="label mb-1.5">Lowest you go</div>
            <div className="tnum display text-[30px] leading-none">{money(forecast.trough.total)}</div>
            <p className="mt-2 text-[13px] text-faint">on {longDate(forecast.trough.date)}</p>
          </div>
          <div className="text-right">
            <div className={`tnum display text-[30px] leading-none ${tone.text}`}>{forecast.riskScore}</div>
            <p className={`mt-2 text-[13px] ${tone.text}`}>{tone.label}</p>
          </div>
        </div>

        <BalanceChart data={chart} height={210} showZero={forecast.trough.total < 0} />

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-3">
          <div>
            <div className="label mb-1">In</div>
            <div className="tnum text-[14.5px] text-good">{moneyCompact(forecast.totalInflow)}</div>
          </div>
          <div>
            <div className="label mb-1">Out</div>
            <div className="tnum text-[14.5px] text-bad">{moneyCompact(forecast.totalOutflow)}</div>
          </div>
          <div>
            <div className="label mb-1">Ends at</div>
            <div className="tnum text-[14.5px]">{moneyCompact(forecast.closingTotal)}</div>
          </div>
        </div>
      </Card>

      {/* ---- Warnings -------------------------------------------------------- */}
      {forecast.flags.length > 0 && (
        <Card title="Watch out for">
          <div className="divide-y divide-line-soft">
            {dedupeFlags(forecast.flags).slice(0, 6).map((f) => (
              <Row
                key={`${f.date}-${f.accountId}`}
                icon={f.severity === 'overdraft' ? '🚨' : '⚠️'}
                title={
                  <span className="flex items-center gap-2">
                    {f.accountName}
                    <Badge tone={f.severity === 'overdraft' ? 'bad' : 'warn'}>
                      {f.severity === 'overdraft' ? 'Runs out' : 'Gets low'}
                    </Badge>
                  </span>
                }
                subtitle={`${shortDate(f.date)} · ${relativeDays(f.date)}${f.cause ? ` · ${f.cause}` : ''}`}
                value={money(f.balance)}
                valueTone={f.balance < 0 ? 'bad' : 'muted'}
              />
            ))}
          </div>
        </Card>
      )}

      {/* ---- What if ---------------------------------------------------------- */}
      {incomes.length > 0 && (
        <Card title="What if you're paid late?">
          <div className="space-y-3">
            {incomes.length > 1 && (
              <Field label="Which one">
                <select value={source} onChange={(e) => setSource(e.target.value)}>
                  {incomes.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div>
              <span className="label mb-2 block">
                {delayDays === 0 ? 'On time' : `${delayDays} day${delayDays === 1 ? '' : 's'} late`}
              </span>
              <input
                type="range"
                min={0}
                max={14}
                value={delayDays}
                onChange={(e) => setDelayDays(Number(e.target.value))}
                aria-label="Days late"
              />
            </div>

            {stressed ? (
              <div className="rounded-[var(--radius-control)] border border-line-soft bg-surface p-4">
                <div className="mb-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="label mb-1">Lowest point</div>
                    <div className="tnum text-[15px]">
                      <span className="text-faint line-through">{moneyCompact(forecast.trough.total)}</span>{' '}
                      <span className={stressed.trough.total < forecast.trough.total ? 'text-bad' : 'text-good'}>
                        {moneyCompact(stressed.trough.total)}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="label mb-1">Score</div>
                    <div className="tnum text-[15px]">
                      <span className="text-faint line-through">{forecast.riskScore}</span>{' '}
                      <span className={stressed.riskScore < forecast.riskScore ? 'text-bad' : 'text-good'}>
                        {stressed.riskScore}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-muted">
                  {stressed.flags.some((f) => f.severity === 'overdraft')
                    ? `${
                        stressed.flags.find((f) => f.severity === 'overdraft')?.accountName
                      } would run out. Move money across before the delay hits.`
                    : stressed.flags.length > forecast.flags.length
                      ? `You would cope, but ${stressed.flags[0]?.accountName} drops under its cushion around ${shortDate(
                          stressed.flags[0]?.date ?? '',
                        )}.`
                      : 'Nothing breaks. Every bill still gets paid on time.'}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-ghost">
                Drag the slider to see what happens if the money arrives late.
              </p>
            )}

            {delayDays > 0 && (
              <Button size="sm" variant="plain" onClick={() => setDelayDays(0)}>
                Reset
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ---- Timeline ---------------------------------------------------------- */}
      <Card title="What's scheduled" padded={false}>
        <div className="px-4 pb-2">
          {busyDays.map((day) => (
            <div key={day.date} className="border-b border-line-soft py-3 last:border-0">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[13px] text-muted">
                  {shortDate(day.date)}
                  <span className="ml-2 text-[12px] text-ghost">{relativeDays(day.date)}</span>
                </span>
                <span
                  className={`tnum text-[13px] ${
                    day.overdraft ? 'text-bad' : day.breach ? 'text-warn' : 'text-faint'
                  }`}
                >
                  {money(day.total)}
                </span>
              </div>
              <div className="space-y-1">
                {day.events.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-[14px]">
                        {KIND_ICON[e.kind] ?? '•'} {e.label}
                      </span>
                      {e.rationale && (
                        <p className="mt-0.5 text-[11.5px] leading-snug text-ghost">{e.rationale}</p>
                      )}
                      {e.kind === 'transfer' && (
                        <p className="mt-0.5 text-[11.5px] text-ghost">
                          {accountName(e.fromAccountId)} → {accountName(e.toAccountId)}
                        </p>
                      )}
                    </div>
                    <span
                      className={`tnum shrink-0 text-[14px] ${
                        e.kind === 'income'
                          ? 'text-good'
                          : e.kind === 'transfer'
                            ? 'text-info'
                            : 'text-muted'
                      }`}
                    >
                      {e.kind === 'income' ? '+' : e.kind === 'transfer' ? '' : '−'}
                      {money(e.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <p className="px-1 text-center text-[12px] leading-relaxed text-ghost">
        Everyday spending is estimated from your own transactions, not a number you typed. The more you
        log, the sharper this gets.
      </p>
    </div>
  )
}

/** One row per account per day — the raw flags repeat within a day. */
function dedupeFlags<T extends { date: string; accountId: string }>(flags: T[]): T[] {
  const seen = new Set<string>()
  return flags.filter((f) => {
    const k = `${f.date}:${f.accountId}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
