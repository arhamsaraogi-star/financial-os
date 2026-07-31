'use client'

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import { today } from '@/lib/dates'
import { exportState, importState, readSyncMeta, transactionsToCsv } from '@/lib/storage'
import { emptyState } from '@/lib/seed'
import type { Category, Settings } from '@/lib/types'
import { Button, Card, Field, PageHeader, Row, Sheet } from '@/components/ui'

const SWATCHES = ['#7FB08A', '#E0A458', '#6FA8C7', '#C77B7B', '#D4A72C', '#B58BC4', '#7FC4C0', '#8F9BD1', '#A98A6B', '#D98BA8', '#9C988E']
const EMOJI = ['🛒', '🍜', '🚗', '🏠', '💡', '🛍️', '🩺', '🔁', '🏦', '🎬', '✈️', '🎓', '🐾', '🎁', '☕', '⛽', '📱', '•']

export default function SettingsPage() {
  const { state, update, replace, reset, metrics } = useStore()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = (fields: Partial<Settings>) =>
    update((s) => ({ ...s, settings: { ...s.settings, ...fields } }))

  const patchCat = (id: string, fields: Partial<Category>) =>
    update((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, ...fields } : c)) }))

  const download = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const addCategory = () => {
    const fresh: Category = {
      id: `cat_${Date.now().toString(36)}`,
      name: 'New category',
      icon: '•',
      colour: SWATCHES[state.categories.length % SWATCHES.length],
      budget: 0,
      kind: 'expense',
    }
    update((s) => ({ ...s, categories: [...s.categories, fresh] }))
    setEditingCat(fresh)
  }

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader title="Settings" />

      <Card title="You">
        <Field label="Name" hint="Only used for the greeting on the home screen.">
          <input
            value={state.settings.ownerName}
            placeholder="Your name"
            onChange={(e) => patch({ ownerName: e.target.value })}
          />
        </Field>
      </Card>

      <Card title="Forecast">
        <div className="space-y-5">
          <Field
            label={`How cautious — ${Math.round(state.settings.forecastConservatism * 100)}%`}
            hint="At 0 the forecast uses your usual amounts. Higher assumes income lands at the low end and bills at the high end. 30% is a sensible default."
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
            hint={
              metrics.burnRate > 0
                ? `You spend about ${money(metrics.burnRate)} a month, so that's ${money(
                    Math.round(metrics.burnRate * state.settings.emergencyFundMonths),
                  )}.`
                : undefined
            }
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

        <p className="mt-4 rounded-[var(--radius-control)] border border-line-soft bg-surface p-3 text-[12.5px] leading-relaxed text-ghost">
          Everyday spending is measured from your transactions over the last 90 days — currently about{' '}
          <span className="text-muted">{money(metrics.everyday)}</span> a month. There is no number to
          type; log what you spend and it corrects itself.
        </p>
      </Card>

      <Card title="Categories" padded={false} action={<Button size="sm" onClick={addCategory}>Add</Button>}>
        <div className="divide-y divide-line-soft px-4">
          {state.categories.map((c) => (
            <Row
              key={c.id}
              icon={c.icon}
              title={c.name}
              subtitle={c.kind === 'income' ? 'Money in' : c.budget > 0 ? `${money(c.budget)} a month` : 'No budget'}
              onClick={() => setEditingCat(c)}
              trailing={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-ghost">
                  <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
            />
          ))}
        </div>
      </Card>

      <DriveSync />

      <Card title="Your data">
        <p className="mb-4 text-[13.5px] leading-relaxed text-muted">
          Everything is saved in this browser, on this device. No account, no server, nobody else holding
          your balances. That also means clearing your browser data erases it — so keep a backup.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="accent"
            onClick={() => {
              download(exportState(state), `financial-os-${today()}.json`, 'application/json')
              setMsg({ ok: true, text: 'Backup saved.' })
            }}
          >
            Save backup
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Restore</Button>
          <Button
            onClick={() => download(transactionsToCsv(state), `transactions-${today()}.csv`, 'text/csv')}
          >
            Export CSV
          </Button>
          <Button
            onClick={() => {
              if (window.confirm('Start over with no accounts or transactions? Save a backup first if you want to keep this.')) {
                replace(emptyState())
                setMsg({ ok: true, text: 'Cleared. Add your accounts to begin.' })
              }
            }}
          >
            Start empty
          </Button>
        </div>

        <div className="mt-2">
          <Button
            variant="danger"
            full
            onClick={() => {
              if (window.confirm('Reset everything back to the sample data? Anything you have entered will be lost.')) {
                reset()
                setMsg({ ok: true, text: 'Reset to the sample profile.' })
              }
            }}
          >
            Reset to sample data
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              replace(importState(await f.text()))
              setMsg({ ok: true, text: 'Backup restored.' })
            } catch (err) {
              setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not read that file.' })
            }
          }}
        />

        {msg && <p className={`mt-3 text-[13px] ${msg.ok ? 'text-good' : 'text-bad'}`}>{msg.text}</p>}
      </Card>

      <Card title="How the forecast works">
        <ol className="space-y-3 text-[13.5px] leading-relaxed text-muted">
          <li>
            <span className="text-text">It lists what's scheduled.</span> Every bill, subscription and
            income date across the period. A bill due on the 31st lands on the 28th in February rather than
            slipping into March.
          </li>
          <li>
            <span className="text-text">It leans pessimistic.</span> Income is nudged toward the low end of
            its range and bills toward the high end, by however cautious you set it above.
          </li>
          <li>
            <span className="text-text">It walks day by day.</span> Each account is tracked separately,
            because a healthy total can hide one account about to run dry.
          </li>
          <li>
            <span className="text-text">It moves money the way you would.</span> Your automatic transfer
            rules run inside the forecast, capped so they can never overdraw the account they pull from.
          </li>
        </ol>
      </Card>

      <p className="px-1 text-center text-[12px] text-ghost">
        {state.transactions.length} transactions · {state.accounts.filter((a) => !a.archived).length} accounts
      </p>

      {/* ---- Category editor ---------------------------------------------- */}
      <Sheet
        open={!!editingCat}
        onClose={() => setEditingCat(null)}
        title={editingCat ? `${editingCat.icon} ${editingCat.name}` : ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (!editingCat) return
                const used = state.transactions.some((t) => t.categoryId === editingCat.id)
                if (used) {
                  setMsg({ ok: false, text: 'That category is used by existing transactions.' })
                  setEditingCat(null)
                  return
                }
                update((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== editingCat.id) }))
                setEditingCat(null)
              }}
            >
              Remove
            </Button>
            <Button variant="accent" size="lg" full onClick={() => setEditingCat(null)}>
              Done
            </Button>
          </div>
        }
      >
        {editingCat &&
          (() => {
            const c = state.categories.find((x) => x.id === editingCat.id) ?? editingCat
            return (
              <div className="space-y-4">
                <Field label="Name">
                  <input value={c.name} onChange={(e) => patchCat(c.id, { name: e.target.value })} />
                </Field>

                <div>
                  <span className="label mb-2 block">Icon</span>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJI.map((i) => (
                      <button
                        key={i}
                        onClick={() => patchCat(c.id, { icon: i })}
                        className={`flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border text-[19px] ${
                          c.icon === i ? 'border-accent/50 bg-accent-wash' : 'border-line-soft bg-surface-2'
                        }`}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="label mb-2 block">Colour</span>
                  <div className="flex flex-wrap gap-2">
                    {SWATCHES.map((s) => (
                      <button
                        key={s}
                        onClick={() => patchCat(c.id, { colour: s })}
                        aria-label={`Colour ${s}`}
                        className={`h-9 w-9 rounded-full border-2 ${
                          c.colour === s ? 'scale-110 border-text' : 'border-transparent'
                        }`}
                        style={{ background: s }}
                      />
                    ))}
                  </div>
                </div>

                {c.kind === 'expense' && (
                  <Field label="Monthly budget" hint="Leave empty for no budget.">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={c.budget || ''}
                      placeholder="0"
                      onChange={(e) => patchCat(c.id, { budget: Number(e.target.value) || 0 })}
                    />
                  </Field>
                )}

                <Field label="Type">
                  <select
                    value={c.kind}
                    onChange={(e) => patchCat(c.id, { kind: e.target.value as Category['kind'] })}
                  >
                    <option value="expense">Money out</option>
                    <option value="income">Money in</option>
                  </select>
                </Field>
              </div>
            )
          })()}
      </Sheet>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Google Drive sync
 * ------------------------------------------------------------------ */

function DriveSync() {
  const { sync, connectDrive, disconnectDrive, syncDrive } = useStore()
  const [clientId, setClientId] = useState('')
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    setClientId(readSyncMeta().clientId)
  }, [])

  const relative = sync.lastSyncedAt
    ? (() => {
        const mins = Math.round((Date.now() - new Date(sync.lastSyncedAt).getTime()) / 60000)
        if (mins < 1) return 'just now'
        if (mins < 60) return `${mins} min ago`
        const hrs = Math.round(mins / 60)
        if (hrs < 24) return `${hrs} hr ago`
        return `${Math.round(hrs / 24)} days ago`
      })()
    : null

  return (
    <Card title="Sync across devices">
      {sync.connected ? (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-[17px] text-good">
              ✓
            </span>
            <div className="min-w-0">
              <p className="text-[15px]">Connected to Google Drive</p>
              <p className="mt-0.5 text-[12.5px] text-faint">
                {relative ? `Last synced ${relative}` : 'Not synced yet'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="accent" onClick={() => void syncDrive()} disabled={sync.busy}>
              {sync.busy ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button onClick={() => void disconnectDrive()} disabled={sync.busy}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-4 text-[13.5px] leading-relaxed text-muted">
            Keeps your phone and laptop in step. The file lives in a hidden folder inside{' '}
            <span className="text-text">your own Google Drive</span> — this app can only ever see that
            one folder, never the rest of your files.
          </p>

          <Field label="Google client ID" hint="A one-off setup. Tap below for the steps.">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="…apps.googleusercontent.com"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              variant="accent"
              onClick={() => void connectDrive(clientId)}
              disabled={sync.busy || !clientId.trim()}
            >
              {sync.busy ? 'Connecting…' : 'Connect'}
            </Button>
            <Button onClick={() => setShowSetup(true)}>How do I get one?</Button>
          </div>
        </>
      )}

      {sync.message && <p className="mt-3 text-[13px] text-good">{sync.message}</p>}
      {sync.error && <p className="mt-3 text-[13px] text-bad">{sync.error}</p>}

      <p className="mt-4 rounded-[var(--radius-control)] border border-line-soft bg-surface p-3 text-[12.5px] leading-relaxed text-ghost">
        Syncing pulls first, merges, then writes back. Transactions from both devices are kept,
        deletions are respected, and where the same setting was changed in two places the more recent
        save wins.
      </p>

      <Sheet open={showSetup} onClose={() => setShowSetup(false)} title="Set up Drive sync">
        <ol className="space-y-4 pb-2 text-[14px] leading-relaxed text-muted">
          <li>
            <span className="text-text">1. Make a project.</span> Open{' '}
            <a
              href="https://console.cloud.google.com/projectcreate"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline underline-offset-2"
            >
              console.cloud.google.com
            </a>{' '}
            and create one. Any name will do.
          </li>
          <li>
            <span className="text-text">2. Turn on the Drive API.</span> Search “Google Drive API” in
            the console and press Enable.
          </li>
          <li>
            <span className="text-text">3. Fill in the consent screen.</span> Choose External, put your
            own email in, and add yourself as a test user. Leaving it in testing mode is fine — it just
            means Google shows an “unverified app” warning that only you will ever see.
          </li>
          <li>
            <span className="text-text">4. Create the credential.</span> Credentials → Create → OAuth
            client ID → Web application. Under{' '}
            <span className="text-text">Authorised JavaScript origins</span> add both of these:
            <span className="mt-2 block overflow-x-auto rounded-[8px] border border-line-soft bg-ink p-2.5 text-[12px] text-muted">
              https://arhamsaraogi-star.github.io
              <br />
              http://localhost:3000
            </span>
          </li>
          <li>
            <span className="text-text">5. Copy the client ID</span> — it ends in{' '}
            <span className="text-text">.apps.googleusercontent.com</span> — and paste it here. On your
            other device you only need to repeat this paste.
          </li>
        </ol>
        <p className="mt-4 text-[12.5px] leading-relaxed text-ghost">
          The client ID is not a secret; it identifies the app, not you. The only permission requested
          is <span className="text-muted">drive.appdata</span>, which cannot read anything else in your
          Drive.
        </p>
      </Sheet>
    </Card>
  )
}
