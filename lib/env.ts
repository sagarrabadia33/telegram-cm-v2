/**
 * Environment Configuration
 *
 * Centralizes all environment variables and provides smart defaults
 * for development vs production environments.
 */

export const config = {
  // Environment detection
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database
  database: {
    url: process.env.DATABASE_URL!,
    // Connection pooling (Railway needs more connections)
    poolSize: process.env.NODE_ENV === 'production' ? 20 : 5,
  },

  // Telegram
  telegram: {
    apiId: process.env.TELEGRAM_API_ID!,
    apiHash: process.env.TELEGRAM_API_HASH!,
    phoneNumber: process.env.TELEGRAM_PHONE_NUMBER!,

    // Session storage strategy
    // - file: Store in config/ folder (development)
    // - database: Store in TelegramSession table (production)
    sessionStorage: process.env.SESSION_STORAGE ||
      (process.env.NODE_ENV === 'production' ? 'database' : 'file'),
  },

  // Sync settings
  sync: {
    // Local: sync faster for testing
    // Production: sync conservatively to avoid rate limits
    batchSize: parseInt(process.env.SYNC_BATCH_SIZE ||
      (process.env.NODE_ENV === 'production' ? '20' : '50')),

    delayMs: parseInt(process.env.SYNC_DELAY_MS ||
      (process.env.NODE_ENV === 'production' ? '1000' : '500')),
  },

  // Railway specific
  railway: {
    environment: process.env.RAILWAY_ENVIRONMENT,
    projectId: process.env.RAILWAY_PROJECT_ID,
    port: process.env.PORT || 3000,
  },
}

// Validation: Ensure required env vars are set
export function validateEnv() {
  const required = [
    'DATABASE_URL',
    'TELEGRAM_API_ID',
    'TELEGRAM_API_HASH',
    'TELEGRAM_PHONE_NUMBER',
  ]

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env.local file or Railway environment variables.'
    )
  }
}

// Log configuration (useful for debugging)
export function logConfig() {
  if (config.isDev) {
    console.log('🔧 Environment Configuration:')
    console.log('  - Node env:', config.nodeEnv)
    console.log('  - Database:', config.database.url.substring(0, 50) + '...')
    console.log('  - Session storage:', config.telegram.sessionStorage)
    console.log('  - Sync batch size:', config.sync.batchSize)
    console.log('  - Sync delay:', config.sync.delayMs + 'ms')

    if (config.railway.environment) {
      console.log('  - Railway env:', config.railway.environment)
    }
  }
}
