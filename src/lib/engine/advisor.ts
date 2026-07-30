import type { FinancialState } from '@/lib/types'
import { ISODate, addMonths, longDate, relativeDays, shortDate, today } from '@/lib/dates'
import { money, moneyCompact, pct } from '@/lib/format'
import { Forecast, simulate } from './forecast'
import { analytics, creditSummary, portfolioSummary, subscriptionInsights } from './analytics'

/* ------------------------------------------------------------------ *
 * Proactive advisories — what the CFO tells you before you ask
 * ------------------------------------------------------------------ */

export type AdviceTone = 'critical' | 'warning' | 'opportunity' | 'good'

export interface Advisory {
  id: string
  tone: AdviceTone
  title: string
  detail: string
  /** The number that makes the case. */
  metric?: string
  action?: string
}

export function advisories(state: FinancialState, forecast: Forecast): Advisory[] {
  const out: Advisory[] = []
  const a = analytics(state)
  const credit = creditSummary(state)
  const subs = subscriptionInsights(state)

  // --- Shortfalls first. Nothing else matters if an account goes dry. ------
  const overdrafts = forecast.flags.filter((f) => f.severity === 'overdraft')
  if (overdrafts.length) {
    const first = overdrafts[0]
    out.push({
      id: 'overdraft',
      tone: 'critical',
      title: `${first.accountName} runs dry ${relativeDays(first.date)}`,
      detail: `Projected to fall ${money(first.shortfall)} short on ${longDate(first.date)}${
        first.cause ? `, driven by ${first.cause}` : ''
      }. Move funds in before then.`,
      metric: money(-first.shortfall),
      action: `Transfer ${money(Math.ceil(first.shortfall / 500) * 500)} from your reserve`,
    })
  }

  const breaches = forecast.flags.filter((f) => f.severity === 'below_buffer')
  if (breaches.length && !overdrafts.length) {
    const first = breaches[0]
    out.push({
      id: 'buffer',
      tone: 'warning',
      title: `${first.accountName} dips under its floor ${relativeDays(first.date)}`,
      detail: `Balance is projected at ${money(first.balance)} on ${shortDate(
        first.date,
      )}, ${money(first.shortfall)} below the buffer you set. Not fatal, but it removes your margin for error.`,
      metric: money(first.balance),
      action: `Top up ${money(Math.ceil(first.shortfall / 500) * 500)}`,
    })
  }

  // --- Emergency fund ------------------------------------------------------
  const ef = state.goals.find((g) => g.kind === 'emergency_fund')
  if (ef) {
    const progress = ef.target > 0 ? (ef.current / ef.target) * 100 : 0
    if (progress >= 100) {
      out.push({
        id: 'ef-done',
        tone: 'opportunity',
        title: 'Emergency fund is fully funded',
        detail: `You hold ${money(ef.current)}, covering ${a.emergencyMonthsCovered.toFixed(
          1,
        )} months of obligations. The monthly contribution of ${money(
          ef.monthlyContribution,
        )} is now doing nothing productive — redirect it into your SIP.`,
        metric: `${a.emergencyMonthsCovered.toFixed(1)} months`,
        action: `Redirect ${money(ef.monthlyContribution)}/mo to investments`,
      })
    } else if (a.emergencyMonthsCovered < 3) {
      const gap = ef.target - ef.current
      const months = ef.monthlyContribution > 0 ? Math.ceil(gap / ef.monthlyContribution) : Infinity
      out.push({
        id: 'ef-thin',
        tone: 'warning',
        title: `Emergency cover is only ${a.emergencyMonthsCovered.toFixed(1)} months`,
        detail: `Below the three-month floor. At ${money(
          ef.monthlyContribution,
        )}/month you close the ${money(gap)} gap in ${
          Number.isFinite(months) ? `${months} months` : 'never — no contribution is set'
        }.`,
        metric: `${progress.toFixed(0)}% funded`,
        action: 'Prioritise the fund over new investments',
      })
    }
  }

  // --- Credit --------------------------------------------------------------
  if (credit.utilisation > 30) {
    const toThirty = credit.balance - credit.limit * 0.3
    out.push({
      id: 'credit-util',
      tone: credit.utilisation > 50 ? 'critical' : 'warning',
      title: `Credit utilisation at ${credit.utilisation.toFixed(0)}%`,
      detail: `Anything above 30% is read as stress by scoring models. Paying down ${money(
        toThirty,
      )} before your statement date drops you back into the healthy band.`,
      metric: `${credit.utilisation.toFixed(0)}%`,
      action: `Pay ${money(Math.ceil(toThirty / 500) * 500)} before the statement cuts`,
    })
  }

  // --- Subscriptions -------------------------------------------------------
  if (subs.cancelCandidates.length) {
    const names = subs.cancelCandidates.slice(0, 3).map((c) => c.name).join(', ')
    out.push({
      id: 'subs',
      tone: 'opportunity',
      title: `${subs.cancelCandidates.length} subscriptions you barely use`,
      detail: `${names} cost ${money(
        subs.potentialSaving,
      )}/month combined and score under 4/10 on usage. Cancelling frees ${money(
        subs.potentialSaving * 12,
      )} a year.`,
      metric: `${money(subs.potentialSaving)}/mo`,
      action: 'Review and cancel',
    })
  }

  // --- Surplus sitting idle ------------------------------------------------
  if (a.surplus > 5000 && forecast.riskScore > 75) {
    out.push({
      id: 'surplus',
      tone: 'opportunity',
      title: `${money(a.surplus)} of monthly surplus is uncommitted`,
      detail: `After every bill, subscription and your current ${money(
        a.commitments.sips,
      )} SIP, this much is left over each month with no job. Your projection stays safe at ${forecast.riskScore}/100, so it can be put to work.`,
      metric: money(a.surplus),
      action: `Raise the SIP by ${money(Math.floor((a.surplus * 0.6) / 500) * 500)}`,
    })
  }

  // --- Savings rate --------------------------------------------------------
  if (a.savingsRate < 20 && a.income > 0) {
    out.push({
      id: 'savings-rate',
      tone: 'warning',
      title: `Savings rate is ${a.savingsRate.toFixed(0)}%`,
      detail: `Fixed costs take ${a.fixedExpenseRatio.toFixed(
        0,
      )}% of income and everyday spend runs ${money(
        a.discretionary,
      )}/month. Getting the rate above 20% is the single highest-leverage change available.`,
      metric: `${a.savingsRate.toFixed(0)}%`,
    })
  }

  if (a.fixedExpenseRatio > 50) {
    out.push({
      id: 'fixed-heavy',
      tone: 'warning',
      title: `Fixed obligations consume ${a.fixedExpenseRatio.toFixed(0)}% of income`,
      detail: `Above 50%, a single delayed receipt becomes a real problem because almost nothing in the budget can flex.`,
      metric: `${a.fixedExpenseRatio.toFixed(0)}%`,
    })
  }

  if (!out.length || (forecast.riskScore >= 85 && out.every((o) => o.tone === 'opportunity'))) {
    out.unshift({
      id: 'all-clear',
      tone: 'good',
      title: 'Every obligation is covered through the horizon',
      detail: `Lowest projected liquidity is ${money(forecast.trough.total)} on ${longDate(
        forecast.trough.date,
      )}, with all account floors intact. Risk score ${forecast.riskScore}/100.`,
      metric: `${forecast.riskScore}/100`,
    })
  }

  const rank: Record<AdviceTone, number> = { critical: 0, warning: 1, opportunity: 2, good: 3 }
  return out.sort((x, y) => rank[x.tone] - rank[y.tone])
}

/* ------------------------------------------------------------------ *
 * Conversational CFO
 * ------------------------------------------------------------------ */

export interface AnswerLine {
  label: string
  value: string
  detail?: string
}

export interface CfoAnswer {
  question: string
  verdict: 'yes' | 'no' | 'caution' | 'info'
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
 * Route a natural-language question to the engine that can answer it, then
 * answer with the user's own numbers. Every response cites the figures it used
 * so no recommendation is ever unexplained.
 */
export function askCfo(state: FinancialState, question: string): CfoAnswer {
  const q = question.toLowerCase().trim()
  const a = analytics(state)
  const base = simulate(state, { horizonDays: 90 })

  // --- Salary delay --------------------------------------------------------
  if (has(q, 'delay', 'late', 'delayed') && has(q, 'salary', 'income', 'paid', 'bond', 'allowance')) {
    const days = extractDays(q) ?? 4
    const source =
      state.income.find((i) => q.includes(i.kind)) ??
      state.income.find((i) => i.kind === 'salary') ??
      state.income[0]
    if (!source) return infoAnswer(question, 'No income sources are configured yet.')

    const delayed = simulate(state, { horizonDays: 90, delayIncome: { incomeId: source.id, days } })
    const newFlags = delayed.flags.filter(
      (f) => !base.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
    )
    const survives = delayed.flags.filter((f) => f.severity === 'overdraft').length === 0

    return {
      question,
      verdict: survives ? (newFlags.length ? 'caution' : 'yes') : 'no',
      headline: survives
        ? newFlags.length
          ? `You absorb a ${days}-day delay, but you lose your buffer`
          : `A ${days}-day delay changes nothing material`
        : `A ${days}-day delay breaks the month`,
      lines: [
        { label: 'Scenario', value: `${source.name} arrives ${days} days late` },
        {
          label: 'Trough moves',
          value: `${money(base.trough.total)} → ${money(delayed.trough.total)}`,
          detail: `on ${shortDate(delayed.trough.date)}`,
        },
        {
          label: 'Risk score',
          value: `${base.riskScore} → ${delayed.riskScore}`,
          detail: delayed.riskLevel,
        },
        {
          label: 'New breaches',
          value: newFlags.length ? `${newFlags.length}` : 'None',
          detail: newFlags[0] ? `${newFlags[0].accountName} on ${shortDate(newFlags[0].date)}` : undefined,
        },
      ],
      reasoning: survives
        ? `Shifting ${source.name} by ${days} days pushes your lowest point to ${money(
            delayed.trough.total,
          )} on ${longDate(delayed.trough.date)}. ${
            newFlags.length
              ? `${newFlags[0].accountName} drops below its floor in the gap, which is survivable but leaves no room for a surprise.`
              : 'Every obligation still clears on time and no account floor is touched.'
          }`
        : `The delay leaves ${
            delayed.flags.find((f) => f.severity === 'overdraft')?.accountName ?? 'an account'
          } short by ${money(
            delayed.flags.find((f) => f.severity === 'overdraft')?.shortfall ?? 0,
          )}. Obligations dated before the new arrival date cannot be funded from current balances.`,
      recommendation: survives
        ? newFlags.length
          ? `Hold ${money(
              Math.ceil((newFlags[0]?.shortfall ?? 5000) / 1000) * 1000,
            )} extra in your bills account as a delay cushion.`
          : undefined
        : `Pre-fund your bills account from reserve before the ${ordinalDay(source.windowStart)}, or move the affected due dates later in the month.`,
    }
  }

  // --- Affordability -------------------------------------------------------
  if (has(q, 'afford', 'can i buy', 'should i buy', 'purchase', 'laptop', 'vacation', 'holiday', 'trip', 'phone')) {
    const amount = extractAmount(q)
    if (amount == null) {
      return infoAnswer(
        question,
        'Tell me the amount and I will run it against the projection — for example, "can I afford a laptop for 90k".',
      )
    }
    return affordability(state, question, amount, base)
  }

  // --- SIP / investing -----------------------------------------------------
  if (has(q, 'sip', 'invest', 'investment', 'mutual fund')) {
    const p = portfolioSummary(state)
    const headroom = Math.max(0, a.surplus)
    const safeIncrease = Math.floor((headroom * 0.6) / 500) * 500
    const efReady = a.emergencyMonthsCovered >= 3

    return {
      question,
      verdict: safeIncrease > 0 && efReady ? 'yes' : 'caution',
      headline: !efReady
        ? 'Finish the emergency fund before adding to the SIP'
        : safeIncrease > 0
          ? `You can raise the SIP by ${money(safeIncrease)} a month`
          : 'Your current SIP is already at the safe ceiling',
      lines: [
        { label: 'Current SIP', value: `${money(a.commitments.sips)}/mo`, detail: `${a.investmentRate.toFixed(0)}% of income` },
        { label: 'Monthly surplus', value: money(a.surplus), detail: 'after every bill and subscription' },
        { label: 'Emergency cover', value: `${a.emergencyMonthsCovered.toFixed(1)} months`, detail: efReady ? 'sufficient' : 'below the 3-month floor' },
        { label: 'Portfolio', value: money(p.current), detail: p.xirrPct != null ? `${pct(p.xirrPct)} XIRR` : 'XIRR pending' },
      ],
      reasoning: !efReady
        ? `You invest ${money(a.commitments.sips)} a month while holding only ${a.emergencyMonthsCovered.toFixed(
            1,
          )} months of cover. An emergency at this level forces you to redeem units at whatever the market happens to be doing, which is how good portfolios get destroyed. Cash first, then compounding.`
        : `Income runs ${money(a.income)} against ${money(
            a.burnRate,
          )} of committed and everyday spend, leaving ${money(
            a.surplus,
          )}. Committing 60% of that keeps ${money(
            a.surplus - safeIncrease,
          )} of monthly slack for variance, which matters because none of your income sources are fixed.`,
      recommendation: efReady && safeIncrease > 0
        ? `Step the SIP from ${money(a.commitments.sips)} to ${money(
            a.commitments.sips + safeIncrease,
          )} and review again after three months of actual receipts.`
        : `Direct surplus to the emergency fund until it covers ${state.settings.emergencyFundMonths} months.`,
    }
  }

  // --- Running out ---------------------------------------------------------
  if (has(q, 'run out', 'running out', 'shortfall', 'short', 'broke', 'enough money')) {
    const worst = base.flags[0]
    return {
      question,
      verdict: base.flags.some((f) => f.severity === 'overdraft') ? 'no' : worst ? 'caution' : 'yes',
      headline: worst
        ? `${worst.accountName} is the pressure point, ${relativeDays(worst.date)}`
        : 'No shortfall anywhere in the next 90 days',
      lines: [
        { label: 'Lowest point', value: money(base.trough.total), detail: longDate(base.trough.date) },
        { label: 'Risk score', value: `${base.riskScore}/100`, detail: base.riskLevel },
        { label: 'Cash runway', value: `${a.cashRunwayMonths.toFixed(1)} months`, detail: 'if all income stopped' },
        { label: 'Net 90-day flow', value: money(base.netFlow) },
      ],
      reasoning: worst
        ? `Across the next 90 days your total liquidity bottoms out at ${money(
            base.trough.total,
          )} on ${longDate(base.trough.date)}. The binding constraint is ${
            worst.accountName
          }, which falls ${money(worst.shortfall)} below its floor on ${shortDate(worst.date)}${
            worst.cause ? ` when ${worst.cause} clears` : ''
          }.`
        : `Every obligation across the horizon is funded. Total liquidity never falls below ${money(
            base.trough.total,
          )}, and no account breaches its floor. Net flow over the period is ${money(base.netFlow)}.`,
      recommendation: worst ? `Move ${money(Math.ceil(worst.shortfall / 1000) * 1000)} into ${worst.accountName} before ${shortDate(worst.date)}.` : undefined,
    }
  }

  // --- Cash needed next week ----------------------------------------------
  if (has(q, 'next week', 'this week', 'coming week', 'how much cash')) {
    const week = simulate(state, { horizonDays: 7 })
    const out = week.events.filter((e) => e.fromAccountId && !e.toAccountId)
    const top = out.slice().sort((x, y) => y.amount - x.amount).slice(0, 4)
    return {
      question,
      verdict: 'info',
      headline: `${money(week.totalOutflow)} leaves your accounts in the next 7 days`,
      lines: [
        { label: 'Outflow', value: money(week.totalOutflow) },
        { label: 'Expected in', value: money(week.totalInflow) },
        { label: 'Net', value: money(week.netFlow) },
        { label: 'Closing cash', value: money(week.closingTotal) },
      ],
      reasoning: `Seven-day view: ${top
        .map((e) => `${e.label} ${money(e.amount)} on ${shortDate(e.date)}`)
        .join(', ')}. You close the week at ${money(week.closingTotal)} against ${money(
        week.openingTotal,
      )} today.`,
    }
  }

  // --- After a specific bill ----------------------------------------------
  const namedBill = state.bills.find((b) => q.includes(b.name.toLowerCase()))
  if (namedBill && has(q, 'after', 'once', 'post')) {
    const idx = base.days.findIndex((d) => d.events.some((e) => e.sourceId === namedBill.id))
    const point = idx >= 0 ? base.days[idx] : null
    return {
      question,
      verdict: 'info',
      headline: point
        ? `${money(point.total)} once ${namedBill.name} clears on ${shortDate(point.date)}`
        : `${namedBill.name} does not fall inside the 90-day window`,
      lines: point
        ? [
            { label: `${namedBill.name} amount`, value: money(namedBill.expectedAmount) },
            { label: 'Date', value: longDate(point.date) },
            { label: 'Total after', value: money(point.total) },
            {
              label: 'Bills account after',
              value: money(point.byAccount[namedBill.fundingAccountId] ?? 0),
            },
          ]
        : [],
      reasoning: point
        ? `${namedBill.name} debits ${money(namedBill.expectedAmount)} from ${
            state.accounts.find((x) => x.id === namedBill.fundingAccountId)?.name ?? 'your bills account'
          } on ${longDate(point.date)}, leaving ${money(
            point.byAccount[namedBill.fundingAccountId] ?? 0,
          )} there and ${money(point.total)} across all accounts.`
        : 'No occurrence inside the projection window.',
    }
  }

  // --- Emergency fund ------------------------------------------------------
  if (has(q, 'emergency', 'safety net', 'rainy day')) {
    const ef = state.goals.find((g) => g.kind === 'emergency_fund')
    if (!ef) return infoAnswer(question, 'No emergency fund goal is configured yet.')
    const gap = Math.max(0, ef.target - ef.current)
    const months = ef.monthlyContribution > 0 ? Math.ceil(gap / ef.monthlyContribution) : null
    return {
      question,
      verdict: gap === 0 ? 'yes' : a.emergencyMonthsCovered >= 3 ? 'caution' : 'no',
      headline:
        gap === 0
          ? 'Fully funded'
          : `${money(gap)} short of target, ${a.emergencyMonthsCovered.toFixed(1)} months covered`,
      lines: [
        { label: 'Held', value: money(ef.current) },
        { label: 'Target', value: money(ef.target), detail: `${state.settings.emergencyFundMonths} months of obligations` },
        { label: 'Monthly burn', value: money(a.burnRate) },
        { label: 'Completion', value: months ? `${months} months` : 'no contribution set' },
      ],
      reasoning: `Your committed and everyday spend totals ${money(
        a.burnRate,
      )} a month. Holding ${money(ef.current)} covers ${a.emergencyMonthsCovered.toFixed(
        1,
      )} months of that. ${
        gap > 0
          ? `At ${money(ef.monthlyContribution)} a month you reach ${money(ef.target)} in ${
              months ?? '—'
            } months.`
          : 'The fund is complete; further contributions belong in investments.'
      }`,
      recommendation: gap > 0 && ef.monthlyContribution === 0 ? 'Set a monthly contribution — the fund is currently static.' : undefined,
    }
  }

  // --- Credit --------------------------------------------------------------
  if (has(q, 'credit', 'card', 'utilisation', 'utilization', 'score')) {
    const c = creditSummary(state)
    return {
      question,
      verdict: c.utilisation <= 30 ? 'yes' : 'caution',
      headline: `${c.utilisation.toFixed(0)}% utilisation — ${c.band.label.toLowerCase()}`,
      lines: [
        { label: 'Outstanding', value: money(c.balance) },
        { label: 'Total limit', value: money(c.limit) },
        { label: 'Available', value: money(c.available) },
        { label: 'Band', value: c.band.label },
      ],
      reasoning: `You carry ${money(c.balance)} against ${money(
        c.limit,
      )} of limit. Utilisation is the largest controllable input to a credit score; under 30% is healthy and under 10% is optimal. ${
        c.utilisation > 30
          ? `Paying ${money(c.balance - c.limit * 0.3)} before the statement date moves you back into the healthy band.`
          : 'Keep paying in full before each statement date.'
      }`,
    }
  }

  // --- Net worth / general -------------------------------------------------
  if (has(q, 'net worth', 'how am i doing', 'summary', 'overview', 'position')) {
    const nw = a.netWorth
    return {
      question,
      verdict: 'info',
      headline: `Net worth ${money(nw.total)}`,
      lines: [
        { label: 'Cash', value: money(nw.cash) },
        { label: 'Investments', value: money(nw.investments) },
        { label: 'Credit outstanding', value: `−${money(nw.credit)}` },
        { label: 'Savings rate', value: `${a.savingsRate.toFixed(0)}%` },
      ],
      reasoning: `You hold ${money(nw.cash)} in cash across ${
        state.accounts.filter((x) => x.role !== 'credit').length
      } accounts and ${money(nw.investments)} in the market, against ${money(
        nw.credit,
      )} of card outstanding. Income of ${money(a.income)} a month against ${money(
        a.burnRate,
      )} of spend gives a ${a.savingsRate.toFixed(0)}% savings rate, and the 90-day projection scores ${
        base.riskScore
      }/100.`,
    }
  }

  return infoAnswer(
    question,
    'I can answer questions about affordability, cash flow timing, delayed income, SIP capacity, your emergency fund, credit utilisation and net worth. Try "can I afford a 90k laptop" or "what if my salary is four days late".',
  )
}

function ordinalDay(n: number) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function infoAnswer(question: string, reasoning: string): CfoAnswer {
  return { question, verdict: 'info', headline: 'Not enough to go on', lines: [], reasoning }
}

/* ------------------------------------------------------------------ *
 * Affordability — the question the system should already know
 * ------------------------------------------------------------------ */

export function affordability(
  state: FinancialState,
  question: string,
  amount: number,
  base?: Forecast,
  when: ISODate = today(),
): CfoAnswer {
  const a = analytics(state)
  const baseline = base ?? simulate(state, { horizonDays: 90 })
  const operating =
    state.accounts.find((x) => x.role === 'income_hub') ?? state.accounts[0]
  const reserve = state.accounts.find((x) => x.role === 'reserve')

  const withSpend = simulate(state, {
    horizonDays: 90,
    extraSpend: { date: when, amount, accountId: reserve?.id ?? operating?.id ?? '', label: 'Purchase' },
  })

  const newOverdrafts = withSpend.flags.filter(
    (f) =>
      f.severity === 'overdraft' &&
      !baseline.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
  )
  const newBreaches = withSpend.flags.filter(
    (f) => !baseline.flags.some((b) => b.date === f.date && b.accountId === f.accountId),
  )

  const ef = state.goals.find((g) => g.kind === 'emergency_fund')
  const untouchable = ef?.current ?? 0
  const trulyFree = Math.max(0, baseline.trough.total - untouchable)

  const verdict: CfoAnswer['verdict'] =
    newOverdrafts.length > 0 ? 'no' : amount > trulyFree ? 'caution' : newBreaches.length ? 'caution' : 'yes'

  const monthsToSave = a.surplus > 0 ? Math.ceil(amount / a.surplus) : null

  return {
    question,
    verdict,
    headline:
      verdict === 'yes'
        ? `Yes — ${money(amount)} clears without touching your safety net`
        : verdict === 'caution'
          ? `Possible, but it eats into money that has a job`
          : `No — ${money(amount)} breaks the next 90 days`,
    lines: [
      { label: 'Purchase', value: money(amount) },
      {
        label: 'Trough after',
        value: `${money(baseline.trough.total)} → ${money(withSpend.trough.total)}`,
        detail: shortDate(withSpend.trough.date),
      },
      { label: 'Risk score', value: `${baseline.riskScore} → ${withSpend.riskScore}`, detail: withSpend.riskLevel },
      {
        label: 'Genuinely free cash',
        value: money(trulyFree),
        detail: untouchable > 0 ? `excludes ${moneyCompact(untouchable)} emergency fund` : undefined,
      },
    ],
    reasoning:
      verdict === 'yes'
        ? `Spending ${money(amount)} today drops your lowest projected point from ${money(
            baseline.trough.total,
          )} to ${money(withSpend.trough.total)} on ${longDate(
            withSpend.trough.date,
          )}. Every bill, SIP and card payment across the horizon still funds on time, no account touches its floor, and your emergency fund of ${money(
            untouchable,
          )} is untouched.`
        : verdict === 'caution'
          ? `The purchase clears mechanically, but it consumes ${(
              (amount / Math.max(1, trulyFree)) * 100
            ).toFixed(
              0,
            )}% of the ${money(trulyFree)} you actually have free once the emergency fund is set aside.${
              newBreaches.length
                ? ` ${newBreaches[0].accountName} also slips below its floor on ${shortDate(
                    newBreaches[0].date,
                  )}.`
                : ''
            } It is affordable in the narrow sense and expensive in the real one.`
          : `${money(amount)} leaves ${
              newOverdrafts[0]?.accountName ?? 'an account'
            } short by ${money(newOverdrafts[0]?.shortfall ?? 0)} on ${longDate(
              newOverdrafts[0]?.date ?? withSpend.trough.date,
            )}. Obligations that are already committed would not fund.`,
    recommendation:
      verdict === 'yes'
        ? undefined
        : monthsToSave
          ? `At your ${money(a.surplus)} monthly surplus, waiting ${monthsToSave} month${
              monthsToSave > 1 ? 's' : ''
            } pays for it out of flow instead of reserves — target ${longDate(
              addMonths(today(), monthsToSave),
            )}.`
          : 'Build a positive monthly surplus before committing to this.',
  }
}

export const SUGGESTED_QUESTIONS = [
  'Can I afford a laptop for 90k?',
  'What if my salary is four days late?',
  'Should I increase my SIP?',
  'Will I run out of money?',
  'How much cash do I need next week?',
  'How is my credit utilisation?',
]
