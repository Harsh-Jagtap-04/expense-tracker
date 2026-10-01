'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, BarChart3, CalendarDays, Camera, Check, ChevronDown, CircleHelp, CreditCard, Download, Edit2, FileText, Home, Loader2, LogOut, Menu, Palette, Plus, Printer, Search, Settings, Shield, Sparkles, Tag, Trash2, TrendingDown, TrendingUp, User, Wallet, X, Zap } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { categoryTotals, defaultSettings, formatMoney, getDisplayName, getInitials, sumBy, type Category, type InvestmentKind, type MonthlyAggregate, type PersonTag, type Transaction, type TransactionTypeRow, type UserProfile, type UserSettings } from '@/lib/trace-data'
import { createClient } from '@/lib/supabase/client'
import { parseTransactionText } from '@/app/actions/parse'
// ── Data fetching hooks ─────────────────────────────────────

function useSupabaseData() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [settings, setSettings] = useState<UserSettings>(defaultSettings)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [transactionTypes, setTransactionTypes] = useState<TransactionTypeRow[]>([])
  const [personTags, setPersonTags] = useState<PersonTag[]>([])
  const [investmentKinds, setInvestmentKinds] = useState<InvestmentKind[]>([])
  const [yearData, setYearData] = useState<MonthlyAggregate[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const year = new Date().getFullYear()
    const startDate = `${year}-01-01`
    const endDate = `${year + 1}-01-01`

    const [profileRes, settingsRes, txRes, catRes, typesRes, tagsRes, kindsRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).single(),
      supabase.from('user_settings').select('*').eq('user_id', user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('categories').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }),
      supabase.from('transaction_types').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('person_tags').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('investment_kinds').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])

    if (profileRes.data) setProfile({ ...profileRes.data, email: user.email || '', created_at_auth: user.created_at })
    if (settingsRes.data) setSettings(settingsRes.data)
    
    let finalCategories = catRes.data || []
    let finalTypes = typesRes.data || []
    let finalPersonTags = tagsRes.data || []
    let finalInvestmentKinds = kindsRes.data || []

    if (txRes.data) {
      setTransactions(txRes.data)
      
      const usedCategories = Array.from(new Set(txRes.data.map((t: any) => t.category).filter(Boolean))) as string[]
      usedCategories.forEach(name => {
        if (!finalCategories.find((c: any) => c.name === name)) {
          finalCategories.push({ id: name, user_id: user.id, name, icon: 'tag', color: '#64748b', is_default: false, sort_order: 999 })
        }
      })

      const usedTypes = Array.from(new Set(txRes.data.map((t: any) => t.type).filter(Boolean))) as string[]
      usedTypes.forEach(name => {
        if (!finalTypes.find((c: any) => c.name === name)) {
          finalTypes.push({ id: name, user_id: user.id, name, color: '#64748b', is_default: false, sort_order: 999 })
        }
      })

      const usedPersons = Array.from(new Set(txRes.data.map((t: any) => t.person).filter(Boolean))) as string[]
      usedPersons.forEach(name => {
        if (!finalPersonTags.find((c: any) => c.name === name)) {
          finalPersonTags.push({ id: name, user_id: user.id, name, color: '#64748b', is_default: false, sort_order: 999 })
        }
      })

      const usedKinds = Array.from(new Set(txRes.data.map((t: any) => t.investment_kind).filter(Boolean))) as string[]
      usedKinds.forEach(name => {
        if (!finalInvestmentKinds.find((c: any) => c.name === name)) {
          finalInvestmentKinds.push({ id: name, user_id: user.id, name, color: '#64748b', is_default: false, sort_order: 999 })
        }
      })
    }

    setCategories(finalCategories)
    setTransactionTypes(finalTypes)
    setPersonTags(finalPersonTags)
    setInvestmentKinds(finalInvestmentKinds)

    // Compute year aggregates
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const agg = months.map(m => {
      const base: MonthlyAggregate = { name: m, income: 0, expenses: 0, investments: 0 }
      if (kindsRes.data) {
        kindsRes.data.forEach((k: any) => {
          base[k.name] = 0
        })
      }
      return base
    })
    for (const tx of txRes.data || []) {
      const d = new Date(tx.date)
      if (d.getFullYear() === year) {
        const idx = d.getMonth()
        if (tx.type === 'Income') agg[idx].income += Number(tx.amount)
        else if (tx.type === 'Expense') agg[idx].expenses += Number(tx.amount)
        else if (tx.type === 'Investment') {
          agg[idx].investments += Number(tx.amount)
          if (tx.investment_kind) {
            agg[idx][tx.investment_kind] = (Number(agg[idx][tx.investment_kind]) || 0) + Number(tx.amount)
          }
        }
      }
    }
    setYearData(agg)
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  return { profile, setProfile, settings, setSettings, transactions, setTransactions, categories, setCategories, transactionTypes, setTransactionTypes, personTags, setPersonTags, investmentKinds, setInvestmentKinds, yearData, loading, refetch: fetchAll }
}

// ── Helpers ─────────────────────────────────────────────────

function money(n: number, currency: string = 'INR') { return formatMoney(n, currency) }

function Spinner() { return <div className="flex items-center justify-center py-20"><Loader2 className="size-8 animate-spin text-primary" /></div> }

// ── Shared UI ───────────────────────────────────────────────

function Logo() { return <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold tracking-tight"><img src="/logo.png" alt="ExpenseTracker Logo" className="size-8 rounded-lg object-cover" />ExpenseTracker</Link> }

function Sidebar({ close, profile }: { close?: () => void; profile: UserProfile | null }) {
  const path = usePathname()
  const nav = [
    { href: '/dashboard', label: 'Overview', icon: Home },
    { href: '/dashboard/log', label: 'Log transaction', icon: Plus },
    { href: '/dashboard/monthly', label: 'Monthly summary', icon: CalendarDays },
    { href: '/dashboard/yearly', label: 'Yearly summary', icon: BarChart3 },
  ]
  const initials = getInitials(profile?.first_name, profile?.last_name, profile?.email)
  const name = getDisplayName(profile?.first_name, profile?.last_name, profile?.email)

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card px-4 py-5">
      <div className="flex items-center justify-between px-2"><Logo />{close && <button onClick={close} className="rounded-md p-2 text-muted-foreground hover:bg-muted" aria-label="Close menu"><X size={18} /></button>}</div>
      <nav className="mt-10 flex flex-1 flex-col gap-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} onClick={close} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${path === href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon size={17} />{label}</Link>
        ))}
      </nav>
      <div className="space-y-1 border-t border-border pt-4">
        <Link href="/dashboard/settings" className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted"><Settings size={17} />Settings</Link>
        <Link href="/dashboard/profile" className="mt-2 flex items-center gap-3 rounded-lg bg-muted p-3">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="size-8 rounded-full object-cover" />
          ) : (
            <div className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.email || ''}</p>
          </div>
          <ChevronDown size={15} className="ml-auto text-muted-foreground" />
        </Link>
      </div>
    </aside>
  )
}

function Shell({ children, profile }: { children: React.ReactNode; profile: UserProfile | null }) {
  const [open, setOpen] = useState(false)
  const initials = getInitials(profile?.first_name, profile?.last_name, profile?.email)

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-y-0 left-0 z-30 hidden md:block print:hidden"><Sidebar profile={profile} /></div>
      {open && <div className="fixed inset-0 z-40 md:hidden print:hidden"><div className="absolute inset-0 bg-foreground/20" onClick={() => setOpen(false)} /><div className="relative h-full w-72"><Sidebar close={() => setOpen(false)} profile={profile} /></div></div>}
      <div className="md:pl-64 print:pl-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur md:px-8 print:hidden">
          <button className="rounded-md p-2 hover:bg-muted md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex"><span>Workspace</span><span>/</span><span className="text-foreground">Personal</span></div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/profile">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="size-8 rounded-full object-cover" />
              ) : (
                <div className="grid size-8 place-items-center rounded-full bg-[#dbeafe] text-xs font-semibold text-[#1d4ed8]">{initials}</div>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8 md:px-8">{children}</main>
      </div>
    </div>
  )
}

function PageHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{title}</h1></div>{action}</div>
}

function Metric({ label, value, change, positive, icon: Icon }: { label: string; value: string; change: string; positive: boolean; icon: any }) {
  return <div className="rounded-xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon size={17} className="text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className={`mt-2 text-xs font-medium ${positive ? 'text-emerald-600' : 'text-rose-600'}`}>{change} <span className="font-normal text-muted-foreground">from last month</span></p></div>
}

function TxRow({ tx, currency = 'INR', onDelete, onEditTitle }: { tx: Transaction; currency?: string; onDelete?: (id: string) => void; onEditTitle?: (id: string, newTitle: string) => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(tx.title)

  const handleSave = () => {
    if (onEditTitle && editTitle.trim() !== tx.title) {
      onEditTitle(tx.id, editTitle.trim())
    }
    setIsEditing(false)
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${tx.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : tx.type === 'Investment' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-600'}`}>{tx.type === 'Income' ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}</span>
        <div className="min-w-0">
          {isEditing ? (
            <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onBlur={handleSave} onKeyDown={e => { if (e.key === 'Enter') handleSave() }} className="h-6 w-full max-w-[180px] rounded border border-input bg-background px-1 text-sm font-medium outline-none" />
          ) : (
            <p className="truncate text-sm font-medium">{tx.title}</p>
          )}
          <p className="text-xs text-muted-foreground">{tx.category} · {tx.person} · {tx.date}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <p className={`shrink-0 text-sm font-semibold sm:mr-2 ${tx.type === 'Income' ? 'text-emerald-600' : tx.type === 'Investment' ? 'text-amber-600' : 'text-foreground'}`}>{tx.type === 'Income' ? '+' : '-'}{money(Number(tx.amount), currency)}</p>
        {onEditTitle && (
          isEditing ? (
            <button onClick={handleSave} className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50 transition-colors" title="Save"><Check size={14} /></button>
          ) : (
            <button onClick={() => setIsEditing(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground transition-colors" title="Edit title"><Edit2 size={14} /></button>
          )
        )}
        {onDelete && <button onClick={() => onDelete(tx.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={14} /></button>}
      </div>
    </div>
  )
}

// ── Overview ────────────────────────────────────────────────

function Overview({ transactions, settings, yearData, profile, onRefetch }: { transactions: Transaction[]; settings: UserSettings; yearData: MonthlyAggregate[]; profile: UserProfile | null; onRefetch: () => void }) {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const monthTx = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const income = sumBy(monthTx, t => t.type === 'Income')
  const expenses = sumBy(monthTx, t => t.type === 'Expense')
  const investments = sumBy(monthTx, t => t.type === 'Investment')
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.first_name || 'there'

  const handleEditTitle = async (id: string, newTitle: string) => {
    const supabase = createClient()
    await supabase.from('transactions').update({ title: newTitle }).eq('id', id)
    onRefetch()
  }

  const handleDelete = async (id: string) => {
    const supabase = createClient()
    await supabase.from('transactions').delete().eq('id', id)
    onRefetch()
  }

  return (
    <>
      <PageHeader
        eyebrow={`${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`}
        title={`${greeting}, ${firstName}.`}
        action={<Link href="/dashboard/log" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"><Plus size={17} />Log transaction</Link>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Balance" value={money(income - expenses - investments, settings.currency)} change={income > 0 ? '+' + ((income - expenses - investments) / income * 100).toFixed(1) + '%' : '—'} positive={income - expenses - investments > 0} icon={Wallet} />
        <Metric label="Income this month" value={money(income, settings.currency)} change={income > 0 ? 'this month' : '—'} positive icon={TrendingUp} />
        <Metric label="Expenses this month" value={money(expenses, settings.currency)} change={settings.monthly_budget > 0 ? ((expenses / settings.monthly_budget) * 100).toFixed(0) + '% of budget' : '—'} positive={expenses < settings.monthly_budget} icon={TrendingDown} />
        <Metric label="Invested this month" value={money(investments, settings.currency)} change={investments > 0 ? 'active' : '—'} positive icon={Zap} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Cash flow</h2><p className="text-sm text-muted-foreground">Income vs. expenses</p></div></div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={yearData}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${money(v, settings.currency).charAt(0)}${v / 1000}k`} />
                <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                <Area type="monotone" dataKey="income" stroke="#0f766e" fill="#ccfbf1" strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#94a3b8" fill="#f1f5f9" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex gap-5 text-xs text-muted-foreground"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-primary" />Income</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-slate-400" />Expenses</span></div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between"><div><h2 className="font-semibold">Recent transactions</h2><p className="text-sm text-muted-foreground">Your latest activity</p></div><Link href="/dashboard/log" className="text-xs font-medium text-primary hover:underline">View all</Link></div>
          {monthTx.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No transactions this month. <Link href="/dashboard/log" className="text-primary hover:underline">Log one now</Link></p>}
          {monthTx.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} currency={settings.currency} onDelete={handleDelete} onEditTitle={handleEditTitle} />)}
        </section>
      </div>
    </>
  )
}

// ── Log ─────────────────────────────────────────────────────

function Log({ transactions, categories, transactionTypes, personTags, investmentKinds, settings, onRefetch }: {
  transactions: Transaction[]; categories: Category[]; transactionTypes: TransactionTypeRow[]; personTags: PersonTag[]; investmentKinds: InvestmentKind[]; settings: UserSettings; onRefetch: () => void
}) {
  const [text, setText] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState(categories[0]?.name || 'Food')
  const [type, setType] = useState(transactionTypes[0]?.name || 'Expense')
  const [amount, setAmount] = useState('')
  const [person, setPerson] = useState(personTags[0]?.name || 'Self')
  const [invKind, setInvKind] = useState(investmentKinds[0]?.name || '')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.name === category)) setCategory(categories[0].name)
  }, [categories])

  const submit = async () => {
    setSaving(true)
    setFeedback(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); setFeedback({ type: 'error', msg: 'Not authenticated.' }); return }

    let transactionsToInsert = []
    let parsedAmount = Number(amount)

    if (!parsedAmount && text.trim()) {
      setFeedback({ type: 'success', msg: 'Parsing with AI...' })
      const res = await parseTransactionText(text.trim(), {
        categories: categories.map(c => c.name),
        transactionTypes: transactionTypes.map(t => t.name),
        personTags: personTags.map(p => p.name),
        investmentKinds: investmentKinds.map(k => k.name),
        currentDate: txDate
      })

      if (!res.success || !res.data || !res.data.transactions) {
        setSaving(false)
        setFeedback({ type: 'error', msg: res.error || 'Failed to parse text.' })
        return
      }

      if (!res.data.isConfident && res.data.transactions.length > 0) {
        const tx = res.data.transactions[0]
        setSaving(false)
        setShowManual(true)
        setText(tx.title || text)
        setAmount(String(tx.amount || ''))
        setCategory(categories.find(c => c.name === tx.category)?.name || category)
        setType(transactionTypes.find(t => t.name === tx.type)?.name || type)
        setTxDate(tx.date || txDate)
        if (tx.person) setPerson(personTags.find(p => p.name === tx.person)?.name || person)
        if (tx.investmentKind) setInvKind(investmentKinds.find(k => k.name === tx.investmentKind)?.name || invKind)
        
        setFeedback({ type: 'error', msg: `AI requires review: ${res.data.confidenceReason || 'Please confirm details.'}` })
        return
      }

      transactionsToInsert = res.data.transactions.map((tx: any) => ({
        user_id: user.id,
        title: tx.title || 'Manual transaction',
        category: tx.category || category,
        type: tx.type || type,
        amount: tx.amount,
        date: tx.date || txDate,
        person: tx.person || person,
        investment_kind: tx.type === 'Investment' ? (tx.investmentKind || invKind) : null,
        recurring: false,
      }))
    } else {
      if (!parsedAmount || parsedAmount <= 0) {
        setSaving(false)
        setFeedback({ type: 'error', msg: 'Please enter a valid amount.' })
        return
      }
      transactionsToInsert.push({
        user_id: user.id,
        title: text.trim() || 'Manual transaction',
        category: category.trim(),
        type: type,
        amount: parsedAmount,
        date: txDate,
        person: person,
        investment_kind: type === 'Investment' ? invKind : null,
        recurring: false,
      })
    }

    if (transactionsToInsert.length === 0) {
       setSaving(false)
       setFeedback({ type: 'error', msg: 'No valid transactions found.' })
       return
    }

    const { error } = await supabase.from('transactions').insert(transactionsToInsert)

    setSaving(false)
    if (error) { setFeedback({ type: 'error', msg: error.message }); return }

    if (category.trim() && !categories.find(c => c.name === category.trim())) {
      await supabase.from('categories').insert({ user_id: user.id, name: category.trim(), icon: 'tag', color: '#64748b', is_default: false, sort_order: 999 })
    }

    setFeedback({ type: 'success', msg: 'Transaction(s) logged!' })
    setText(''); setAmount('')
    onRefetch()
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id)
  }

  const confirmDelete = async () => {
    if (!deleteConfirmId) return
    const supabase = createClient()
    await supabase.from('transactions').delete().eq('id', deleteConfirmId)
    setDeleteConfirmId(null)
    onRefetch()
  }

  return (
    <>
      <PageHeader eyebrow="Capture a moment" title="Log a transaction." />
      <div className="mx-auto max-w-3xl">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={23} /></div>
          <h2 className="text-xl font-semibold">Tell ExpenseTracker what happened</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Write it naturally or use the manual form below.</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors overflow-hidden">
              <CalendarDays size={20} />
              <input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} onClick={e => { if ('showPicker' in e.currentTarget) e.currentTarget.showPicker() }} className="absolute inset-0 h-full w-full opacity-0 cursor-pointer" title={`Selected date: ${txDate}`} />
            </div>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit() }} placeholder="e.g. Spent ₹32 on dinner" className="h-12 flex-1 rounded-lg border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" />
            <button disabled={saving} onClick={submit} className="h-12 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60 whitespace-nowrap">{saving ? 'Saving…' : 'Add transaction'}</button>
          </div>

          {feedback && <p className={`mt-3 text-sm font-medium ${feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>{feedback.msg}</p>}

          <button onClick={() => setShowManual(!showManual)} className="mt-7 text-sm font-medium text-primary hover:underline">{showManual ? 'Hide manual entry' : 'Prefer to enter it manually?'}</button>

          {showManual && (
            <div className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/40 p-4 sm:grid-cols-2">
              <label className="text-sm font-medium">Title / Description<input value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Milk, Yoghurt" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
              <label className="text-sm font-medium">Amount<input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" placeholder="90" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
              <label className="text-sm font-medium">Date<input value={txDate} onChange={e => setTxDate(e.target.value)} type="date" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
              <label className="text-sm font-medium">Type
                <select value={type} onChange={e => setType(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
                  {transactionTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium">Category
                <input list="category-options" value={category} onChange={e => setCategory(e.target.value)} placeholder="Select or type new..." className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" />
                <datalist id="category-options">
                  {categories.map(c => <option key={c.id} value={c.name} />)}
                </datalist>
              </label>
              <label className="text-sm font-medium">For
                <select value={person} onChange={e => setPerson(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
                  {personTags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </label>
              {type === 'Investment' && (
                <label className="text-sm font-medium">Investment kind
                  <select value={invKind} onChange={e => setInvKind(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
                    {investmentKinds.map(k => <option key={k.id} value={k.name}>{k.name}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between"><div><h2 className="font-semibold">Recent entries</h2><p className="text-sm text-muted-foreground">Transactions you have logged</p></div><Link href="/dashboard/monthly" className="text-xs font-medium text-primary hover:underline">View all</Link></div>
          {transactions.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet. Log your first one above!</p>}
          {transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} currency={settings.currency} onDelete={handleDelete} onEditTitle={async (id, newTitle) => {
            const supabase = createClient()
            await supabase.from('transactions').update({ title: newTitle }).eq('id', id)
            onRefetch()
          }} />)}
        </section>
      </div>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Delete transaction?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this transaction? This action cannot be undone.</p>
            </div>
            <div className="flex bg-muted/50 p-4 gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 rounded-xl bg-background px-4 py-2.5 text-sm font-semibold text-foreground border border-border hover:bg-muted transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors shadow-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Monthly ─────────────────────────────────────────────────

function Monthly({ transactions, settings, yearData, investmentKinds, onRefetch }: { transactions: Transaction[]; settings: UserSettings; yearData: MonthlyAggregate[]; investmentKinds: InvestmentKind[]; onRefetch: () => void }) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(5)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const confirmDelete = async () => {
    if (!deleteConfirmId) return
    const supabase = createClient()
    await supabase.from('transactions').delete().eq('id', deleteConfirmId)
    setDeleteConfirmId(null)
    onRefetch()
  }
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const year = new Date().getFullYear()

  const handleMonthChange = (e: any) => {
    setSelectedMonth(Number(e.target.value))
    setCurrentPage(1)
  }

  const monthTx = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === selectedMonth && d.getFullYear() === year
  })

  const rows = categoryTotals(monthTx)
  const income = sumBy(monthTx, t => t.type === 'Income')
  const expenses = sumBy(monthTx, t => t.type === 'Expense')
  const investments = sumBy(monthTx, t => t.type === 'Investment')

  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate()
  const dailySpending = Array.from({ length: daysInMonth }).map((_, i) => {
    const day = i + 1
    const dayExpenses = monthTx.filter(t => {
      const d = new Date(t.date)
      return d.getDate() === day && t.type === 'Expense'
    })
    return { name: day.toString(), value: sumBy(dayExpenses, () => true) }
  })

  const sortedMonthTx = [...monthTx].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
  const totalPages = Math.ceil(sortedMonthTx.length / pageSize)
  const paginatedTx = sortedMonthTx.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const outgoingsPieData = [
    { name: 'Expenses', value: expenses },
    ...investmentKinds.map(k => ({
      name: k.name,
      value: sumBy(monthTx, t => t.type === 'Investment' && t.investment_kind === k.name)
    }))
  ].filter(d => d.value > 0)

  return (
    <>
      <PageHeader
        eyebrow={`${monthNames[selectedMonth]} ${year}`}
        title="Monthly summary."
        action={
          <select value={selectedMonth} onChange={handleMonthChange} className="rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium">
            {monthNames.map((m, i) => <option key={i} value={i}>{m} {year}</option>)}
          </select>
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total income" value={money(income, settings.currency)} change={income > 0 ? 'received' : '—'} positive icon={ArrowDownLeft} />
        <Metric label="Total expenses" value={money(expenses, settings.currency)} change={settings.monthly_budget > 0 ? ((expenses / settings.monthly_budget) * 100).toFixed(0) + '% of budget' : '—'} positive={expenses < settings.monthly_budget} icon={ArrowUpRight} />
        <Metric label="Investments" value={money(investments, settings.currency)} change={investments > 0 ? 'allocated' : '—'} positive icon={Wallet} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Spending by category</h2>
          <p className="mb-5 text-sm text-muted-foreground">Repeated purchases accumulate into one readable monthly total.</p>
          <div className="h-72">
            {rows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                  <Bar dataKey="value" fill="#0f766e" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No expense data for this month.</p>}
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Monthly ledger</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="pb-3 font-medium">Category</th><th className="pb-3 text-right font-medium">Entries</th><th className="pb-3 text-right font-medium">Total</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">No data</td></tr>}
                {rows.map(row => {
                  const count = monthTx.filter(tx => tx.category === row.name && tx.type === 'Expense').length
                  return <tr key={row.name} className="border-b border-border last:border-0"><td className="py-3 font-medium">{row.name}</td><td className="py-3 text-right text-muted-foreground">{count}</td><td className="py-3 text-right font-semibold">{money(row.value, settings.currency)}</td></tr>
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Daily spending trend</h2><p className="text-sm text-muted-foreground">See how your expenses map out across the days of the month.</p></div><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">{money(expenses, settings.currency)}</span></div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailySpending}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip formatter={(v) => money(Number(v), settings.currency)} labelFormatter={(v) => `Day ${v}`} />
                <Line type="monotone" dataKey="value" stroke="#be123c" strokeWidth={3} dot={{ r: 4, fill: '#be123c' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="font-semibold">Outgoings breakdown</h2>
            <p className="text-sm text-muted-foreground">Expenses vs Investments</p>
          </div>
          <div className="h-64">
            {outgoingsPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={outgoingsPieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} stroke="none">
                    {outgoingsPieData.map((entry, index) => {
                      const COLORS = ['#be123c', '#0f766e', '#c2410c', '#4338ca', '#15803d', '#b45309']
                      return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    })}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No outgoing money yet.</p>}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">All entries</h2><p className="text-sm text-muted-foreground">Detailed chronological log of all transactions for this month.</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Date</th>
                <th className="pb-3 font-medium">Title</th>
                <th className="pb-3 font-medium">Type</th>
                <th className="pb-3 text-right font-medium">Amount</th>
                <th className="pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedTx.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No entries this month.</td></tr>}
              {paginatedTx.map(tx => (
                <tr key={tx.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="py-3">
                    <div className="flex flex-col gap-1.5 items-start">
                      <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">{tx.category}</span>
                      {tx.person && tx.person !== 'Self' && (
                        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-700 border border-indigo-200 uppercase">
                          {tx.person}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground">{tx.date}</td>
                  <td className="py-3 font-medium">{tx.title}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tx.type === 'Income' ? 'bg-emerald-100 text-emerald-800' : tx.type === 'Expense' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>{tx.type}</span>
                  </td>
                  <td className={`py-3 text-right font-semibold ${tx.type === 'Income' ? 'text-emerald-600' : 'text-foreground'}`}>
                    {tx.type === 'Expense' ? '-' : tx.type === 'Income' ? '+' : ''}{money(tx.amount, settings.currency)}
                  </td>
                  <td className="py-3 text-right">
                    <button onClick={() => setDeleteConfirmId(tx.id)} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sortedMonthTx.length > 0 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Show</span>
              <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="rounded-md border border-border bg-background px-2 py-1">
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="text-muted-foreground">per page</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground">Page {currentPage} of {totalPages || 1}</span>
              <div className="flex gap-1">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-md border border-border px-3 py-1 hover:bg-muted disabled:opacity-50">Prev</button>
                <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)} className="rounded-md border border-border px-3 py-1 hover:bg-muted disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        )}
      </section>

      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-200 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-100 text-red-600">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Delete transaction?</h3>
              <p className="mt-2 text-sm text-muted-foreground">Are you sure you want to delete this transaction? This action cannot be undone.</p>
            </div>
            <div className="flex bg-muted/50 p-4 gap-3">
              <button onClick={() => setDeleteConfirmId(null)} className="flex-1 rounded-xl bg-background px-4 py-2.5 text-sm font-semibold text-foreground border border-border hover:bg-muted transition-colors">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors shadow-sm">Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Yearly ──────────────────────────────────────────────────

function YearlyPage({ transactions, settings, yearData, investmentKinds }: { transactions: Transaction[]; settings: UserSettings; yearData: MonthlyAggregate[]; investmentKinds: InvestmentKind[] }) {
  const year = new Date().getFullYear()
  const yearTx = transactions.filter(t => new Date(t.date).getFullYear() === year)
  const totalExpenses = sumBy(yearTx, t => t.type === 'Expense')
  const totalIncome = sumBy(yearTx, t => t.type === 'Income')
  const totalInvestments = sumBy(yearTx, t => t.type === 'Investment')
  const activeMonths = yearData.filter(m => m.income > 0 || m.expenses > 0).length || 1
  const avgMonthlySpend = totalExpenses / activeMonths
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses - totalInvestments) / totalIncome * 100).toFixed(1) : '0'

  const catRows = categoryTotals(yearTx)
  const topCategory = catRows.length > 0 ? catRows[0].name : '—'
  const topCatAmount = catRows.length > 0 ? catRows[0].value : 0

  const pieData = catRows.slice(0, 5).map((c, i) => ({
    name: c.name,
    value: c.value,
  }))

  return (
    <>
      <PageHeader eyebrow="Patterns over time" title="Yearly summary." action={<span className="rounded-lg border border-border bg-card px-3 py-2 text-sm">{year} full year</span>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Average monthly spend" value={money(avgMonthlySpend, settings.currency)} change={`over ${activeMonths} months`} positive icon={CreditCard} />
        <Metric label="Largest category" value={topCategory} change={money(topCatAmount, settings.currency)} positive icon={Tag} />
        <Metric label="Year investments" value={money(totalInvestments, settings.currency)} change={totalInvestments > 0 ? 'allocated' : '—'} positive icon={TrendingUp} />
        <Metric label="Savings rate" value={`${savingsRate}%`} change={Number(savingsRate) > 0 ? 'positive' : 'deficit'} positive={Number(savingsRate) > 0} icon={Wallet} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4"><h2 className="font-semibold">Complete-year cash flow</h2><p className="text-sm text-muted-foreground">Income, expenses, and investment contributions across every month</p></div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={yearData}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${money(v, settings.currency).charAt(0)}${v / 1000}k`} />
                <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                <Area type="monotone" dataKey="income" stroke="#15803d" fill="#dcfce3" strokeWidth={2} />
                <Bar dataKey="expenses" fill="#be123c" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="investments" stroke="#c2410c" strokeWidth={3} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4"><h2 className="font-semibold">Income vs Expense</h2><p className="text-sm text-muted-foreground">Monthly breakdown of money in vs money out</p></div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearData}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(v) => `${money(v, settings.currency).charAt(0)}${v / 1000}k`} />
                <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                <Bar dataKey="income" fill="#15803d" radius={[4, 4, 0, 0]} name="Income" />
                <Bar dataKey="expenses" fill="#be123c" radius={[4, 4, 0, 0]} name="Expenses" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold">Investment contributions</h2><p className="text-sm text-muted-foreground">SIP and stock purchases stay separate from household spending.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">{money(totalInvestments, settings.currency)}</span></div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={yearData}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                {investmentKinds.map((k, i) => {
                  const colors = ['#d97706', '#0f766e', '#6d28d9', '#be123c', '#0369a1', '#15803d']
                  const fills = ['#fef3c7', '#ccfbf1', '#ede9fe', '#ffe4e6', '#e0f2fe', '#dcfce3']
                  return <Area key={k.id} type="monotone" dataKey={k.name} stackId="1" stroke={colors[i % colors.length]} fill={fills[i % fills.length]} strokeWidth={2} />
                })}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Expense mix</h2>
          <p className="text-sm text-muted-foreground">Where the year went</p>
          <div className="mt-4 h-56">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} stroke="none">
                    {pieData.map((entry, index) => {
                      const COLORS = ['#0f766e', '#c2410c', '#be123c', '#4338ca', '#15803d', '#b45309', '#6d28d9', '#334155']
                      return <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    })}
                  </Pie>
                  <Tooltip formatter={(v) => money(Number(v), settings.currency)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">No expense data yet.</p>}
          </div>
          {pieData.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {pieData.map((c, i) => {
                const COLORS = ['#0f766e', '#c2410c', '#be123c', '#4338ca', '#15803d', '#b45309', '#6d28d9', '#334155']
                return (
                  <span key={c.name} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                    <i className="size-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    {c.name}: {money(c.value, settings.currency)}
                  </span>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

// ── Settings ────────────────────────────────────────────────

function SettingsPage({ settings, setSettings, categories, setCategories, transactionTypes, personTags, investmentKinds, transactions, onRefetch }: {
  settings: UserSettings; setSettings: (s: UserSettings) => void; categories: Category[]; setCategories: (c: Category[]) => void; transactionTypes: TransactionTypeRow[]; personTags: PersonTag[]; investmentKinds: InvestmentKind[]; transactions: Transaction[]; onRefetch: () => void
}) {
  const [currency, setCurrency] = useState(settings.currency)
  const [budget, setBudget] = useState(String(settings.monthly_budget))
  const [dateFormat, setDateFormat] = useState(settings.date_format)
  const [theme, setTheme] = useState(settings.theme)
  const [notif, setNotif] = useState(settings.notifications_enabled)
  const [alertThreshold, setAlertThreshold] = useState(String(settings.budget_alert_threshold))
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newCat, setNewCat] = useState('')
  const [newTag, setNewTag] = useState('')
  const [newKind, setNewKind] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportingJson, setExportingJson] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportScope, setExportScope] = useState('all')
  const [clearing, setClearing] = useState(false)

  const availableYears = Array.from(new Set(transactions.map(t => new Date(t.date).getFullYear()))).sort((a, b) => b - a)
  const availableMonths = Array.from(new Set(transactions.map(t => t.date.substring(0, 7)))).sort((a, b) => b.localeCompare(a))
  const [clearConfirm, setClearConfirm] = useState(false)

  useEffect(() => {
    setCurrency(settings.currency)
    setBudget(String(settings.monthly_budget))
    setDateFormat(settings.date_format)
    setTheme(settings.theme)
    setNotif(settings.notifications_enabled)
    setAlertThreshold(String(settings.budget_alert_threshold))
  }, [settings])

  const saveSettings = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('user_settings').update({
      currency,
      monthly_budget: Number(budget),
      date_format: dateFormat,
      theme,
      notifications_enabled: notif,
      budget_alert_threshold: Number(alertThreshold),
    }).eq('user_id', user.id)

    setSettings({ ...settings, currency, monthly_budget: Number(budget), date_format: dateFormat, theme, notifications_enabled: notif, budget_alert_threshold: Number(alertThreshold) })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  const handleAddCategory = async () => {
    if (!newCat.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0)
    await supabase.from('categories').insert({ user_id: user.id, name: newCat.trim(), sort_order: maxOrder + 1 })
    setNewCat('')
    onRefetch()
  }

  const handleDeleteCategory = async (id: string) => {
    const supabase = createClient()
    await supabase.from('categories').delete().eq('id', id)
    onRefetch()
  }

  const handleAddTag = async () => {
    if (!newTag.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('person_tags').insert({ user_id: user.id, name: newTag.trim() })
    setNewTag('')
    onRefetch()
  }

  const handleDeleteTag = async (id: string) => {
    const supabase = createClient()
    await supabase.from('person_tags').delete().eq('id', id)
    onRefetch()
  }

  const handleAddKind = async () => {
    if (!newKind.trim()) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('investment_kinds').insert({ user_id: user.id, name: newKind.trim() })
    setNewKind('')
    onRefetch()
  }

  const handleDeleteKind = async (id: string) => {
    const supabase = createClient()
    await supabase.from('investment_kinds').delete().eq('id', id)
    onRefetch()
  }

  const filterExportData = (data: any[]) => {
    if (exportScope === 'all') return data
    if (exportScope.startsWith('year-')) {
      const year = exportScope.split('-')[1]
      return data.filter(d => d.date.startsWith(year))
    }
    if (exportScope.startsWith('month-')) {
      const monthPrefix = exportScope.substring(6) // "2026-09"
      return data.filter(d => d.date.startsWith(monthPrefix))
    }
    return data
  }

  const handleExport = async () => {
    setExporting(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExporting(false); return }
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false })
    if (data && data.length > 0) {
      const filtered = filterExportData(data)
      if (filtered.length === 0) { alert('No transactions found for the selected scope.'); setExporting(false); return }
      const headers = 'Date,Title,Category,Type,Amount,Person,Investment Kind,Recurring,Notes'
      const rows = filtered.map((t: any) => `${t.date},"${t.title}","${t.category}","${t.type}",${t.amount},"${t.person}","${t.investment_kind || ''}",${t.recurring || false},"${t.notes || ''}"`)
      const csv = [headers, ...rows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `transactions_${exportScope}_${new Date().toISOString().split('T')[0]}.csv`; a.click()
      URL.revokeObjectURL(url)
    }
    setExporting(false)
  }

  const handleExportJSON = async () => {
    setExportingJson(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExportingJson(false); return }
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false })
    if (data && data.length > 0) {
      const filtered = filterExportData(data)
      if (filtered.length === 0) { alert('No transactions found for the selected scope.'); setExportingJson(false); return }
      const jsonStr = JSON.stringify(filtered, null, 2)
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `transactions_${exportScope}_${new Date().toISOString().split('T')[0]}.json`; a.click()
      URL.revokeObjectURL(url)
    }
    setExportingJson(false)
  }

  const handleExportPDF = async () => {
    setExportingPdf(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setExportingPdf(false); return }
    const { data } = await supabase.from('transactions').select('*').eq('user_id', user.id).order('date', { ascending: false }).order('created_at', { ascending: false })
    
    if (data && data.length > 0) {
      const filtered = filterExportData(data)
      if (filtered.length === 0) { alert('No transactions found for the selected scope.'); setExportingPdf(false); return }
      
      const doc = new jsPDF()
      
      let title = 'All Time Transaction Report'
      if (exportScope.startsWith('year-')) {
        title = `Yearly Summary - ${exportScope.split('-')[1]}`
      } else if (exportScope.startsWith('month-')) {
        const d = new Date(exportScope.substring(6) + '-01')
        title = `Monthly Summary - ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`
      }
      
      doc.setFontSize(18)
      doc.text(title, 14, 22)
      doc.setFontSize(11)
      doc.setTextColor(100)
      doc.text(`Generated on ${new Date().toLocaleDateString()}`, 14, 30)
      
      const tableColumn = ["Date", "Title", "Category", "Type", "Amount"]
      const tableRows = filtered.map((tx: any) => {
        return [
          tx.date,
          tx.title,
          tx.category,
          tx.type,
          `${tx.type === 'Expense' ? '-' : tx.type === 'Income' ? '+' : ''}${money(tx.amount, settings.currency)}`
        ]
      })
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 10 }
      })
      
      doc.save(`report_${exportScope}_${new Date().toISOString().split('T')[0]}.pdf`)
    }
    setExportingPdf(false)
  }

  const handleClearAll = async () => {
    setClearing(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setClearing(false); return }
    await supabase.from('transactions').delete().eq('user_id', user.id)
    setClearing(false)
    setClearConfirm(false)
    onRefetch()
  }

  return (
    <>
      <PageHeader eyebrow="Workspace preferences" title="Settings." />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        {/* Money & Dates */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Money and dates</h2>
          <p className="mt-1 text-sm text-muted-foreground">Configure currency, budget, and date preferences.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Currency
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
                <option value="INR">INR · Indian Rupee</option>
                <option value="USD">USD · US Dollar</option>
                <option value="EUR">EUR · Euro</option>
                <option value="GBP">GBP · Pound Sterling</option>
              </select>
            </label>
            <label className="text-sm font-medium">Monthly budget<input value={budget} onChange={e => setBudget(e.target.value)} type="number" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
            <label className="text-sm font-medium">Date format
              <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3">
                <option>DD MMM YYYY</option>
                <option>MMM DD, YYYY</option>
                <option>YYYY-MM-DD</option>
              </select>
            </label>
            <label className="text-sm font-medium">Budget alert threshold (%)
              <input value={alertThreshold} onChange={e => setAlertThreshold(e.target.value)} type="number" min="0" max="100" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input type="checkbox" checked={notif} onChange={e => setNotif(e.target.checked)} className="size-4 rounded border-border" />
              Enable budget notifications
            </label>
          </div>
          <button onClick={saveSettings} disabled={saving} className="mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save settings'}</button>
        </section>

        {/* Categories */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Your categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">Manage the categories used for logging transactions.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map(cat => (
              <span key={cat.id} className="group inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
                <span className="size-2 rounded-full" style={{ backgroundColor: cat.color }} />
                {cat.name}
                {!cat.is_default && <button onClick={() => handleDeleteCategory(cat.id)} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"><X size={12} /></button>}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input value={newCat} onChange={e => setNewCat(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} placeholder="New category…" className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
            <button onClick={handleAddCategory} className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus size={16} /></button>
          </div>
        </section>

        {/* Person Tags */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Person tags</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tags for who the transaction is for.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {personTags.map(tag => (
              <span key={tag.id} className="group inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
                {tag.name}
                {!tag.is_default && <button onClick={() => handleDeleteTag(tag.id)} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"><X size={12} /></button>}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTag()} placeholder="New tag…" className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
            <button onClick={handleAddTag} className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus size={16} /></button>
          </div>
        </section>

        {/* Investment Kinds */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Investment kinds</h2>
          <p className="mt-1 text-sm text-muted-foreground">Types of investments you track.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {investmentKinds.map(kind => (
              <span key={kind.id} className="group inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
                {kind.name}
                {!kind.is_default && <button onClick={() => handleDeleteKind(kind.id)} className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"><X size={12} /></button>}
              </span>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input value={newKind} onChange={e => setNewKind(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddKind()} placeholder="New kind…" className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
            <button onClick={handleAddKind} className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"><Plus size={16} /></button>
          </div>
        </section>

        {/* Export */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Data export</h2>
          <p className="mt-1 text-sm text-muted-foreground">Download your transactions as a CSV, JSON, or PDF file.</p>
          
          <div className="mt-4 flex items-center gap-3 border-b border-border pb-4">
            <span className="text-sm font-medium">Export scope:</span>
            <select value={exportScope} onChange={e => setExportScope(e.target.value)} className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none">
              <option value="all">All time</option>
              <optgroup label="Yearly">
                {availableYears.map(y => <option key={`y-${y}`} value={`year-${y}`}>{y}</option>)}
              </optgroup>
              <optgroup label="Monthly">
                {availableMonths.map(m => {
                   const date = new Date(m + '-01')
                   return <option key={`m-${m}`} value={`month-${m}`}>{date.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</option>
                })}
              </optgroup>
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={handleExport} disabled={exporting || exportingJson || exportingPdf} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
              <Download size={16} />{exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button onClick={handleExportJSON} disabled={exporting || exportingJson || exportingPdf} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60">
              <FileText size={16} />{exportingJson ? 'Exporting…' : 'Export JSON'}
            </button>
            <button onClick={handleExportPDF} disabled={exporting || exportingJson || exportingPdf} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-60 transition-colors">
              <Printer size={16} />{exportingPdf ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="rounded-xl border border-red-200 bg-red-50/50 p-6 shadow-sm">
          <h2 className="font-semibold text-red-700">Danger zone</h2>
          <p className="mt-1 text-sm text-red-600/80">These actions are irreversible.</p>
          <div className="mt-4 space-y-3">
            {!clearConfirm ? (
              <button onClick={() => setClearConfirm(true)} className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50">
                <Trash2 size={16} />Clear all transactions
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-red-700 font-medium">Are you sure?</span>
                <button onClick={handleClearAll} disabled={clearing} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{clearing ? 'Clearing…' : 'Yes, delete all'}</button>
                <button onClick={() => setClearConfirm(false)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium">Cancel</button>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  )
}

// ── Profile ─────────────────────────────────────────────────

function ProfilePage({ profile, onRefetch }: { profile: UserProfile | null; onRefetch: () => void }) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(profile?.first_name || '')
  const [lastName, setLastName] = useState(profile?.last_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [dob, setDob] = useState(profile?.date_of_birth || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwFeedback, setPwFeedback] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '')
      setLastName(profile.last_name || '')
      setPhone(profile.phone || '')
      setDob(profile.date_of_birth || '')
      setBio(profile.bio || '')
    }
  }, [profile])

  const saveProfile = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('user_profiles').update({
      first_name: firstName || null,
      last_name: lastName || null,
      phone: phone || null,
      date_of_birth: dob || null,
      bio: bio || null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)

    setSaving(false)
    setSaved(true)
    onRefetch()
    setTimeout(() => setSaved(false), 2200)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const fileExt = file.name.split('.').pop()
    const filePath = `${user.id}/avatar.${fileExt}`

    await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`

    await supabase.from('user_profiles').update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    setUploading(false)
    onRefetch()
  }

  const handleRemoveAvatar = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: files } = await supabase.storage.from('avatars').list(user.id)
    if (files && files.length > 0) {
      await supabase.storage.from('avatars').remove(files.map((f: any) => `${user.id}/${f.name}`))
    }
    await supabase.from('user_profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('user_id', user.id)
    onRefetch()
  }

  const handleChangePassword = async () => {
    if (newPassword.length < 6) { setPwFeedback('Password must be at least 6 characters.'); return }
    setChangingPassword(true)
    setPwFeedback(null)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) { setPwFeedback(error.message); return }
    setPwFeedback('Password updated successfully!')
    setNewPassword('')
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = getInitials(profile?.first_name, profile?.last_name, profile?.email)
  const memberSince = profile?.created_at_auth ? new Date(profile.created_at_auth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '—'

  return (
    <>
      <PageHeader eyebrow="Your account" title="Profile." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Avatar & info summary */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-5">
            <div className="relative">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="size-20 rounded-2xl object-cover" />
              ) : (
                <div className="grid size-20 place-items-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">{initials}</div>
              )}
              <button onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90" title="Change avatar">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              </button>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{getDisplayName(profile?.first_name, profile?.last_name, profile?.email)}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Member since {memberSince}</p>
              {profile?.avatar_url && <button onClick={handleRemoveAvatar} className="mt-2 text-xs text-red-500 hover:underline">Remove photo</button>}
            </div>
          </div>
        </section>

        {/* Account actions */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Account</h2>
          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Change password</label>
              <div className="mt-2 flex gap-2">
                <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="New password" className="h-10 flex-1 rounded-lg border border-input bg-background px-3 text-sm" />
                <button onClick={handleChangePassword} disabled={changingPassword} className="h-10 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">{changingPassword ? '…' : 'Update'}</button>
              </div>
              {pwFeedback && <p className={`mt-1 text-xs ${pwFeedback.includes('success') ? 'text-emerald-600' : 'text-rose-600'}`}>{pwFeedback}</p>}
            </div>
            <hr className="border-border" />
            <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
              <LogOut size={16} />Sign out
            </button>
          </div>
        </section>

        {/* Personal info */}
        <section className="rounded-xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
          <h2 className="font-semibold">Personal information</h2>
          <p className="mt-1 text-sm text-muted-foreground">This information is only visible to you.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">First name<input value={firstName} onChange={e => setFirstName(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="Jordan" /></label>
            <label className="text-sm font-medium">Last name<input value={lastName} onChange={e => setLastName(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="Davis" /></label>
            <label className="text-sm font-medium">Email <span className="text-muted-foreground">(read-only)</span><input value={profile?.email || ''} disabled className="mt-2 h-11 w-full rounded-lg border border-input bg-muted px-3 text-muted-foreground" /></label>
            <label className="text-sm font-medium">Phone<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="+91 98765 43210" /></label>
            <label className="text-sm font-medium">Date of birth<input value={dob} onChange={e => setDob(e.target.value)} type="date" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" /></label>
            <label className="text-sm font-medium sm:col-span-2">Bio<textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" placeholder="A few words about yourself…" /></label>
          </div>
          <button onClick={saveProfile} disabled={saving} className="mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saved ? '✓ Saved' : saving ? 'Saving…' : 'Save profile'}</button>
        </section>
      </div>
    </>
  )
}

// ── Main App ────────────────────────────────────────────────

export default function TraceApp() {
  const path = usePathname()
  const data = useSupabaseData()

  if (data.loading) return <Shell profile={null}><Spinner /></Shell>

  let content: React.ReactNode
  if (path === '/dashboard/log') {
    content = <Log transactions={data.transactions} categories={data.categories} transactionTypes={data.transactionTypes} personTags={data.personTags} investmentKinds={data.investmentKinds} settings={data.settings} onRefetch={data.refetch} />
  } else if (path === '/dashboard/monthly') {
    content = <Monthly transactions={data.transactions} settings={data.settings} yearData={data.yearData} investmentKinds={data.investmentKinds} onRefetch={data.refetch} />
  } else if (path === '/dashboard/yearly') {
    content = <YearlyPage transactions={data.transactions} settings={data.settings} yearData={data.yearData} investmentKinds={data.investmentKinds} />
  } else if (path === '/dashboard/settings') {
    content = <SettingsPage settings={data.settings} setSettings={data.setSettings} categories={data.categories} setCategories={data.setCategories} transactionTypes={data.transactionTypes} personTags={data.personTags} investmentKinds={data.investmentKinds} transactions={data.transactions} onRefetch={data.refetch} />
  } else if (path === '/dashboard/profile') {
    content = <ProfilePage profile={data.profile} onRefetch={data.refetch} />
  } else {
    content = <Overview transactions={data.transactions} settings={data.settings} yearData={data.yearData} profile={data.profile} onRefetch={data.refetch} />
  }

  return <Shell profile={data.profile}>{content}</Shell>
}

export function Login() {
  const router = useRouter()
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5">
      <div className="w-full max-w-md">
        <div className="mb-10 flex justify-center"><Logo /></div>
        <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back.</h1>
          <p className="mt-2 text-sm text-muted-foreground">Your money, in focus.</p>
          <div className="mt-7 space-y-4">
            <label className="block text-sm font-medium">Email<input type="email" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="you@example.com" /></label>
            <label className="block text-sm font-medium">Password<input type="password" className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3" placeholder="••••••••" /></label>
            <button onClick={() => router.push('/dashboard')} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground">Sign in</button>
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">Demo mode · Supabase auth can be connected to this flow</p>
        </div>
      </div>
    </main>
  )
}
