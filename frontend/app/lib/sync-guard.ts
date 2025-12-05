import { NextResponse } from 'next/server';

/**
 * Production-only sync guard
 *
 * Prevents Telegram sync operations from running in local development.
 * This avoids session conflicts since only one Telegram session can be active
 * per API credentials.
 *
 * Set SYNC_ENABLED=true in Railway environment variables to enable sync.
 * Local development defaults to sync disabled.
 */
export function isSyncEnabled(): boolean {
  return process.env.SYNC_ENABLED === 'true';
}

/**
 * Returns a 403 response if sync is disabled
 */
export function syncDisabledResponse(): NextResponse {
  return NextResponse.json(
    {
      error: 'Telegram sync is disabled in this environment',
      message: 'Sync operations only run in production (Railway). Local development is read-only.',
      code: 'SYNC_DISABLED',
    },
    { status: 403 }
  );
}
