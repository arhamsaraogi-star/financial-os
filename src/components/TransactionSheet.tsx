'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { money } from '@/lib/format'
import { shortDate, today } from '@/lib/dates'
import { frequentDescriptions, guessCategory } from '@/lib/engine/analytics'
import type { Transaction } from '@/lib/types'
import { Button, Field, Sheet } from '@/components/ui'

type Mode = 'spend' | 'income' | 'transfer'

export interface TransactionSheetProps {
  open: boolean
  onClose: () => void
  /** Pass a transaction to edit it; omit to create a new one. */
  editing?: Transaction | null
}

/**
 * One sheet for adding and editing.
 *
 * Ordered by what the user knows first: the amount, then what it was, then the
 * category. Everything else is defaulted so a normal entry is three taps —
 * type the amount, tap a category, save.
 */
export function TransactionSheet({ open, onClose, editing }: TransactionSheetProps) {
  const { state, addTransaction, editTransaction, removeTransaction } = useStore()

  const cash = state.accounts.filter((a) => !a.archived)
  const expenseCats = state.categories.filter((c) => c.kind === 'expense')
  const incomeCats = state.categories.filter((c) => c.kind === 'income')

  const [mode, setMode] = useState<Mode>('spend')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const suggestions = useMemo(() => frequentDescriptions(state, 6), [state])

  // Reset to sensible defaults whenever the sheet opens.
  useEffect(() => {
    if (!open) return
    setError(null)
    if (editing) {
      setMode(editing.transfer ? 'transfer' : editing.amount >= 0 ? 'income' : 'spend')
      setAmount(String(Math.abs(editing.amount)))
      setDescription(editing.description)
      setCategoryId(editing.categoryId)
      setAccountId(editing.accountId)
      setToAccountId(editing.transferAccountId ?? '')
      setDate(editing.date)
      setNote(editing.note ?? '')
    } else {
      setMode('spend')
      setAmount('')
      setDescription('')
      setCategoryId(expenseCats[0]?.id ?? '')
      setAccountId(cash.find((a) => a.kind === 'spending')?.id ?? cash[0]?.id ?? '')
      setToAccountId(cash.find((a) => a.kind === 'savings')?.id ?? '')
      setDate(today())
      setNote('')
    }
    // Only re-run when the sheet opens or the edit target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  // Switching mode swaps to a category of the right kind.
  useEffect(() => {
    if (mode === 'income' && !incomeCats.some((c) => c.id === categoryId)) {
      setCategoryId(incomeCats[0]?.id ?? '')
    }
    if (mode === 'spend' && !expenseCats.some((c) => c.id === categoryId)) {
      setCategoryId(expenseCats[0]?.id ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const cats = mode === 'income' ? incomeCats : expenseCats
  const parsed = Number(amount.replace(/[^0-9.]/g, ''))
  const valid = Number.isFinite(parsed) && parsed > 0

  const applySuggestion = (s: (typeof suggestions)[number]) => {
    setDescription(s.description)
    setCategoryId(s.categoryId)
    setAccountId(s.accountId)
    if (!amount) setAmount(String(s.amount))
  }

  const onDescriptionBlur = () => {
    if (mode === 'transfer' || !description.trim()) return
    const guess = guessCategory(state, description)
    if (guess && cats.some((c) => c.id === guess)) setCategoryId(guess)
  }

  const save = () => {
    if (!valid) {
      setError('Enter an amount.')
      return
    }
    if (!accountId) {
      setError('Pick an account.')
      return
    }
    if (mode === 'transfer' && (!toAccountId || toAccountId === accountId)) {
      setError('Pick two different accounts.')
      return
    }

    const payload = {
      date,
      description: description.trim() || (mode === 'transfer' ? 'Transfer' : 'Untitled'),
      // Stored from the account's point of view: money out is negative.
      amount: mode === 'income' ? parsed : -parsed,
      accountId,
      categoryId: mode === 'transfer' ? (cats[0]?.id ?? '') : categoryId,
      note: note.trim(),
      transfer: mode === 'transfer',
      transferAccountId: mode === 'transfer' ? toAccountId : undefined,
    }

    if (editing) editTransaction(editing.id, payload)
    else addTransaction(payload)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Edit transaction' : 'Add transaction'}
      footer={
        <div className="flex gap-2">
          {editing && (
            <Button
              variant="danger"
              onClick={() => {
                removeTransaction(editing.id)
                onClose()
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="accent" size="lg" full onClick={save} disabled={!valid}>
            {editing ? 'Save changes' : 'Add'}
          </Button>
        </div>
      }
    >
      {/* --- Mode ---------------------------------------------------------- */}
      <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-[var(--radius-control)] bg-surface p-1">
        {(
          [
            ['spend', 'Spent'],
            ['income', 'Received'],
            ['transfer', 'Moved'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`min-h-[40px] rounded-[8px] text-[14px] font-medium transition-colors ${
              mode === m ? 'bg-surface-3 text-text' : 'text-faint'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* --- Amount, front and centre -------------------------------------- */}
      <div className="mb-5 text-center">
        <div className="flex items-center justify-center gap-1">
          <span className="display text-[30px] text-faint">₹</span>
          <input
            autoFocus={!editing}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''))
              setError(null)
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label="Amount"
            className="display !w-auto max-w-[220px] !border-0 !bg-transparent px-0 text-center !text-[42px] leading-none tracking-tight focus:!shadow-none"
          />
        </div>
        <p className="mt-1 text-[12.5px] text-ghost">
          {mode === 'spend' ? 'Money out' : mode === 'income' ? 'Money in' : 'Between your accounts'}
        </p>
      </div>

      <div className="space-y-4">
        {/* --- Description + recent ---------------------------------------- */}
        <Field label={mode === 'transfer' ? 'Note' : 'What was it?'}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={onDescriptionBlur}
            placeholder={mode === 'transfer' ? 'Moving to savings' : 'Groceries, Uber, coffee…'}
          />
        </Field>

        {!editing && mode !== 'transfer' && suggestions.length > 0 && (
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {suggestions.map((s) => (
              <button
                key={s.description}
                onClick={() => applySuggestion(s)}
                className="shrink-0 rounded-full border border-line bg-surface-2 px-3 py-2 text-[13px] text-muted active:bg-surface-3"
              >
                {s.description}
              </button>
            ))}
          </div>
        )}

        {/* --- Category ------------------------------------------------------ */}
        {mode !== 'transfer' && (
          <div>
            <span className="label mb-2 block">Category</span>
            <div className="grid grid-cols-4 gap-1.5">
              {cats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border px-1 py-2 transition-colors ${
                    categoryId === c.id
                      ? 'border-accent/50 bg-accent-wash'
                      : 'border-line-soft bg-surface-2'
                  }`}
                >
                  <span className="text-[19px]">{c.icon}</span>
                  <span
                    className={`w-full truncate px-0.5 text-center text-[11px] ${
                      categoryId === c.id ? 'text-accent' : 'text-faint'
                    }`}
                  >
                    {c.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- Accounts ------------------------------------------------------ */}
        <Field label={mode === 'transfer' ? 'From' : 'Account'}>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {cash.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {money(a.balance)}
              </option>
            ))}
          </select>
        </Field>

        {mode === 'transfer' && (
          <Field label="To">
            <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose an account</option>
              {cash
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {money(a.balance)}
                  </option>
                ))}
            </select>
          </Field>
        )}

        {/* --- Date ---------------------------------------------------------- */}
        <div>
          <span className="label mb-2 block">When</span>
          <div className="mb-2 flex gap-1.5">
            {[
              { label: 'Today', value: today() },
              { label: 'Yesterday', value: shiftDays(today(), -1) },
              { label: '2 days ago', value: shiftDays(today(), -2) },
            ].map((d) => (
              <button
                key={d.label}
                onClick={() => setDate(d.value)}
                className={`rounded-full border px-3 py-2 text-[13px] transition-colors ${
                  date === d.value ? 'border-accent/50 bg-accent-wash text-accent' : 'border-line bg-surface-2 text-faint'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          <p className="mt-1.5 text-[12px] text-ghost">{shortDate(date)}</p>
        </div>

        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering" />
        </Field>

        {error && <p className="text-[13px] text-bad">{error}</p>}
      </div>
    </Sheet>
  )
}

function shiftDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
