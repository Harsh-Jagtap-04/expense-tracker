'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getTransactions(month?: number, year?: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (month !== undefined && year !== undefined) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endMonth = month === 12 ? 1 : month + 1
    const endYear = month === 12 ? year + 1 : year
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
    query = query.gte('date', startDate).lt('date', endDate)
  }

  const { data, error } = await query
  if (error) { console.error('getTransactions error:', error); return [] }
  return data || []
}

export async function addTransaction(formData: {
  title: string
  category: string
  type: string
  amount: number
  date: string
  person: string
  investment_kind?: string
  recurring?: boolean
  notes?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase.from('transactions').insert({
    user_id: user.id,
    title: formData.title,
    category: formData.category,
    type: formData.type,
    amount: formData.amount,
    date: formData.date,
    person: formData.person,
    investment_kind: formData.investment_kind || null,
    recurring: formData.recurring || false,
    notes: formData.notes || null,
  })

  if (error) { console.error('addTransaction error:', error); return { error: error.message } }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function updateTransaction(id: string, formData: Partial<{
  title: string
  category: string
  type: string
  amount: number
  date: string
  person: string
  investment_kind: string
  recurring: boolean
  notes: string
}>) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('transactions')
    .update(formData)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) { console.error('updateTransaction error:', error); return { error: error.message } }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) { console.error('deleteTransaction error:', error); return { error: error.message } }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function getMonthlyAggregates(year: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const startDate = `${year}-01-01`
  const endDate = `${year + 1}-01-01`

  const { data, error } = await supabase
    .from('transactions')
    .select('type, amount, date')
    .eq('user_id', user.id)
    .gte('date', startDate)
    .lt('date', endDate)

  if (error) { console.error('getMonthlyAggregates error:', error); return [] }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const agg = months.map(m => ({ name: m, income: 0, expenses: 0, investments: 0 }))

  for (const row of data || []) {
    const monthIdx = new Date(row.date).getMonth()
    if (row.type === 'Income') agg[monthIdx].income += Number(row.amount)
    else if (row.type === 'Expense') agg[monthIdx].expenses += Number(row.amount)
    else if (row.type === 'Investment') agg[monthIdx].investments += Number(row.amount)
  }

  return agg
}

export async function clearAllTransactions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', user.id)

  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { success: true }
}

export async function exportTransactionsCSV() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated', csv: '' }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  if (error) return { error: error.message, csv: '' }

  const headers = 'Date,Title,Category,Type,Amount,Person,Investment Kind,Recurring,Notes'
  const rows = (data || []).map(t =>
    `${t.date},"${t.title}","${t.category}","${t.type}",${t.amount},"${t.person}","${t.investment_kind || ''}",${t.recurring || false},"${t.notes || ''}"`
  )

  return { csv: [headers, ...rows].join('\n') }
}
