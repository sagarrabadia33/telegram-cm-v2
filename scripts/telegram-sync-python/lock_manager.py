#!/usr/bin/env python3
"""
Database-backed distributed lock manager with automatic expiration.

This provides 100% reliable locking for sync coordination:
- Locks are stored in PostgreSQL (survives crashes)
- Auto-expiration via expiresAt column (handles zombie processes)
- Heartbeat mechanism to keep locks alive
- Single process enforcement for listener

Usage:
    from lock_manager import SyncLockManager

    conn = psycopg2.connect(DATABASE_URL)
    lock_manager = SyncLockManager(conn)

    # Acquire a lock
    if lock_manager.acquire('global', 'all'):
        try:
            # Do work...
        finally:
            lock_manager.release('global', 'all')

    # Check who holds a lock
    holder = lock_manager.check_lock('listener', 'singleton')
    if holder:
        print(f"Listener running on {holder['hostname']}, PID {holder['process_id']}")
"""

import socket
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

import psycopg2
from psycopg2.extras import Json


class SyncLockManager:
    """Database-backed distributed lock manager with automatic expiration."""

    # Different lock durations based on type:
    # - Listener locks: 30 minutes (long-running, requires heartbeat)
    # - Single/Global sync locks: 2 minutes (short operations)
    LOCK_DURATIONS = {
        'listener': timedelta(minutes=30),
        'global': timedelta(minutes=5),
        'single': timedelta(minutes=2),
    }
    DEFAULT_LOCK_DURATION = timedelta(minutes=2)
    HEARTBEAT_INTERVAL = timedelta(seconds=30)  # Refresh every 30s

    def __init__(self, conn, schema: str = 'telegram_crm'):
        """
        Initialize lock manager.

        Args:
            conn: psycopg2 connection object
            schema: Database schema name (default: telegram_crm)
        """
        self.conn = conn
        self.schema = schema
        self.hostname = socket.gethostname()
        self.process_id = str(os.getpid())
        self._held_locks: List[Tuple[str, str, str]] = []  # (lock_type, lock_key, lock_id)

    def _is_process_alive(self, pid: str, hostname: str) -> bool:
        """
        Check if a process is still running.
        Only works for processes on the same host.
        """
        if hostname != self.hostname:
            # Can't check remote processes - assume alive if not expired
            return True

        try:
            pid_int = int(pid)
            # Check if process exists by sending signal 0
            os.kill(pid_int, 0)
            return True
        except (OSError, ValueError):
            return False

    def _cleanup_dead_locks(self, cursor) -> int:
        """
        Remove locks held by dead processes on this host.
        Returns number of locks cleaned up.
        """
        # Get all non-expired locks on this host
        cursor.execute(f"""
            SELECT id, "processId", hostname, "lockType", "lockKey"
            FROM {self.schema}."SyncLock"
            WHERE hostname = %s AND "expiresAt" > NOW()
        """, (self.hostname,))
        locks = cursor.fetchall()

        cleaned = 0
        for lock_id, pid, hostname, lock_type, lock_key in locks:
            if not self._is_process_alive(pid, hostname):
                cursor.execute(f"""
                    DELETE FROM {self.schema}."SyncLock"
                    WHERE id = %s
                """, (lock_id,))
                cleaned += 1
                print(f"Cleaned up stale lock: {lock_type}/{lock_key} (dead PID {pid})")

        return cleaned

    def acquire(self, lock_type: str, lock_key: str = 'all',
                metadata: Optional[Dict] = None) -> bool:
        """
        Attempt to acquire a lock.

        Args:
            lock_type: 'global', 'single', or 'listener'
            lock_key: conversation_id or 'all' for global locks
            metadata: Optional JSON metadata to store with lock

        Returns:
            True if lock acquired, False if lock is held by another process
        """
        # Use type-specific lock duration
        duration = self.LOCK_DURATIONS.get(lock_type, self.DEFAULT_LOCK_DURATION)
        expires_at = datetime.now(timezone.utc) + duration
        lock_id = str(uuid.uuid4())[:24]

        cursor = self.conn.cursor()
        try:
            # First, clean up any expired locks
            cursor.execute(f"""
                DELETE FROM {self.schema}."SyncLock"
                WHERE "expiresAt" < NOW()
            """)

            # Also clean up locks from dead processes on this host
            self._cleanup_dead_locks(cursor)

            # Try to acquire lock (atomic with ON CONFLICT)
            cursor.execute(f"""
                INSERT INTO {self.schema}."SyncLock" (
                    id, "lockType", "lockKey", "processId",
                    hostname, "acquiredAt", "expiresAt", "heartbeatAt", metadata
                )
                VALUES (%s, %s, %s, %s, %s, NOW(), %s, NOW(), %s)
                ON CONFLICT ("lockType", "lockKey") DO NOTHING
                RETURNING id
            """, (lock_id, lock_type, lock_key, self.process_id,
                  self.hostname, expires_at, Json(metadata) if metadata else None))

            result = cursor.fetchone()
            self.conn.commit()

            if result:
                self._held_locks.append((lock_type, lock_key, result[0]))
                return True

            return False

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def release(self, lock_type: str, lock_key: str = 'all') -> bool:
        """
        Release a lock.

        Args:
            lock_type: The type of lock to release
            lock_key: The key of the lock to release

        Returns:
            True if lock was released
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                DELETE FROM {self.schema}."SyncLock"
                WHERE "lockType" = %s
                  AND "lockKey" = %s
                  AND "processId" = %s
            """, (lock_type, lock_key, self.process_id))
            self.conn.commit()

            # Remove from held locks list
            self._held_locks = [
                l for l in self._held_locks
                if not (l[0] == lock_type and l[1] == lock_key)
            ]
            return True

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def heartbeat(self) -> int:
        """
        Refresh all held locks to prevent expiration.

        Should be called periodically (every 30 seconds) by long-running processes.

        Returns:
            Number of locks refreshed
        """
        if not self._held_locks:
            return 0

        cursor = self.conn.cursor()
        refreshed = 0
        try:
            for lock_type, lock_key, lock_id in self._held_locks:
                # Get the correct duration for this lock type
                duration = self.LOCK_DURATIONS.get(lock_type, self.DEFAULT_LOCK_DURATION)
                interval_minutes = int(duration.total_seconds() / 60)

                cursor.execute(f"""
                    UPDATE {self.schema}."SyncLock"
                    SET "heartbeatAt" = NOW(),
                        "expiresAt" = NOW() + INTERVAL '{interval_minutes} minutes'
                    WHERE id = %s AND "processId" = %s
                    RETURNING id
                """, (lock_id, self.process_id))
                if cursor.fetchone():
                    refreshed += 1
            self.conn.commit()
            return refreshed

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def check_lock(self, lock_type: str, lock_key: str = 'all',
                   verify_alive: bool = True) -> Optional[Dict[str, Any]]:
        """
        Check if a lock is held and by whom.

        Args:
            lock_type: The type of lock to check
            lock_key: The key of the lock to check
            verify_alive: If True, check if the holding process is still alive
                         and clean up the lock if it's dead

        Returns:
            Dict with lock info if held, None if not held
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                SELECT id, "processId", hostname, "acquiredAt", "heartbeatAt", metadata
                FROM {self.schema}."SyncLock"
                WHERE "lockType" = %s
                  AND "lockKey" = %s
                  AND "expiresAt" > NOW()
            """, (lock_type, lock_key))
            row = cursor.fetchone()

            if row:
                lock_id, process_id, hostname, acquired_at, heartbeat_at, metadata = row

                # Verify the holding process is still alive (same host only)
                if verify_alive and hostname == self.hostname:
                    if not self._is_process_alive(process_id, hostname):
                        # Process is dead - clean up the stale lock
                        cursor.execute(f"""
                            DELETE FROM {self.schema}."SyncLock"
                            WHERE id = %s
                        """, (lock_id,))
                        self.conn.commit()
                        print(f"Cleaned up stale lock: {lock_type}/{lock_key} (dead PID {process_id})")
                        return None

                return {
                    'process_id': process_id,
                    'hostname': hostname,
                    'acquired_at': acquired_at,
                    'heartbeat_at': heartbeat_at,
                    'metadata': metadata,
                }
            return None

        finally:
            cursor.close()

    def is_locked(self, lock_type: str, lock_key: str = 'all') -> bool:
        """Check if a lock is currently held."""
        return self.check_lock(lock_type, lock_key) is not None

    def release_all(self) -> int:
        """
        Release all locks held by this process.

        Should be called during graceful shutdown.

        Returns:
            Number of locks released
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                DELETE FROM {self.schema}."SyncLock"
                WHERE "processId" = %s
                RETURNING id
            """, (self.process_id,))
            released = len(cursor.fetchall())
            self.conn.commit()
            self._held_locks = []
            return released

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def force_release(self, lock_type: str, lock_key: str = 'all') -> bool:
        """
        Force release a lock regardless of who holds it.

        USE WITH CAUTION - only for emergency cleanup.

        Args:
            lock_type: The type of lock to release
            lock_key: The key of the lock to release

        Returns:
            True if a lock was released
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                DELETE FROM {self.schema}."SyncLock"
                WHERE "lockType" = %s AND "lockKey" = %s
                RETURNING id
            """, (lock_type, lock_key))
            released = cursor.fetchone() is not None
            self.conn.commit()
            return released

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def list_all_locks(self) -> List[Dict[str, Any]]:
        """
        List all current locks.

        Returns:
            List of lock info dicts
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                SELECT "lockType", "lockKey", "processId", hostname,
                       "acquiredAt", "heartbeatAt", "expiresAt", metadata
                FROM {self.schema}."SyncLock"
                WHERE "expiresAt" > NOW()
                ORDER BY "acquiredAt" DESC
            """)
            rows = cursor.fetchall()

            return [{
                'lock_type': row[0],
                'lock_key': row[1],
                'process_id': row[2],
                'hostname': row[3],
                'acquired_at': row[4],
                'heartbeat_at': row[5],
                'expires_at': row[6],
                'metadata': row[7],
            } for row in rows]

        finally:
            cursor.close()

    def cleanup_expired(self) -> int:
        """
        Remove all expired locks.

        Returns:
            Number of locks cleaned up
        """
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                DELETE FROM {self.schema}."SyncLock"
                WHERE "expiresAt" < NOW()
                RETURNING id
            """)
            cleaned = len(cursor.fetchall())
            self.conn.commit()
            return cleaned

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()


class ListenerStateManager:
    """Manage persistent listener state in database."""

    def __init__(self, conn, schema: str = 'telegram_crm'):
        self.conn = conn
        self.schema = schema
        self.process_id = str(os.getpid())
        self.hostname = socket.gethostname()

    def update_state(self, status: str, messages_received: int = 0,
                     errors: Optional[List] = None) -> None:
        """Update listener state in database."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                INSERT INTO {self.schema}."ListenerState" (
                    id, status, "lastHeartbeat", "processId", hostname,
                    "startedAt", "messagesReceived", errors, "updatedAt"
                )
                VALUES (
                    'singleton', %s, NOW(), %s, %s,
                    CASE WHEN %s = 'running' THEN NOW() ELSE NULL END,
                    %s, %s, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    status = EXCLUDED.status,
                    "lastHeartbeat" = EXCLUDED."lastHeartbeat",
                    "processId" = EXCLUDED."processId",
                    hostname = EXCLUDED.hostname,
                    "startedAt" = CASE
                        WHEN EXCLUDED.status = 'running' AND {self.schema}."ListenerState".status != 'running'
                        THEN NOW()
                        ELSE {self.schema}."ListenerState"."startedAt"
                    END,
                    "messagesReceived" = EXCLUDED."messagesReceived",
                    errors = EXCLUDED.errors,
                    "updatedAt" = NOW()
            """, (status, self.process_id, self.hostname, status,
                  messages_received, Json(errors) if errors else None))
            self.conn.commit()

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()

    def get_state(self) -> Optional[Dict[str, Any]]:
        """Get current listener state."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                SELECT status, "lastHeartbeat", "processId", hostname,
                       "startedAt", "messagesReceived", errors
                FROM {self.schema}."ListenerState"
                WHERE id = 'singleton'
            """)
            row = cursor.fetchone()

            if row:
                return {
                    'status': row[0],
                    'last_heartbeat': row[1],
                    'process_id': row[2],
                    'hostname': row[3],
                    'started_at': row[4],
                    'messages_received': row[5],
                    'errors': row[6],
                }
            return None

        finally:
            cursor.close()

    def increment_messages(self, count: int = 1) -> None:
        """Increment message counter."""
        cursor = self.conn.cursor()
        try:
            cursor.execute(f"""
                UPDATE {self.schema}."ListenerState"
                SET "messagesReceived" = "messagesReceived" + %s,
                    "lastMessageAt" = NOW(),
                    "lastHeartbeat" = NOW(),
                    "updatedAt" = NOW()
                WHERE id = 'singleton'
            """, (count,))
            self.conn.commit()

        except Exception as e:
            self.conn.rollback()
            raise e
        finally:
            cursor.close()


# CLI for testing and management
if __name__ == '__main__':
    import sys
    from pathlib import Path
    from dotenv import load_dotenv

    # Load environment
    ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
    load_dotenv(ENV_PATH)

    DATABASE_URL = os.getenv('DATABASE_URL', '')
    if '?schema=' in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.split('?schema=')[0]

    conn = psycopg2.connect(DATABASE_URL)
    lock_manager = SyncLockManager(conn)
    state_manager = ListenerStateManager(conn)

    if len(sys.argv) < 2:
        print("Usage: python lock_manager.py <command>")
        print("Commands:")
        print("  list          - List all current locks")
        print("  cleanup       - Remove expired locks")
        print("  status        - Show listener status")
        print("  force-unlock  - Force release all locks (emergency)")
        sys.exit(1)

    command = sys.argv[1]

    if command == 'list':
        locks = lock_manager.list_all_locks()
        if locks:
            print(f"Active locks ({len(locks)}):")
            for lock in locks:
                age = datetime.now(timezone.utc) - lock['acquired_at'].replace(tzinfo=timezone.utc)
                print(f"  {lock['lock_type']}/{lock['lock_key']}: "
                      f"PID={lock['process_id']}, host={lock['hostname']}, "
                      f"age={age.total_seconds():.0f}s")
        else:
            print("No active locks")

    elif command == 'cleanup':
        cleaned = lock_manager.cleanup_expired()
        print(f"Cleaned up {cleaned} expired locks")

    elif command == 'status':
        state = state_manager.get_state()
        if state:
            print(f"Listener Status: {state['status']}")
            print(f"  Process ID: {state['process_id']}")
            print(f"  Hostname: {state['hostname']}")
            print(f"  Started: {state['started_at']}")
            print(f"  Last Heartbeat: {state['last_heartbeat']}")
            print(f"  Messages Received: {state['messages_received']}")
        else:
            print("No listener state found")

    elif command == 'force-unlock':
        confirm = input("This will force release ALL locks. Type 'yes' to confirm: ")
        if confirm == 'yes':
            cursor = conn.cursor()
            cursor.execute(f'DELETE FROM telegram_crm."SyncLock"')
            conn.commit()
            cursor.close()
            print("All locks released")
        else:
            print("Cancelled")

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)

    conn.close()
