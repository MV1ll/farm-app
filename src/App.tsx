import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Species = 'Pig' | 'Chicken'
type EntryKind = 'Weekly feed use' | 'Mortality' | 'Weekly weight check' | 'Batch note' | 'Expense' | 'Sale'
type Batch = { id: string; databaseId?: string; species: Species; purchaseDate: string; supplier: string; headcount: number; headsLost: number; averageWeight: number; targetWeight: number; fcr: number; totalCost: number; profit?: number; status: 'Active' | 'Completed' }
type ExpenseCategory = 'Feed' | 'Medicine' | 'Materials' | 'Gas' | 'Salary'
 type Expense = { id: string; date: string; category: ExpenseCategory; supplier: string; batchId: string; description: string; amount: number; employeeName?: string; bonusAmount?: number }
type PerformanceSample = { averageWeight: number; feedBags: number }
type BatchNote = { id: string; batchId: string; date: string; type: string; note: string }
type MortalityRecord = { id: string; batchId: string; date: string; headsLost: number; note: string }
type FarmData = { batches: Array<{ id: string; batch_code: string; species: Species; purchase_date: string; supplier_name: string | null; starting_headcount: number; target_weight_kg: number; purchase_cost_php: number; status: Batch['status'] }>; performance: Array<{ id: string; batch_id: string; week_ending: string; average_weight_kg: number; feed_bags: number | null; bag_weight_kg: number }>; mortality: Array<{ id: string; batch_id: string; loss_date: string; heads_lost: number; note: string | null }>; notes: Array<{ id: string; batch_id: string; note_date: string; note_type: string; note: string }>; expenses: Array<{ id: string; expense_date: string; category: ExpenseCategory; supplier_name: string | null; batch_id: string | null; description: string; amount_php: number; employee_name: string | null; bonus_amount_php: number }>; estimates: Array<{ batch_id: string; estimated_price_per_kg_php: number; estimated_weight_per_head_kg: number }> }

const php = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 })
const formatDate = (date: string) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`))
const batchDays = (date: string) => Math.max(1, Math.round((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000))

function App() {
  const [batches, setBatches] = useState<Batch[]>([])
  const [userName, setUserName] = useState('')
  const [activeEntry, setActiveEntry] = useState<EntryKind | null>(null)
  const [section, setSection] = useState('Dashboard')
  const [notice, setNotice] = useState('')
  const [showBatchForm, setShowBatchForm] = useState(false)
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null)
  const [batchNotes, setBatchNotes] = useState<BatchNote[]>([])
  const [mortalityRecords, setMortalityRecords] = useState<MortalityRecord[]>([])
  const [performanceByBatch, setPerformanceByBatch] = useState<Record<string, PerformanceSample[]>>({})
  const [saleEstimates, setSaleEstimates] = useState<Record<string, { price: number; weight: number }>>({})
  const [dataLoadState, setDataLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  useEffect(() => {
    const loadAuthenticatedUser = async () => {
      try {
        const response = await fetch('/.auth/me')
        const profile = await response.json() as { clientPrincipal?: { userDetails?: string } }
        const fullName = profile.clientPrincipal?.userDetails?.trim()
        if (fullName) setUserName(fullName.split(/[.@]/)[0])
      } catch {
        // Local Vite development has no Azure Static Web Apps auth endpoint.
      }
    }
    void loadAuthenticatedUser()
  }, [])
  useEffect(() => {
    const loadFarmData = async () => {
      try {
        const response = await fetch('/api/farm-data')
        if (!response.ok) throw new Error('Farm data request failed.')
        const data = await response.json() as FarmData
        const lossesByBatch = new Map<string, number>()
        data.mortality.forEach((record) => lossesByBatch.set(record.batch_id, (lossesByBatch.get(record.batch_id) ?? 0) + Number(record.heads_lost)))
        const expensesByBatch = new Map<string, number>()
        data.expenses.forEach((expense) => expense.batch_id && expensesByBatch.set(expense.batch_id, (expensesByBatch.get(expense.batch_id) ?? 0) + Number(expense.amount_php)))
        const performance = data.performance.reduce<Record<string, PerformanceSample[]>>((records, entry) => {
          const batch = data.batches.find((item) => item.id === entry.batch_id)
          if (!batch) return records
          records[batch.batch_code] = [...(records[batch.batch_code] ?? []), { averageWeight: Number(entry.average_weight_kg), feedBags: Number(entry.feed_bags ?? 0) }]
          return records
        }, {})
        setPerformanceByBatch(performance)
        setBatches(data.batches.map((batch) => {
          const samples = performance[batch.batch_code] ?? []
          const firstWeight = samples[0]?.averageWeight ?? 0
          const latestWeight = samples.at(-1)?.averageWeight ?? 0
          const survivingHeads = Number(batch.starting_headcount) - (lossesByBatch.get(batch.id) ?? 0)
          const feedKg = samples.reduce((total, sample) => total + sample.feedBags * 50, 0)
          const weightGainKg = survivingHeads * Math.max(latestWeight - firstWeight, 0)
          return { id: batch.batch_code, databaseId: batch.id, species: batch.species, purchaseDate: batch.purchase_date.slice(0, 10), supplier: batch.supplier_name ?? 'Unknown supplier', headcount: Number(batch.starting_headcount), headsLost: lossesByBatch.get(batch.id) ?? 0, averageWeight: latestWeight, targetWeight: Number(batch.target_weight_kg), fcr: weightGainKg ? Number((feedKg / weightGainKg).toFixed(2)) : 0, totalCost: Number(batch.purchase_cost_php) + (expensesByBatch.get(batch.id) ?? 0), status: batch.status }
        }))
        const batchCodes = new Map(data.batches.map((batch) => [batch.id, batch.batch_code]))
        setSaleEstimates(data.estimates.reduce<Record<string, { price: number; weight: number }>>((estimates, estimate) => {
          const batchCode = batchCodes.get(estimate.batch_id)
          if (batchCode) estimates[batchCode] = { price: Number(estimate.estimated_price_per_kg_php), weight: Number(estimate.estimated_weight_per_head_kg) }
          return estimates
        }, {}))
        setMortalityRecords(data.mortality.map((record) => ({ id: record.id, batchId: batchCodes.get(record.batch_id) ?? record.batch_id, date: record.loss_date.slice(0, 10), headsLost: Number(record.heads_lost), note: record.note ?? '' })))
        setBatchNotes(data.notes.map((note) => ({ id: note.id, batchId: batchCodes.get(note.batch_id) ?? note.batch_id, date: note.note_date.slice(0, 10), type: note.note_type, note: note.note })))
        setExpenses(data.expenses.map((expense) => ({ id: expense.id, date: expense.expense_date.slice(0, 10), category: expense.category, supplier: expense.supplier_name ?? 'Farm overhead', batchId: expense.batch_id ? batchCodes.get(expense.batch_id) ?? expense.batch_id : 'Farm overhead', description: expense.description, amount: Number(expense.amount_php), employeeName: expense.employee_name ?? undefined, bonusAmount: Number(expense.bonus_amount_php) })))
        setDataLoadState('ready')
      } catch {
        setDataLoadState('error')
      }
    }
    void loadFarmData()
  }, [])
  const totalAnimals = batches.filter((batch) => batch.status === 'Active').reduce((total, batch) => total + batch.headcount, 0)
  const totalCost = batches.filter((batch) => batch.status === 'Active').reduce((total, batch) => total + batch.totalCost, 0)

  const saveToDatabase = async (action: string, payload: Record<string, unknown>) => {
    const response = await fetch('/api/farm-data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) })
    if (!response.ok) throw new Error('Unable to save this record to the farm database.')
    return response.json() as Promise<{ id: string }>
  }

  const saveSaleEstimate = async (batch: Batch, price: number, weight: number) => {
    if (!batch.databaseId) return
    try {
      await saveToDatabase('saveSaleEstimate', { batchId: batch.databaseId, estimatedPricePerKgPhp: price, estimatedWeightPerHeadKg: weight })
      setSaleEstimates((current) => ({ ...current, [batch.id]: { price, weight } }))
      setNotice(`Market estimate for ${batch.id} saved to the farm database.`)
    } catch {
      setNotice('The market estimate could not be saved to the database. Check your connection and try again.')
    }
  }

  const addBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const species = form.get('species') as Species
    const purchaseDate = String(form.get('purchaseDate'))
    const prefix = species === 'Pig' ? 'PIG' : 'CHK'
    const baseId = `${prefix}-${purchaseDate.replaceAll('-', '')}`
    const duplicates = batches.filter((batch) => batch.id === baseId || batch.id.startsWith(`${baseId}-`)).length
    const id = duplicates ? `${baseId}-${String(duplicates + 1).padStart(2, '0')}` : baseId
    const batch: Batch = {
      id, species, purchaseDate, supplier: String(form.get('supplier')).trim(),
      headcount: Number(form.get('headcount')), headsLost: 0, averageWeight: Number(form.get('startingWeight')),
      targetWeight: Number(form.get('targetWeight')), fcr: 0, totalCost: Number(form.get('purchaseCost')), status: 'Active',
    }
    try {
      const saved = await saveToDatabase('createBatch', { batchCode: id, species, purchaseDate, supplier: batch.supplier, headcount: batch.headcount, targetWeightKg: batch.targetWeight, purchaseCostPhp: batch.totalCost })
      setBatches((current) => [{ ...batch, databaseId: saved.id }, ...current])
      setShowBatchForm(false)
      setNotice(`${id} saved to the farm database. Add weekly feed and weight records to build its performance history.`)
    } catch {
      setNotice('The batch could not be saved to the database. Check your connection and try again.')
    }
  }

  const updateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingBatch?.databaseId) return
    const form = new FormData(event.currentTarget)
    const updatedBatch: Batch = {
      ...editingBatch,
      id: String(form.get('batchCode')).trim(),
      species: form.get('species') as Species,
      purchaseDate: String(form.get('purchaseDate')),
      supplier: String(form.get('supplier')).trim(),
      headcount: Number(form.get('headcount')),
      targetWeight: Number(form.get('targetWeight')),
      totalCost: Number(form.get('purchaseCost')),
    }
    try {
      await saveToDatabase('updateBatch', { batchId: editingBatch.databaseId, batchCode: updatedBatch.id, species: updatedBatch.species, purchaseDate: updatedBatch.purchaseDate, supplier: updatedBatch.supplier, headcount: updatedBatch.headcount, targetWeightKg: updatedBatch.targetWeight, purchaseCostPhp: updatedBatch.totalCost })
      setBatches((current) => current.map((batch) => batch.databaseId === editingBatch.databaseId ? updatedBatch : batch))
      setSelectedBatch(updatedBatch)
      setEditingBatch(null)
      setNotice(`${updatedBatch.id} updated in the farm database.`)
    } catch {
      setNotice('The batch could not be updated. Check the batch code is unique and try again.')
    }
  }

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const batchId = String(form.get('batchId'))
    const batch = batches.find((item) => item.id === batchId)
    if (!activeEntry || !batch?.databaseId) {
      setNotice('This record cannot be saved until the batch has loaded from the farm database.')
      return
    }

    const date = String(form.get('date'))
    const value = Number(form.get('value'))
    const note = String(form.get('note')).trim()
    try {
      if (activeEntry === 'Batch note') {
        const saved = await saveToDatabase('createNote', { batchId: batch.databaseId, noteDate: date, noteType: String(form.get('noteType')), note })
        setBatchNotes((current) => [{ id: saved.id, batchId, date, type: String(form.get('noteType')), note }, ...current])
      } else if (activeEntry === 'Mortality') {
        const saved = await saveToDatabase('recordMortality', { batchId: batch.databaseId, lossDate: date, headsLost: value, note })
        setBatches((current) => current.map((item) => item.id === batchId ? { ...item, headsLost: item.headsLost + value } : item))
        setMortalityRecords((current) => [{ id: saved.id, batchId, date, headsLost: value, note }, ...current])
      } else if (activeEntry === 'Weekly feed use' || activeEntry === 'Weekly weight check') {
        const existingSamples = performanceByBatch[batchId] ?? []
        const existingSample = existingSamples.find((_, index) => index === existingSamples.length - 1)
        const averageWeightKg = activeEntry === 'Weekly weight check' ? value : batch.averageWeight
        const feedBags = activeEntry === 'Weekly feed use' ? value : existingSample?.feedBags ?? 0
        await saveToDatabase('recordPerformance', { batchId: batch.databaseId, weekEnding: date, averageWeightKg, feedBags, note })
        setPerformanceByBatch((current) => ({ ...current, [batchId]: [...existingSamples, { averageWeight: averageWeightKg, feedBags }].sort((first, second) => first.averageWeight - second.averageWeight) }))
        if (activeEntry === 'Weekly weight check') setBatches((current) => current.map((item) => item.id === batchId ? { ...item, averageWeight: value } : item))
      }
      setActiveEntry(null)
      setNotice(`${activeEntry} saved to the farm database.`)
    } catch {
      setNotice('This record could not be saved to the database. Check your connection and try again.')
    }
  }
  const openBatch = (batch: Batch) => { setSelectedBatch(batch); setSection('Batches') }
  const addExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const category = form.get('category') as ExpenseCategory
    const date = String(form.get('date'))
    const supplier = String(form.get('supplier')).trim()
    const batchId = String(form.get('batchId'))
    const description = String(form.get('description')).trim()
    const salaryEmployees = ['Kuya Rowel', 'Inek', 'Joshua']
    const newExpenses: Expense[] = category === 'Salary'
        ? salaryEmployees.flatMap((employeeName) => {
          const baseAmount = Number(form.get(`salary-${employeeName}`))
          const bonusAmount = Number(form.get(`bonus-${employeeName}`))
          const amount = baseAmount + bonusAmount
          return amount > 0 ? [{ id: `EXP-${Date.now()}-${employeeName}`, date, category, supplier, batchId, description, amount, employeeName, bonusAmount }] : []
        })
      : [{ id: `EXP-${Date.now()}`, date, category, supplier, batchId, description, amount: Number(form.get('amount')) }]
    try {
      const savedExpenses = await Promise.all(newExpenses.map(async (expense) => {
        const batch = batches.find((item) => item.id === expense.batchId)
        const saved = await saveToDatabase('createExpense', { expenseDate: expense.date, category: expense.category, supplier: expense.supplier, batchId: batch?.databaseId ?? null, description: expense.description, amountPhp: expense.amount, employeeName: expense.employeeName ?? null, bonusAmountPhp: expense.bonusAmount ?? 0 })
        return { ...expense, id: saved.id }
      }))
      setExpenses((current) => [...savedExpenses, ...current])
      setBatches((current) => current.map((batch) => ({ ...batch, totalCost: batch.id === batchId ? batch.totalCost + savedExpenses.reduce((total, expense) => total + expense.amount, 0) : batch.totalCost })))
      setShowExpenseForm(false)
      const savedAmount = savedExpenses.reduce((total, expense) => total + expense.amount, 0)
      setNotice(`${category} expense of ${php.format(savedAmount)} saved to the farm database.`)
    } catch {
      setNotice('The expense could not be saved to the database. Check your connection and try again.')
    }
  }

  return <div className="farm-app">
    <aside className="sidebar"><a className="wordmark" href="#dashboard" onClick={() => setSection('Dashboard')}><span>F</span>FarmIVAll</a><p className="farm-location">Bulacan, Philippines</p><nav aria-label="Farm sections">{['Dashboard', 'Batches', 'Performance', 'Feed inventory', 'Expenses', 'Sales', 'Reports'].map((item) => <button key={item} type="button" className={section === item ? 'side-link selected' : 'side-link'} onClick={() => setSection(item)}>{item}</button>)}</nav><div className="sidebar-footer"><span className="sync-dot" /> All changes synced<br /><small>Last backup: today, 8:42 AM</small></div></aside>
    <main className="workspace">
      <header className="page-header"><div><p className="date-label">Tuesday, September 2, 2026</p><h1>{section === 'Batches' ? 'Livestock batches' : section === 'Performance' ? 'Batch performance' : section === 'Expenses' ? 'Farm expenses' : userName ? `Good morning, ${userName}.` : 'Good morning.'}</h1></div><div className="header-actions"><span className="offline-status">Online and synced</span><button className="profile-button" type="button" aria-label="Open account menu">{userName.charAt(0).toUpperCase() || 'F'}</button></div></header>
      {notice && <div className="notice" role="status"><span>Saved</span>{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></div>}
      {dataLoadState === 'loading' && <div className="notice" role="status"><span>Loading</span>Loading live farm records from PostgreSQL.</div>}
      {dataLoadState === 'error' && <div className="notice" role="alert"><span>Unavailable</span>Live farm records could not be loaded. Check the database connection and refresh the page.</div>}
      {section === 'Batches' ? <BatchesPage batches={batches} selectedBatch={selectedBatch} onAddBatch={() => setShowBatchForm(true)} onEditBatch={setEditingBatch} onOpenBatch={setSelectedBatch} /> : section === 'Performance' ? <PerformancePanel batches={batches} expenses={expenses} batchNotes={batchNotes} mortalityRecords={mortalityRecords} performanceByBatch={performanceByBatch} saleEstimates={saleEstimates} onAddWeight={() => setActiveEntry('Weekly weight check')} onAddNote={() => setActiveEntry('Batch note')} onSaveEstimate={saveSaleEstimate} /> : section === 'Expenses' ? <ExpensesPage expenses={expenses} onAddExpense={() => setShowExpenseForm(true)} /> : <Dashboard batches={batches} expenses={expenses} totalAnimals={totalAnimals} totalCost={totalCost} onEntry={(kind) => kind === 'Expense' ? setShowExpenseForm(true) : setActiveEntry(kind)} onBatches={() => setSection('Batches')} onOpenBatch={openBatch} />}
    </main>
    {activeEntry && <EntryModal activeEntry={activeEntry} batches={batches} onClose={() => setActiveEntry(null)} onSave={saveEntry} />}
    {showBatchForm && <BatchForm onClose={() => setShowBatchForm(false)} onSubmit={addBatch} />}
    {editingBatch && <BatchForm batch={editingBatch} onClose={() => setEditingBatch(null)} onSubmit={updateBatch} />}
    {showExpenseForm && <ExpenseForm batches={batches} onClose={() => setShowExpenseForm(false)} onSubmit={addExpense} />}
  </div>
}

function Dashboard({ batches, expenses, totalAnimals, totalCost, onEntry, onBatches, onOpenBatch }: { batches: Batch[]; expenses: Expense[]; totalAnimals: number; totalCost: number; onEntry: (kind: EntryKind) => void; onBatches: () => void; onOpenBatch: (batch: Batch) => void }) {
  const activeBatches = batches.filter((batch) => batch.status === 'Active')
  const completedBatches = batches.filter((batch) => batch.status === 'Completed')
  const pigHeads = activeBatches.filter((batch) => batch.species === 'Pig').reduce((total, batch) => total + batch.headcount, 0)
  const chickenHeads = activeBatches.filter((batch) => batch.species === 'Chicken').reduce((total, batch) => total + batch.headcount, 0)
  const pigCost = activeBatches.filter((batch) => batch.species === 'Pig').reduce((total, batch) => total + batch.totalCost, 0)
  const chickenCost = activeBatches.filter((batch) => batch.species === 'Chicken').reduce((total, batch) => total + batch.totalCost, 0)
  const profitYtd = completedBatches.reduce((total, batch) => total + (batch.profit ?? 0), 0)
  const salesYtd = completedBatches.reduce((total, batch) => total + batch.totalCost + (batch.profit ?? 0), 0)
  const expensesYtd = expenses.reduce((total, expense) => total + expense.amount, 0)
  return <><section className="quick-actions" aria-labelledby="quick-actions-title"><div className="section-intro"><p className="section-kicker">Farm record</p><h2 id="quick-actions-title">What happened today?</h2></div><div className="action-row">{(['Weekly feed use', 'Mortality', 'Weekly weight check', 'Expense', 'Sale'] as EntryKind[]).map((kind) => <button className="quick-button" key={kind} type="button" onClick={() => onEntry(kind)}><b>{kind}</b><span>{kind === 'Weekly feed use' ? 'Record bags used' : kind === 'Weekly weight check' ? 'Record weekly weight' : 'Record entry'}</span></button>)}</div></section>
    <section className="overview-grid" aria-label="Farm overview"><article className="summary-card animals animal-summary"><p>Animals on farm <b>{totalAnimals} heads</b></p><div className="animal-breakdown"><span><b>Pigs</b><em>{pigHeads} heads</em></span><span><b>Chickens</b><em>{chickenHeads} heads</em></span></div><small>Across {activeBatches.length} active batches</small></article><article className="summary-card feed-summary"><p>Feed on hand <b>36 bags</b></p><div className="feed-breakdown"><span><b>Chicken</b><i>Starter <em>5</em></i><i>Grower <em>7</em></i><i>Finisher <em>6</em></i></span><span><b>Pig</b><i>Starter <em>4</em></i><i>Grower <em>9</em></i><i>Finisher <em>5</em></i></span></div></article><article className="summary-card cost-summary"><p>Active batch cost <b>{php.format(totalCost)}</b></p><div className="cost-breakdown"><span><b>Pig batches</b><em>{php.format(pigCost)}</em></span><span><b>Chicken batches</b><em>{php.format(chickenCost)}</em></span></div></article><article className="summary-card ytd-summary"><p>Year to date</p><div className="ytd-breakdown"><span><b>Total sales</b><em>{php.format(salesYtd)}</em></span><span><b>Profit</b><em>{php.format(profitYtd)}</em></span><span><b>Expenses</b><em>{php.format(expensesYtd)}</em></span></div></article><article className="summary-card warning"><p>Needs attention</p><strong>2</strong><span>Check feed stock and weights</span></article></section>
    <section className="content-layout"><article className="table-panel"><div className="panel-heading"><div><p className="section-kicker">Grow-out</p><h2>Active batches</h2></div><button className="quiet-action" type="button" onClick={onBatches}>View all batches</button></div><BatchTable batches={activeBatches} onOpen={onOpenBatch} /></article><aside className="side-panels"><FeedCard /><article className="performance-card"><p className="section-kicker">Batch watch</p><h2>CHK-20260728</h2><p>Approaching target market weight.</p><div className="performance-value"><strong>1.46 <small>kg</small></strong><span>Target<br /><b>1.80 kg</b></span></div><div className="progress"><span /></div><button type="button" onClick={() => onEntry('Weekly weight check')}>Record weekly weight</button></article></aside></section>
    <Ledger /></>
}

function BatchesPage({ batches, selectedBatch, onAddBatch, onEditBatch, onOpenBatch }: { batches: Batch[]; selectedBatch: Batch | null; onAddBatch: () => void; onEditBatch: (batch: Batch) => void; onOpenBatch: (batch: Batch) => void }) {
  const [completedFrom, setCompletedFrom] = useState('')
  const [completedTo, setCompletedTo] = useState('')
  const activeBatches = batches.filter((batch) => batch.status === 'Active')
  const completedBatches = batches.filter((batch) => batch.status === 'Completed' && (!completedFrom || batch.purchaseDate >= completedFrom) && (!completedTo || batch.purchaseDate <= completedTo))
  return <><section className="batches-toolbar"><p className="section-kicker">Grow-out operations</p><div className="batch-toolbar-actions">{selectedBatch && <button className="quiet-action" type="button" onClick={() => onEditBatch(selectedBatch)}>Edit batch</button>}<button className="primary-action" type="button" onClick={onAddBatch}>Add livestock batch</button></div></section>
    <section className="batch-metrics"><span><b>{activeBatches.length}</b> active batches</span><span><b>{activeBatches.filter((batch) => batch.species === 'Pig').length}</b> pig batches</span><span><b>{activeBatches.filter((batch) => batch.species === 'Chicken').length}</b> chicken batches</span></section>
    <article className="table-panel batches-list"><div className="panel-heading"><div><p className="section-kicker">Current stock</p><h2>All active batches</h2></div><span className="list-note">Select a batch to view its ledger</span></div><BatchTable batches={activeBatches} onOpen={onOpenBatch} /></article>
    <article className="table-panel completed-list"><div className="panel-heading"><div><p className="section-kicker">History</p><h2>Completed batches</h2></div><div className="date-filter"><label>From<input type="date" value={completedFrom} onChange={(event) => setCompletedFrom(event.target.value)} /></label><label>To<input type="date" value={completedTo} onChange={(event) => setCompletedTo(event.target.value)} /></label></div></div><BatchTable batches={completedBatches} onOpen={onOpenBatch} showProfit /><p className="filter-note">{completedBatches.length} completed batch{completedBatches.length === 1 ? '' : 'es'} shown. Filter uses the purchase date.</p></article>
  </>
}

function ExpensesPage({ expenses, onAddExpense }: { expenses: Expense[]; onAddExpense: () => void }) {
  const [from, setFrom] = useState('2026-08-01')
  const [to, setTo] = useState('2026-09-02')
  const [category, setCategory] = useState<'All' | ExpenseCategory>('All')
  const [assignedTo, setAssignedTo] = useState('All')
  const assignments = ['All', ...Array.from(new Set(expenses.map((expense) => expense.batchId)))]
  const visibleExpenses = expenses.filter((expense) => expense.date >= from && expense.date <= to && (category === 'All' || expense.category === category) && (assignedTo === 'All' || expense.batchId === assignedTo))
  const total = visibleExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  const totalByCategory = (type: ExpenseCategory) => visibleExpenses.filter((expense) => expense.category === type).reduce((sum, expense) => sum + expense.amount, 0)
  return <><section className="expenses-toolbar"><div className="expense-filters"><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value as 'All' | ExpenseCategory)}><option>All</option><option>Feed</option><option>Medicine</option><option>Materials</option><option>Gas</option><option>Salary</option></select></label><label>Assigned to<select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>{assignments.map((assignment) => <option key={assignment}>{assignment}</option>)}</select></label></div><button className="primary-action" type="button" onClick={onAddExpense}>Add expense</button></section>
    <section className="expense-summary" aria-label="Expense summary"><article><p>Total expenses</p><strong>{php.format(total)}</strong><span>{visibleExpenses.length} records in selected period</span></article>{(['Feed', 'Medicine', 'Materials', 'Gas', 'Salary'] as ExpenseCategory[]).map((type) => <article key={type}><p>{type}</p><strong>{php.format(totalByCategory(type))}</strong><span>{visibleExpenses.filter((expense) => expense.category === type).length} records</span></article>)}</section>
    <article className="table-panel expense-list"><div className="panel-heading"><div><p className="section-kicker">Expense ledger</p><h2>Recorded expenses</h2></div><span className="list-note">Amounts are in Philippine pesos</span></div><div className="expense-table" role="table" aria-label="Expense ledger"><div className="expense-head" role="row"><span>Date</span><span>Category</span><span>Supplier</span><span>Assigned to</span><span>Description</span><span>Employee</span><span>Bonus / tips</span><span>Amount</span></div>{visibleExpenses.map((expense) => <div className="expense-row" role="row" key={expense.id}><span>{formatDate(expense.date)}</span><span><i className={`expense-tag ${expense.category.toLowerCase()}`}>{expense.category}</i></span><span>{expense.supplier}</span><span>{expense.batchId}</span><span>{expense.description}</span><span>{expense.employeeName ?? '-'}</span><span>{expense.category === 'Salary' ? php.format(expense.bonusAmount ?? 0) : '-'}</span><span>{php.format(expense.amount)}</span></div>)}</div><p className="filter-note">{visibleExpenses.length} expense{visibleExpenses.length === 1 ? '' : 's'} shown.</p></article>
  </>
}

function BatchTable({ batches, onOpen, showProfit = false }: { batches: Batch[]; onOpen: (batch: Batch) => void; showProfit?: boolean }) {
  return <div className={showProfit ? 'batch-table with-profit' : 'batch-table'} role="table" aria-label="Livestock batches"><div className="table-head" role="row"><span>Batch</span><span>Status</span><span>Headcount</span><span>Heads lost</span><span>Days raised</span><span>Live weight</span><span>Feed conversion</span><span>Cost to date</span>{showProfit && <span>Profit</span>}</div>{batches.map((batch) => { const progress = Math.round(batch.averageWeight / batch.targetWeight * 100); return <button className="batch-row" type="button" key={batch.id} onClick={() => onOpen(batch)}><span className="batch-name"><i className={batch.species === 'Pig' ? 'species pig' : 'species chicken'}>{batch.species === 'Pig' ? 'P' : 'C'}</i><b>{batch.id}</b><small>Bought {formatDate(batch.purchaseDate)}</small><small>Supplier: {batch.supplier}</small></span><span><i className={batch.status === 'Completed' ? 'batch-status completed' : 'batch-status active'}>{batch.status}</i></span><span>{batch.headcount}<small>heads</small></span><span className={batch.headsLost > 0 ? 'loss-count has-loss' : 'loss-count'}>{batch.headsLost}<small>heads</small></span><span>{batchDays(batch.purchaseDate)}<small>days</small></span><span>{batch.averageWeight}<small>kg avg. · {progress}% target</small></span><span>{batch.fcr || 'Pending'}<small>FCR</small></span><span>{php.format(batch.totalCost)}<small>PHP</small></span>{showProfit && <span className="profit-value">{php.format(batch.profit ?? 0)}<small>PHP</small></span>}</button> })}</div>
}

function FeedCard() { return <article className="feed-card"><div className="panel-heading"><div><p className="section-kicker">Inventory</p><h2>Feed stock</h2></div><button className="quiet-action" type="button">Manage</button></div>{[['Hog grower', '62%', '18 bags', ''], ['Broiler finisher', '23%', '6 bags', 'low'], ['Broiler starter', '45%', '12 bags', '']].map(([name, width, amount, state]) => <div className={`stock-line ${state}`} key={name}><b>{name}</b><span><i style={{ width }} /></span><em>{amount}</em></div>)}<p className="stock-warning">Broiler finisher is below your 10 bag minimum.</p></article> }
function Ledger() { return <section className="ledger-section"><div className="panel-heading"><div><p className="section-kicker">This week</p><h2>Farm ledger</h2></div><button className="quiet-action" type="button">Open report</button></div><div className="ledger-items"><p><time>Mon</time><span className="ledger-mark feed" /><b>4 bags broiler grower recorded</b><small>CHK-20260822 · {php.format(1792)}</small></p><p><time>Tue</time><span className="ledger-mark weight" /><b>Weight sample added</b><small>CHK-20260728 · 1.46 kg average</small></p><p><time>Tue</time><span className="ledger-mark cost" /><b>Diesel expense recorded</b><small>Farm overhead · {php.format(850)}</small></p></div></section> }

function PerformancePanel({ batches, expenses, batchNotes, mortalityRecords, performanceByBatch, saleEstimates, onAddWeight, onAddNote, onSaveEstimate }: { batches: Batch[]; expenses: Expense[]; batchNotes: BatchNote[]; mortalityRecords: MortalityRecord[]; performanceByBatch: Record<string, PerformanceSample[]>; saleEstimates: Record<string, { price: number; weight: number }>; onAddWeight: () => void; onAddNote: () => void; onSaveEstimate: (batch: Batch, price: number, weight: number) => void }) {
  const activeBatches = batches.filter((batch) => batch.status === 'Active')
  const [selectedBatchId, setSelectedBatchId] = useState('CHK-20260728')
  const [estimatedPrices, setEstimatedPrices] = useState<Record<string, number>>({})
  const [estimatedWeights, setEstimatedWeights] = useState<Record<string, number>>({})
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null)
  const selectedBatch = activeBatches.find((batch) => batch.id === selectedBatchId) ?? activeBatches[0]
  if (!selectedBatch) return null
  const samples = performanceByBatch[selectedBatch.id] ?? []
  const weeks = samples.map((_, index) => index === 0 ? 'Arrival' : `Wk ${index}`)
  const chartDates = samples.map((_, index) => {
    const date = new Date(`${selectedBatch.purchaseDate}T00:00:00`)
    date.setDate(date.getDate() + index * 7)
    return date.toISOString().slice(0, 10)
  })
  const chartPoints = samples.map((sample, index) => ({ x: 58 + index * 517 / Math.max(samples.length - 1, 1), y: 174 - Math.min(sample.averageWeight / selectedBatch.targetWeight, 1) * 151 }))
  const chartPath = chartPoints.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const weightTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({ value: selectedBatch.targetWeight * ratio, y: 23 + (1 - ratio) * 151 }))
  const formatWeightTick = (weight: number) => `${weight >= 10 ? weight.toFixed(0) : weight.toFixed(2)} kg`
  const latestFeedBags = samples.at(-1)?.feedBags ?? 0
  const maxFeedBags = Math.max(...samples.map((sample) => sample.feedBags), 0.25)
  const targetProgress = Math.round(selectedBatch.averageWeight / selectedBatch.targetWeight * 100)
  const estimatedPrice = estimatedPrices[selectedBatch.id] ?? saleEstimates[selectedBatch.id]?.price ?? (selectedBatch.species === 'Pig' ? 185 : 120)
  const estimatedWeight = estimatedWeights[selectedBatch.id] ?? saleEstimates[selectedBatch.id]?.weight ?? selectedBatch.targetWeight
  const remainingHeads = selectedBatch.headcount - selectedBatch.headsLost
  const projectedWeight = remainingHeads * estimatedWeight
  const projectedRevenue = projectedWeight * estimatedPrice
  const expectedProfit = projectedRevenue - selectedBatch.totalCost
  const weeklyNotes = samples.map((sample, index) => ({ id: `week-${index}`, date: chartDates[index], type: index === 0 ? 'Starting check' : 'Weekly check', title: `${sample.averageWeight} kg average weight`, detail: index === 0 ? 'Starting weight recorded on arrival' : `${sample.feedBags} of 50 kg feed bags used this week` }))
  const purchaseNote = { id: 'purchase', date: selectedBatch.purchaseDate, type: 'Purchase', title: `${selectedBatch.headcount} ${selectedBatch.species.toLowerCase()} received`, detail: `Purchased from ${selectedBatch.supplier}` }
  const expenseNotes = expenses.filter((expense) => expense.batchId === selectedBatch.id).map((expense) => ({ id: expense.id, date: expense.date, type: expense.category, title: `${expense.category} recorded`, detail: `${expense.description} · ${php.format(expense.amount)}` }))
  const manualNotes = batchNotes.filter((note) => note.batchId === selectedBatch.id).map((note) => ({ id: note.id, date: note.date, type: note.type, title: 'Farm note', detail: note.note }))
  const lossNotes = mortalityRecords.filter((record) => record.batchId === selectedBatch.id).map((record) => ({ id: record.id, date: record.date, type: 'Mortality', title: `${record.headsLost} head${record.headsLost === 1 ? '' : 's'} lost`, detail: record.note || 'No reason recorded' }))
  const timeline = [purchaseNote, ...weeklyNotes, ...expenseNotes, ...manualNotes, ...lossNotes].sort((first, second) => first.date.localeCompare(second.date))
  const selectedDate = selectedDayIndex === null ? null : chartDates[selectedDayIndex]
  const visibleTimeline = selectedDate ? timeline.filter((note) => note.date === selectedDate) : timeline
  return <section className="performance-panel">
    <div className="panel-heading"><div><p className="section-kicker">Weekly performance</p><h2>{selectedBatch.id} growth and feed</h2></div><div className="performance-actions"><label>Active batch<select value={selectedBatch.id} onChange={(event) => { setSelectedBatchId(event.target.value); setSelectedDayIndex(null) }}>{activeBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.id} · {batch.species}</option>)}</select></label><button className="quiet-action" type="button" onClick={onAddWeight}>Add weekly weight</button><button className="quiet-action" type="button" onClick={onAddNote}>Add note</button></div></div>
    <div className="performance-metrics"><span><b>{selectedBatch.averageWeight} kg</b>Latest average weight</span><span><b>{latestFeedBags} bags</b>Feed used this week</span><span><b>{selectedBatch.fcr || 'Pending'}</b>Current FCR</span><span><b>{targetProgress}%</b>Target weight reached</span></div>
    <section className="market-estimate" aria-label="Projected batch sale"><div className="market-estimate-heading"><div><p className="section-kicker">Market estimate</p><h2>Expected sale and profit</h2></div><p>{remainingHeads} remaining {selectedBatch.species === 'Chicken' ? 'birds' : 'heads'} · cost to date {php.format(selectedBatch.totalCost)}</p></div><div className="estimate-inputs"><label>Price per kg<span className="price-input"><b>PHP</b><input aria-label="Estimated price per kg" type="number" min="0" step="1" value={estimatedPrice} onChange={(event) => setEstimatedPrices((current) => ({ ...current, [selectedBatch.id]: Number(event.target.value) }))} onBlur={() => onSaveEstimate(selectedBatch, estimatedPrice, estimatedWeight)} /></span></label><label>Sale weight per {selectedBatch.species === 'Chicken' ? 'bird' : 'head'}<span className="price-input"><b>KG</b><input aria-label={`Projected sale weight per ${selectedBatch.species === 'Chicken' ? 'bird' : 'head'}`} type="number" min="0" step="0.01" value={estimatedWeight} onChange={(event) => setEstimatedWeights((current) => ({ ...current, [selectedBatch.id]: Number(event.target.value) }))} onBlur={() => onSaveEstimate(selectedBatch, estimatedPrice, estimatedWeight)} /></span></label></div><div className="estimate-outcomes"><div className="estimate-value"><span>Projected sale weight</span><b>{projectedWeight.toLocaleString()} kg</b></div><div className="estimate-value"><span>Projected revenue</span><b>{php.format(projectedRevenue)}</b></div><div className={expectedProfit >= 0 ? 'estimate-value profit-positive' : 'estimate-value profit-negative'}><span>Expected profit</span><b>{php.format(expectedProfit)}</b></div></div></section>
    <div className="trend-layout"><article><div className="chart-title"><b>Average weight gain</b><span>Target: {selectedBatch.targetWeight.toFixed(2)} kg</span></div><svg className="weight-chart" viewBox="0 0 600 210" role="img" aria-label={`Average ${selectedBatch.species.toLowerCase()} weight history for ${selectedBatch.id}`} onClick={() => setSelectedDayIndex(null)}>{weightTicks.map((tick) => <g key={tick.value}><line className="grid-line" x1="58" y1={tick.y} x2="575" y2={tick.y} /><text className="axis-label" x="51" y={tick.y + 3} textAnchor="end">{formatWeightTick(tick.value)}</text></g>)}<line className="axis-line" x1="58" y1="23" x2="58" y2="174" /><path d={chartPath} /><path className="target-line" d="M 58 23 L 575 23" />{chartPoints.map((point, index) => <circle className={selectedDayIndex === index ? 'selected-point' : undefined} key={weeks[index]} cx={point.x} cy={point.y} r="6" role="button" tabIndex={0} aria-label={`Show notes for ${weeks[index]}, ${formatDate(chartDates[index])}`} onClick={(event) => { event.stopPropagation(); setSelectedDayIndex(index) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedDayIndex(index) }} />)}{chartPoints.map((point, index) => <text key={weeks[index]} x={point.x} y="201" textAnchor="middle">{weeks[index]}</text>)}</svg></article><article><div className="chart-title"><b>Weekly feed used</b><span>50 kg bags, quarter-bag increments</span></div><div className="feed-chart" style={{ gridTemplateColumns: `repeat(${samples.length}, 1fr)` }}>{samples.map((sample, index) => <div key={weeks[index]}><span style={{ height: `${sample.feedBags / maxFeedBags * 100}%` }}><b>{sample.feedBags}</b></span><small>{weeks[index]}</small></div>)}</div></article></div>
    <article className="performance-timeline"><div className="panel-heading"><div><p className="section-kicker">Batch record</p><h2>{selectedDate ? `Dates and notes · ${formatDate(selectedDate)}` : 'Dates and notes'}</h2></div>{selectedDate ? <button className="quiet-action" type="button" onClick={() => setSelectedDayIndex(null)}>Show all notes</button> : <span className="list-note">{timeline.length} recorded events</span>}</div><div className="timeline-list">{visibleTimeline.map((note) => <div className="timeline-item" key={note.id}><time>{formatDate(note.date)}</time><span className={`timeline-marker ${note.type.toLowerCase().replaceAll(' ', '-')}`} aria-label={note.type === 'Mortality' ? 'Mortality event' : note.type === 'Medicine' ? 'Medicine event' : undefined}>{note.type === 'Mortality' ? '!' : note.type === 'Medicine' ? '+' : ''}</span><div><i>{note.type}</i><b>{note.title}</b><p>{note.detail}</p></div></div>)}</div></article>
  </section>
}

function EntryModal({ activeEntry, batches, onClose, onSave }: { activeEntry: EntryKind; batches: Batch[]; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop" role="presentation"><section className="entry-modal" role="dialog" aria-modal="true" aria-labelledby="entry-title"><div><p className="section-kicker">New farm record</p><h2 id="entry-title">{activeEntry}</h2><p>{activeEntry === 'Batch note' ? 'Keep a dated record of medicine, health observations, pen work, or anything important for this batch.' : activeEntry === 'Mortality' ? 'Record the number of animals lost. This immediately updates the selected batch headcount record and the weekly performance record.' : activeEntry === 'Weekly feed use' ? 'Record total bags used by this batch during the week, in quarter-bag steps. The configured bag weight converts this to kilograms for FCR.' : activeEntry === 'Weekly weight check' ? 'Record the batch average for the completed week. This drives the growth trend and FCR calculation.' : 'Saved on this device immediately, then synced when online.'}</p></div><button className="close-modal" type="button" onClick={onClose} aria-label="Close entry form">Close</button><form onSubmit={onSave}><label>Batch<select name="batchId" required>{batches.filter((batch) => batch.status === 'Active').map((batch) => <option key={batch.id}>{batch.id}</option>)}</select></label>{activeEntry === 'Batch note' ? <><div className="form-grid"><label>Record type<select name="noteType" defaultValue="Observation"><option>Medicine</option><option>Health check</option><option>Observation</option><option>Pen maintenance</option><option>Reminder</option></select></label><label>Date<input name="date" required type="date" defaultValue="2026-09-02" /></label></div><label>Note<input name="note" required autoFocus placeholder="What happened or what needs attention?" /></label></> : <><div className="form-grid"><label>{activeEntry === 'Expense' ? 'Amount (PHP)' : activeEntry === 'Weekly weight check' ? 'Average weight (kg)' : activeEntry === 'Mortality' ? 'Heads lost' : activeEntry === 'Sale' ? 'Live weight (kg)' : 'Bags used this week'}<input name="value" required min={activeEntry === 'Mortality' ? '1' : '0'} step={activeEntry === 'Weekly feed use' ? '0.25' : activeEntry === 'Mortality' ? '1' : '0.01'} type="number" autoFocus /></label><label>{activeEntry === 'Weekly feed use' || activeEntry === 'Weekly weight check' ? 'Week ending' : 'Date'}<input name="date" required type="date" defaultValue="2026-09-02" /></label></div><label>Note (optional)<input name="note" placeholder="Supplier, reason, or other details" /></label></>}<button className="submit-entry" type="submit">Save {activeEntry}</button></form></section></div> }

function ExpenseForm({ batches, onClose, onSubmit }: { batches: Batch[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('Feed')
  const isSalary = category === 'Salary'
  return <div className="modal-backdrop" role="presentation"><section className="entry-modal payroll-modal" role="dialog" aria-modal="true" aria-labelledby="expense-title"><div><p className="section-kicker">New expense</p><h2 id="expense-title">Record a cost</h2><p>Record the supplier and assign the cost to a batch or farm overhead.</p></div><button className="close-modal" type="button" onClick={onClose} aria-label="Close expense form">Close</button><form onSubmit={onSubmit}><div className="form-grid"><label>Category<select name="category" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}><option>Feed</option><option>Medicine</option><option>Materials</option><option>Gas</option><option>Salary</option></select></label><label>Date<input name="date" required type="date" defaultValue="2026-09-02" /></label></div>{isSalary && <section className="payroll-card"><div className="payroll-card-title"><div><b>Weekly payroll</b><small>Farm overhead</small></div><span>Enter only the amounts paid</span></div><div className="payroll-rows"><span className="payroll-heading">Employee</span><span className="payroll-heading">Base pay</span><span className="payroll-heading">Bonus / tips</span>{['Kuya Rowel', 'Inek', 'Joshua'].flatMap((employeeName) => [<b key={`${employeeName}-name`}>{employeeName}</b>, <input key={`${employeeName}-salary`} name={`salary-${employeeName}`} min="0" step="0.01" type="number" placeholder="0.00" aria-label={`${employeeName} base pay`} />, <input key={`${employeeName}-bonus`} name={`bonus-${employeeName}`} min="0" step="0.01" type="number" placeholder="0.00" aria-label={`${employeeName} bonus or tips`} />])}</div></section>}<label>Supplier<input name={isSalary ? undefined : 'supplier'} required={!isSalary} placeholder="Store, farm, or supplier name" defaultValue={isSalary ? 'Farm workers' : undefined} disabled={isSalary} autoFocus={!isSalary} />{isSalary && <input name="supplier" type="hidden" value="Farm workers" />}</label><div className="form-grid"><label>Assign to<select name={isSalary ? undefined : 'batchId'} defaultValue="Farm overhead" disabled={isSalary}><option>Farm overhead</option>{!isSalary && batches.filter((batch) => batch.status === 'Active').map((batch) => <option key={batch.id}>{batch.id}</option>)}</select>{isSalary && <><input name="batchId" type="hidden" value="Farm overhead" /><small className="field-note">Salary is always assigned to farm overhead.</small></>}</label>{!isSalary && <label>Amount (PHP)<input name="amount" required min="0" step="0.01" type="number" /></label>}</div><label>Description<input name={isSalary ? undefined : 'description'} required={!isSalary} placeholder="What was purchased?" defaultValue={isSalary ? 'Weekly worker payroll' : undefined} disabled={isSalary} />{isSalary && <input name="description" type="hidden" value="Weekly worker payroll" />}</label><button className="submit-entry" type="submit">Save expense</button></form></section></div>
}

function BatchForm({ batch, onClose, onSubmit }: { batch?: Batch; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const isEditing = Boolean(batch); return <div className="modal-backdrop" role="presentation"><section className="entry-modal batch-form" role="dialog" aria-modal="true" aria-labelledby="batch-title"><div><p className="section-kicker">{isEditing ? 'Correct batch details' : 'New livestock purchase'}</p><h2 id="batch-title">{isEditing ? `Edit ${batch?.id}` : 'Create a batch'}</h2><p>{isEditing ? 'Update the original purchase information. Recorded weight, feed, mortality, notes, and costs remain attached to this batch.' : 'The app creates a code from the species and purchase date, such as PIG-20260902.'}</p></div><button className="close-modal" type="button" onClick={onClose} aria-label="Close batch form">Close</button><form onSubmit={onSubmit}>{isEditing && <label>Batch code<input name="batchCode" required defaultValue={batch?.id} autoFocus /></label>}<div className="form-grid"><label>Animal type<select name="species" defaultValue={batch?.species ?? 'Pig'}><option>Pig</option><option>Chicken</option></select></label><label>Purchase date<input name="purchaseDate" required type="date" defaultValue={batch?.purchaseDate ?? '2026-09-02'} /></label></div><label>Bought from<input name="supplier" required placeholder="Supplier or farm name" defaultValue={batch?.supplier} autoFocus={!isEditing} /></label><div className="form-grid"><label>Starting headcount<input name="headcount" required min="1" step="1" type="number" defaultValue={batch?.headcount} /></label><label>Purchase cost (PHP)<input name="purchaseCost" required min="0" step="0.01" type="number" defaultValue={batch?.totalCost} /></label></div><div className="form-grid">{!isEditing && <label>Starting average weight (kg)<input name="startingWeight" required min="0" step="0.01" type="number" /></label>}<label>Target selling weight (kg)<input name="targetWeight" required min="0" step="0.01" type="number" defaultValue={batch?.targetWeight} /></label></div><button className="submit-entry" type="submit">{isEditing ? 'Save batch changes' : 'Create batch'}</button></form></section></div> }

export default App