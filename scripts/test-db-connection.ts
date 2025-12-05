/**
 * Database Connection Test
 *
 * Run this to verify your Azure PostgreSQL connection works.
 *
 * Usage:
 *   npm run db:test
 */

// Load environment variables from .env.local
import { config as dotenvConfig } from 'dotenv'
import { resolve } from 'path'

dotenvConfig({ path: resolve(process.cwd(), '.env.local') })

import { PrismaClient } from '../lib/generated/prisma'
import { config, validateEnv, logConfig } from '../lib/env'

async function testConnection() {
  console.log('\n🔍 Testing database connection...\n')

  try {
    // Step 1: Validate environment variables
    console.log('1️⃣  Validating environment variables...')
    validateEnv()
    console.log('✅ All required environment variables are set\n')

    // Step 2: Log configuration
    logConfig()
    console.log('')

    // Step 3: Create Prisma client
    console.log('2️⃣  Creating Prisma client...')
    const prisma = new PrismaClient()
    console.log('✅ Prisma client created\n')

    // Step 4: Connect to database
    console.log('3️⃣  Connecting to database...')
    await prisma.$connect()
    console.log('✅ Connected to database\n')

    // Step 5: Query database version
    console.log('4️⃣  Querying database info...')
    const result = await prisma.$queryRaw<any[]>`
      SELECT version() as version, current_database() as database, current_schema() as schema
    `
    console.log('✅ Database info:')
    console.log('   Version:', result[0].version.substring(0, 50) + '...')
    console.log('   Database:', result[0].database)
    console.log('   Schema:', result[0].schema)
    console.log('')

    // Step 6: Check if tables exist
    console.log('5️⃣  Checking if schema is initialized...')
    const tables = await prisma.$queryRaw<any[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
      ORDER BY table_name
    `

    if (tables.length === 0) {
      console.log('⚠️  No tables found. Run migrations:')
      console.log('   npm run db:push\n')
    } else {
      console.log(`✅ Found ${tables.length} tables:`)
      tables.slice(0, 10).forEach(t => console.log('   -', t.table_name))
      if (tables.length > 10) {
        console.log(`   ... and ${tables.length - 10} more`)
      }
      console.log('')
    }

    // Step 7: Disconnect
    console.log('6️⃣  Disconnecting...')
    await prisma.$disconnect()
    console.log('✅ Disconnected\n')

    console.log('🎉 All tests passed! Database connection is working.\n')

  } catch (error: any) {
    console.error('\n❌ Connection test failed:\n')
    console.error(error.message)
    console.error('\nTroubleshooting:')
    console.error('1. Check your .env.local file has correct DATABASE_URL')
    console.error('2. Ensure Azure PostgreSQL firewall allows your IP')
    console.error('3. Verify username, password, and database name')
    console.error('4. Check if sslmode=require is in connection string\n')
    process.exit(1)
  }
}

testConnection()
