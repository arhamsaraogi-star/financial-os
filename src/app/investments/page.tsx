'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact, ordinal, pct } from '@/lib/format'
import type { Holding, Sip } from '@/lib/types'
import {
  holdingCost,
  holdingValue,
  portfolioSummary,
  projectCorpus,
  xirr,
} from '@/lib/engine/analytics'
import { AllocationDonut, Legend, SERIES_COLOURS } from '@/components/charts'
import {
  Badge,
  Button,
  Field,
  Meter,
  PageHeader,
  Panel,
  ScrollX,
  Segmented,
  Stat,
  Td,
  Th,
} from '@/components/ui'
import { IconChevron, IconPlus, IconTrash } from '@/components/icons'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const KIND_LABEL: Record<Holding['kind'], string> = {
  mutual_fund: 'Mutual fund',
  stock: 'Stock',
  etf: 'ETF',
  bond: 'Bond',
  gold: 'Gold',
  cash: 'Cash',
}

export default function Investments() {
  const { state, update, metrics } = useStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [split, setSplit] = useState<'assetClass' | 'sector' | 'kind'>('assetClass')
  const [assumedReturn, setAssumedReturn] = useState(12)

  const p = useMemo(() => portfolioSummary(state), [state])
  const sipTotal = state.sips.filter((s) => s.active).reduce((s, x) => s + x.amount, 0)

  const projection = useMemo(
    () => projectCorpus(p.current, sipTotal, assumedReturn, 25),
    [p.current, sipTotal, assumedReturn],
  )

  const allocation =
    split === 'assetClass' ? p.byAssetClass : split === 'sector' ? p.bySector : p.byKind

  const patchHolding = (id: string, fields: Partial<Holding>) =>
    update((s) => ({ ...s, holdings: s.holdings.map((h) => (h.id === id ? { ...h, ...fields } : h)) }))

  const patchSip = (id: string, fields: Partial<Sip>) =>
    update((s) => ({ ...s, sips: s.sips.map((x) => (x.id === id ? { ...x, ...fields } : x)) }))

  const addHolding = () =>
    update((s) => ({
      ...s,
      holdings: [
        ...s.holdings,
        {
          id: `h_${Date.now().toString(36)}`,
          name: 'New holding',
          kind: 'mutual_fund',
          units: 0,
          avgCost: 0,
          currentPrice: 0,
          sector: 'Diversified',
          assetClass: 'equity',
          flows: [],
          dividendsYtd: 0,
        },
      ],
    }))

  const addSip = () =>
    update((s) => ({
      ...s,
      sips: [
        ...s.sips,
        {
          id: `sip_${Date.now().toString(36)}`,
          name: 'New SIP',
          amount: 0,
          day: 5,
          accountId: s.accounts.find((a) => a.role === 'reserve')?.id ?? s.accounts[0]?.id ?? '',
          active: true,
        },
      ],
    }))

  return (
    <div className="rise">
      <PageHeader
        eyebrow="Investment Engine"
        title="Treated exactly like rent"
        lede="Investments are a fixed obligation funded before anything discretionary, not whatever happens to be left at month end. The corpus projection below assumes you never miss a contribution."
        actions={
          <Button onClick={addHolding} variant="brass" size="sm">
            <IconPlus /> Holding
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Market value" value={money(p.current)} sub={`${money(p.invested)} invested`} />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Absolute gain"
            value={money(p.absoluteGain)}
            sub={pct(p.absoluteReturnPct)}
            tone={p.absoluteGain >= 0 ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="XIRR"
            value={p.xirrPct != null ? pct(p.xirrPct) : '—'}
            sub="Money-weighted, all contributions"
            tone={(p.xirrPct ?? 0) >= 0 ? 'positive' : 'negative'}
          />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Monthly SIP"
            value={money(sipTotal)}
            sub={`${metrics.investmentRate.toFixed(0)}% of income`}
            tone="brass"
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Panel
          title="Allocation"
          actions={
            <Segmented
              value={split}
              onChange={setSplit}
              options={[
                { label: 'Asset', value: 'assetClass' },
                { label: 'Sector', value: 'sector' },
                { label: 'Type', value: 'kind' },
              ]}
            />
          }
        >
          <AllocationDonut data={allocation} height={190} />
          <div className="mt-3 border-t border-line-soft pt-3">
            <Legend data={allocation} />
          </div>
        </Panel>

        <Panel
          title="Projected corpus"
          subtitle={`${money(p.current)} today plus ${money(sipTotal)} a month, compounded`}
          actions={
            <Segmented
              value={assumedReturn}
              onChange={setAssumedReturn}
              options={[
                { label: '8%', value: 8 },
                { label: '10%', value: 10 },
                { label: '12%', value: 12 },
                { label: '14%', value: 14 },
              ]}
            />
          }
        >
          <div style={{ height: 210 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={projection} margin={{ top: 8, right: 6, bottom: 0, left: -6 }}>
                <defs>
                  <linearGradient id="corpus" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#74A37F" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#74A37F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="year"
                  tickFormatter={(y: number) => `${y}y`}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis
                  tickFormatter={(v: number) => moneyCompact(v)}
                  width={62}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: number, n: string) => [money(v), n === 'value' ? 'Corpus' : 'Contributed']}
                  labelFormatter={(y: number) => `Year ${y}`}
                  contentStyle={{
                    background: '#14171B',
                    border: '1px solid #23272E',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  itemStyle={{ color: '#E9E5DB' }}
                  labelStyle={{ color: '#6B6860', fontSize: 10 }}
                />
                <Area
                  type="monotone"
                  dataKey="contributed"
                  stroke="#6B6860"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  fill="none"
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#74A37F"
                  strokeWidth={1.7}
                  fill="url(#corpus)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-line-soft pt-3 text-[11px]">
            {[10, 15, 25].map((y) => {
              const row = projection[y - 1]
              return (
                <div key={y}>
                  <div className="eyebrow mb-1">In {y} years</div>
                  <div className="tnum text-[14px] text-positive">{moneyCompact(row?.value ?? 0)}</div>
                  <div className="mt-0.5 text-[10px] text-ghost">
                    {moneyCompact(row?.contributed ?? 0)} contributed
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      {/* ---- SIPs ------------------------------------------------------------ */}
      <Panel
        className="mb-4"
        title="Systematic investments"
        subtitle="Funded automatically by the rule engine before the debit date"
        actions={
          <Button onClick={addSip} size="sm">
            <IconPlus /> SIP
          </Button>
        }
      >
        <ul className="divide-y divide-line-soft">
          {state.sips.map((sip) => (
            <li key={sip.id} className="grid gap-3 py-3 first:pt-0 sm:grid-cols-[1.6fr_1fr_1fr_auto] sm:items-end">
              <Field label="Name">
                <input value={sip.name} onChange={(e) => patchSip(sip.id, { name: e.target.value })} />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  value={sip.amount}
                  onChange={(e) => patchSip(sip.id, { amount: Number(e.target.value) })}
                />
              </Field>
              <Field label={`Debit day — ${ordinal(sip.day)}`}>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={sip.day}
                  onChange={(e) =>
                    patchSip(sip.id, { day: Math.max(1, Math.min(31, Number(e.target.value) || 1)) })
                  }
                />
              </Field>
              <div className="flex items-center gap-2 pb-1">
                <label className="flex items-center gap-1.5 text-[11px] text-dim">
                  <input
                    type="checkbox"
                    checked={sip.active}
                    onChange={(e) => patchSip(sip.id, { active: e.target.checked })}
                  />
                  On
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => update((s) => ({ ...s, sips: s.sips.filter((x) => x.id !== sip.id) }))}
                >
                  <IconTrash />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---- Holdings -------------------------------------------------------- */}
      <Panel className="mb-4" title="Holdings" subtitle={`${state.holdings.length} positions`}>
        <ScrollX>
          <table className="w-full min-w-[680px] text-[12px]">
            <thead>
              <tr className="border-b border-line-soft">
                <Th>Holding</Th>
                <Th align="right">Units</Th>
                <Th align="right">Avg cost</Th>
                <Th align="right">Price</Th>
                <Th align="right">Invested</Th>
                <Th align="right">Value</Th>
                <Th align="right">Gain</Th>
                <Th align="right">XIRR</Th>
                <Th align="right">Weight</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {state.holdings.map((h, i) => {
                const cost = holdingCost(h)
                const value = holdingValue(h)
                const gain = value - cost
                const own = h.flows.length
                  ? xirr([...h.flows, { date: new Date().toISOString().slice(0, 10), amount: value }])
                  : null
                return (
                  <tr key={h.id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}
                        />
                        <span>
                          {h.name}
                          <span className="ml-2 text-[10px] text-ghost">{KIND_LABEL[h.kind]}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="tnum text-right text-faint">{h.units.toFixed(2)}</Td>
                    <Td className="tnum text-right text-faint">{money(h.avgCost, true)}</Td>
                    <Td className="tnum text-right">{money(h.currentPrice, true)}</Td>
                    <Td className="tnum text-right text-faint">{money(cost)}</Td>
                    <Td className="tnum text-right">{money(value)}</Td>
                    <Td className={`tnum text-right ${gain >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {money(gain)}
                      <span className="ml-1 text-[10px] opacity-70">
                        {pct(cost > 0 ? (gain / cost) * 100 : 0)}
                      </span>
                    </Td>
                    <Td className={`tnum text-right ${(own ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {own != null ? pct(own * 100) : '—'}
                    </Td>
                    <Td className="tnum text-right text-faint">
                      {p.current > 0 ? `${((value / p.current) * 100).toFixed(1)}%` : '—'}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <Td className="text-faint">Total</Td>
                <Td> </Td>
                <Td> </Td>
                <Td> </Td>
                <Td className="tnum text-right text-faint">{money(p.invested)}</Td>
                <Td className="tnum text-right">{money(p.current)}</Td>
                <Td className={`tnum text-right ${p.absoluteGain >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {money(p.absoluteGain)}
                </Td>
                <Td className="tnum text-right text-brass">{p.xirrPct != null ? pct(p.xirrPct) : '—'}</Td>
                <Td className="tnum text-right text-faint">100%</Td>
              </tr>
            </tfoot>
          </table>
        </ScrollX>
      </Panel>

      <div className="space-y-3">
        {state.holdings.map((h) => {
          const open = editing === h.id
          const value = holdingValue(h)
          return (
            <Panel key={h.id} padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px]">{h.name}</h3>
                    <Badge tone="neutral">{h.assetClass}</Badge>
                    {h.dividendsYtd > 0 && <Badge tone="positive">{money(h.dividendsYtd)} dividends</Badge>}
                  </div>
                  <p className="mt-1 text-[11px] text-ghost">
                    {h.sector} · {h.units.toFixed(2)} units at {money(h.avgCost, true)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-28">
                    <Meter
                      value={value}
                      max={Math.max(...state.holdings.map(holdingValue), 1)}
                      height={3}
                      tone="brass"
                    />
                  </div>
                  <span className="tnum text-[15px]">{money(value)}</span>
                  <button
                    onClick={() => setEditing(open ? null : h.id)}
                    className="rounded-[4px] border border-line p-1.5 text-faint transition-colors hover:border-brass-deep hover:text-brass"
                    aria-label={open ? 'Close editor' : 'Edit holding'}
                  >
                    <IconChevron className={open ? 'rotate-90 transition-transform' : 'transition-transform'} />
                  </button>
                </div>
              </div>

              {open && (
                <div className="border-t border-line-soft bg-panel-2/40 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Name">
                      <input value={h.name} onChange={(e) => patchHolding(h.id, { name: e.target.value })} />
                    </Field>
                    <Field label="Type">
                      <select
                        value={h.kind}
                        onChange={(e) => patchHolding(h.id, { kind: e.target.value as Holding['kind'] })}
                      >
                        {(Object.keys(KIND_LABEL) as Holding['kind'][]).map((k) => (
                          <option key={k} value={k}>
                            {KIND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Asset class">
                      <select
                        value={h.assetClass}
                        onChange={(e) =>
                          patchHolding(h.id, { assetClass: e.target.value as Holding['assetClass'] })
                        }
                      >
                        {['equity', 'debt', 'gold', 'cash', 'alternative'].map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sector">
                      <input value={h.sector} onChange={(e) => patchHolding(h.id, { sector: e.target.value })} />
                    </Field>
                    <Field label="Units">
                      <input
                        type="number"
                        step="0.01"
                        value={h.units}
                        onChange={(e) => patchHolding(h.id, { units: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Average cost">
                      <input
                        type="number"
                        step="0.01"
                        value={h.avgCost}
                        onChange={(e) => patchHolding(h.id, { avgCost: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Current price" hint="Update this to mark the portfolio to market.">
                      <input
                        type="number"
                        step="0.01"
                        value={h.currentPrice}
                        onChange={(e) => patchHolding(h.id, { currentPrice: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Dividends YTD">
                      <input
                        type="number"
                        value={h.dividendsYtd}
                        onChange={(e) => patchHolding(h.id, { dividendsYtd: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        update((s) => ({ ...s, holdings: s.holdings.filter((x) => x.id !== h.id) }))
                      }
                    >
                      <IconTrash /> Remove holding
                    </Button>
                  </div>
                </div>
              )}
            </Panel>
          )
        })}
      </div>
    </div>
  )
}
