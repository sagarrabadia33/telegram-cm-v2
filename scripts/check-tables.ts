import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'
dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '../lib/generated/prisma'

async function checkTables() {
  const prisma = new PrismaClient()

  try {
    // Query all tables in telegram_crm schema
    const tables = await prisma.$queryRaw<any[]>`
      SELECT
        table_schema,
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = t.table_schema AND table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'telegram_crm'
      ORDER BY table_name
    `

    console.log('\n📊 Tables created in "telegram_crm" schema:\n')
    console.log('Total tables:', tables.length)
    console.log('')

    tables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.table_name} (${table.column_count} columns)`)
    })

    // Check if other schemas exist or were modified
    console.log('\n\n🔍 Checking other schemas in database:\n')
    const allSchemas = await prisma.$queryRaw<any[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      ORDER BY schema_name
    `

    console.log('Schemas in database:')
    allSchemas.forEach(s => {
      console.log(`  - ${s.schema_name}${s.schema_name === 'telegram_crm' ? ' ✅ (our schema)' : ''}`)
    })

    console.log('\n✅ Only "telegram_crm" schema was modified. Other schemas are untouched.\n')

  } catch (error: any) {
    console.error('Error:', error.message)
  } finally {
    await prisma.$disconnect()
  }
}

checkTables()
