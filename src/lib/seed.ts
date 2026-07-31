import type { Category, FinancialState, Transaction } from '@/lib/types'
import { dayOfMonthIn, fromISO, today } from '@/lib/dates'

/**
 * Deterministic jitter. Real spending varies day to day, and the demo history
 * is only convincing if it varies too — but it has to vary the *same way* on
 * every render, or a statically-exported page would hydrate against different
 * numbers than it was built with.
 */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const ACC = {
  icici: 'acc_icici',
  au: 'acc_au',
  axis: 'acc_axis',
  amex: 'acc_amex',
  hdfc: 'acc_hdfc',
} as const

const CAT = {
  groceries: 'cat_groceries',
  dining: 'cat_dining',
  transport: 'cat_transport',
  rent: 'cat_rent',
  utilities: 'cat_utilities',
  shopping: 'cat_shopping',
  health: 'cat_health',
  subs: 'cat_subs',
  emi: 'cat_emi',
  fun: 'cat_fun',
  other: 'cat_other',
  salary: 'cat_salary',
  family: 'cat_family',
  interest: 'cat_interest',
} as const

export const DEFAULT_CATEGORIES: Category[] = [
  { id: CAT.groceries, name: 'Groceries', icon: '🛒', colour: '#7FB08A', budget: 9000, kind: 'expense' },
  { id: CAT.dining, name: 'Eating out', icon: '🍜', colour: '#E0A458', budget: 6000, kind: 'expense' },
  { id: CAT.transport, name: 'Transport', icon: '🚗', colour: '#6FA8C7', budget: 3500, kind: 'expense' },
  { id: CAT.rent, name: 'Rent & home', icon: '🏠', colour: '#C77B7B', budget: 0, kind: 'expense' },
  { id: CAT.utilities, name: 'Utilities', icon: '💡', colour: '#C9A227', budget: 0, kind: 'expense' },
  { id: CAT.shopping, name: 'Shopping', icon: '🛍️', colour: '#B58BC4', budget: 5000, kind: 'expense' },
  { id: CAT.health, name: 'Health', icon: '🩺', colour: '#7FC4C0', budget: 2000, kind: 'expense' },
  { id: CAT.subs, name: 'Subscriptions', icon: '🔁', colour: '#8F9BD1', budget: 0, kind: 'expense' },
  { id: CAT.emi, name: 'Loans & EMI', icon: '🏦', colour: '#A98A6B', budget: 0, kind: 'expense' },
  { id: CAT.fun, name: 'Fun', icon: '🎬', colour: '#D98BA8', budget: 3000, kind: 'expense' },
  { id: CAT.other, name: 'Other', icon: '•', colour: '#9C988E', budget: 0, kind: 'expense' },
  { id: CAT.salary, name: 'Salary', icon: '💼', colour: '#74A37F', budget: 0, kind: 'income' },
  { id: CAT.family, name: 'Family', icon: '🤝', colour: '#74A37F', budget: 0, kind: 'income' },
  { id: CAT.interest, name: 'Interest', icon: '📈', colour: '#74A37F', budget: 0, kind: 'income' },
]

/**
 * Starting profile: three bank accounts with distinct jobs, two cards, and
 * three months of spending history so the charts and averages have something
 * real to work with on first launch. All of it is editable.
 */
export function seedState(): FinancialState {
  const rand = rng(20260101)

  return {
    version: 2,
    settings: {
      ownerName: '',
      emergencyFundMonths: 6,
      forecastConservatism: 0.3,
      compact: false,
    },

    accounts: [
      {
        id: ACC.icici,
        name: 'ICICI',
        institution: 'ICICI Bank',
        kind: 'spending',
        balance: 24_180,
        targetBalance: 25_000,
        minBuffer: 5_000,
        accent: '#C9A227',
        archived: false,
        notes: 'Salary lands here. Everyday spending comes out of it.',
      },
      {
        id: ACC.au,
        name: 'AU',
        institution: 'AU Small Finance Bank',
        kind: 'bills',
        balance: 41_600,
        targetBalance: 48_000,
        minBuffer: 12_000,
        accent: '#7A9E9F',
        archived: false,
        notes: 'Rent, EMI, electricity and card payments are paid from here.',
      },
      {
        id: ACC.axis,
        name: 'Axis',
        institution: 'Axis Bank',
        kind: 'savings',
        balance: 2_86_400,
        targetBalance: 3_00_000,
        minBuffer: 50_000,
        accent: '#8B6F9E',
        archived: false,
        notes: 'Emergency fund and savings goals.',
      },
      {
        id: ACC.amex,
        name: 'Amex Platinum',
        institution: 'American Express',
        kind: 'credit',
        balance: -38_400,
        targetBalance: 0,
        minBuffer: 0,
        accent: '#6FA8C7',
        archived: false,
        notes: '',
        creditLimit: 2_50_000,
        statementDay: 20,
        dueDay: 8,
        apr: 42,
      },
      {
        id: ACC.hdfc,
        name: 'HDFC Regalia',
        institution: 'HDFC Bank',
        kind: 'credit',
        balance: -11_900,
        targetBalance: 0,
        minBuffer: 0,
        accent: '#C77B7B',
        archived: false,
        notes: '',
        creditLimit: 1_20_000,
        statementDay: 25,
        dueDay: 14,
        apr: 43.2,
      },
    ],

    categories: DEFAULT_CATEGORIES,

    recurring: [
      {
        id: 'rec_salary',
        name: 'Salary',
        kind: 'income',
        amount: 62_000,
        minAmount: 60_000,
        maxAmount: 64_000,
        cadence: 'monthly',
        day: 28,
        dayEnd: 31,
        accountId: ACC.icici,
        categoryId: CAT.salary,
        priority: 'normal',
        confidence: 0.97,
        usage: 5,
        autopay: false,
        active: true,
        notes: 'Arrives between the 28th and month end.',
      },
      {
        id: 'rec_bond',
        name: 'Bond income',
        kind: 'income',
        amount: 16_500,
        minAmount: 15_000,
        maxAmount: 18_000,
        cadence: 'monthly',
        day: 10,
        dayEnd: 15,
        accountId: ACC.axis,
        categoryId: CAT.interest,
        priority: 'normal',
        confidence: 0.88,
        usage: 5,
        autopay: false,
        active: true,
        notes: '',
      },
      {
        id: 'rec_allowance',
        name: 'Allowance',
        kind: 'income',
        amount: 12_000,
        minAmount: 10_000,
        maxAmount: 14_000,
        cadence: 'monthly',
        day: 10,
        dayEnd: 20,
        accountId: ACC.axis,
        categoryId: CAT.family,
        priority: 'normal',
        confidence: 0.82,
        usage: 5,
        autopay: false,
        active: true,
        notes: '',
      },

      {
        id: 'rec_rent',
        name: 'Rent',
        kind: 'bill',
        amount: 28_000,
        minAmount: 28_000,
        maxAmount: 28_000,
        cadence: 'monthly',
        day: 5,
        accountId: ACC.au,
        categoryId: CAT.rent,
        priority: 'critical',
        confidence: 1,
        usage: 5,
        autopay: false,
        active: true,
        notes: '',
      },
      {
        id: 'rec_furniture',
        name: 'Furniture EMI',
        kind: 'bill',
        amount: 6_400,
        minAmount: 6_400,
        maxAmount: 6_400,
        cadence: 'monthly',
        day: 7,
        accountId: ACC.au,
        categoryId: CAT.emi,
        priority: 'critical',
        confidence: 1,
        usage: 5,
        autopay: true,
        active: true,
        notes: '',
      },
      {
        id: 'rec_electricity',
        name: 'Electricity',
        kind: 'bill',
        amount: 2_400,
        minAmount: 1_400,
        maxAmount: 4_200,
        cadence: 'monthly',
        day: 18,
        accountId: ACC.au,
        categoryId: CAT.utilities,
        priority: 'high',
        confidence: 1,
        usage: 5,
        autopay: true,
        active: true,
        notes: 'Swings with the season — summer peaks near the top.',
      },
      {
        id: 'rec_broadband',
        name: 'Broadband',
        kind: 'bill',
        amount: 1_100,
        minAmount: 1_100,
        maxAmount: 1_100,
        cadence: 'monthly',
        day: 12,
        accountId: ACC.au,
        categoryId: CAT.utilities,
        priority: 'normal',
        confidence: 1,
        usage: 5,
        autopay: true,
        active: true,
        notes: '',
      },
      {
        id: 'rec_help',
        name: 'Household help',
        kind: 'bill',
        amount: 4_500,
        minAmount: 4_500,
        maxAmount: 5_000,
        cadence: 'monthly',
        day: 3,
        accountId: ACC.au,
        categoryId: CAT.rent,
        priority: 'high',
        confidence: 1,
        usage: 5,
        autopay: false,
        active: true,
        notes: '',
      },

      {
        id: 'rec_claude',
        name: 'Claude Max',
        kind: 'subscription',
        amount: 8_500,
        minAmount: 8_500,
        maxAmount: 8_500,
        cadence: 'monthly',
        day: 14,
        accountId: ACC.au,
        categoryId: CAT.subs,
        priority: 'normal',
        confidence: 1,
        usage: 10,
        autopay: true,
        active: true,
        startedOn: monthsAgo(today(), 9),
        notes: '',
      },
      {
        id: 'rec_icloud',
        name: 'iCloud 2TB',
        kind: 'subscription',
        amount: 749,
        minAmount: 749,
        maxAmount: 749,
        cadence: 'monthly',
        day: 9,
        accountId: ACC.au,
        categoryId: CAT.subs,
        priority: 'normal',
        confidence: 1,
        usage: 8,
        autopay: true,
        active: true,
        startedOn: monthsAgo(today(), 26),
        notes: '',
      },
      {
        id: 'rec_spotify',
        name: 'Spotify',
        kind: 'subscription',
        amount: 199,
        minAmount: 199,
        maxAmount: 199,
        cadence: 'monthly',
        day: 22,
        accountId: ACC.au,
        categoryId: CAT.subs,
        priority: 'normal',
        confidence: 1,
        usage: 9,
        autopay: true,
        active: true,
        startedOn: monthsAgo(today(), 31),
        notes: '',
      },
      {
        id: 'rec_gym',
        name: 'Gym membership',
        kind: 'subscription',
        amount: 24_000,
        minAmount: 24_000,
        maxAmount: 24_000,
        cadence: 'annual',
        day: 4,
        month: 11,
        accountId: ACC.au,
        categoryId: CAT.health,
        priority: 'normal',
        confidence: 1,
        usage: 3,
        autopay: false,
        active: true,
        startedOn: monthsAgo(today(), 20),
        notes: '',
      },
      {
        id: 'rec_ft',
        name: 'FT Digital',
        kind: 'subscription',
        amount: 1_900,
        minAmount: 1_900,
        maxAmount: 1_900,
        cadence: 'quarterly',
        day: 16,
        accountId: ACC.au,
        categoryId: CAT.subs,
        priority: 'normal',
        confidence: 1,
        usage: 2,
        autopay: true,
        active: true,
        startedOn: monthsAgo(today(), 14),
        notes: '',
      },
    ],

    goals: [
      {
        id: 'goal_ef',
        name: 'Emergency fund',
        icon: '🛟',
        emergencyFund: true,
        target: 3_60_000,
        saved: 2_45_000,
        monthlyContribution: 8_000,
        accountId: ACC.axis,
      },
      {
        id: 'goal_trip',
        name: 'Japan trip',
        icon: '✈️',
        emergencyFund: false,
        target: 2_40_000,
        saved: 62_000,
        monthlyContribution: 6_000,
        accountId: ACC.axis,
      },
    ],

    rules: [
      {
        id: 'rule_salary',
        name: 'When salary arrives',
        trigger: { type: 'income_received', recurringId: 'rec_salary' },
        actions: [
          { type: 'top_up_to_target', fromAccountId: ACC.icici, toAccountId: ACC.au },
          { type: 'sweep_excess', fromAccountId: ACC.icici, toAccountId: ACC.axis, keep: 30_000 },
        ],
        enabled: true,
        rationale:
          'Bills get funded before anything else. What is left above one month of everyday spending has no job sitting in the spending account, so it moves to savings.',
        order: 1,
      },
      {
        id: 'rule_bills_low',
        name: 'If the bills account runs low',
        trigger: { type: 'account_below_target', accountId: ACC.au },
        actions: [{ type: 'top_up_to_target', fromAccountId: ACC.axis, toAccountId: ACC.au }],
        enabled: true,
        rationale:
          'Savings exist so a bill never depends on timing. Topping up costs nothing and removes the failure mode.',
        order: 2,
      },
      {
        id: 'rule_spending_low',
        name: 'If the spending account runs low',
        trigger: { type: 'account_below_target', accountId: ACC.icici },
        actions: [{ type: 'top_up_to_target', fromAccountId: ACC.axis, toAccountId: ACC.icici }],
        enabled: true,
        rationale:
          'Everyday spending is lumpy and salary only arrives once. Rather than leave a whole month of it parked in the spending account, top it up from savings when it actually runs down.',
        order: 3,
      },
    ],

    transactions: buildHistory(rand),
    deletedTransactionIds: [],
  }
}

/* ------------------------------------------------------------------ *
 * Synthetic history
 * ------------------------------------------------------------------ */

function monthsAgo(base: string, n: number): string {
  const d = fromISO(base)
  d.setMonth(d.getMonth() - n)
  return dayOfMonthIn(d.getFullYear(), d.getMonth() + 1, Math.min(d.getDate(), 28))
}

/**
 * Three months of everyday spending. Recurring items are NOT written here —
 * the forecast generates those from the schedules, and writing them as
 * transactions too would count every bill twice.
 */
function buildHistory(rand: () => number): Transaction[] {
  const out: Transaction[] = []
  const base = fromISO(today())
  const todayISO = today()
  let n = 0

  const shops = ['BigBasket', 'DMart', 'Local kirana', 'Blinkit', 'Nature’s Basket']
  const food = ['Swiggy', 'Zomato', 'Third Wave Coffee', 'Toit', 'Local cafe']
  const rides = ['Uber', 'Ola', 'Metro card', 'Fuel']
  const shopping = ['Amazon', 'Myntra', 'Decathlon', 'Zara']
  const fun = ['PVR', 'BookMyShow', 'Steam', 'Concert']

  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length) % arr.length]
  const jit = (v: number, s: number) => Math.round((v + (rand() - 0.5) * s) / 10) * 10

  const add = (
    date: string,
    description: string,
    amount: number,
    accountId: string,
    categoryId: string,
  ) => {
    if (date > todayISO) return
    out.push({
      id: `tx_seed_${n++}`,
      date,
      description,
      amount,
      accountId,
      categoryId,
      note: '',
      transfer: false,
    })
  }

  // Walk back 92 days so the current month is partially filled, which is what
  // a real ledger looks like mid-month.
  for (let back = 92; back >= 0; back--) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - back)
    const date = dayOfMonthIn(d.getFullYear(), d.getMonth() + 1, d.getDate())
    const dow = d.getDay()

    // Tuned so everyday spending lands near ₹25,000 a month — below the seeded
    // budgets and inside what the sweep rule leaves in the spending account.
    // A demo profile that quietly overdraws itself teaches the wrong thing.
    if (rand() < 0.32) add(date, pick(shops), -jit(850, 620), ACC.icici, CAT.groceries)
    if (rand() < 0.34) add(date, pick(food), -jit(430, 340), ACC.amex, CAT.dining)
    if (rand() < 0.42) add(date, pick(rides), -jit(200, 160), ACC.icici, CAT.transport)
    if (rand() < 0.1) add(date, pick(shopping), -jit(1_900, 1_500), ACC.amex, CAT.shopping)
    if ((dow === 5 || dow === 6) && rand() < 0.22) add(date, pick(fun), -jit(800, 600), ACC.hdfc, CAT.fun)
    if (rand() < 0.05) add(date, 'Pharmacy', -jit(550, 350), ACC.icici, CAT.health)
    if (rand() < 0.03) add(date, 'Cash withdrawal', -jit(1_800, 900), ACC.icici, CAT.other)
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** A brand-new user starts empty apart from the categories. */
export function emptyState(): FinancialState {
  return {
    version: 2,
    settings: { ownerName: '', emergencyFundMonths: 6, forecastConservatism: 0.3, compact: false },
    accounts: [],
    categories: DEFAULT_CATEGORIES,
    transactions: [],
    recurring: [],
    goals: [],
    rules: [],
    deletedTransactionIds: [],
  }
}
