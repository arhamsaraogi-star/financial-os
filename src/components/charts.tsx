'use client'

import { ReactNode, useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { money, moneyCompact } from '@/lib/format'
import { shortDate } from '@/lib/dates'

export const SERIES_COLOURS = [
  '#C9A227',
  '#7A9E9F',
  '#8F74A2',
  '#B8564C',
  '#74A37F',
  '#C28C3E',
]

/* ------------------------------------------------------------------ *
 * Tooltip — one shared shell so every chart speaks the same language
 * ------------------------------------------------------------------ */

interface TipPayload {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

function TipShell({ title, rows }: { title: string; rows: ReactNode }) {
  return (
    <div className="panel-raised px-3 py-2 text-[11px] shadow-2xl">
      <div className="eyebrow mb-1.5">{title}</div>
      {rows}
    </div>
  )
}

function ChartTooltip({
  active,
  payload,
  label,
  labelFormat,
  valueFormat = (v: number) => money(v),
}: {
  active?: boolean
  payload?: TipPayload[]
  label?: string | number
  labelFormat?: (l: string) => string
  valueFormat?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <TipShell
      title={labelFormat ? labelFormat(String(label)) : String(label)}
      rows={
        <div className="space-y-1">
          {payload.map((p, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-dim">
                <span
                  className="inline-block h-[7px] w-[7px] rounded-full"
                  style={{ background: p.color }}
                />
                {p.name}
              </span>
              <span className="tnum text-parchment">{valueFormat(Number(p.value ?? 0))}</span>
            </div>
          ))}
        </div>
      }
    />
  )
}

/* ------------------------------------------------------------------ *
 * Projected liquidity
 * ------------------------------------------------------------------ */

export interface FlowPoint {
  date: string
  total: number
  [accountId: string]: number | string
}

export function LiquidityChart({
  data,
  height = 260,
  floor = 0,
  troughDate,
}: {
  data: FlowPoint[]
  height?: number
  floor?: number
  troughDate?: string
}) {
  const gradId = useId()
  const totals = data.map((d) => d.total)
  // Anchor to zero only when a floor line is actually drawn, otherwise a
  // healthy balance sitting well above zero wastes most of the plot area.
  const min = floor > 0 ? Math.min(...totals, floor) : Math.min(...totals)
  const max = Math.max(...totals)
  const pad = Math.max(4000, (max - min) * 0.12)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A227" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#C9A227" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            minTickGap={38}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => moneyCompact(v)}
            width={58}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
          />
          <Tooltip
            content={<ChartTooltip labelFormat={shortDate} />}
            cursor={{ stroke: '#8A7228', strokeDasharray: '3 3' }}
          />
          {floor > 0 && (
            <ReferenceLine
              y={floor}
              stroke="#B8564C"
              strokeDasharray="4 4"
              strokeOpacity={0.65}
              label={{ value: 'floor', position: 'insideTopLeft', fill: '#B8564C', fontSize: 9 }}
            />
          )}
          {troughDate && (
            <ReferenceLine x={troughDate} stroke="#6B6860" strokeDasharray="2 3" strokeOpacity={0.6} />
          )}
          <Area
            type="monotone"
            dataKey="total"
            name="Projected liquidity"
            stroke="#C9A227"
            strokeWidth={1.7}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 3, fill: '#C9A227', stroke: '#08090B', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Per-account projection: the view that catches a dry bills account. */
export function AccountLinesChart({
  data,
  accounts,
  height = 240,
}: {
  data: FlowPoint[]
  accounts: { id: string; name: string; accent: string; minBuffer: number }[]
  height?: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -14 }}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={38} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => moneyCompact(v)} width={58} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip labelFormat={shortDate} />} />
          <ReferenceLine y={0} stroke="#B8564C" strokeOpacity={0.5} />
          {accounts.map((a) => (
            <Line
              key={a.id}
              type="monotone"
              dataKey={a.id}
              name={a.name}
              stroke={a.accent}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Bars / composition
 * ------------------------------------------------------------------ */

export function MonthlyBars({
  data,
  height = 220,
}: {
  data: { label: string; income: number; expense: number; invested: number }[]
  height?: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: -14 }} barGap={2}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis tickFormatter={(v: number) => moneyCompact(v)} width={58} tickLine={false} axisLine={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#14171B' }} />
          <Bar dataKey="income" name="Income" fill="#74A37F" radius={[2, 2, 0, 0]} maxBarSize={16} />
          <Bar dataKey="expense" name="Expense" fill="#B8564C" radius={[2, 2, 0, 0]} maxBarSize={16} />
          <Bar dataKey="invested" name="Invested" fill="#C9A227" radius={[2, 2, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AllocationDonut({
  data,
  height = 200,
}: {
  data: { name: string; value: number; pct: number }[]
  height?: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="#08090B"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={SERIES_COLOURS[i % SERIES_COLOURS.length]} />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Legend({ data }: { data: { name: string; value: number; pct: number }[] }) {
  return (
    <ul className="space-y-1.5">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center justify-between gap-3 text-[11.5px]">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: SERIES_COLOURS[i % SERIES_COLOURS.length] }}
            />
            <span className="truncate text-dim">{d.name}</span>
          </span>
          <span className="tnum shrink-0 text-faint">
            {d.pct.toFixed(1)}% · {moneyCompact(d.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ *
 * Sparkline
 * ------------------------------------------------------------------ */

export function Sparkline({
  values,
  width = 96,
  height = 26,
  colour = '#C9A227',
}: {
  values: number[]
  width?: number
  height?: number
  colour?: string
}) {
  const path = useMemo(() => {
    if (values.length < 2) return ''
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    return values
      .map((v, i) => {
        const x = (i / (values.length - 1)) * width
        const y = height - ((v - min) / span) * (height - 3) - 1.5
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [values, width, height])

  if (!path) return null
  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <path d={path} fill="none" stroke={colour} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ *
 * Sankey — where every rupee goes
 * ------------------------------------------------------------------ */

export interface SankeyNode {
  id: string
  label: string
  value: number
  column: number
  colour: string
}

export interface SankeyLink {
  from: string
  to: string
  value: number
}

/**
 * A purpose-built Sankey. Recharts' version cannot express three columns with
 * per-node colouring and stable ordering, and a generic layout library would be
 * heavier than the 120 lines this takes.
 */
export function Sankey({
  nodes,
  links,
  height = 340,
}: {
  nodes: SankeyNode[]
  links: SankeyLink[]
  height?: number
}) {
  const W = 800
  const H = height
  const NODE_W = 9
  const GAP = 10
  const PAD = 4

  const layout = useMemo(() => {
    const columns = [...new Set(nodes.map((n) => n.column))].sort((a, b) => a - b)
    const total = Math.max(
      ...columns.map((c) =>
        nodes.filter((n) => n.column === c).reduce((s, n) => s + n.value, 0),
      ),
      1,
    )
    const usableH = H - PAD * 2

    const placed = new Map<string, { x: number; y: number; h: number; node: SankeyNode }>()

    for (const c of columns) {
      const col = nodes.filter((n) => n.column === c)
      const colTotal = col.reduce((s, n) => s + n.value, 0)
      const gaps = GAP * Math.max(0, col.length - 1)
      const scale = (usableH - gaps) / Math.max(total, colTotal)
      let y = PAD + (usableH - gaps - colTotal * scale) / 2
      const x =
        columns.length > 1
          ? (c / (columns.length - 1)) * (W - NODE_W)
          : 0
      for (const n of col) {
        const h = Math.max(2, n.value * scale)
        placed.set(n.id, { x, y, h, node: n })
        y += h + GAP
      }
    }

    // Ribbons stack in node order on both ends so bands never cross needlessly.
    const outCursor = new Map<string, number>()
    const inCursor = new Map<string, number>()
    const ribbons = links
      .filter((l) => l.value > 0 && placed.has(l.from) && placed.has(l.to))
      .map((l) => {
        const a = placed.get(l.from)!
        const b = placed.get(l.to)!
        const aTotal = links.filter((x) => x.from === l.from).reduce((s, x) => s + x.value, 0) || 1
        const bTotal = links.filter((x) => x.to === l.to).reduce((s, x) => s + x.value, 0) || 1
        const ah = (l.value / aTotal) * a.h
        const bh = (l.value / bTotal) * b.h
        const ay = a.y + (outCursor.get(l.from) ?? 0)
        const by = b.y + (inCursor.get(l.to) ?? 0)
        outCursor.set(l.from, (outCursor.get(l.from) ?? 0) + ah)
        inCursor.set(l.to, (inCursor.get(l.to) ?? 0) + bh)

        const x1 = a.x + NODE_W
        const x2 = b.x
        const cx = (x1 + x2) / 2
        const d = [
          `M${x1},${ay}`,
          `C${cx},${ay} ${cx},${by} ${x2},${by}`,
          `L${x2},${by + bh}`,
          `C${cx},${by + bh} ${cx},${ay + ah} ${x1},${ay + ah}`,
          'Z',
        ].join(' ')
        return { d, colour: a.node.colour, key: `${l.from}->${l.to}`, value: l.value }
      })

    return { placed: [...placed.values()], ribbons, columns: columns.length }
  }, [nodes, links, H])

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        className="min-w-[560px]"
        role="img"
        aria-label="Flow of money from income sources through accounts to destinations"
      >
        <g>
          {layout.ribbons.map((r) => (
            <path key={r.key} d={r.d} fill={r.colour} fillOpacity={0.16}>
              <title>{money(r.value)}</title>
            </path>
          ))}
        </g>
        <g>
          {layout.placed.map(({ x, y, h, node }) => {
            const isLast = node.column === layout.columns - 1
            return (
              <g key={node.id}>
                <rect x={x} y={y} width={NODE_W} height={h} fill={node.colour} rx={1.5} />
                <text
                  x={isLast ? x - 8 : x + NODE_W + 8}
                  y={y + h / 2 - 3}
                  textAnchor={isLast ? 'end' : 'start'}
                  fill="var(--color-dim)"
                  fontSize={11}
                >
                  {node.label}
                </text>
                <text
                  x={isLast ? x - 8 : x + NODE_W + 8}
                  y={y + h / 2 + 10}
                  textAnchor={isLast ? 'end' : 'start'}
                  fill="var(--color-ghost)"
                  fontSize={10}
                  className="tnum"
                >
                  {moneyCompact(node.value)}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
