/**
 * Database Connection Manager
 *
 * Provides a singleton Prisma client with smart configuration
 * for development vs production environments.
 */

import { PrismaClient } from './generated/prisma'
import { config } from './env'

// Singleton instance
let prisma: PrismaClient | undefined

/**
 * Get Prisma client instance
 *
 * Creates a new client if one doesn't exist, or reuses the existing one.
 * In development, this enables hot reloading without connection leaks.
 */
export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: config.isDev
        ? ['query', 'error', 'warn']  // Verbose logging in dev
        : ['error'],                   // Only errors in prod

      // Connection pool configuration
      datasources: {
        db: {
          url: config.database.url,
        },
      },
    })

    // Log connection in dev
    if (config.isDev) {
      console.log('✅ Prisma client created')
    }
  }

  return prisma
}

/**
 * Disconnect from database
 *
 * Should be called when shutting down the application.
 */
export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect()
    prisma = undefined

    if (config.isDev) {
      console.log('🔌 Prisma client disconnected')
    }
  }
}

// Export singleton instance
export const db = getPrisma()

// Handle process termination
if (typeof window === 'undefined') {
  process.on('beforeExit', async () => {
    await disconnectPrisma()
  })
}
