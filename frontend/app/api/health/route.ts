import { NextResponse } from 'next/server';

/**
 * Health check endpoint for Railway
 * Used for deployment health monitoring
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
}
