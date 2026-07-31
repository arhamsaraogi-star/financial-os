import { z } from 'zod'

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** ISO date, `YYYY-MM-DD`. Everything in the system is date-resolution. */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const priority = z.enum(['critical', 'high', 'normal'])
export type Priority = z.infer<typeof priority>

/**
 * What an account is for.
 *
 * Credit cards are accounts too, with a negative balance meaning money owed.
 * Keeping them in one list means a transaction, a transfer and a balance work
 * identically everywhere — the alternative was a parallel set of rules for
 * cards that got every sign convention subtly wrong.
 */
export const accountKind = z.enum([
  'spending', // everyday account, where income lands
  'bills', // dedicated account obligations are paid from
  'savings', // reserve, emergency fund, goals
  'credit', // a card. balance <= 0. -5000 means ₹5,000 owed.
])
export type AccountKind = z.infer<typeof accountKind>

export const account = z.object({
  id: z.string(),
  name: z.string().min(1),
  institution: z.string().default(''),
  kind: accountKind,
  /** Cash held. For a credit account this is zero or negative. */
  balance: z.number(),
  /** What this account should hold. Drives top-up suggestions. Cash only. */
  targetBalance: z.number().nonnegative().default(0),
  /** Falling below this is flagged. Cash only. */
  minBuffer: z.number().nonnegative().default(0),
  accent: z.string(),
  archived: z.boolean().default(false),
  notes: z.string().default(''),

  // Credit-only fields.
  creditLimit: z.number().nonnegative().optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  apr: z.number().nonnegative().optional(),
  /** Which account clears this card. Falls back to the bills account. */
  paymentAccountId: z.string().optional(),
})
export type Account = z.infer<typeof account>

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

export const category = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Single emoji. Cheap, universal, and needs no icon font. */
  icon: z.string().default('•'),
  colour: z.string(),
  /** Monthly cap. 0 means untracked. */
  budget: z.number().nonnegative().default(0),
  kind: z.enum(['expense', 'income']).default('expense'),
})
export type Category = z.infer<typeof category>

/* ------------------------------------------------------------------ *
 * Transactions — the thing the user actually touches every day
 * ------------------------------------------------------------------ */

export const transaction = z.object({
  id: z.string(),
  date: isoDate,
  /** What it was. Doubles as the autocomplete key. */
  description: z.string().min(1),
  /** Negative = money out, positive = money in. Always from the account's view. */
  amount: z.number(),
  accountId: z.string(),
  categoryId: z.string(),
  note: z.string().default(''),
  /** Moving money between your own accounts is not income or spending. */
  transfer: z.boolean().default(false),
  /** The other side of a transfer. */
  transferAccountId: z.string().optional(),
  /** Set when generated from a recurring rule, so it is not double-counted. */
  recurringId: z.string().optional(),
})
export type Transaction = z.infer<typeof transaction>

/* ------------------------------------------------------------------ *
 * Recurring money — one shape for income, bills and subscriptions
 * ------------------------------------------------------------------ *
 *
 * These were three separate entities. They differ only in sign and cadence,
 * and keeping them apart meant three editors, three list screens and three
 * sets of nearly identical code.
 */

export const recurringKind = z.enum(['income', 'bill', 'subscription'])
export type RecurringKind = z.infer<typeof recurringKind>

export const recurring = z.object({
  id: z.string(),
  name: z.string().min(1),
  kind: recurringKind,
  /** Always positive. `kind` decides the direction. */
  amount: z.number().nonnegative(),
  /** Expected spread, for things like electricity. Equal values = fixed. */
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().nonnegative(),
  cadence: z.enum(['monthly', 'quarterly', 'annual']),
  /** Day of month it lands or is due. */
  day: z.number().int().min(1).max(31),
  /** For annual items. */
  month: z.number().int().min(1).max(12).optional(),
  /** Income only: the arrival window closes here. `day` is when it opens. */
  dayEnd: z.number().int().min(1).max(31).optional(),
  accountId: z.string(),
  categoryId: z.string(),
  priority: priority.default('normal'),
  /** Income only, 0–1. Scales the source down in the forecast. */
  confidence: z.number().min(0).max(1).default(1),
  /** Subscriptions only, 0–10. Low usage plus real spend gets flagged. */
  usage: z.number().min(0).max(10).default(5),
  autopay: z.boolean().default(false),
  active: z.boolean().default(true),
  startedOn: isoDate.optional(),
  notes: z.string().default(''),
})
export type Recurring = z.infer<typeof recurring>

/* ------------------------------------------------------------------ *
 * Goals
 * ------------------------------------------------------------------ */

export const goal = z.object({
  id: z.string(),
  name: z.string().min(1),
  icon: z.string().default('◎'),
  emergencyFund: z.boolean().default(false),
  target: z.number().nonnegative(),
  saved: z.number().nonnegative(),
  monthlyContribution: z.number().nonnegative(),
  accountId: z.string(),
  targetDate: isoDate.optional(),
})
export type Goal = z.infer<typeof goal>

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

export const ruleTrigger = z.discriminatedUnion('type', [
  z.object({ type: z.literal('income_received'), recurringId: z.string().optional() }),
  z.object({ type: z.literal('account_below_target'), accountId: z.string() }),
  z.object({ type: z.literal('day_of_month'), day: z.number().int().min(1).max(31) }),
])
export type RuleTrigger = z.infer<typeof ruleTrigger>

export const ruleAction = z.discriminatedUnion('type', [
  z.object({ type: z.literal('top_up_to_target'), fromAccountId: z.string(), toAccountId: z.string() }),
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
    keep: z.number().nonnegative(),
  }),
])
export type RuleAction = z.infer<typeof ruleAction>

export const rule = z.object({
  id: z.string(),
  name: z.string().min(1),
  trigger: ruleTrigger,
  actions: z.array(ruleAction),
  enabled: z.boolean(),
  /** Plain-English reason, shown wherever this rule moves money. */
  rationale: z.string(),
  order: z.number().int(),
})
export type Rule = z.infer<typeof rule>

/* ------------------------------------------------------------------ *
 * Settings + root
 * ------------------------------------------------------------------ */

export const settings = z.object({
  ownerName: z.string().default(''),
  emergencyFundMonths: z.number().positive().default(6),
  /** 0 = plan for expected amounts, 1 = plan for the worst end of every range. */
  forecastConservatism: z.number().min(0).max(1).default(0.3),
  /** Show the running-total column and denser tables. */
  compact: z.boolean().default(false),
})
export type Settings = z.infer<typeof settings>

export const financialState = z.object({
  version: z.literal(2),
  settings,
  accounts: z.array(account),
  categories: z.array(category),
  transactions: z.array(transaction),
  recurring: z.array(recurring),
  goals: z.array(goal),
  rules: z.array(rule),
})
export type FinancialState = z.infer<typeof financialState>
