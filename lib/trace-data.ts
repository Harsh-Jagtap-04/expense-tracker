// ── Types ───────────────────────────────────────────────────

export type Transaction = {
  id: string
  user_id: string
  title: string
  category: string
  type: string
  amount: number
  date: string
  person: string
  investment_kind?: string | null
  recurring?: boolean
  notes?: string | null
  created_at?: string
}

export type UserProfile = {
  user_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  date_of_birth: string | null
  bio: string | null
  email: string
  created_at?: string
  updated_at?: string
  created_at_auth?: string
}

export type UserSettings = {
  user_id: string
  currency: string
  locale: string
  date_format: string
  month_start: number
  monthly_budget: number
  theme: string
  notifications_enabled: boolean
  budget_alert_threshold: number
}

export type Category = {
  id: string
  user_id: string
  name: string
  icon: string
  color: string
  is_default: boolean
  sort_order: number
  created_at?: string
}

export type TransactionTypeRow = {
  id: string
  user_id: string
  name: string
  color: string
  is_default: boolean
  created_at?: string
}

export type PersonTag = {
  id: string
  user_id: string
  name: string
  is_default: boolean
  created_at?: string
}

export type InvestmentKind = {
  id: string
  user_id: string
  name: string
  is_default: boolean
  created_at?: string
}

export type MonthlyAggregate = {
  name: string
  income: number
  expenses: number
  investments: number
  [key: string]: string | number
}

// ── Defaults (used only as fallback before DB loads) ────────

export const defaultSettings: UserSettings = {
  user_id: '',
  currency: 'INR',
  locale: 'en-IN',
  date_format: 'DD MMM YYYY',
  month_start: 1,
  monthly_budget: 65000,
  theme: 'light',
  notifications_enabled: true,
  budget_alert_threshold: 80,
}

export const defaultCategories = ['Home', 'Food', 'Transport', 'Subscriptions', 'Health', 'Family', 'Work', 'Shopping', 'Investments', 'Other']

// ── Utility functions ──────────────────────────────────────

export function formatMoney(amount: number, currency: string = 'INR') {
  const localeMap: Record<string, string> = {
    INR: 'en-IN',
    USD: 'en-US',
    EUR: 'de-DE',
    GBP: 'en-GB',
  }
  return new Intl.NumberFormat(localeMap[currency] || 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function sumBy(transactions: Transaction[], predicate: (t: Transaction) => boolean) {
  return transactions.filter(predicate).reduce((sum, t) => sum + Number(t.amount), 0)
}

export function categoryTotals(transactions: Transaction[]) {
  return Object.entries(
    transactions
      .filter(t => t.type === 'Expense')
      .reduce<Record<string, number>>((result, t) => {
        result[t.category] = (result[t.category] || 0) + Number(t.amount)
        return result
      }, {})
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

export function getInitials(firstName?: string | null, lastName?: string | null, email?: string) {
  if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase()
  if (firstName) return firstName.substring(0, 2).toUpperCase()
  if (email) return email.substring(0, 2).toUpperCase()
  return 'U'
}

export function getDisplayName(firstName?: string | null, lastName?: string | null, email?: string) {
  if (firstName && lastName) return `${firstName} ${lastName}`
  if (firstName) return firstName
  return email || 'User'
}
