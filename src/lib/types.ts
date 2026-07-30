import { z } from 'zod'

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** ISO date, `YYYY-MM-DD`. Everything in the system is date-resolution. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const priority = z.enum(['critical', 'high', 'medium', 'low'])
export type Priority = z.infer<typeof priority>

/**
 * What an account is *for*. Roles drive the rule engine and the funding
 * lookups, so nothing about the architecture is hardcoded to a bank name —
 * ICICI/AU/Axis are just the seed values for these three roles.
 */
export const accountRole = z.enum([
  'income_hub', // salary lands here, acts as the operating account
  'bills', // every obligation is paid out of here
  'reserve', // emergency fund, investment funding, spare liquidity
  'investment', // brokerage / folio cash
  'credit', // a liability, not an asset
])
export type AccountRole = z.infer<typeof accountRole>

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export const account = z.object({
  id: z.string(),
  name: z.string().min(1),
  institution: z.string(),
  role: accountRole,
  balance: z.number(),
  /** The balance this account *should* hold. Drives top-up recommendations. */
  targetBalance: z.number().nonnegative(),
  /** Hard floor. Dipping below this is a red event, not a warning. */
  minBuffer: z.number().nonnegative(),
  accent: z.string(),
  notes: z.string().optional(),
})
export type Account = z.infer<typeof account>

/* ------------------------------------------------------------------ *
 * Income
 * ------------------------------------------------------------------ */

export const incomeSource = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.enum(['salary', 'bond', 'allowance', 'freelance', 'other']),
  expectedAmount: z.number().nonnegative(),
  /** Expected range, because nothing here is a fixed number. */
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().nonnegative(),
  /** Arrival window as days-of-month, inclusive. e.g. salary 28 → 31. */
  windowStart: z.number().int().min(1).max(31),
  windowEnd: z.number().int().min(1).max(31),
  accountId: z.string(),
  /** 0–1. How reliably this has actually shown up. Decays the forecast. */
  confidence: z.number().min(0).max(1),
  /** Trailing receipts, newest last. Feeds average + variance. */
  history: z.array(z.object({ date: isoDate, amount: z.number() })),
  active: z.boolean(),
  notes: z.string().optional(),
})
export type IncomeSource = z.infer<typeof incomeSource>

/* ------------------------------------------------------------------ *
 * Obligations
 * ------------------------------------------------------------------ */

export const bill = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string(),
  expectedAmount: z.number().nonnegative(),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().nonnegative(),
  dueDay: z.number().int().min(1).max(31),
  /** Days of slack after the due date before this genuinely hurts. */
  graceDays: z.number().int().min(0),
  priority,
  fundingAccountId: z.string(),
  autopay: z.boolean(),
  active: z.boolean(),
  notes: z.string().optional(),
})
export type Bill = z.infer<typeof bill>

export const subscription = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: z.string(),
  amount: z.number().nonnegative(),
  cycle: z.enum(['monthly', 'quarterly', 'annual']),
  /** Day of month it renews (for annual, paired with renewalMonth). */
  renewalDay: z.number().int().min(1).max(31),
  renewalMonth: z.number().int().min(1).max(12).optional(),
  accountId: z.string(),
  /** 0–10 self-rated. Below 4 with real spend triggers a cancel suggestion. */
  usageScore: z.number().min(0).max(10),
  startedOn: isoDate,
  active: z.boolean(),
})
export type Subscription = z.infer<typeof subscription>

/* ------------------------------------------------------------------ *
 * Investments
 * ------------------------------------------------------------------ */

export const holding = z.object({
  id: z.string(),
  name: z.string().min(1),
  ticker: z.string().optional(),
  kind: z.enum(['mutual_fund', 'stock', 'etf', 'bond', 'gold', 'cash']),
  units: z.number().nonnegative(),
  avgCost: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  sector: z.string(),
  assetClass: z.enum(['equity', 'debt', 'gold', 'cash', 'alternative']),
  /** Cashflow log for XIRR: negative = invested, positive = redeemed. */
  flows: z.array(z.object({ date: isoDate, amount: z.number() })),
  dividendsYtd: z.number().nonnegative().default(0),
})
export type Holding = z.infer<typeof holding>

export const sip = z.object({
  id: z.string(),
  name: z.string().min(1),
  amount: z.number().nonnegative(),
  day: z.number().int().min(1).max(31),
  accountId: z.string(),
  holdingId: z.string().optional(),
  active: z.boolean(),
})
export type Sip = z.infer<typeof sip>

/* ------------------------------------------------------------------ *
 * Credit
 * ------------------------------------------------------------------ */

export const creditCard = z.object({
  id: z.string(),
  name: z.string().min(1),
  issuer: z.string(),
  limit: z.number().positive(),
  currentBalance: z.number().nonnegative(),
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  paymentAccountId: z.string(),
  apr: z.number().nonnegative(),
  active: z.boolean(),
})
export type CreditCard = z.infer<typeof creditCard>

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const goal = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: z.enum(['emergency_fund', 'purchase', 'travel', 'custom']),
  target: z.number().nonnegative(),
  current: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative(),
  accountId: z.string(),
  targetDate: isoDate.optional(),
  priority,
})
export type Goal = z.infer<typeof goal>

/* ------------------------------------------------------------------ *
 * Rule engine
 * ------------------------------------------------------------------ */

export const ruleTrigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('income_received'), incomeId: z.string().optional() }),
  z.object({ type: z.literal('account_below_target'), accountId: z.string() }),
  z.object({ type: z.literal('account_above'), accountId: z.string(), amount: z.number() }),
  z.object({ type: z.literal('goal_complete'), goalId: z.string() }),
  z.object({ type: z.literal('day_of_month'), day: z.number().int().min(1).max(31) }),
])
export type RuleTrigger = z.infer<typeof ruleTrigger>

export const ruleAction = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('top_up_to_target'),
    fromAccountId: z.string(),
    toAccountId: z.string(),
  }),
  z.object({
    type: z.literal('transfer_fixed'),
    fromAccountId: z.string(),
    toAccountId: z.string(),
    amount: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal('sweep_excess'),
    fromAccountId: z.string(),
    toAccountId: z.string(),
    /** Leave this much behind in the source account. */
    keep: z.number().nonnegative(),
  }),
  z.object({ type: z.literal('fund_sips'), fromAccountId: z.string() }),
  z.object({ type: z.literal('recommend'), message: z.string() }),
])
export type RuleAction = z.infer<typeof ruleAction>

export const rule = z.object({
  id: z.string(),
  name: z.string().min(1),
  trigger: ruleTrigger,
  actions: z.array(ruleAction),
  enabled: z.boolean(),
  /** Shown verbatim in the ledger so every automated move is explained. */
  rationale: z.string(),
  order: z.number().int(),
})
export type Rule = z.infer<typeof rule>

/* ------------------------------------------------------------------ *
 * Ledger
 * ------------------------------------------------------------------ */

export const transaction = z.object({
  id: z.string(),
  date: isoDate,
  description: z.string(),
  amount: z.number(),
  accountId: z.string(),
  category: z.string(),
  kind: z.enum(['income', 'bill', 'subscription', 'investment', 'transfer', 'discretionary', 'credit']),
})
export type Transaction = z.infer<typeof transaction>

/* ------------------------------------------------------------------ *
 * Settings + root
 * ------------------------------------------------------------------ */

export const settings = z.object({
  ownerName: z.string(),
  currency: z.string(),
  locale: z.string(),
  /** Baseline day-to-day spend not captured by bills. Used in the forecast. */
  discretionaryMonthly: z.number().nonnegative(),
  emergencyFundMonths: z.number().positive(),
  riskTolerance: z.enum(['conservative', 'balanced', 'aggressive']),
  /** Forecast pessimism: 0 = use expected, 1 = use the low end of every range. */
  forecastConservatism: z.number().min(0).max(1),
})
export type Settings = z.infer<typeof settings>

export const financialState = z.object({
  version: z.literal(1),
  settings,
  accounts: z.array(account),
  income: z.array(incomeSource),
  bills: z.array(bill),
  subscriptions: z.array(subscription),
  holdings: z.array(holding),
  sips: z.array(sip),
  cards: z.array(creditCard),
  goals: z.array(goal),
  rules: z.array(rule),
  transactions: z.array(transaction),
})
export type FinancialState = z.infer<typeof financialState>
