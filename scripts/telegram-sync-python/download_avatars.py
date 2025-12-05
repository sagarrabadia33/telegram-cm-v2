#!/usr/bin/env python3
"""
===============================================================================
                    TELEGRAM AVATAR DOWNLOAD SCRIPT
===============================================================================

Downloads avatars for all contacts and group conversations from Telegram.

FEATURES:
- Downloads profile photos for all contacts
- Downloads group/supergroup avatars
- Incremental mode: Only downloads new/changed avatars
- Full mode: Re-downloads all avatars
- Stores avatar paths in database (avatarUrl field)
- Organizes files by type: avatars/contacts/{id}.jpg, avatars/groups/{id}.jpg

USAGE:
    python3 download_avatars.py                    # Incremental (default)
    python3 download_avatars.py --full            # Full download (all avatars)
    python3 download_avatars.py --dry-run         # Preview without downloading
    python3 download_avatars.py --contacts-only   # Only contacts
    python3 download_avatars.py --groups-only     # Only groups

Author: telegram-crm-v2
"""

import os
import sys
import json
import asyncio
import argparse
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
import traceback

import psycopg2
from telethon import TelegramClient
from telethon.tl.types import (
    User, Chat, Channel,
    InputPeerUser, InputPeerChat, InputPeerChannel,
    UserProfilePhoto, ChatPhoto
)
from telethon.tl.functions.photos import GetUserPhotosRequest
from telethon.tl.functions.messages import GetFullChatRequest
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.errors import FloodWaitError, ChannelPrivateError
from dotenv import load_dotenv

# ===============================================================================
# CONFIGURATION
# ===============================================================================

# Load environment
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Paths
AVATAR_DIR = Path(__file__).parent.parent.parent / 'public' / 'media' / 'avatars'
CONTACTS_AVATAR_DIR = AVATAR_DIR / 'contacts'
GROUPS_AVATAR_DIR = AVATAR_DIR / 'groups'
LOG_DIR = Path(__file__).parent / 'logs'
STATE_FILE = Path(__file__).parent / 'avatar-sync-state.json'

# Database
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

# Telegram
API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
PHONE = os.getenv('TELEGRAM_PHONE_NUMBER', '')

# Performance
RATE_LIMIT_DELAY = 0.3  # Seconds between API calls
BATCH_SIZE = 50  # Process in batches


# ===============================================================================
# DATA STRUCTURES
# ===============================================================================

@dataclass
class AvatarStats:
    """Track avatar download statistics."""
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    contacts_processed: int = 0
    contacts_downloaded: int = 0
    contacts_skipped: int = 0
    contacts_failed: int = 0
    groups_processed: int = 0
    groups_downloaded: int = 0
    groups_skipped: int = 0
    groups_failed: int = 0
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'started_at': self.started_at.isoformat(),
            'duration_seconds': (datetime.now(timezone.utc) - self.started_at).total_seconds(),
            'contacts_processed': self.contacts_processed,
            'contacts_downloaded': self.contacts_downloaded,
            'contacts_skipped': self.contacts_skipped,
            'contacts_failed': self.contacts_failed,
            'groups_processed': self.groups_processed,
            'groups_downloaded': self.groups_downloaded,
            'groups_skipped': self.groups_skipped,
            'groups_failed': self.groups_failed,
            'errors': self.errors[-10:]
        }


# ===============================================================================
# LOGGING
# ===============================================================================

class Logger:
    """Structured logging with levels."""

    COLORS = {
        'INFO': '\033[94m',      # Blue
        'SUCCESS': '\033[92m',   # Green
        'WARN': '\033[93m',      # Yellow
        'ERROR': '\033[91m',     # Red
        'RESET': '\033[0m'
    }

    def __init__(self, name: str, verbose: bool = True):
        self.name = name
        self.verbose = verbose
        self.log_file = None

        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_filename = f"avatar-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
        self.log_file = LOG_DIR / log_filename

    def _log(self, level: str, message: str, data: Optional[Dict] = None):
        timestamp = datetime.now().strftime('%H:%M:%S')
        color = self.COLORS.get(level, '')
        reset = self.COLORS['RESET']

        if self.verbose or level in ('ERROR', 'SUCCESS'):
            prefix = f"[{timestamp}] {color}{level:7}{reset}"
            print(f"{prefix} {message}")

        if self.log_file:
            log_entry = {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'level': level,
                'message': message,
                'data': data
            }
            with open(self.log_file, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')

    def info(self, message: str, data: Optional[Dict] = None):
        self._log('INFO', message, data)

    def success(self, message: str, data: Optional[Dict] = None):
        self._log('SUCCESS', message, data)

    def warn(self, message: str, data: Optional[Dict] = None):
        self._log('WARN', message, data)

    def error(self, message: str, data: Optional[Dict] = None):
        self._log('ERROR', message, data)


log = Logger('avatar-download')


# ===============================================================================
# DATABASE OPERATIONS
# ===============================================================================

class Database:
    """Database operations."""

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self._conn = None

    def connect(self) -> 'Database':
        self._conn = psycopg2.connect(self.connection_string)
        self._conn.autocommit = True
        log.info("Connected to PostgreSQL")
        return self

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

    def get_contacts_for_avatar_sync(self, full_sync: bool = False) -> List[Dict[str, Any]]:
        """Get contacts that need avatar sync."""
        cursor = self._conn.cursor()

        # Get contacts with their Telegram external IDs
        if full_sync:
            query = """
                SELECT DISTINCT
                    c.id,
                    c."displayName",
                    c."firstName",
                    c."avatarUrl",
                    si."externalId" as telegram_id
                FROM "Contact" c
                JOIN "SourceIdentity" si ON si."contactId" = c.id
                WHERE si.source = 'telegram'
                  AND si."externalId" IS NOT NULL
                ORDER BY c.id
            """
        else:
            # Incremental: only contacts without avatars
            query = """
                SELECT DISTINCT
                    c.id,
                    c."displayName",
                    c."firstName",
                    c."avatarUrl",
                    si."externalId" as telegram_id
                FROM "Contact" c
                JOIN "SourceIdentity" si ON si."contactId" = c.id
                WHERE si.source = 'telegram'
                  AND si."externalId" IS NOT NULL
                  AND (c."avatarUrl" IS NULL OR c."avatarUrl" = '')
                ORDER BY c.id
            """

        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        return [
            {
                'id': row[0],
                'display_name': row[1] or row[2] or 'Unknown',
                'avatar_url': row[3],
                'telegram_id': row[4]
            }
            for row in rows
        ]

    def get_groups_for_avatar_sync(self, full_sync: bool = False) -> List[Dict[str, Any]]:
        """Get groups/supergroups that need avatar sync."""
        cursor = self._conn.cursor()

        if full_sync:
            query = """
                SELECT
                    id,
                    title,
                    type,
                    "externalChatId",
                    "avatarUrl"
                FROM "Conversation"
                WHERE source = 'telegram'
                  AND type IN ('group', 'supergroup')
                  AND "isSyncDisabled" = FALSE
                ORDER BY id
            """
        else:
            # Incremental: only groups without avatars
            query = """
                SELECT
                    id,
                    title,
                    type,
                    "externalChatId",
                    "avatarUrl"
                FROM "Conversation"
                WHERE source = 'telegram'
                  AND type IN ('group', 'supergroup')
                  AND "isSyncDisabled" = FALSE
                  AND ("avatarUrl" IS NULL OR "avatarUrl" = '')
                ORDER BY id
            """

        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        return [
            {
                'id': row[0],
                'title': row[1] or 'Unknown Group',
                'type': row[2],
                'external_chat_id': row[3],
                'avatar_url': row[4]
            }
            for row in rows
        ]

    def update_contact_avatar(self, contact_id: str, avatar_url: str):
        """Update contact's avatar URL."""
        cursor = self._conn.cursor()
        cursor.execute("""
            UPDATE "Contact"
            SET "avatarUrl" = %s, "updatedAt" = NOW()
            WHERE id = %s
        """, (avatar_url, contact_id))
        cursor.close()

    def update_conversation_avatar(self, conversation_id: str, avatar_url: str):
        """Update conversation's avatar URL."""
        cursor = self._conn.cursor()
        cursor.execute("""
            UPDATE "Conversation"
            SET "avatarUrl" = %s, "updatedAt" = NOW()
            WHERE id = %s
        """, (avatar_url, conversation_id))
        cursor.close()


# ===============================================================================
# AVATAR DOWNLOADER
# ===============================================================================

class AvatarDownloader:
    """Download avatars from Telegram."""

    def __init__(self, client: TelegramClient, db: Database):
        self.client = client
        self.db = db
        self.stats = AvatarStats()

        # Create directories
        CONTACTS_AVATAR_DIR.mkdir(parents=True, exist_ok=True)
        GROUPS_AVATAR_DIR.mkdir(parents=True, exist_ok=True)

    async def download_contact_avatar(
        self,
        contact: Dict[str, Any],
        dry_run: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """Download avatar for a contact."""
        telegram_id = int(contact['telegram_id'])

        try:
            # Get the user entity
            entity = await self.client.get_entity(telegram_id)

            if not isinstance(entity, User):
                return False, "Not a user entity"

            if not entity.photo or isinstance(entity.photo, type(None)):
                return False, None  # No avatar, not an error

            # Determine filename
            filename = f"{contact['id']}.jpg"
            filepath = CONTACTS_AVATAR_DIR / filename
            avatar_url = f"/media/avatars/contacts/{filename}"

            if dry_run:
                log.info(f"  [DRY RUN] Would download avatar to {filepath}")
                return True, avatar_url

            # Download the profile photo
            await self.client.download_profile_photo(
                entity,
                file=str(filepath),
                download_big=False  # Small version is enough
            )

            # Verify file was created
            if filepath.exists():
                # Update database
                self.db.update_contact_avatar(contact['id'], avatar_url)
                return True, avatar_url
            else:
                return False, "File not created"

        except FloodWaitError as e:
            await asyncio.sleep(e.seconds)
            return False, f"FloodWait: {e.seconds}s"

        except Exception as e:
            return False, f"{type(e).__name__}: {str(e)}"

    async def download_group_avatar(
        self,
        group: Dict[str, Any],
        dry_run: bool = False
    ) -> Tuple[bool, Optional[str]]:
        """Download avatar for a group/supergroup."""
        chat_id = int(group['external_chat_id'])

        try:
            # Get the chat entity
            entity = await self.client.get_entity(chat_id)

            has_photo = False
            if isinstance(entity, (Chat, Channel)):
                has_photo = entity.photo is not None and not isinstance(entity.photo, type(None))

            if not has_photo:
                return False, None  # No avatar, not an error

            # Determine filename
            filename = f"{group['id']}.jpg"
            filepath = GROUPS_AVATAR_DIR / filename
            avatar_url = f"/media/avatars/groups/{filename}"

            if dry_run:
                log.info(f"  [DRY RUN] Would download avatar to {filepath}")
                return True, avatar_url

            # Download the profile photo
            await self.client.download_profile_photo(
                entity,
                file=str(filepath),
                download_big=False
            )

            # Verify file was created
            if filepath.exists():
                # Update database
                self.db.update_conversation_avatar(group['id'], avatar_url)
                return True, avatar_url
            else:
                return False, "File not created"

        except ChannelPrivateError:
            return False, None  # Private channel, skip

        except FloodWaitError as e:
            await asyncio.sleep(e.seconds)
            return False, f"FloodWait: {e.seconds}s"

        except Exception as e:
            return False, f"{type(e).__name__}: {str(e)}"

    async def run_sync(
        self,
        full_sync: bool = False,
        dry_run: bool = False,
        contacts_only: bool = False,
        groups_only: bool = False
    ):
        """Run avatar sync."""
        log.info("=" * 60)
        log.info("  TELEGRAM AVATAR DOWNLOAD")
        log.info("=" * 60)
        log.info(f"Mode: {'FULL' if full_sync else 'INCREMENTAL'} {'[DRY RUN]' if dry_run else ''}")
        log.info(f"Target: {'CONTACTS ONLY' if contacts_only else 'GROUPS ONLY' if groups_only else 'ALL'}")
        log.info("")

        # Download contact avatars
        if not groups_only:
            await self._sync_contacts(full_sync, dry_run)

        # Download group avatars
        if not contacts_only:
            await self._sync_groups(full_sync, dry_run)

        # Print summary
        self._print_summary()

    async def _sync_contacts(self, full_sync: bool, dry_run: bool):
        """Sync contact avatars."""
        contacts = self.db.get_contacts_for_avatar_sync(full_sync)
        log.info(f"Found {len(contacts)} contacts to process")

        for i, contact in enumerate(contacts):
            progress = f"[{i+1}/{len(contacts)}]"
            log.info(f"{progress} Contact: {contact['display_name']}")

            success, error = await self.download_contact_avatar(contact, dry_run)
            self.stats.contacts_processed += 1

            if success:
                self.stats.contacts_downloaded += 1
                log.success(f"  Downloaded avatar")
            elif error is None:
                self.stats.contacts_skipped += 1
                log.info(f"  No avatar available")
            else:
                self.stats.contacts_failed += 1
                log.warn(f"  Failed: {error}")
                self.stats.errors.append({
                    'type': 'contact',
                    'name': contact['display_name'],
                    'error': error
                })

            await asyncio.sleep(RATE_LIMIT_DELAY)

        log.info("")

    async def _sync_groups(self, full_sync: bool, dry_run: bool):
        """Sync group avatars."""
        groups = self.db.get_groups_for_avatar_sync(full_sync)
        log.info(f"Found {len(groups)} groups to process")

        for i, group in enumerate(groups):
            progress = f"[{i+1}/{len(groups)}]"
            log.info(f"{progress} Group: {group['title']}")

            success, error = await self.download_group_avatar(group, dry_run)
            self.stats.groups_processed += 1

            if success:
                self.stats.groups_downloaded += 1
                log.success(f"  Downloaded avatar")
            elif error is None:
                self.stats.groups_skipped += 1
                log.info(f"  No avatar available")
            else:
                self.stats.groups_failed += 1
                log.warn(f"  Failed: {error}")
                self.stats.errors.append({
                    'type': 'group',
                    'name': group['title'],
                    'error': error
                })

            await asyncio.sleep(RATE_LIMIT_DELAY)

        log.info("")

    def _print_summary(self):
        """Print download summary."""
        stats = self.stats
        duration = (datetime.now(timezone.utc) - stats.started_at).total_seconds()

        log.info("=" * 60)
        log.success("  AVATAR DOWNLOAD COMPLETE")
        log.info("=" * 60)
        log.info(f"Duration: {duration:.1f} seconds")
        log.info("")
        log.info("CONTACTS:")
        log.info(f"  Processed: {stats.contacts_processed}")
        log.info(f"  Downloaded: {stats.contacts_downloaded}")
        log.info(f"  Skipped (no avatar): {stats.contacts_skipped}")
        log.info(f"  Failed: {stats.contacts_failed}")
        log.info("")
        log.info("GROUPS:")
        log.info(f"  Processed: {stats.groups_processed}")
        log.info(f"  Downloaded: {stats.groups_downloaded}")
        log.info(f"  Skipped (no avatar): {stats.groups_skipped}")
        log.info(f"  Failed: {stats.groups_failed}")

        if stats.errors:
            log.warn("")
            log.warn("Recent errors:")
            for err in stats.errors[-5:]:
                log.warn(f"  - [{err['type']}] {err['name']}: {err['error']}")

        # Save state
        with open(STATE_FILE, 'w') as f:
            json.dump(stats.to_dict(), f, indent=2)
        log.info(f"\nState saved to: {STATE_FILE}")


# ===============================================================================
# MAIN
# ===============================================================================

async def main():
    """Main entry point."""

    parser = argparse.ArgumentParser(description='Telegram Avatar Download')
    parser.add_argument('--full', action='store_true', help='Full download (re-download all)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without downloading')
    parser.add_argument('--contacts-only', action='store_true', help='Only download contact avatars')
    parser.add_argument('--groups-only', action='store_true', help='Only download group avatars')
    parser.add_argument('--quiet', action='store_true', help='Less verbose output')
    args = parser.parse_args()

    if args.quiet:
        log.verbose = False

    # Validate environment
    if not all([API_ID, API_HASH, PHONE, DATABASE_URL]):
        log.error("Missing environment variables. Check .env.local")
        sys.exit(1)

    # Initialize
    session_file = Path(__file__).parent / 'telegram_session'
    client = TelegramClient(str(session_file), API_ID, API_HASH)
    db = Database(DATABASE_URL)

    try:
        # Connect
        log.info("Connecting to Telegram...")
        await client.start(phone=PHONE)
        log.success("Connected to Telegram")

        log.info("Connecting to PostgreSQL...")
        db.connect()

        # Run sync
        downloader = AvatarDownloader(client, db)
        await downloader.run_sync(
            full_sync=args.full,
            dry_run=args.dry_run,
            contacts_only=args.contacts_only,
            groups_only=args.groups_only
        )

    except Exception as e:
        log.error(f"Fatal error: {e}")
        traceback.print_exc()
        sys.exit(1)

    finally:
        db.close()
        await client.disconnect()
        log.info("Disconnected")


if __name__ == '__main__':
    asyncio.run(main())
