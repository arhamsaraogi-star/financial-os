import type { FinancialState } from '@/lib/types'
import { ISODate, addMonths, longDate, relativeDays, shortDate, today } from '@/lib/dates'
import { money } from '@/lib/format'
import { Forecast, simulate } from './forecast'
import {
  analytics,
  budgetSummary,
  creditSummary,
  currentMonth,
  isSpend,
  monthLabel,
  previousMonth,
  spendByCategory,
  subscriptionInsights,
  unusualTransactions,
} from './analytics'

/* ------------------------------------------------------------------ *
 * Proactive advice — what the app tells you before you ask
 * ------------------------------------------------------------------ */

export type AdviceTone = 'urgent' | 'warning' | 'idea' | 'good'

export interface Advisory {
  id: string
  tone: AdviceTone
  title: string
  detail: string
  metric?: string
  action?: string
  href?: string
}

export function advisories(state: FinancialState, forecast: Forecast): Advisory[] {
  const out: Advisory[] = []
  const a = analytics(state)
  const credit = creditSummary(state)
  const subs = subscriptionInsights(state)
  const budget = budgetSummary(state)

  // --- Shortfalls first. Nothing matters if an account runs dry. -----------
  const overdrafts = forecast.flags.filter((f) => f.severity === 'overdraft')
  if (overdrafts.length) {
    const first = overdrafts[0]
    out.push({
      id: 'overdraft',
      tone: 'urgent',
      title: `${first.accountName} runs out ${relativeDays(first.date)}`,
      detail: `It is short by ${money(first.shortfall)} on ${longDate(first.date)}${
        first.cause ? `, because of ${first.cause}` : ''
      }. Move money in before then.`,
      metric: money(-first.shortfall),
      action: `Move ${money(Math.ceil(first.shortfall / 500) * 500)} from savings`,
      href: '/accounts',
    })
  } else {
    const breach = forecast.flags[0]
    if (breach) {
      out.push({
        id: 'buffer',
        tone: 'warning',
        title: `${breach.accountName} gets low ${relativeDays(breach.date)}`,
        detail: `Projected at ${money(breach.balance)} on ${shortDate(breach.date)}, which is ${money(
          breach.shortfall,
        )} under the cushion you set. Not dangerous, but there is no room for a surprise.`,
        metric: money(breach.balance),
        action: `Top up ${money(Math.ceil(breach.shortfall / 500) * 500)}`,
        href: '/accounts',
      })
    }
  }

  // --- Budget pace ---------------------------------------------------------
  if (budget.budgeted > 0 && budget.daysLeft > 0 && budget.paceRatio > 1.05) {
    out.push({
      id: 'pace',
      tone: 'warning',
      title: `Spending faster than budget`,
      detail: `At this pace you will finish the month around ${money(
        budget.projectedSpend,
      )} against a budget of ${money(budget.budgeted)}. There are ${budget.daysLeft} days left, so ${money(
        Math.max(0, budget.remaining) / Math.max(1, budget.daysLeft),
      )} a day keeps you inside it.`,
      metric: `${Math.round(budget.paceRatio * 100)}% of budget`,
      href: '/spending',
    })
  }

  if (budget.over.length) {
    const worst = budget.over[0]
    out.push({
      id: 'over-budget',
      tone: 'warning',
      title: `${worst.category.name} is over budget`,
      detail: `${money(worst.spent)} spent against ${money(worst.budget)} — ${money(
        worst.spent - worst.budget,
      )} over, across ${worst.count} transactions.`,
      metric: money(worst.spent - worst.budget),
      href: '/spending',
    })
  }

  // --- Cards ---------------------------------------------------------------
  if (credit.utilisation > 30) {
    const toThirty = credit.owed - credit.limit * 0.3
    out.push({
      id: 'credit-util',
      tone: credit.utilisation > 50 ? 'urgent' : 'warning',
      title: `Card usage at ${credit.utilisation.toFixed(0)}%`,
      detail: `Above 30% starts to hurt your credit score. Paying ${money(
        toThirty,
      )} before the statement date brings you back into the healthy range.`,
      metric: `${credit.utilisation.toFixed(0)}%`,
      action: `Pay ${money(Math.ceil(toThirty / 500) * 500)}`,
      href: '/accounts',
    })
  }

  if (credit.monthlyInterestIfCarried > 500) {
    out.push({
      id: 'card-interest',
      tone: 'warning',
      title: `Carrying card debt costs ${money(Math.round(credit.monthlyInterestIfCarried))} a month`,
      detail: `You owe ${money(credit.owed)}. At these rates, clearing it is the single best use of spare cash you have.`,
      metric: money(Math.round(credit.monthlyInterestIfCarried)),
      href: '/accounts',
    })
  }

  // --- Unusual spending ----------------------------------------------------
  const odd = unusualTransactions(state)
  if (odd.length) {
    out.push({
      id: 'unusual',
      tone: 'idea',
      title: `${odd.length} unusually large purchase${odd.length === 1 ? '' : 's'} recently`,
      detail: `${odd
        .slice(0, 2)
        .map((t) => `${t.description} ${money(Math.abs(t.amount))} on ${shortDate(t.date)}`)
        .join(', ')}. Worth a glance in case something is wrong.`,
      href: '/transactions',
    })
  }

  // --- Subscriptions -------------------------------------------------------
  if (subs.lowValue.length) {
    out.push({
      id: 'subs',
      tone: 'idea',
      title: `${subs.lowValue.length} subscription${subs.lowValue.length === 1 ? '' : 's'} you barely use`,
      detail: `${subs.lowValue
        .slice(0, 3)
        .map((r) => r.recurring.name)
        .join(', ')} cost ${money(subs.recoverable)} a month together. Cancelling frees ${money(
        subs.recoverable * 12,
      )} a year.`,
      metric: `${money(subs.recoverable)}/mo`,
      action: 'Review them',
      href: '/recurring',
    })
  }

  // --- Emergency fund ------------------------------------------------------
  const ef = state.goals.find((g) => g.emergencyFund)
  if (ef && a.burnRate > 0) {
    if (a.emergencyMonthsCovered >= state.settings.emergencyFundMonths) {
      out.push({
        id: 'ef-done',
        tone: 'good',
        title: 'Emergency fund is complete',
        detail: `${money(ef.saved)} covers ${a.emergencyMonthsCovered.toFixed(
          1,
        )} months of your spending. The ${money(
          ef.monthlyContribution,
        )} you still put in each month could go somewhere more useful now.`,
        metric: `${a.emergencyMonthsCovered.toFixed(1)} months`,
        href: '/goals',
      })
    } else if (a.emergencyMonthsCovered < 3) {
      out.push({
        id: 'ef-thin',
        tone: 'warning',
        title: `Only ${a.emergencyMonthsCovered.toFixed(1)} months of cover saved`,
        detail: `Three months is the usual floor. You spend about ${money(
          a.burnRate,
        )} a month, so that is ${money(a.burnRate * 3)}.`,
        metric: `${ef.target > 0 ? Math.round((ef.saved / ef.target) * 100) : 0}% there`,
        href: '/goals',
      })
    }
  }

  // --- Saving --------------------------------------------------------------
  if (a.income > 0 && a.savingsRate < 15) {
    out.push({
      id: 'savings-rate',
      tone: 'warning',
      title: `You are keeping ${a.savingsRate.toFixed(0)}% of what you earn`,
      detail: `Fixed bills take ${a.fixedExpenseRatio.toFixed(0)}% and everyday spending runs about ${money(
        a.everyday,
      )} a month. Getting above 20% is the highest-value change available to you.`,
      metric: `${a.savingsRate.toFixed(0)}%`,
      href: '/spending',
    })
  } else if (a.surplus > 5000 && forecast.riskScore > 75) {
    out.push({
      id: 'surplus',
      tone: 'idea',
      title: `${money(a.surplus)} a month is spare`,
      detail: `After every bill and your usual spending, this much is left over with no job. Giving it one — a goal, or clearing card debt — beats letting it drift.`,
      metric: money(a.surplus),
      href: '/goals',
    })
  }

  if (!out.length) {
    out.push({
      id: 'all-clear',
      tone: 'good',
      title: 'Everything is covered',
      detail: `Your lowest point over the next ${
        forecast.days.length - 1
      } days is ${money(forecast.trough.total)} on ${longDate(
        forecast.trough.date,
      )}, with every account staying above its cushion.`,
      metric: `${forecast.riskScore}/100`,
    })
  }

  const rank: Record<AdviceTone, number> = { urgent: 0, warning: 1, idea: 2, good: 3 }
  return out.sort((x, y) => rank[x.tone] - rank[y.tone])
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

export interface AnswerLine {
  label: string
  value: string
  detail?: string
}

export interface Answer {
  question: string
  verdict: 'yes' | 'no' | 'careful' | 'info'
  headline: string
  lines: AnswerLine[]
  reasoning: string
  recommendation?: string
}

/** Pull a rupee figure out of free text: "80k", "1.2 lakh", "₹45,000", "60000". */
export function extractAmount(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, '')
  const lakh = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l\b)/)
  if (lakh) return parseFloat(lakh[1]) * 1_00_000
  const cr = t.match(/(\d+(?:\.\d+)?)\s*(crore|cr\b)/)
  if (cr) return parseFloat(cr[1]) * 1_00_00_000
  const k = t.match(/(\d+(?:\.\d+)?)\s*k\b/)
  if (k) return parseFloat(k[1]) * 1_000
  const plain = t.match(/(?:₹|rs\.?\s*)?(\d{3,9})(?:\.\d+)?/)
  if (plain) return parseFloat(plain[1])
  return null
}

function extractDays(text: string): number | null {
  const m = text.toLowerCase().match(/(\d+)\s*day/)
  if (m) return parseInt(m[1], 10)
  const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 }
  for (const [w, n] of Object.entries(words)) {
    if (new RegExp(`${w}\\s*days?`).test(text.toLowerCase())) return n
  }
  return null
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w))

/**
 * Route a plain-English question to whichever engine can answer it, then answer
 * with the user's own numbers. Deterministic — every response cites the figures
 * it used, so nothing is ever unexplained.
 */
export function ask(state: FinancialState, question: string): Answer {
  const q = question.toLowerCase().trim()
  const a = analytics(state)
  const base = simulate(state, { horizonDays: 90 })

  // --- How much did I spend on X? -----------------------------------------
  if (has(q, 'spend', 'spent', 'spending')) {
    const rows = spendByCategory(state)
    const named = rows.find((r) => q.includes(r.category.name.toLowerCase()))

    if (named) {
      return {
        question,
        verdict: 'info',
        headline: `${money(named.spent)} on ${named.category.name} this month`,
        lines: [
          { label: 'This month', value: money(named.spent), detail: `${named.count} transactions` },
          { label: 'Last month', value: money(named.prior) },
          { label: 'Budget', value: named.budget > 0 ? money(named.budget) : 'None set' },
          {
            label: 'Change',
            value: named.prior > 0 ? `${named.change >= 0 ? '+' : ''}${named.change.toFixed(0)}%` : '—',
          },
        ],
        reasoning: `You have spent ${money(named.spent)} on ${named.category.name} across ${
          named.count
        } transactions in ${monthLabel(currentMonth(), true)}${
          named.prior > 0
            ? `, against ${money(named.prior)} in ${monthLabel(previousMonth(currentMonth()), true)}`
            : ''
        }.${
          named.budget > 0
            ? named.spent > named.budget
              ? ` That is ${money(named.spent - named.budget)} over your ${money(named.budget)} budget.`
              : ` You have ${money(named.budget - named.spent)} left of your ${money(named.budget)} budget.`
            : ''
        }`,
      }
    }

    const budget = budgetSummary(state)
    const top = rows.slice(0, 3)
    return {
      question,
      verdict: 'info',
      headline: `${money(a.monthSpend)} spent this month`,
      lines: [
        { label: 'This month', value: money(a.monthSpend) },
        { label: 'Budget', value: budget.budgeted > 0 ? money(budget.budgeted) : 'None set' },
        { label: 'On track for', value: money(budget.projectedTotal), detail: 'at this pace' },
        { label: 'Days left', value: `${budget.daysLeft}` },
      ],
      reasoning: `Biggest categories: ${top
        .map((r) => `${r.category.name} ${money(r.spent)}`)
        .join(', ')}.${
        budget.budgeted > 0
          ? ` Of that, ${money(budget.spent)} sits in categories you have budgeted, against ${money(
              budget.budgeted,
            )} — ${
              budget.projectedSpend > budget.budgeted
                ? `heading for about ${money(budget.projectedSpend)} by month end.`
                : `on track to come in under.`
            }`
          : ' You have not set any budgets yet, so there is nothing to compare against.'
      }`,
    }
  }

  // --- Income delay --------------------------------------------------------
  if (has(q, 'delay', 'late', 'delayed') && has(q, 'salary', 'income', 'paid', 'pay')) {
    const days = extractDays(q) ?? 4
    const source =
      state.recurring.find((r) => r.kind === 'income' && q.includes(r.name.toLowerCase())) ??
      state.recurring.find((r) => r.kind === 'income')
    if (!source) return info(question, 'No income sources are set up yet.')

    const delayed = simulate(state, { horizonDays: 90, delayIncome: { recurringId: source.id, days } })
    const newFlags = delayed.flags.filter(
      (f) => !base.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
    )
    const survives = !delayed.flags.some((f) => f.severity === 'overdraft')

    return {
      question,
      verdict: survives ? (newFlags.length ? 'careful' : 'yes') : 'no',
      headline: survives
        ? newFlags.length
          ? `You would cope, but with no margin`
          : `A ${days}-day delay changes nothing`
        : `A ${days}-day delay would break the month`,
      lines: [
        { label: 'Scenario', value: `${source.name} arrives ${days} days late` },
        {
          label: 'Lowest point',
          value: `${money(base.trough.total)} → ${money(delayed.trough.total)}`,
          detail: shortDate(delayed.trough.date),
        },
        { label: 'Score', value: `${base.riskScore} → ${delayed.riskScore}`, detail: delayed.riskLevel },
        { label: 'New problems', value: newFlags.length ? `${newFlags.length}` : 'None' },
      ],
      reasoning: survives
        ? `Moving ${source.name} back ${days} days pushes your lowest point to ${money(
            delayed.trough.total,
          )} on ${longDate(delayed.trough.date)}. ${
            newFlags.length
              ? `${newFlags[0].accountName} dips under its cushion in the gap — survivable, but one surprise away from trouble.`
              : 'Every bill still gets paid on time and no account gets low.'
          }`
        : `The delay leaves ${
            delayed.flags.find((f) => f.severity === 'overdraft')?.accountName ?? 'an account'
          } short by ${money(
            delayed.flags.find((f) => f.severity === 'overdraft')?.shortfall ?? 0,
          )}. Bills dated before the new arrival date cannot be paid.`,
      recommendation: survives
        ? undefined
        : `Keep about ${money(
            Math.ceil((delayed.flags[0]?.shortfall ?? 5000) / 1000) * 1000,
          )} extra in your bills account, or move those due dates later in the month.`,
    }
  }

  // --- Affordability -------------------------------------------------------
  if (has(q, 'afford', 'can i buy', 'should i buy', 'buy a', 'purchase', 'holiday', 'trip')) {
    const amount = extractAmount(q)
    if (amount == null) {
      return info(question, 'Tell me the amount and I will check it — for example, “can I afford a 90k laptop”.')
    }
    return affordability(state, question, amount, base)
  }

  // --- Running out ---------------------------------------------------------
  if (has(q, 'run out', 'running out', 'short', 'broke', 'enough money', 'ok this month')) {
    const worst = base.flags[0]
    return {
      question,
      verdict: base.flags.some((f) => f.severity === 'overdraft') ? 'no' : worst ? 'careful' : 'yes',
      headline: worst
        ? `${worst.accountName} is the pinch point, ${relativeDays(worst.date)}`
        : 'No shortfalls in the next 90 days',
      lines: [
        { label: 'Lowest point', value: money(base.trough.total), detail: longDate(base.trough.date) },
        { label: 'Score', value: `${base.riskScore}/100`, detail: base.riskLevel },
        { label: 'Cover', value: `${a.cashRunwayMonths.toFixed(1)} months`, detail: 'if income stopped' },
        { label: '90-day net', value: money(base.netFlow) },
      ],
      reasoning: worst
        ? `Your cash bottoms out at ${money(base.trough.total)} on ${longDate(
            base.trough.date,
          )}. The tight spot is ${worst.accountName}, ${money(worst.shortfall)} under its cushion on ${shortDate(
            worst.date,
          )}${worst.cause ? ` when ${worst.cause} goes out` : ''}.`
        : `Everything is covered. Your cash never drops below ${money(
            base.trough.total,
          )} and no account gets low. Net movement over the period is ${money(base.netFlow)}.`,
      recommendation: worst
        ? `Move ${money(Math.ceil(worst.shortfall / 1000) * 1000)} into ${worst.accountName} before ${shortDate(
            worst.date,
          )}.`
        : undefined,
    }
  }

  // --- Save money ----------------------------------------------------------
  if (has(q, 'save money', 'cut', 'reduce', 'save more', 'where can i')) {
    const subs = subscriptionInsights(state)
    const rows = spendByCategory(state)
    const overs = rows.filter((r) => r.budget > 0 && r.spent > r.budget)
    return {
      question,
      verdict: 'info',
      headline:
        subs.recoverable > 0
          ? `${money(subs.recoverable)} a month is easy to recover`
          : 'Nothing obvious to cut',
      lines: [
        { label: 'Unused subs', value: money(subs.recoverable), detail: `${subs.lowValue.length} services` },
        { label: 'Over budget', value: `${overs.length} categories` },
        { label: 'Everyday', value: `${money(a.everyday)}/mo` },
        { label: 'Spare now', value: money(a.surplus) },
      ],
      reasoning: `${
        subs.lowValue.length
          ? `${subs.lowValue.map((r) => r.recurring.name).join(', ')} score under 4/10 on usage and cost ${money(
              subs.recoverable,
            )} a month — ${money(subs.recoverable * 12)} a year.`
          : 'Your subscriptions all get used.'
      }${
        overs.length
          ? ` ${overs[0].category.name} is ${money(overs[0].spent - overs[0].budget)} over budget this month.`
          : ''
      } Everyday spending runs ${money(a.everyday)} a month, measured from your own transactions.`,
    }
  }

  // --- Cards ---------------------------------------------------------------
  if (has(q, 'credit', 'card', 'utilisation', 'utilization', 'score', 'owe')) {
    const c = creditSummary(state)
    return {
      question,
      verdict: c.utilisation <= 30 ? 'yes' : 'careful',
      headline: `${c.utilisation.toFixed(0)}% of your limit used — ${c.band.label.toLowerCase()}`,
      lines: [
        { label: 'Owed', value: money(c.owed) },
        { label: 'Limit', value: money(c.limit) },
        { label: 'Available', value: money(c.available) },
        { label: 'Monthly interest', value: money(Math.round(c.monthlyInterestIfCarried)) },
      ],
      reasoning: `You owe ${money(c.owed)} against ${money(
        c.limit,
      )} of limit. Staying under 30% matters for your score, and it is measured on the statement date rather than the due date. ${
        c.utilisation > 30
          ? `Paying ${money(c.owed - c.limit * 0.3)} before the statement cuts gets you back under.`
          : 'Keep clearing the balance in full each month.'
      }`,
    }
  }

  // --- Emergency fund ------------------------------------------------------
  if (has(q, 'emergency', 'safety net', 'rainy day')) {
    const ef = state.goals.find((g) => g.emergencyFund)
    if (!ef) return info(question, 'No emergency fund is set up yet. You can add one under Goals.')
    const gap = Math.max(0, ef.target - ef.saved)
    const months = ef.monthlyContribution > 0 ? Math.ceil(gap / ef.monthlyContribution) : null
    return {
      question,
      verdict: gap === 0 ? 'yes' : a.emergencyMonthsCovered >= 3 ? 'careful' : 'no',
      headline:
        gap === 0
          ? 'Fully funded'
          : `${money(gap)} to go — ${a.emergencyMonthsCovered.toFixed(1)} months covered`,
      lines: [
        { label: 'Saved', value: money(ef.saved) },
        { label: 'Target', value: money(ef.target) },
        { label: 'You spend', value: `${money(a.burnRate)}/mo` },
        { label: 'Done by', value: months ? longDate(addMonths(today(), months)) : '—' },
      ],
      reasoning: `You spend about ${money(a.burnRate)} a month, so ${money(
        ef.saved,
      )} covers ${a.emergencyMonthsCovered.toFixed(1)} months.${
        gap > 0 && months
          ? ` At ${money(ef.monthlyContribution)} a month you get there in ${months} months.`
          : ''
      }`,
    }
  }

  // --- Overview ------------------------------------------------------------
  if (has(q, 'net worth', 'how am i doing', 'summary', 'overview', 'total')) {
    const nw = a.netWorth
    return {
      question,
      verdict: 'info',
      headline: `${money(nw.total)} net`,
      lines: [
        { label: 'Cash', value: money(nw.cash) },
        { label: 'Owed on cards', value: `−${money(nw.owed)}` },
        { label: 'Spent this month', value: money(a.monthSpend) },
        { label: 'Spare monthly', value: money(a.surplus) },
      ],
      reasoning: `You hold ${money(nw.cash)} across your accounts and owe ${money(
        nw.owed,
      )} on cards. Income of about ${money(a.income)} a month against ${money(
        a.burnRate,
      )} of bills and everyday spending leaves ${money(
        a.surplus,
      )}. The 90-day outlook scores ${base.riskScore}/100.`,
    }
  }

  return info(
    question,
    'Try asking: “can I afford a 90k laptop”, “how much did I spend on groceries”, “what if I’m paid four days late”, “where can I save money”, or “will I run out of money”.',
  )
}

function info(question: string, reasoning: string): Answer {
  return { question, verdict: 'info', headline: 'I need a bit more', lines: [], reasoning }
}

/* ------------------------------------------------------------------ *
 * Affordability
 * ------------------------------------------------------------------ */

export function affordability(
  state: FinancialState,
  question: string,
  amount: number,
  base?: Forecast,
  when: ISODate = today(),
): Answer {
  const a = analytics(state)
  const baseline = base ?? simulate(state, { horizonDays: 90 })
  const from =
    state.accounts.find((x) => x.kind === 'savings' && !x.archived) ??
    state.accounts.find((x) => x.kind === 'spending' && !x.archived)

  const withSpend = simulate(state, {
    horizonDays: 90,
    extraSpend: { date: when, amount, accountId: from?.id ?? '', label: 'Purchase' },
  })

  const newOverdrafts = withSpend.flags.filter(
    (f) =>
      f.severity === 'overdraft' &&
      !baseline.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
  )
  const newBreaches = withSpend.flags.filter(
    (f) => !baseline.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
  )

  const ef = state.goals.find((g) => g.emergencyFund)
  const untouchable = ef?.saved ?? 0
  const free = Math.max(0, baseline.trough.total - untouchable)

  const verdict: Answer['verdict'] =
    newOverdrafts.length > 0 ? 'no' : amount > free ? 'careful' : newBreaches.length ? 'careful' : 'yes'

  const monthsToSave = a.surplus > 0 ? Math.ceil(amount / a.surplus) : null

  return {
    question,
    verdict,
    headline:
      verdict === 'yes'
        ? `Yes — ${money(amount)} is comfortable`
        : verdict === 'careful'
          ? 'You can, but it eats your buffer'
          : `No — ${money(amount)} would break the next 90 days`,
    lines: [
      { label: 'Purchase', value: money(amount) },
      {
        label: 'Lowest point',
        value: `${money(baseline.trough.total)} → ${money(withSpend.trough.total)}`,
        detail: shortDate(withSpend.trough.date),
      },
      { label: 'Score', value: `${baseline.riskScore} → ${withSpend.riskScore}` },
      {
        label: 'Truly spare',
        value: money(free),
        detail: untouchable > 0 ? 'excludes emergency fund' : undefined,
      },
    ],
    reasoning:
      verdict === 'yes'
        ? `Spending ${money(amount)} today moves your lowest point from ${money(
            baseline.trough.total,
          )} to ${money(withSpend.trough.total)} on ${longDate(
            withSpend.trough.date,
          )}. Every bill still gets paid, no account gets low, and your emergency fund of ${money(
            untouchable,
          )} stays untouched.`
        : verdict === 'careful'
          ? `It clears, but it uses ${((amount / Math.max(1, free)) * 100).toFixed(
              0,
            )}% of the ${money(free)} you actually have spare once the emergency fund is set aside.${
              newBreaches.length
                ? ` ${newBreaches[0].accountName} also drops under its cushion on ${shortDate(
                    newBreaches[0].date,
                  )}.`
                : ''
            }`
          : `${money(amount)} leaves ${
              newOverdrafts[0]?.accountName ?? 'an account'
            } short by ${money(newOverdrafts[0]?.shortfall ?? 0)} on ${longDate(
              newOverdrafts[0]?.date ?? withSpend.trough.date,
            )}. Bills you have already committed to would not get paid.`,
    recommendation:
      verdict === 'yes'
        ? undefined
        : monthsToSave && monthsToSave <= 60
          ? `Waiting ${monthsToSave} month${
              monthsToSave > 1 ? 's' : ''
            } pays for it out of income instead of savings — around ${longDate(
              addMonths(today(), monthsToSave),
            )}.`
          : 'Build up some monthly surplus before committing to this.',
  }
}

export const SUGGESTED_QUESTIONS = [
  'Can I afford a 90k laptop?',
  'How much did I spend this month?',
  'Will I run out of money?',
  'Where can I save money?',
  'What if I’m paid four days late?',
  'How are my cards doing?',
]

/** Spending by category, but only what actually has spend — for the advisor UI. */
export function topCategories(state: FinancialState, limit = 5) {
  return spendByCategory(state)
    .filter((r) => r.spent > 0)
    .slice(0, limit)
}

export { isSpend }
