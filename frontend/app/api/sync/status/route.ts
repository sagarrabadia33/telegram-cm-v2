import { NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { isSyncEnabled, syncDisabledResponse } from '@/app/lib/sync-guard';

// Sync state file paths
const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts', 'telegram-sync-python');
const GLOBAL_STATE_FILE = path.join(SCRIPTS_DIR, 'incremental-sync-state.json');
const SINGLE_STATE_FILE = path.join(SCRIPTS_DIR, 'single-sync-state.json');
const LOCK_FILE = path.join(SCRIPTS_DIR, '.sync.lock');

export interface SyncStatus {
  syncEnabled: boolean; // Whether sync is enabled in this environment
  globalSync: {
    isRunning: boolean;
    startedAt: string | null;
    progress: {
      conversationsProcessed: number;
      conversationsSkipped: number;
      conversationsTotal: number;
      messagesSynced: number;
      currentConversation: string | null;
    } | null;
    lastCompletedAt: string | null;
    lastDuration: number | null;
    errors: Array<{ conversation: string; error: string; timestamp: string }>;
  };
  singleSync: {
    isRunning: boolean;
    conversationId: string | null;
    conversationTitle: string | null;
    startedAt: string | null;
    messagesSynced: number | null;
    error: string | null;
  };
  canStartGlobalSync: boolean;
  canStartSingleSync: boolean;
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    if (!existsSync(filePath)) return null;
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function isLockActive(): Promise<{ locked: boolean; type: string | null; pid: number | null }> {
  try {
    if (!existsSync(LOCK_FILE)) return { locked: false, type: null, pid: null };
    const content = await readFile(LOCK_FILE, 'utf-8');
    const lock = JSON.parse(content);

    // Check if lock is stale (older than 30 minutes)
    const lockTime = new Date(lock.started_at).getTime();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;

    if (now - lockTime > thirtyMinutes) {
      return { locked: false, type: null, pid: null };
    }

    return { locked: true, type: lock.type, pid: lock.pid };
  } catch {
    return { locked: false, type: null, pid: null };
  }
}

// GET /api/sync/status - Get current sync status
export async function GET() {
  try {
    const [globalState, singleState, lockStatus] = await Promise.all([
      readJsonFile(GLOBAL_STATE_FILE),
      readJsonFile(SINGLE_STATE_FILE),
      isLockActive(),
    ]);

    const isGlobalRunning = lockStatus.locked && lockStatus.type === 'global';
    const isSingleRunning = lockStatus.locked && lockStatus.type === 'single';

    const syncEnabled = isSyncEnabled();
    const status: SyncStatus = {
      syncEnabled,
      globalSync: {
        isRunning: isGlobalRunning,
        startedAt: isGlobalRunning && globalState?.started_at ? String(globalState.started_at) : null,
        progress: isGlobalRunning && globalState ? {
          conversationsProcessed: Number(globalState.conversations_processed || 0),
          conversationsSkipped: Number(globalState.conversations_skipped || 0),
          conversationsTotal: Number(globalState.conversations_total || 0),
          messagesSynced: Number(globalState.messages_synced || 0),
          currentConversation: globalState.current_conversation ? String(globalState.current_conversation) : null,
        } : null,
        lastCompletedAt: !isGlobalRunning && globalState?.completed_at ? String(globalState.completed_at) : null,
        lastDuration: !isGlobalRunning && globalState?.duration_seconds ? Number(globalState.duration_seconds) : null,
        errors: Array.isArray(globalState?.errors) ? globalState.errors as SyncStatus['globalSync']['errors'] : [],
      },
      singleSync: {
        isRunning: isSingleRunning,
        conversationId: isSingleRunning && singleState?.conversation_id ? String(singleState.conversation_id) : null,
        conversationTitle: isSingleRunning && singleState?.conversation_title ? String(singleState.conversation_title) : null,
        startedAt: isSingleRunning && singleState?.started_at ? String(singleState.started_at) : null,
        messagesSynced: !isSingleRunning && singleState?.messages_synced !== undefined ? Number(singleState.messages_synced) : null,
        error: singleState?.error ? String(singleState.error) : null,
      },
      canStartGlobalSync: syncEnabled && !lockStatus.locked,
      canStartSingleSync: syncEnabled && !lockStatus.locked,
    };

    return NextResponse.json(status);
  } catch (error) {
    console.error('Error fetching sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}

// POST /api/sync/status - Create or release lock
export async function POST(request: Request) {
  // Check if sync is enabled (production only)
  if (!isSyncEnabled()) {
    return syncDisabledResponse();
  }

  try {
    const body = await request.json();
    const { action, type, pid } = body;

    if (action === 'lock') {
      // Check if already locked
      const lockStatus = await isLockActive();
      if (lockStatus.locked) {
        return NextResponse.json(
          { error: `Sync already in progress (${lockStatus.type})`, locked: true },
          { status: 409 }
        );
      }

      // Create lock
      const lockData = {
        type,
        pid,
        started_at: new Date().toISOString(),
      };
      await writeFile(LOCK_FILE, JSON.stringify(lockData, null, 2));
      return NextResponse.json({ success: true, locked: true });
    }

    if (action === 'unlock') {
      // Remove lock file
      const { unlink } = await import('fs/promises');
      try {
        await unlink(LOCK_FILE);
      } catch {
        // Ignore if file doesn't exist
      }
      return NextResponse.json({ success: true, locked: false });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error managing sync lock:', error);
    return NextResponse.json(
      { error: 'Failed to manage sync lock' },
      { status: 500 }
    );
  }
}
