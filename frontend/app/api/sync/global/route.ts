import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { writeFile, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { isSyncEnabled, syncDisabledResponse } from '@/app/lib/sync-guard';

const SCRIPTS_DIR = path.join(process.cwd(), '..', 'scripts', 'telegram-sync-python');
const LOCK_FILE = path.join(SCRIPTS_DIR, '.sync.lock');
const STATE_FILE = path.join(SCRIPTS_DIR, 'incremental-sync-state.json');

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

// POST /api/sync/global - Start global incremental sync
export async function POST() {
  // Check if sync is enabled (production only)
  if (!isSyncEnabled()) {
    return syncDisabledResponse();
  }

  try {
    // Check if sync is already running
    if (await isLockActive()) {
      // Read lock file to provide more specific error message
      try {
        const lockContent = await readFile(LOCK_FILE, 'utf-8');
        const lock = JSON.parse(lockContent);
        if (lock.type === 'single') {
          return NextResponse.json(
            {
              error: 'A conversation sync is currently running. Please wait for it to complete.',
              code: 'SINGLE_SYNC_IN_PROGRESS',
              lockType: 'single',
              lockConversationId: lock.conversationId
            },
            { status: 409 }
          );
        } else if (lock.type === 'global') {
          return NextResponse.json(
            {
              error: 'A global sync is already running.',
              code: 'GLOBAL_SYNC_IN_PROGRESS',
              lockType: 'global'
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

    // Create lock file
    const lockData = {
      type: 'global',
      pid: process.pid,
      started_at: new Date().toISOString(),
    };
    await writeFile(LOCK_FILE, JSON.stringify(lockData, null, 2));

    // Initialize state file
    const initialState = {
      started_at: new Date().toISOString(),
      status: 'running',
      conversations_processed: 0,
      conversations_skipped: 0,
      conversations_total: 0,
      messages_synced: 0,
      current_conversation: null,
      errors: [],
    };
    await writeFile(STATE_FILE, JSON.stringify(initialState, null, 2));

    // Spawn the Python sync script
    const pythonScript = path.join(SCRIPTS_DIR, 'incremental_sync.py');

    const child = spawn('python3', [pythonScript], {
      cwd: SCRIPTS_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    // Handle process completion (async, won't block response)
    child.on('close', async (code) => {
      try {
        // Read final state
        if (existsSync(STATE_FILE)) {
          const content = await readFile(STATE_FILE, 'utf-8');
          const state = JSON.parse(content);
          state.status = code === 0 ? 'completed' : 'failed';
          state.completed_at = new Date().toISOString();
          state.exit_code = code;
          await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        }
        // Remove lock
        await unlink(LOCK_FILE).catch(() => {});
      } catch (e) {
        console.error('Error cleaning up after sync:', e);
      }
    });

    child.on('error', async (err) => {
      console.error('Sync process error:', err);
      try {
        await unlink(LOCK_FILE).catch(() => {});
        if (existsSync(STATE_FILE)) {
          const content = await readFile(STATE_FILE, 'utf-8');
          const state = JSON.parse(content);
          state.status = 'failed';
          state.error = err.message;
          state.completed_at = new Date().toISOString();
          await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        }
      } catch (e) {
        console.error('Error handling sync failure:', e);
      }
    });

    // Unref to allow parent process to exit independently
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Global sync started',
      pid: child.pid,
    });
  } catch (error) {
    console.error('Error starting global sync:', error);
    // Clean up lock on error
    await unlink(LOCK_FILE).catch(() => {});
    return NextResponse.json(
      { error: 'Failed to start global sync' },
      { status: 500 }
    );
  }
}

// DELETE /api/sync/global - Cancel running global sync
export async function DELETE() {
  try {
    if (!existsSync(LOCK_FILE)) {
      return NextResponse.json(
        { error: 'No sync in progress' },
        { status: 404 }
      );
    }

    const content = await readFile(LOCK_FILE, 'utf-8');
    const lock = JSON.parse(content);

    if (lock.type !== 'global') {
      return NextResponse.json(
        { error: 'No global sync in progress' },
        { status: 404 }
      );
    }

    // Try to kill the process
    if (lock.pid) {
      try {
        process.kill(lock.pid, 'SIGTERM');
      } catch {
        // Process may have already exited
      }
    }

    // Update state
    if (existsSync(STATE_FILE)) {
      const stateContent = await readFile(STATE_FILE, 'utf-8');
      const state = JSON.parse(stateContent);
      state.status = 'cancelled';
      state.cancelled_at = new Date().toISOString();
      await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    }

    // Remove lock
    await unlink(LOCK_FILE).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Global sync cancelled',
    });
  } catch (error) {
    console.error('Error cancelling global sync:', error);
    return NextResponse.json(
      { error: 'Failed to cancel global sync' },
      { status: 500 }
    );
  }
}
