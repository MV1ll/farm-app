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

  async updateBatch(payload) {
    const supplierId = await createSupplier(payload.supplier)
    return query(
      `UPDATE batches
       SET batch_code = $2,
           species = $3,
           purchase_date = $4,
           supplier_id = $5,
           starting_headcount = $6,
           target_weight_kg = $7,
           purchase_cost_php = $8,
           updated_at = now()
       WHERE id = $1
       RETURNING id`,
      [payload.batchId, payload.batchCode, payload.species, payload.purchaseDate, supplierId, payload.headcount, payload.targetWeightKg, payload.purchaseCostPhp],
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