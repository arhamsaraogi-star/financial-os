'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money, moneyCompact } from '@/lib/format'
import { nextDayOfMonth, relativeDays, shortDate } from '@/lib/dates'
import type { Account, AccountKind } from '@/lib/types'
import { creditSummary } from '@/lib/engine/analytics'
import { Badge, Button, Card, Empty, Field, Meter, PageHeader, Row, Sheet } from '@/components/ui'

const KIND_LABEL: Record<AccountKind, string> = {
  spending: 'Spending',
  bills: 'Bills',
  savings: 'Savings',
  credit: 'Credit card',
}

const KIND_HELP: Record<AccountKind, string> = {
  spending: 'Where income lands and everyday spending comes from.',
  bills: 'Rent, EMIs and card payments are paid from here.',
  savings: 'Your reserve — emergency fund and goals.',
  credit: 'A card. The balance shows what you owe.',
}

const PALETTE = ['#D4A72C', '#7A9E9F', '#8B6F9E', '#6FBF8B', '#E0A458', '#C77B7B', '#6FA8C7']

export default function Accounts() {
  const { state, update, forecast } = useStore()
  const [editing, setEditing] = useState<Account | null>(null)
  const [creating, setCreating] = useState(false)

  const credit = useMemo(() => creditSummary(state), [state])
  const banks = state.accounts.filter((a) => a.kind !== 'credit' && !a.archived)
  const cards = state.accounts.filter((a) => a.kind === 'credit' && !a.archived)
  const totalCash = banks.reduce((s, a) => s + a.balance, 0)

  const patch = (id: string, fields: Partial<Account>) =>
    update((s) => ({ ...s, accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...fields } : a)) }))

  const create = (kind: AccountKind) => {
    const id = `acc_${Date.now().toString(36)}`
    const fresh: Account = {
      id,
      name: kind === 'credit' ? 'New card' : 'New account',
      institution: '',
      kind,
      balance: 0,
      targetBalance: 0,
      minBuffer: 0,
      accent: PALETTE[state.accounts.length % PALETTE.length],
      archived: false,
      notes: '',
      ...(kind === 'credit' ? { creditLimit: 100000, statementDay: 20, dueDay: 8, apr: 42 } : {}),
    }
    update((s) => ({ ...s, accounts: [...s.accounts, fresh] }))
    setCreating(false)
    setEditing(fresh)
  }

  return (
    <div className="rise space-y-4 pb-4">
      <PageHeader
        title="Accounts"
        lede="Each account has a job. That is what makes the forecast and the automatic transfers work."
        action={
          <Button size="sm" variant="accent" onClick={() => setCreating(true)}>
            Add
          </Button>
        }
      />

      {/* ---- Cash ------------------------------------------------------------ */}
      <Card>
        <div className="label mb-1.5">In the bank</div>
        <div className="tnum display text-[34px] leading-none">{money(totalCash)}</div>
        {credit.owed > 0 && (
          <p className="mt-2 text-[13.5px] text-faint">
            minus <span className="text-bad">{money(credit.owed)}</span> owed on cards ={' '}
            <span className="text-text">{money(totalCash - credit.owed)}</span> net
          </p>
        )}
      </Card>

      {banks.length === 0 ? (
        <Card>
          <Empty
            icon="🏦"
            title="No accounts yet"
            detail="Add your bank accounts so the app can track balances and forecast."
            action={<Button variant="accent" onClick={() => setCreating(true)}>Add an account</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {banks.map((a) => {
            const low = Math.min(...forecast.days.map((d) => d.byAccount[a.id] ?? a.balance))
            return (
              <Card key={a.id} padded={false}>
                <button onClick={() => setEditing(a)} className="w-full px-4 py-4 text-left active:opacity-70">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.accent }} />
                        <span className="truncate text-[16px]">{a.name}</span>
                        <Badge tone="neutral">{KIND_LABEL[a.kind]}</Badge>
                      </div>
                      <p className="mt-1.5 text-[12.5px] text-faint">{a.institution || KIND_HELP[a.kind]}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum display text-[22px] leading-none">{money(a.balance)}</div>
                      {low < a.minBuffer && (
                        <div className="mt-1.5 text-[11.5px] text-bad">dips to {moneyCompact(low)}</div>
                      )}
                    </div>
                  </div>

                  {a.targetBalance > 0 && (
                    <div className="mt-3.5">
                      <Meter
                        value={a.balance}
                        max={Math.max(a.targetBalance, a.balance, 1)}
                        height={5}
                        tone={a.balance < a.minBuffer ? 'bad' : 'accent'}
                      />
                      <div className="mt-1.5 flex justify-between text-[11.5px] text-ghost">
                        <span>cushion {moneyCompact(a.minBuffer)}</span>
                        <span>target {moneyCompact(a.targetBalance)}</span>
                      </div>
                    </div>
                  )}
                </button>
              </Card>
            )
          })}
        </div>
      )}

      {/* ---- Cards ------------------------------------------------------------ */}
      {cards.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-1 pt-2">
            <h2 className="label">Credit cards</h2>
            <span className="tnum text-[12.5px] text-faint">
              {credit.utilisation.toFixed(0)}% of {moneyCompact(credit.limit)} used
            </span>
          </div>

          <Card>
            <Meter
              value={credit.utilisation}
              max={100}
              height={8}
              tone={credit.utilisation <= 30 ? 'good' : credit.utilisation <= 50 ? 'warn' : 'bad'}
            />
            <div className="mt-2 flex justify-between text-[11.5px] text-ghost">
              <span>0%</span>
              <span className={credit.utilisation > 30 ? 'text-warn' : 'text-good'}>30% — keep under this</span>
              <span>100%</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-faint">
              {credit.utilisation <= 30
                ? `You are using ${credit.utilisation.toFixed(0)}% of your limit, which is the healthy range. What matters is the balance on the statement date, not the due date.`
                : `Paying ${money(
                    credit.owed - credit.limit * 0.3,
                  )} before your statement date gets you back under 30%, which is where credit scores stop penalising you.`}
            </p>
          </Card>

          <div className="space-y-2">
            {cards.map((c) => {
              const owed = Math.abs(Math.min(0, c.balance))
              const util = c.creditLimit ? (owed / c.creditLimit) * 100 : 0
              const due = c.dueDay ? nextDayOfMonth(c.dueDay) : null
              return (
                <Card key={c.id} padded={false}>
                  <button onClick={() => setEditing(c)} className="w-full px-4 py-4 text-left active:opacity-70">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.accent }} />
                          <span className="truncate text-[16px]">{c.name}</span>
                        </div>
                        <p className="mt-1.5 text-[12.5px] text-faint">
                          {due ? `Due ${shortDate(due)} · ${relativeDays(due)}` : 'No due date set'}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tnum display text-[22px] leading-none text-bad">{money(owed)}</div>
                        <div className="mt-1.5 text-[11.5px] text-ghost">
                          of {moneyCompact(c.creditLimit ?? 0)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3.5">
                      <Meter
                        value={util}
                        max={100}
                        height={5}
                        tone={util <= 30 ? 'good' : util <= 50 ? 'warn' : 'bad'}
                      />
                    </div>
                  </button>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* ---- Create ------------------------------------------------------------ */}
      <Sheet open={creating} onClose={() => setCreating(false)} title="What kind of account?">
        <div className="space-y-2 pb-2">
          {(['spending', 'bills', 'savings', 'credit'] as AccountKind[]).map((k) => (
            <button
              key={k}
              onClick={() => create(k)}
              className="w-full rounded-[var(--radius-control)] border border-line bg-surface-2 p-4 text-left active:bg-surface-3"
            >
              <div className="text-[15.5px] text-text">{KIND_LABEL[k]}</div>
              <div className="mt-1 text-[13px] text-faint">{KIND_HELP[k]}</div>
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---- Edit --------------------------------------------------------------- */}
      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name ?? ''}
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                if (editing && window.confirm(`Remove ${editing.name}? Its transactions stay in your history.`)) {
                  update((s) => ({ ...s, accounts: s.accounts.filter((a) => a.id !== editing.id) }))
                  setEditing(null)
                }
              }}
            >
              Remove
            </Button>
            <Button variant="accent" size="lg" full onClick={() => setEditing(null)}>
              Done
            </Button>
          </div>
        }
      >
        {editing && (
          <AccountForm
            account={state.accounts.find((a) => a.id === editing.id) ?? editing}
            accounts={state.accounts}
            patch={patch}
          />
        )}
      </Sheet>
    </div>
  )
}

function AccountForm({
  account,
  accounts,
  patch,
}: {
  account: Account
  accounts: Account[]
  patch: (id: string, fields: Partial<Account>) => void
}) {
  const isCard = account.kind === 'credit'
  const owed = Math.abs(Math.min(0, account.balance))

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={account.name} onChange={(e) => patch(account.id, { name: e.target.value })} />
      </Field>

      <Field label="Bank">
        <input
          value={account.institution}
          onChange={(e) => patch(account.id, { institution: e.target.value })}
          placeholder="ICICI Bank"
        />
      </Field>

      <Field label="Type" hint={KIND_HELP[account.kind]}>
        <select
          value={account.kind}
          onChange={(e) => patch(account.id, { kind: e.target.value as AccountKind })}
        >
          {(Object.keys(KIND_LABEL) as AccountKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>

      {isCard ? (
        <>
          <Field label="Amount owed" hint="What you currently owe on this card.">
            <input
              type="number"
              inputMode="decimal"
              value={owed || ''}
              placeholder="0"
              onChange={(e) => patch(account.id, { balance: -Math.abs(Number(e.target.value) || 0) })}
            />
          </Field>
          <Field label="Credit limit">
            <input
              type="number"
              inputMode="decimal"
              value={account.creditLimit ?? ''}
              onChange={(e) => patch(account.id, { creditLimit: Number(e.target.value) || 0 })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement day">
              <input
                type="number"
                inputMode="numeric"
                value={account.statementDay ?? ''}
                onChange={(e) =>
                  patch(account.id, { statementDay: clampDay(e.target.value) })
                }
              />
            </Field>
            <Field label="Due day">
              <input
                type="number"
                inputMode="numeric"
                value={account.dueDay ?? ''}
                onChange={(e) => patch(account.id, { dueDay: clampDay(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Interest rate %" hint="Used to show what carrying a balance costs you.">
            <input
              type="number"
              inputMode="decimal"
              value={account.apr ?? ''}
              onChange={(e) => patch(account.id, { apr: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Paid from">
            <select
              value={account.paymentAccountId ?? ''}
              onChange={(e) => patch(account.id, { paymentAccountId: e.target.value || undefined })}
            >
              <option value="">Bills account (automatic)</option>
              {accounts
                .filter((a) => a.kind !== 'credit' && !a.archived)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </Field>
        </>
      ) : (
        <>
          <Field label="Current balance">
            <input
              type="number"
              inputMode="decimal"
              value={account.balance || ''}
              placeholder="0"
              onChange={(e) => patch(account.id, { balance: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Target balance" hint="What this account should hold. Used for automatic top-ups.">
            <input
              type="number"
              inputMode="decimal"
              value={account.targetBalance || ''}
              placeholder="0"
              onChange={(e) => patch(account.id, { targetBalance: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Cushion" hint="Dropping below this gets flagged as a warning in the forecast.">
            <input
              type="number"
              inputMode="decimal"
              value={account.minBuffer || ''}
              placeholder="0"
              onChange={(e) => patch(account.id, { minBuffer: Number(e.target.value) || 0 })}
            />
          </Field>
        </>
      )}

      <Field label="Colour">
        <div className="flex flex-wrap gap-2 pt-1">
          {PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => patch(account.id, { accent: c })}
              aria-label={`Colour ${c}`}
              className={`h-9 w-9 rounded-full border-2 transition-transform ${
                account.accent === c ? 'scale-110 border-text' : 'border-transparent'
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      </Field>

      <Field label="Note">
        <input
          value={account.notes}
          onChange={(e) => patch(account.id, { notes: e.target.value })}
          placeholder="What this account is for"
        />
      </Field>
    </div>
  )
}

function clampDay(v: string) {
  return Math.max(1, Math.min(31, Number(v) || 1))
}
