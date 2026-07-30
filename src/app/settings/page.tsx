'use client'

import { useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import { exportState, importState } from '@/lib/storage'
import type { Settings } from '@/lib/types'
import { Button, Field, KeyHint, PageHeader, Panel, Stat } from '@/components/ui'

const SHORTCUTS: [string, string][] = [
  ['⌘K / Ctrl K', 'Command palette'],
  ['g then o', 'Overview'],
  ['g then f', 'Cash flow'],
  ['g then a', 'Accounts'],
  ['g then i', 'Income'],
  ['g then b', 'Obligations'],
  ['g then s', 'Subscriptions'],
  ['g then v', 'Investments'],
  ['g then c', 'Credit'],
  ['g then r', 'Reserve & goals'],
  ['g then p', 'Reports'],
  ['g then k', 'Ask the CFO'],
  ['g then u', 'Automation'],
  ['/', 'Focus the CFO question box'],
  ['Esc', 'Close any overlay'],
]

export default function SettingsPage() {
  const { state, update, replace, reset, metrics } = useStore()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (fields: Partial<Settings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...fields } }))

  const download = () => {
    const blob = new Blob([exportState(state)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `financial-os-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ kind: 'ok', text: 'Backup downloaded.' })
  }

  const upload = async (file: File) => {
    try {
      const next = importState(await file.text())
      replace(next)
      setMessage({ kind: 'ok', text: 'Backup restored.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Could not read that file.' })
    }
  }

  return (
    <div className="rise">
      <PageHeader
        eyebrow="System"
        title="Settings"
        lede="The assumptions the engines run on. Changing conservatism or the discretionary run-rate re-computes every projection in the application immediately."
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Profile">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input
                value={state.settings.ownerName}
                onChange={(e) => patch({ ownerName: e.target.value })}
              />
            </Field>
            <Field label="Risk tolerance" hint="Informs advice on how much surplus to commit.">
              <select
                value={state.settings.riskTolerance}
                onChange={(e) => patch({ riskTolerance: e.target.value as Settings['riskTolerance'] })}
              >
                <option value="conservative">Conservative</option>
                <option value="balanced">Balanced</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Forecast assumptions">
          <div className="space-y-4">
            <Field
              label={`Everyday spend — ${money(state.settings.discretionaryMonthly)} a month`}
              hint="Groceries, transport, dining and anything else that is not a scheduled bill. The projection draws this weekly from your operating account."
            >
              <input
                type="range"
                min={0}
                max={60000}
                step={500}
                value={state.settings.discretionaryMonthly}
                onChange={(e) => patch({ discretionaryMonthly: Number(e.target.value) })}
              />
            </Field>

            <Field
              label={`Conservatism — ${Math.round(state.settings.forecastConservatism * 100)}%`}
              hint="At 0 the forecast uses expected values. At 100 it assumes every receipt lands at the bottom of its range and every bill at the top. The default of 35% is deliberately pessimistic."
            >
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(state.settings.forecastConservatism * 100)}
                onChange={(e) => patch({ forecastConservatism: Number(e.target.value) / 100 })}
              />
            </Field>

            <Field
              label={`Emergency fund target — ${state.settings.emergencyFundMonths} months`}
              hint={`At your current burn rate of ${money(metrics.burnRate)} a month, that is ${money(
                Math.round(metrics.burnRate * state.settings.emergencyFundMonths),
              )}.`}
            >
              <input
                type="range"
                min={1}
                max={12}
                value={state.settings.emergencyFundMonths}
                onChange={(e) => patch({ emergencyFundMonths: Number(e.target.value) })}
              />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line-soft bg-line-soft lg:grid-cols-4">
        <div className="bg-panel p-4">
          <Stat label="Confidence-weighted income" value={money(metrics.income)} sub="Per month" />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Committed" value={money(metrics.commitments.total)} sub="Bills, subs and SIPs" />
        </div>
        <div className="bg-panel p-4">
          <Stat label="Burn rate" value={money(metrics.burnRate)} sub="Excluding investment" />
        </div>
        <div className="bg-panel p-4">
          <Stat
            label="Surplus"
            value={money(metrics.surplus)}
            sub="Uncommitted each month"
            tone={metrics.surplus >= 0 ? 'positive' : 'negative'}
          />
        </div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Your data" subtitle="Stored in this browser and nowhere else">
          <p className="mb-4 text-[12px] leading-relaxed text-dim">
            Everything lives in this device&apos;s local storage — no account, no server, no third party holding
            your balances. That also means clearing site data erases it, so keep a backup. The export is plain
            JSON and restores into any browser running this application.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download} variant="brass" size="sm">
              Export backup
            </Button>
            <Button onClick={() => fileRef.current?.click()} size="sm">
              Restore from file
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (
                  window.confirm(
                    'This erases every account, obligation, holding and rule you have entered, and restores the starting profile. Export a backup first if you want to keep it. Continue?',
                  )
                ) {
                  reset()
                  setMessage({ kind: 'ok', text: 'Reset to the starting profile.' })
                }
              }}
            >
              Reset everything
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void upload(f)
              e.target.value = ''
            }}
          />
          {message && (
            <p
              className={`mt-3 text-[11.5px] ${message.kind === 'ok' ? 'text-positive' : 'text-negative'}`}
            >
              {message.text}
            </p>
          )}
        </Panel>

        <Panel title="Keyboard">
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {SHORTCUTS.map(([keys, what]) => (
              <li key={keys} className="flex items-center justify-between gap-3 text-[11.5px]">
                <span className="text-dim">{what}</span>
                <KeyHint>{keys}</KeyHint>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="How the projection works" subtitle="No hidden model — this is the whole method">
        <ol className="space-y-2.5 text-[12px] leading-relaxed text-dim">
          <li className="border-l-2 border-line pl-3">
            <span className="text-parchment">Expand.</span> Every income source, bill, subscription, SIP and
            card statement is expanded into dated events across the horizon. Days-of-month clamp to the end of
            short months, so a bill due on the 31st lands on the 28th in February rather than rolling into
            March.
          </li>
          <li className="border-l-2 border-line pl-3">
            <span className="text-parchment">Skew.</span> Each amount is pulled toward the pessimistic end of
            its range by the conservatism setting — receipts toward their floor, obligations toward their
            ceiling.
          </li>
          <li className="border-l-2 border-line pl-3">
            <span className="text-parchment">Walk.</span> The simulation steps one day at a time, applying
            events to individual account balances. Accounts are tracked separately because an aggregate can
            look healthy while the account that pays rent is empty.
          </li>
          <li className="border-l-2 border-line pl-3">
            <span className="text-parchment">Automate.</span> After each day&apos;s events, enabled rules run in
            order. Transfers are capped at the source account&apos;s balance above its own floor, so automation
            can never manufacture an overdraft.
          </li>
          <li className="border-l-2 border-line pl-3">
            <span className="text-parchment">Score.</span> Risk is penalised for overdrafts first, floor
            breaches second, how close the trough came to zero third, and the direction of net flow last.
            Sustained pressure scores worse than a single bad day.
          </li>
        </ol>
      </Panel>
    </div>
  )
}
