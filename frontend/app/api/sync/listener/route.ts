import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * API endpoint to get real-time listener status from database.
 * This replaces file-based lock checking with database-backed status.
 */

export interface ListenerStatus {
  isRunning: boolean;
  status: string | null;
  processId: string | null;
  hostname: string | null;
  startedAt: string | null;
  lastHeartbeat: string | null;
  lastMessageAt: string | null;
  messagesReceived: number;
  isHealthy: boolean;
  lockInfo: {
    lockType: string;
    acquiredAt: string;
    expiresAt: string;
  } | null;
}

// GET /api/sync/listener - Get listener status from database
export async function GET() {
  try {
    // Check listener state from database
    const listenerState = await prisma.listenerState.findUnique({
      where: { id: 'singleton' },
    });

    // Check listener lock (more reliable than state for running status)
    const listenerLock = await prisma.syncLock.findFirst({
      where: {
        lockType: 'listener',
        lockKey: 'singleton',
        expiresAt: { gt: new Date() },
      },
    });

    // Determine if listener is healthy (heartbeat within last 2 minutes)
    const isHealthy = listenerState?.lastHeartbeat
      ? (Date.now() - new Date(listenerState.lastHeartbeat).getTime()) < 120000
      : false;

    // Listener is running if lock exists and is not expired
    const isRunning = !!listenerLock;

    const status: ListenerStatus = {
      isRunning,
      status: listenerState?.status || null,
      processId: listenerLock?.processId || listenerState?.processId || null,
      hostname: listenerLock?.hostname || listenerState?.hostname || null,
      startedAt: listenerState?.startedAt?.toISOString() || null,
      lastHeartbeat: listenerState?.lastHeartbeat?.toISOString() || null,
      lastMessageAt: listenerState?.lastMessageAt?.toISOString() || null,
      messagesReceived: listenerState?.messagesReceived || 0,
      isHealthy,
      lockInfo: listenerLock ? {
        lockType: listenerLock.lockType,
        acquiredAt: listenerLock.acquiredAt.toISOString(),
        expiresAt: listenerLock.expiresAt.toISOString(),
      } : null,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching listener status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch listener status' },
      { status: 500 }
    );
  }
}
