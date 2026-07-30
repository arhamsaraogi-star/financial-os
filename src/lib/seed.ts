import type { FinancialState, Transaction } from '@/lib/types'
import { dayOfMonthIn, fromISO, today } from '@/lib/dates'

/**
 * Deterministic jitter. Real receipts and bills vary month to month, and the
 * forecast is only honest if the history it learns from varies too — but it has
 * to vary the *same way* on every render, or a static export would hydrate
 * against different numbers than it was built with.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const ACC = { icici: 'acc_icici', au: 'acc_au', axis: 'acc_axis' } as const

/**
 * The starting profile: three accounts with distinct jobs, ~₹90,000 of variable
 * monthly receipts, and every obligation mapped to the account responsible for
 * it. All of it is editable — nothing here is structural.
 */
export function seedState(): FinancialState {
  const now = today()
  const rand = rng(20260101)

  return {
    version: 1,
    settings: {
      ownerName: 'Principal',
      currency: 'INR',
      locale: 'en-IN',
      discretionaryMonthly: 18_000,
      emergencyFundMonths: 6,
      riskTolerance: 'balanced',
      forecastConservatism: 0.35,
    },

    accounts: [
      {
        id: ACC.icici,
        name: 'ICICI',
        institution: 'ICICI Bank',
        role: 'income_hub',
        balance: 24_180,
        targetBalance: 5_000,
        minBuffer: 5_000,
        accent: '#C9A227',
        notes: 'Salary lands here. Operating account for everyday spend.',
      },
      {
        id: ACC.au,
        name: 'AU',
        institution: 'AU Small Finance Bank',
        role: 'bills',
        balance: 41_600,
        targetBalance: 48_000,
        minBuffer: 12_000,
        accent: '#7A9E9F',
        notes: 'Every obligation is paid from here. Rent, furniture, electricity, cards.',
      },
      {
        id: ACC.axis,
        name: 'Axis',
        institution: 'Axis Bank',
        role: 'reserve',
        balance: 2_86_400,
        targetBalance: 3_00_000,
        minBuffer: 50_000,
        accent: '#8B6F9E',
        notes: 'Bond and allowance receipts. Emergency fund and investment funding.',
      },
    ],

    income: [
      {
        id: 'inc_salary',
        name: 'Salary',
        kind: 'salary',
        expectedAmount: 62_000,
        minAmount: 60_000,
        maxAmount: 64_000,
        windowStart: 28,
        windowEnd: 31,
        accountId: ACC.icici,
        confidence: 0.97,
        history: buildIncomeHistory(62_000, 2_000, 29, rand),
        active: true,
        notes: 'Credited between the 28th and month end. Amount moves with variable pay.',
      },
      {
        id: 'inc_bond',
        name: 'Bond income',
        kind: 'bond',
        expectedAmount: 16_500,
        minAmount: 15_000,
        maxAmount: 18_000,
        windowStart: 10,
        windowEnd: 15,
        accountId: ACC.axis,
        confidence: 0.88,
        history: buildIncomeHistory(16_500, 1_500, 12, rand),
        active: true,
        notes: 'Coupon flow. Timing drifts within the window.',
      },
      {
        id: 'inc_allowance',
        name: 'Allowance',
        kind: 'allowance',
        expectedAmount: 12_000,
        minAmount: 10_000,
        maxAmount: 14_000,
        windowStart: 10,
        windowEnd: 20,
        accountId: ACC.axis,
        confidence: 0.82,
        history: buildIncomeHistory(12_000, 2_000, 15, rand),
        active: true,
      },
    ],

    bills: [
      {
        id: 'bill_rent',
        name: 'Rent',
        category: 'Housing',
        expectedAmount: 28_000,
        minAmount: 28_000,
        maxAmount: 28_000,
        dueDay: 5,
        graceDays: 2,
        priority: 'critical',
        fundingAccountId: ACC.au,
        autopay: false,
        active: true,
      },
      {
        id: 'bill_furniture',
        name: 'Furniture EMI',
        category: 'Debt',
        expectedAmount: 6_400,
        minAmount: 6_400,
        maxAmount: 6_400,
        dueDay: 7,
        graceDays: 0,
        priority: 'critical',
        fundingAccountId: ACC.au,
        autopay: true,
        active: true,
      },
      {
        id: 'bill_electricity',
        name: 'Electricity',
        category: 'Utilities',
        expectedAmount: 2_400,
        minAmount: 1_400,
        maxAmount: 4_200,
        dueDay: 18,
        graceDays: 5,
        priority: 'high',
        fundingAccountId: ACC.au,
        autopay: true,
        active: true,
        notes: 'Swings hard with the season. Summer peaks near the top of the range.',
      },
      {
        id: 'bill_internet',
        name: 'Broadband',
        category: 'Utilities',
        expectedAmount: 1_100,
        minAmount: 1_100,
        maxAmount: 1_100,
        dueDay: 12,
        graceDays: 7,
        priority: 'medium',
        fundingAccountId: ACC.au,
        autopay: true,
        active: true,
      },
      {
        id: 'bill_help',
        name: 'Household help',
        category: 'Housing',
        expectedAmount: 4_500,
        minAmount: 4_500,
        maxAmount: 5_000,
        dueDay: 3,
        graceDays: 3,
        priority: 'high',
        fundingAccountId: ACC.au,
        autopay: false,
        active: true,
      },
    ],

    subscriptions: [
      {
        id: 'sub_claude',
        name: 'Claude Max',
        category: 'Software',
        amount: 8_500,
        cycle: 'monthly',
        renewalDay: 14,
        accountId: ACC.au,
        usageScore: 10,
        startedOn: monthsAgo(now, 9),
        active: true,
      },
      {
        id: 'sub_icloud',
        name: 'iCloud 2TB',
        category: 'Software',
        amount: 749,
        cycle: 'monthly',
        renewalDay: 9,
        accountId: ACC.au,
        usageScore: 8,
        startedOn: monthsAgo(now, 26),
        active: true,
      },
      {
        id: 'sub_spotify',
        name: 'Spotify',
        category: 'Media',
        amount: 199,
        cycle: 'monthly',
        renewalDay: 22,
        accountId: ACC.au,
        usageScore: 9,
        startedOn: monthsAgo(now, 31),
        active: true,
      },
      {
        id: 'sub_gym',
        name: 'Gym membership',
        category: 'Health',
        amount: 24_000,
        cycle: 'annual',
        renewalDay: 4,
        renewalMonth: 11,
        accountId: ACC.au,
        usageScore: 3,
        startedOn: monthsAgo(now, 20),
        active: true,
      },
      {
        id: 'sub_news',
        name: 'FT Digital',
        category: 'Media',
        amount: 1_900,
        cycle: 'quarterly',
        renewalDay: 16,
        accountId: ACC.au,
        usageScore: 2,
        startedOn: monthsAgo(now, 14),
        active: true,
      },
    ],

    // Units are derived from the contribution flows rather than typed in.
    // XIRR reads the flow log while absolute return reads units × avgCost, so
    // if the two disagree the portfolio reports a loss and a gain at once.
    holdings: [
      {
        id: 'h_pp_flexi',
        name: 'Parag Parikh Flexi Cap',
        kind: 'mutual_fund',
        units: unitsFor(5_000 * 24, 68.4),
        avgCost: 68.4,
        currentPrice: 84.15,
        sector: 'Diversified',
        assetClass: 'equity',
        flows: buildSipFlows(now, 5_000, 24),
        dividendsYtd: 0,
      },
      {
        id: 'h_nifty50',
        name: 'UTI Nifty 50 Index',
        kind: 'mutual_fund',
        units: unitsFor(3_000 * 18, 132.1),
        avgCost: 132.1,
        currentPrice: 151.9,
        sector: 'Large Cap',
        assetClass: 'equity',
        flows: buildSipFlows(now, 3_000, 18),
        dividendsYtd: 0,
      },
      {
        id: 'h_goldetf',
        name: 'Nippon Gold ETF',
        kind: 'etf',
        units: unitsFor(1_000 * 14, 62.5),
        avgCost: 62.5,
        currentPrice: 78.9,
        sector: 'Commodity',
        assetClass: 'gold',
        flows: buildSipFlows(now, 1_000, 14),
        dividendsYtd: 0,
      },
      {
        id: 'h_hdfc',
        name: 'HDFC Bank',
        kind: 'stock',
        ticker: 'HDFCBANK',
        units: 42,
        avgCost: 1_540,
        currentPrice: 1_712,
        sector: 'Financials',
        assetClass: 'equity',
        flows: [{ date: monthsAgo(now, 15), amount: -64_680 }],
        dividendsYtd: 819,
      },
      {
        id: 'h_liquid',
        name: 'ICICI Liquid Fund',
        kind: 'mutual_fund',
        units: 118.2,
        avgCost: 340.0,
        currentPrice: 358.6,
        sector: 'Debt',
        assetClass: 'debt',
        flows: [{ date: monthsAgo(now, 11), amount: -40_188 }],
        dividendsYtd: 0,
      },
    ],

    sips: [
      { id: 'sip_pp', name: 'SIP — Parag Parikh Flexi Cap', amount: 5_000, day: 5, accountId: ACC.axis, holdingId: 'h_pp_flexi', active: true },
      { id: 'sip_nifty', name: 'SIP — UTI Nifty 50', amount: 3_000, day: 5, accountId: ACC.axis, holdingId: 'h_nifty50', active: true },
      { id: 'sip_gold', name: 'SIP — Nippon Gold ETF', amount: 1_000, day: 5, accountId: ACC.axis, holdingId: 'h_goldetf', active: true },
    ],

    cards: [
      {
        id: 'card_amex',
        name: 'Amex Platinum Travel',
        issuer: 'American Express',
        limit: 2_50_000,
        currentBalance: 38_400,
        statementDay: 20,
        dueDay: 8,
        paymentAccountId: ACC.au,
        apr: 42,
        active: true,
      },
      {
        id: 'card_hdfc',
        name: 'HDFC Regalia',
        issuer: 'HDFC Bank',
        limit: 1_20_000,
        currentBalance: 11_900,
        statementDay: 25,
        dueDay: 14,
        paymentAccountId: ACC.au,
        apr: 43.2,
        active: true,
      },
    ],

    goals: [
      {
        id: 'goal_ef',
        name: 'Emergency Fund',
        kind: 'emergency_fund',
        target: 3_60_000,
        current: 2_45_000,
        monthlyContribution: 8_000,
        accountId: ACC.axis,
        priority: 'critical',
      },
      {
        id: 'goal_laptop',
        name: 'MacBook Pro',
        kind: 'purchase',
        target: 2_40_000,
        current: 62_000,
        monthlyContribution: 6_000,
        accountId: ACC.axis,
        priority: 'medium',
      },
    ],

    rules: [
      {
        id: 'rule_salary',
        name: 'Salary lands',
        trigger: { type: 'income_received', incomeId: 'inc_salary' },
        actions: [
          { type: 'top_up_to_target', fromAccountId: ACC.icici, toAccountId: ACC.au },
          { type: 'sweep_excess', fromAccountId: ACC.icici, toAccountId: ACC.axis, keep: 22_000 },
        ],
        enabled: true,
        rationale:
          'The bills account must be whole before anything else moves. Whatever remains above one month of everyday spend has no job sitting in the operating account, so it goes to reserve.',
        order: 1,
      },
      {
        id: 'rule_sip',
        name: 'Fund the SIP like rent',
        trigger: { type: 'day_of_month', day: 3 },
        actions: [{ type: 'fund_sips', fromAccountId: ACC.axis }],
        enabled: true,
        rationale:
          'Investments are a fixed obligation, not a leftover. Funding two days before the debit removes any chance of a failed mandate.',
        order: 2,
      },
      {
        id: 'rule_bills_low',
        name: 'Bills account below target',
        trigger: { type: 'account_below_target', accountId: ACC.au },
        actions: [{ type: 'top_up_to_target', fromAccountId: ACC.axis, toAccountId: ACC.au }],
        enabled: true,
        rationale:
          'Reserve exists precisely so obligations never depend on timing. Topping up from Axis costs nothing and removes the failure mode entirely.',
        order: 3,
      },
      {
        id: 'rule_ef',
        name: 'Emergency fund complete',
        trigger: { type: 'goal_complete', goalId: 'goal_ef' },
        actions: [
          {
            type: 'recommend',
            message: 'Emergency fund is complete — redirect its monthly contribution into the SIP.',
          },
        ],
        enabled: true,
        rationale:
          'Once six months of cover is banked, further cash accumulation loses to inflation. The contribution should convert into equity exposure.',
        order: 4,
      },
    ],

    transactions: buildTransactionHistory(now, rand),
  }
}

/* ------------------------------------------------------------------ *
 * Synthetic history
 * ------------------------------------------------------------------ */

function monthsAgo(base: string, n: number): string {
  const d = fromISO(base)
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    Math.min(d.getDate(), 28),
  ).padStart(2, '0')}`
}

function buildIncomeHistory(base: number, spread: number, day: number, rand: () => number) {
  const out: { date: string; amount: number }[] = []
  const now = fromISO(today())
  for (let i = 11; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const jitterDay = Math.max(1, Math.min(28, day + Math.round((rand() - 0.5) * 4)))
    out.push({
      date: dayOfMonthIn(d.getFullYear(), d.getMonth() + 1, jitterDay),
      amount: Math.round((base + (rand() - 0.5) * spread * 2) / 100) * 100,
    })
  }
  return out
}

/** Keep units × avgCost equal to what was actually contributed. */
function unitsFor(totalInvested: number, avgCost: number) {
  return Math.round((totalInvested / avgCost) * 1000) / 1000
}

function buildSipFlows(now: string, amount: number, months: number) {
  const out: { date: string; amount: number }[] = []
  for (let i = months; i >= 1; i--) out.push({ date: monthsAgo(now, i), amount: -amount })
  return out
}

/**
 * Twelve months of ledger so the reports, rolling averages and growth rates
 * have something real to chew on from the first launch.
 */
function buildTransactionHistory(now: string, rand: () => number): Transaction[] {
  const out: Transaction[] = []
  const base = fromISO(now)

  for (let i = 12; i >= 1; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    const jit = (v: number, s: number) => Math.round((v + (rand() - 0.5) * s) / 10) * 10

    const push = (
      day: number,
      description: string,
      amount: number,
      accountId: string,
      category: string,
      kind: Transaction['kind'],
    ) => {
      out.push({
        id: `tx_${y}${m}_${description.replace(/\W+/g, '')}_${day}`,
        date: dayOfMonthIn(y, m, day),
        description,
        amount,
        accountId,
        category,
        kind,
      })
    }

    push(29, 'Salary', jit(62_000, 3_000), ACC.icici, 'Salary', 'income')
    push(12, 'Bond coupon', jit(16_500, 2_000), ACC.axis, 'Investments', 'income')
    push(15, 'Allowance', jit(12_000, 3_000), ACC.axis, 'Family', 'income')

    push(5, 'Rent', -28_000, ACC.au, 'Housing', 'bill')
    push(7, 'Furniture EMI', -6_400, ACC.au, 'Debt', 'bill')
    // Electricity peaks through the Indian summer; the range is not decorative.
    const summer = m >= 4 && m <= 7
    push(18, 'Electricity', -jit(summer ? 3_600 : 1_900, 700), ACC.au, 'Utilities', 'bill')
    push(12, 'Broadband', -1_100, ACC.au, 'Utilities', 'bill')
    push(3, 'Household help', -4_500, ACC.au, 'Housing', 'bill')

    push(14, 'Claude Max', -8_500, ACC.au, 'Software', 'subscription')
    push(9, 'iCloud 2TB', -749, ACC.au, 'Software', 'subscription')
    push(22, 'Spotify', -199, ACC.au, 'Media', 'subscription')

    push(5, 'SIP — Parag Parikh Flexi Cap', -5_000, ACC.axis, 'Investments', 'investment')
    push(5, 'SIP — UTI Nifty 50', -3_000, ACC.axis, 'Investments', 'investment')
    push(5, 'SIP — Nippon Gold ETF', -1_000, ACC.axis, 'Investments', 'investment')

    // The card payment covers only what the everyday categories below do not.
    // Booking a full statement balance *and* the groceries it settled would
    // double-count the same rupees and report a loss every month.
    push(8, 'Amex payment', -jit(4_200, 2_600), ACC.au, 'Credit', 'credit')
    push(16, 'Groceries', -jit(7_200, 1_800), ACC.icici, 'Food', 'discretionary')
    push(21, 'Dining & delivery', -jit(5_400, 2_400), ACC.icici, 'Food', 'discretionary')
    push(24, 'Transport', -jit(2_600, 900), ACC.icici, 'Transport', 'discretionary')
    push(26, 'Shopping', -jit(3_400, 2_600), ACC.icici, 'Lifestyle', 'discretionary')
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}
