#!/usr/bin/env python3
"""
Session Manager - Safe Telegram Session Handling for Railway

CRITICAL: Telegram session files contain authentication state.
This module handles:
1. Restoring session from PostgreSQL database (primary method)
2. Fallback to base64-encoded environment variable
3. Persisting session to Railway Volume (subsequent deploys)
4. Backup and recovery mechanisms

TELEGRAM API SAFETY:
- Session files are tied to API credentials, not IP addresses
- Telethon handles reconnection from new IPs gracefully
- The session persists auth state, encryption keys, and DC info
- Moving to a new server/IP is normal and won't trigger bans

Author: telegram-crm-v2
"""

import os
import base64
import shutil
from pathlib import Path
from datetime import datetime
import json


# Configuration from environment
SESSION_PATH = Path(os.getenv('SESSION_PATH', '/data/sessions/telegram_session'))
SESSION_FILE = SESSION_PATH.with_suffix('.session')
BACKUP_DIR = SESSION_PATH.parent / 'backups'


def log(message: str):
    """Simple logging with timestamp."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [SessionManager] {message}")


def clean_database_url(url: str) -> str:
    """
    Remove 'schema' query parameter from DATABASE_URL.

    Prisma uses ?schema=xxx but psycopg2 doesn't understand it.
    """
    from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)

    # Remove 'schema' parameter (Prisma-specific)
    query_params.pop('schema', None)

    # Rebuild URL
    new_query = urlencode(query_params, doseq=True)
    new_parsed = parsed._replace(query=new_query)

    return urlunparse(new_parsed)


def restore_session_from_database() -> bool:
    """
    Restore Telegram session from PostgreSQL database.

    This is the primary method for Railway deployment where
    environment variables have a 32KB limit but session files are ~224KB.

    Returns:
        True if session was restored from database, False otherwise
    """
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        log("DATABASE_URL not set, cannot restore from database")
        return False

    try:
        import psycopg2

        # Remove Prisma-specific 'schema' parameter that psycopg2 doesn't understand
        clean_url = clean_database_url(database_url)

        log("Connecting to database to restore session...")
        conn = psycopg2.connect(clean_url)
        cur = conn.cursor()

        # Query the TelegramWorkerSession table
        cur.execute('''
            SELECT session_data, updated_at
            FROM telegram_crm."TelegramWorkerSession"
            WHERE session_name = 'default'
            LIMIT 1
        ''')

        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            log("No session found in database")
            return False

        session_data, updated_at = row

        # Ensure directory exists
        SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Write session to file
        # psycopg2 returns BYTEA as memoryview, need to convert to bytes
        if isinstance(session_data, memoryview):
            session_data = bytes(session_data)

        SESSION_FILE.write_bytes(session_data)

        log(f"Session restored from database ({len(session_data)} bytes, updated: {updated_at})")
        return True

    except ImportError:
        log("psycopg2 not installed, cannot restore from database")
        return False
    except Exception as e:
        log(f"Failed to restore session from database: {e}")
        return False


def restore_session_from_env() -> bool:
    """
    Restore Telegram session from base64-encoded environment variable.

    This is a fallback method. Primary method is database.

    Returns:
        True if session was restored or already exists, False otherwise
    """
    # Check if session already exists on volume (from previous run)
    if SESSION_FILE.exists():
        size = SESSION_FILE.stat().st_size
        log(f"Session file found on volume ({size} bytes)")
        return True

    # First, try to restore from database (primary method for large sessions)
    if restore_session_from_database():
        return True

    # Fallback: Try to restore from base64 environment variable
    session_b64 = os.getenv('TELEGRAM_SESSION_BASE64')
    if not session_b64:
        log("ERROR: No session found on volume, database, or TELEGRAM_SESSION_BASE64")
        log("Session is stored in TelegramWorkerSession table in PostgreSQL.")
        log("Ensure DATABASE_URL is set correctly.")
        return False

    try:
        log("Restoring session from TELEGRAM_SESSION_BASE64 environment variable...")

        # Ensure directory exists
        SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)

        # Decode and write session file
        session_data = base64.b64decode(session_b64)
        SESSION_FILE.write_bytes(session_data)

        log(f"Session restored successfully ({len(session_data)} bytes)")
        return True

    except Exception as e:
        log(f"ERROR: Failed to restore session: {e}")
        return False


def backup_session():
    """
    Create a backup of the current session file.

    Called periodically to ensure we can recover from corruption.
    """
    if not SESSION_FILE.exists():
        return

    try:
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)

        # Keep last 5 backups
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = BACKUP_DIR / f"telegram_session_{timestamp}.session"

        shutil.copy2(SESSION_FILE, backup_file)
        log(f"Session backed up to {backup_file.name}")

        # Clean old backups (keep last 5)
        backups = sorted(BACKUP_DIR.glob("telegram_session_*.session"))
        for old_backup in backups[:-5]:
            old_backup.unlink()
            log(f"Removed old backup: {old_backup.name}")

    except Exception as e:
        log(f"WARNING: Failed to backup session: {e}")


def save_session_to_database() -> bool:
    """
    Save the current session file back to the database.

    Called periodically to keep the database copy up to date.
    """
    if not SESSION_FILE.exists():
        log("No session file to save")
        return False

    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        log("DATABASE_URL not set, cannot save to database")
        return False

    try:
        import psycopg2

        # Remove Prisma-specific 'schema' parameter that psycopg2 doesn't understand
        clean_url = clean_database_url(database_url)

        session_data = SESSION_FILE.read_bytes()

        conn = psycopg2.connect(clean_url)
        conn.autocommit = True
        cur = conn.cursor()

        cur.execute('''
            INSERT INTO telegram_crm."TelegramWorkerSession" (session_name, session_data, updated_at)
            VALUES ('default', %s, NOW())
            ON CONFLICT (session_name)
            DO UPDATE SET session_data = EXCLUDED.session_data, updated_at = NOW()
        ''', (psycopg2.Binary(session_data),))

        cur.close()
        conn.close()

        log(f"Session saved to database ({len(session_data)} bytes)")
        return True

    except Exception as e:
        log(f"Failed to save session to database: {e}")
        return False


def get_session_info() -> dict:
    """Get information about the current session."""
    info = {
        'exists': SESSION_FILE.exists(),
        'path': str(SESSION_FILE),
        'size': 0,
        'modified': None,
        'backups': 0,
    }

    if SESSION_FILE.exists():
        stat = SESSION_FILE.stat()
        info['size'] = stat.st_size
        info['modified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()

    if BACKUP_DIR.exists():
        info['backups'] = len(list(BACKUP_DIR.glob("telegram_session_*.session")))

    return info


def export_session_base64() -> str:
    """
    Export current session as base64 string.

    Useful for:
    - Migrating to a new deployment
    - Emergency backup
    - Setting up a new environment
    """
    if not SESSION_FILE.exists():
        raise FileNotFoundError(f"Session file not found: {SESSION_FILE}")

    session_data = SESSION_FILE.read_bytes()
    return base64.b64encode(session_data).decode('utf-8')


# CLI for testing
if __name__ == '__main__':
    import sys

    if len(sys.argv) < 2:
        print("Usage: python session_manager.py <command>")
        print("Commands:")
        print("  restore  - Restore session from database or env var")
        print("  backup   - Backup current session")
        print("  save     - Save session to database")
        print("  info     - Show session info")
        print("  export   - Export session as base64")
        sys.exit(1)

    command = sys.argv[1]

    if command == 'restore':
        success = restore_session_from_env()
        sys.exit(0 if success else 1)

    elif command == 'backup':
        backup_session()

    elif command == 'save':
        success = save_session_to_database()
        sys.exit(0 if success else 1)

    elif command == 'info':
        info = get_session_info()
        print(json.dumps(info, indent=2))

    elif command == 'export':
        try:
            b64 = export_session_base64()
            print(b64)
        except FileNotFoundError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            sys.exit(1)

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
