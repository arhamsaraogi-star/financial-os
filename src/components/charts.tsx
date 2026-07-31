'use client'

import { ReactNode, useId, useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
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

interface TipRow {
  name?: string
  value?: number | string
  color?: string
}

function Tip({
  active,
  payload,
  label,
  formatLabel,
}: {
  active?: boolean
  payload?: TipRow[]
  label?: string | number
  formatLabel?: (l: string) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="card-raised px-3 py-2 text-[12.5px]">
      <div className="label mb-1">{formatLabel ? formatLabel(String(label)) : String(label)}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="tnum text-text">{money(Number(p.value ?? 0))}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Projected balance
 * ------------------------------------------------------------------ */

export function BalanceChart({
  data,
  height = 200,
  showZero = false,
}: {
  data: { date: string; total: number }[]
  height?: number
  showZero?: boolean
}) {
  const gradId = useId()
  const totals = data.map((d) => d.total)
  // Anchor to zero only when it is actually in view, otherwise a healthy
  // balance well above zero wastes most of the plot.
  const min = showZero ? Math.min(...totals, 0) : Math.min(...totals)
  const max = Math.max(...totals)
  const pad = Math.max(3000, (max - min) * 0.15)

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4A72C" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#D4A72C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={44} tickLine={false} axisLine={false} />
          <YAxis
            tickFormatter={(v: number) => moneyCompact(v)}
            width={54}
            tickLine={false}
            axisLine={false}
            domain={[min - pad, max + pad]}
          />
          <Tooltip content={<Tip formatLabel={shortDate} />} cursor={{ stroke: '#8F7420', strokeDasharray: '3 3' }} />
          {min - pad < 0 && <ReferenceLine y={0} stroke="#E06C60" strokeOpacity={0.6} />}
          <Area
            type="monotone"
            dataKey="total"
            name="Balance"
            stroke="#D4A72C"
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: '#D4A72C', stroke: '#0B0C0F', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Month comparison
 * ------------------------------------------------------------------ */

export function MonthBars({
  data,
  height = 180,
}: {
  data: { label: string; income: number; spend: number }[]
  height?: number
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -10 }} barGap={3}>
          <CartesianGrid strokeDasharray="2 5" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickFormatter={(v: number) => moneyCompact(v)} width={54} tickLine={false} axisLine={false} />
          <Tooltip content={<Tip />} cursor={{ fill: '#1C1F26' }} />
          <Bar dataKey="income" name="In" fill="#6FBF8B" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="spend" name="Out" fill="#E06C60" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Category split
 * ------------------------------------------------------------------ */

export function CategoryDonut({
  data,
  height = 190,
  centre,
}: {
  data: { name: string; value: number; colour: string }[]
  height?: number
  centre?: ReactNode
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="64%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="#0B0C0F"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.colour} />
            ))}
          </Pie>
          <Tooltip content={<Tip />} />
        </PieChart>
      </ResponsiveContainer>
      {centre && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centre}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Daily spend, as a compact bar strip
 * ------------------------------------------------------------------ */

export function DailyStrip({
  data,
  height = 56,
}: {
  data: { date: string; amount: number }[]
  height?: number
}) {
  const max = useMemo(() => Math.max(...data.map((d) => d.amount), 1), [data])

  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {data.map((d) => {
        const h = d.amount > 0 ? Math.max(3, (d.amount / max) * height) : 2
        return (
          <div
            key={d.date}
            className="flex-1 rounded-[2px]"
            style={{
              height: h,
              background: d.amount > 0 ? 'var(--color-accent)' : 'var(--color-surface-3)',
              opacity: d.amount > 0 ? 0.35 + (d.amount / max) * 0.65 : 1,
            }}
            title={`${shortDate(d.date)} · ${money(d.amount)}`}
          />
        )
      })}
    </div>
  )
}

export function Sparkline({
  values,
  width = 90,
  height = 28,
  colour = '#D4A72C',
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
        const y = height - ((v - min) / span) * (height - 4) - 2
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [values, width, height])

  if (!path) return null
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke={colour} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
