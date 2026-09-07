import { readFile } from 'node:fs/promises'
import process from 'node:process'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL must be set before applying the database schema.')
}

const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8')
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })

await client.connect()

try {
  await client.query('BEGIN')
  await client.query(schema)
  await client.query('COMMIT')
  console.log('FarmIVAll database schema applied successfully.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}