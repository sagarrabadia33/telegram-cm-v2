import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { isSyncEnabled, syncDisabledResponse } from '@/app/lib/sync-guard';

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts', 'telegram-sync-python');
const LOCK_FILE = path.join(SCRIPTS_DIR, '.sync.lock');
const STATE_FILE = path.join(SCRIPTS_DIR, 'single-sync-state.json');

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function isLockActive(): Promise<boolean> {
  try {
    if (!existsSync(LOCK_FILE)) return false;
    const content = await readFile(LOCK_FILE, 'utf-8');
    const lock = JSON.parse(content);

    // Check if lock is stale (older than 30 minutes)
    const lockTime = new Date(lock.started_at).getTime();
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;

    return now - lockTime <= thirtyMinutes;
  } catch {
    return false;
  }
}

// GET /api/sync/conversation/[id] - Get sync status for a conversation
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    if (!existsSync(STATE_FILE)) {
      return NextResponse.json({
        conversationId: id,
        status: 'idle',
        lastSync: null,
      });
    }

    const content = await readFile(STATE_FILE, 'utf-8');
    const state = JSON.parse(content);

    // Check if this is for the requested conversation
    if (state.conversation_id !== id) {
      return NextResponse.json({
        conversationId: id,
        status: 'idle',
        lastSync: null,
      });
    }

    return NextResponse.json({
      conversationId: id,
      status: state.status,
      startedAt: state.started_at,
      completedAt: state.completed_at,
      messagesSynced: state.messages_synced,
      error: state.error,
    });
  } catch (error) {
    console.error('Error fetching conversation sync status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    );
  }
}

// POST /api/sync/conversation/[id] - Start sync for a conversation
export async function POST(request: NextRequest, context: RouteContext) {
  // Check if sync is enabled (production only)
  if (!isSyncEnabled()) {
    return syncDisabledResponse();
  }

  const { id: conversationId } = await context.params;

  try {
    // Check if sync is already running
    if (await isLockActive()) {
      // Read lock file to provide more specific error message
      try {
        const lockContent = await readFile(LOCK_FILE, 'utf-8');
        const lock = JSON.parse(lockContent);
        if (lock.type === 'global') {
          return NextResponse.json(
            {
              error: 'A global sync is currently running. Please wait for it to complete.',
              code: 'GLOBAL_SYNC_IN_PROGRESS',
              lockType: 'global'
            },
            { status: 409 }
          );
        } else if (lock.type === 'single') {
          return NextResponse.json(
            {
              error: 'Another conversation is currently syncing. Please wait for it to complete.',
              code: 'SINGLE_SYNC_IN_PROGRESS',
              lockType: 'single',
              lockConversationId: lock.conversationId
            },
            { status: 409 }
          );
        }
      } catch {
        // Fallback to generic error
      }
      return NextResponse.json(
        { error: 'A sync is already in progress', code: 'SYNC_IN_PROGRESS' },
        { status: 409 }
      );
    }

    // Create lock file for single sync
    const lockData = {
      type: 'single',
      conversationId,
      pid: process.pid,
      started_at: new Date().toISOString(),
    };
    await writeFile(LOCK_FILE, JSON.stringify(lockData, null, 2));

    // Initialize state file
    const initialState = {
      conversation_id: conversationId,
      status: 'starting',
      started_at: new Date().toISOString(),
      messages_synced: 0,
      error: null,
    };
    await writeFile(STATE_FILE, JSON.stringify(initialState, null, 2));

    // Spawn the Python sync script
    const pythonScript = path.join(SCRIPTS_DIR, 'single_conversation_sync.py');

    const child = spawn('python3', [pythonScript, conversationId], {
      cwd: SCRIPTS_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle process completion
    child.on('close', async (code) => {
      try {
        if (existsSync(STATE_FILE)) {
          const content = await readFile(STATE_FILE, 'utf-8');
          const state = JSON.parse(content);

          // Only update if still for this conversation
          if (state.conversation_id === conversationId) {
            if (state.status === 'running' || state.status === 'starting') {
              state.status = code === 0 ? 'completed' : 'failed';
              state.completed_at = new Date().toISOString();
              if (code !== 0 && !state.error) {
                state.error = stderr || 'Sync failed';
              }
              await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
            }
          }
        }
        // Remove lock file when sync completes
        await unlink(LOCK_FILE).catch(() => {});
      } catch (e) {
        console.error('Error updating sync state:', e);
      }
    });

    child.on('error', async (err) => {
      console.error('Sync process error:', err);
      try {
        if (existsSync(STATE_FILE)) {
          const content = await readFile(STATE_FILE, 'utf-8');
          const state = JSON.parse(content);
          if (state.conversation_id === conversationId) {
            state.status = 'failed';
            state.error = err.message;
            state.completed_at = new Date().toISOString();
            await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
          }
        }
        // Remove lock file on error
        await unlink(LOCK_FILE).catch(() => {});
      } catch (e) {
        console.error('Error handling sync failure:', e);
      }
    });

    // Unref to allow parent process to exit independently
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Conversation sync started',
      conversationId,
      pid: child.pid,
    });
  } catch (error) {
    console.error('Error starting conversation sync:', error);
    return NextResponse.json(
      { error: 'Failed to start conversation sync' },
      { status: 500 }
    );
  }
}
