import { app } from '@azure/functions'
import { createHash } from 'node:crypto'
import { query } from '../db.js'

const json = (body, status = 200) => ({ status, jsonBody: body })

const identityFromRequest = (request) => {
  const encodedPrincipal = request.headers.get('x-ms-client-principal')
  if (!encodedPrincipal) return null

  return JSON.parse(Buffer.from(encodedPrincipal, 'base64').toString('utf8'))
}

const uuidFromIdentity = (value) => {
  const hash = createHash('sha256').update(value).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

const getCurrentUser = async (request) => {
  const principal = identityFromRequest(request)
  if (!principal?.userId || !principal?.userDetails) return null
  const entraObjectId = uuidFromIdentity(principal.userId)

  const result = await query(
    `INSERT INTO farm_users (entra_object_id, display_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (entra_object_id) DO UPDATE
     SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
     RETURNING id`,
    [entraObjectId, principal.userDetails, principal.userDetails],
  )

  return result.rows[0].id
}

const createSupplier = async (name) => {
  if (!name) return null

  const result = await query(
    `INSERT INTO suppliers (name)
     VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name.trim()],
  )

  return result.rows[0].id
}

const initialBatches = [
  { batchCode: 'PIG-20260814', species: 'Pig', purchaseDate: '2026-08-14', supplier: 'San Miguel Hog Farm', headcount: 10, targetWeightKg: 90, purchaseCostPhp: 82560, status: 'Active' },
  { batchCode: 'CHK-20260822', species: 'Chicken', purchaseDate: '2026-08-05', supplier: 'Bulacan Poultry Supply', headcount: 100, targetWeightKg: 1.8, purchaseCostPhp: 16028, status: 'Active' },
  { batchCode: 'CHK-20260728', species: 'Chicken', purchaseDate: '2026-07-28', supplier: 'Bulacan Poultry Supply', headcount: 96, targetWeightKg: 1.8, purchaseCostPhp: 15740, status: 'Active' },
  { batchCode: 'PIG-20260412', species: 'Pig', purchaseDate: '2026-04-12', supplier: 'San Miguel Hog Farm', headcount: 10, targetWeightKg: 90, purchaseCostPhp: 127600, status: 'Completed' },
  { batchCode: 'PIG-20260119', species: 'Pig', purchaseDate: '2026-01-19', supplier: 'Tarlac Growers Cooperative', headcount: 14, targetWeightKg: 90, purchaseCostPhp: 176400, status: 'Completed' },
  { batchCode: 'CHK-20260516', species: 'Chicken', purchaseDate: '2026-05-16', supplier: 'Bulacan Poultry Supply', headcount: 180, targetWeightKg: 1.8, purchaseCostPhp: 68400, status: 'Completed' },
  { batchCode: 'CHK-20260308', species: 'Chicken', purchaseDate: '2026-03-08', supplier: 'North Luzon Hatchery', headcount: 150, targetWeightKg: 1.8, purchaseCostPhp: 57120, status: 'Completed' },
]

const initialPerformance = {
  'PIG-20260814': [[30, 1.25], [34.2, 1.75], [38.5, 1.75], [42.8, 2.25]],
  'CHK-20260822': [[0.04, 0.25], [0.19, 0.5], [0.46, 0.75], [0.86, 1]],
  'CHK-20260728': [[0.04, 0.25], [0.18, 0.5], [0.42, 0.75], [0.72, 1], [1.08, 1], [1.46, 1]],
}

const initialMortality = [
  ['CHK-20260822', '2026-08-17', 1, 'Weak chick found during morning check'],
  ['CHK-20260822', '2026-08-24', 1, 'Loss recorded after heavy rain'],
  ['CHK-20260728', '2026-08-02', 2, 'Early brooding losses'],
  ['CHK-20260728', '2026-08-16', 1, 'Small bird found weak during health check'],
  ['CHK-20260728', '2026-08-27', 1, 'Loss recorded after heat stress observation'],
]

const initialExpenses = [
  ['2026-09-02', 'Gas', 'Petron Plaridel', null, 'Pickup fuel for supply run', 850, null, 0],
  ['2026-09-01', 'Feed', 'Bulacan Agri Trading', 'CHK-20260822', 'Broiler grower feed, 4 bags', 1792, null, 0],
  ['2026-08-30', 'Medicine', 'Meycauayan Vet Supply', 'CHK-20260728', 'Vitamins and electrolytes', 1260, null, 0],
  ['2026-08-29', 'Materials', 'Ace Hardware', null, 'Bedding and pen repairs', 2140, null, 0],
  ['2026-08-27', 'Feed', 'Bulacan Agri Trading', 'PIG-20260814', 'Hog grower feed, 6 bags', 3840, null, 0],
  ['2026-08-26', 'Salary', 'Farm workers', null, 'Weekly worker payroll', 3200, 'Kuya Rowel', 200],
]

const seedInitialFarmData = async (userId) => {
  const existing = await query('SELECT id FROM batches LIMIT 1')
  if (existing.rowCount) return

  const batchIds = new Map()
  for (const batch of initialBatches) {
    const supplierId = await createSupplier(batch.supplier)
    const result = await query(
      `INSERT INTO batches (
        batch_code, species, purchase_date, supplier_id, starting_headcount,
        target_weight_kg, purchase_cost_php, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [batch.batchCode, batch.species, batch.purchaseDate, supplierId, batch.headcount, batch.targetWeightKg, batch.purchaseCostPhp, batch.status, userId],
    )
    batchIds.set(batch.batchCode, result.rows[0].id)
  }

  for (const [batchCode, samples] of Object.entries(initialPerformance)) {
    const purchaseDate = initialBatches.find((batch) => batch.batchCode === batchCode).purchaseDate
    for (const [index, [averageWeightKg, feedBags]] of samples.entries()) {
      const weekEnding = new Date(`${purchaseDate}T00:00:00`)
      weekEnding.setDate(weekEnding.getDate() + index * 7)
      await query(
        `INSERT INTO weekly_performance (
          batch_id, week_ending, average_weight_kg, feed_bags, bag_weight_kg, recorded_by
        ) VALUES ($1, $2, $3, $4, 50, $5)`,
        [batchIds.get(batchCode), weekEnding.toISOString().slice(0, 10), averageWeightKg, feedBags, userId],
      )
    }
  }

  for (const [batchCode, lossDate, headsLost, note] of initialMortality) {
    await query(
      'INSERT INTO mortality_records (batch_id, loss_date, heads_lost, note, recorded_by) VALUES ($1, $2, $3, $4, $5)',
      [batchIds.get(batchCode), lossDate, headsLost, note, userId],
    )
  }

  for (const [expenseDate, category, supplier, batchCode, description, amountPhp, employeeName, bonusAmountPhp] of initialExpenses) {
    const supplierId = await createSupplier(supplier)
    await query(
      `INSERT INTO expenses (
        expense_date, category, supplier_id, batch_id, description, amount_php,
        employee_name, bonus_amount_php, recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [expenseDate, category, supplierId, batchCode ? batchIds.get(batchCode) : null, description, amountPhp, employeeName, bonusAmountPhp, userId],
    )
  }
}

const handlers = {
  async createBatch(payload, userId) {
    const supplierId = await createSupplier(payload.supplier)
    return query(
      `INSERT INTO batches (
        batch_code, species, purchase_date, supplier_id, starting_headcount,
        target_weight_kg, purchase_cost_php, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [payload.batchCode, payload.species, payload.purchaseDate, supplierId, payload.headcount, payload.targetWeightKg, payload.purchaseCostPhp, userId],
    )
  },

  async recordPerformance(payload, userId) {
    return query(
      `INSERT INTO weekly_performance (
        batch_id, week_ending, average_weight_kg, feed_bags, bag_weight_kg, note, recorded_by
      ) VALUES ($1, $2, $3, $4, COALESCE($5, 50), $6, $7)
      ON CONFLICT (batch_id, week_ending) DO UPDATE SET
        average_weight_kg = EXCLUDED.average_weight_kg,
        feed_bags = EXCLUDED.feed_bags,
        bag_weight_kg = EXCLUDED.bag_weight_kg,
        note = EXCLUDED.note,
        recorded_by = EXCLUDED.recorded_by
      RETURNING id`,
      [payload.batchId, payload.weekEnding, payload.averageWeightKg, payload.feedBags, payload.bagWeightKg, payload.note, userId],
    )
  },

  async recordMortality(payload, userId) {
    return query(
      `INSERT INTO mortality_records (batch_id, loss_date, heads_lost, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [payload.batchId, payload.lossDate, payload.headsLost, payload.note, userId],
    )
  },

  async createNote(payload, userId) {
    return query(
      `INSERT INTO batch_notes (batch_id, note_date, note_type, note, recorded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [payload.batchId, payload.noteDate, payload.noteType, payload.note, userId],
    )
  },

  async createExpense(payload, userId) {
    const supplierId = await createSupplier(payload.supplier)
    return query(
      `INSERT INTO expenses (
        expense_date, category, supplier_id, batch_id, description, amount_php,
        employee_name, bonus_amount_php, recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), $9)
      RETURNING id`,
      [payload.expenseDate, payload.category, supplierId, payload.batchId, payload.description, payload.amountPhp, payload.employeeName, payload.bonusAmountPhp, userId],
    )
  },

  async saveSaleEstimate(payload, userId) {
    return query(
      `INSERT INTO batch_sale_estimates (
        batch_id, estimated_price_per_kg_php, estimated_weight_per_head_kg, updated_by
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (batch_id) DO UPDATE SET
        estimated_price_per_kg_php = EXCLUDED.estimated_price_per_kg_php,
        estimated_weight_per_head_kg = EXCLUDED.estimated_weight_per_head_kg,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING batch_id`,
      [payload.batchId, payload.estimatedPricePerKgPhp, payload.estimatedWeightPerHeadKg, userId],
    )
  },
}

app.http('farm-data', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'farm-data',
  handler: async (request) => {
    const userId = await getCurrentUser(request)
    if (!userId) return json({ error: 'Authentication is required.' }, 401)

    if (request.method === 'GET') {
      const [batches, performance, mortality, notes, expenses, estimates, sales] = await Promise.all([
        query(`SELECT b.*, s.name AS supplier_name FROM batches b LEFT JOIN suppliers s ON s.id = b.supplier_id ORDER BY b.purchase_date DESC`),
        query('SELECT * FROM weekly_performance ORDER BY week_ending'),
        query('SELECT * FROM mortality_records ORDER BY loss_date'),
        query('SELECT * FROM batch_notes ORDER BY note_date'),
        query('SELECT e.*, s.name AS supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id = e.supplier_id ORDER BY expense_date DESC'),
        query('SELECT * FROM batch_sale_estimates'),
        query('SELECT * FROM sales ORDER BY sale_date DESC'),
      ])
      return json({ batches: batches.rows, performance: performance.rows, mortality: mortality.rows, notes: notes.rows, expenses: expenses.rows, estimates: estimates.rows, sales: sales.rows })
    }

    const { action, payload } = await request.json()
    const handler = handlers[action]
    if (!handler) return json({ error: 'Unsupported data action.' }, 400)

    const result = await handler(payload, userId)
    return json({ id: result.rows[0].id ?? result.rows[0].batch_id }, 201)
  },
})