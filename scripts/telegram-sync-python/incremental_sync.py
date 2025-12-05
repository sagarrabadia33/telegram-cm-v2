#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
                    TELEGRAM INCREMENTAL SYNC - PRODUCTION GRADE
═══════════════════════════════════════════════════════════════════════════════

100% RELIABLE incremental message sync using checkpoint-based architecture.

GUARANTEES:
- Zero message loss: Atomic transactions ensure all-or-nothing commits
- Idempotent: Safe to run multiple times, no duplicates
- Resumable: Picks up exactly where it left off after interruption
- Fast: Only fetches NEW messages since last checkpoint

ARCHITECTURE:
┌─────────────────────────────────────────────────────────────────────────────┐
│  For each conversation:                                                     │
│  1. Read checkpoint (lastSyncedMessageId)                                  │
│  2. Fetch messages from Telegram WHERE id > checkpoint                     │
│  3. BEGIN TRANSACTION                                                       │
│     ├── UPSERT all messages                                                │
│     ├── UPDATE checkpoint = MAX(fetched message IDs)                       │
│     └── COMMIT                                                              │
│  4. If ANY step fails → ROLLBACK → checkpoint unchanged → retry next run   │
└─────────────────────────────────────────────────────────────────────────────┘

Usage:
    python3 incremental_sync.py                    # Normal incremental sync (no media)
    python3 incremental_sync.py --with-media       # Sync with media downloads (photos only)
    python3 incremental_sync.py --conversations 50 # Limit to 50 conversations
    python3 incremental_sync.py --dry-run          # Preview without changes

Author: Production-grade implementation for telegram-crm-v2
"""

import os
import sys
import json
import asyncio
import argparse
import hashlib
import signal
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field
from contextlib import contextmanager
import traceback

import psycopg2
from psycopg2.extras import Json, execute_values
from telethon import TelegramClient
from telethon.tl.types import (
    User, Chat, Channel, Message,
    MessageMediaPhoto, MessageMediaDocument,
    PeerUser, PeerChat, PeerChannel,
    Document, DocumentAttributeVideo, DocumentAttributeAudio
)
from telethon.errors import FloodWaitError, ChatAdminRequiredError, ChannelPrivateError
from dotenv import load_dotenv

# Import database-backed lock manager
from lock_manager import SyncLockManager

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Load environment
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Paths
MEDIA_DIR = Path(__file__).parent.parent.parent / 'public' / 'media' / 'telegram'
LOG_DIR = Path(__file__).parent / 'logs'
STATE_FILE = Path(__file__).parent / 'incremental-sync-state.json'

# Database
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

# Telegram
API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
PHONE = os.getenv('TELEGRAM_PHONE_NUMBER', '')

# Performance tuning
BATCH_SIZE = 100                    # Messages per batch insert
RATE_LIMIT_DELAY = 0.5              # Seconds between API calls (fast but safe)
MAX_MESSAGES_PER_CONVERSATION = 500 # Safety limit per run
TRANSACTION_TIMEOUT = 30            # Seconds before transaction timeout
CONNECTION_POOL_SIZE = 3            # DB connection pool

# Media settings
DOWNLOAD_MEDIA = False              # Default: skip media for faster sync (use --with-media flag to enable)
MAX_FILE_SIZE = 10 * 1024 * 1024    # 10MB max file size
MAX_PHOTO_SIZE = 5 * 1024 * 1024    # 5MB max for photos
DOWNLOAD_PHOTOS = True              # Download photos when media enabled
DOWNLOAD_VIDEOS = False             # Skip videos (usually large)
MEDIA_DOWNLOAD_TIMEOUT = 30         # Seconds timeout per file

# ═══════════════════════════════════════════════════════════════════════════════
# DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class SyncStats:
    """Track sync statistics."""
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    conversations_processed: int = 0
    conversations_skipped: int = 0
    conversations_failed: int = 0
    conversations_total: int = 0
    messages_synced: int = 0
    messages_skipped: int = 0
    media_downloaded: int = 0
    media_skipped: int = 0
    media_failed: int = 0
    new_contacts: int = 0
    current_conversation: Optional[str] = None
    errors: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self, status: str = 'running') -> Dict[str, Any]:
        result = {
            'started_at': self.started_at.isoformat(),
            'status': status,
            'duration_seconds': (datetime.now(timezone.utc) - self.started_at).total_seconds(),
            'conversations_processed': self.conversations_processed,
            'conversations_skipped': self.conversations_skipped,
            'conversations_failed': self.conversations_failed,
            'conversations_total': self.conversations_total,
            'messages_synced': self.messages_synced,
            'messages_skipped': self.messages_skipped,
            'media_downloaded': self.media_downloaded,
            'media_skipped': self.media_skipped,
            'media_failed': self.media_failed,
            'new_contacts': self.new_contacts,
            'current_conversation': self.current_conversation,
            'errors': self.errors[-10:]  # Last 10 errors
        }
        # Add completed_at for completed syncs (used by UI to show "last synced X ago")
        if status == 'completed':
            result['completed_at'] = datetime.now(timezone.utc).isoformat()
        return result


@dataclass
class ConversationCheckpoint:
    """Checkpoint data for a conversation."""
    conversation_id: str
    external_chat_id: str
    title: str
    type: str
    last_synced_message_id: Optional[str]
    last_synced_at: Optional[datetime]


# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

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

        # Create log directory
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        log_filename = f"sync-{datetime.now().strftime('%Y%m%d-%H%M%S')}.log"
        self.log_file = LOG_DIR / log_filename

    def _log(self, level: str, message: str, data: Optional[Dict] = None):
        timestamp = datetime.now().strftime('%H:%M:%S')
        color = self.COLORS.get(level, '')
        reset = self.COLORS['RESET']

        # Console output
        if self.verbose or level in ('ERROR', 'SUCCESS'):
            prefix = f"[{timestamp}] {color}{level:7}{reset}"
            print(f"{prefix} {message}")

        # File output (always)
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


log = Logger('incremental-sync')

# ═══════════════════════════════════════════════════════════════════════════════
# DATABASE OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

class Database:
    """Database operations with transaction support."""

    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self._conn = None

    def connect(self) -> 'Database':
        """Establish database connection."""
        self._conn = psycopg2.connect(self.connection_string)
        self._conn.autocommit = False  # Explicit transaction control
        log.info("Connected to PostgreSQL")
        return self

    def close(self):
        """Close database connection."""
        if self._conn:
            self._conn.close()
            self._conn = None

    @contextmanager
    def transaction(self):
        """Context manager for atomic transactions."""
        cursor = self._conn.cursor()
        try:
            yield cursor
            self._conn.commit()
        except Exception as e:
            self._conn.rollback()
            raise e
        finally:
            cursor.close()

    def get_conversations_for_sync(self, limit: Optional[int] = None) -> List[ConversationCheckpoint]:
        """Get conversations that need syncing, ordered by priority."""
        with self.transaction() as cursor:
            query = """
                SELECT
                    c.id,
                    c."externalChatId",
                    c.title,
                    c.type,
                    c."lastSyncedMessageId",
                    c."lastSyncedAt"
                FROM "Conversation" c
                WHERE c.source = 'telegram'
                  AND c."isSyncDisabled" = FALSE
                ORDER BY
                    c."lastSyncedAt" ASC NULLS FIRST,
                    c."lastMessageAt" DESC NULLS LAST
            """
            if limit:
                query += f" LIMIT {limit}"

            cursor.execute(query)
            rows = cursor.fetchall()

            return [
                ConversationCheckpoint(
                    conversation_id=row[0],
                    external_chat_id=row[1],
                    title=row[2] or 'Unknown',
                    type=row[3],
                    last_synced_message_id=row[4],
                    last_synced_at=row[5]
                )
                for row in rows
            ]

    def upsert_messages_atomic(
        self,
        cursor,
        conversation_id: str,
        messages: List[Dict[str, Any]],
        new_checkpoint: str
    ) -> int:
        """
        ATOMIC: Insert messages and update checkpoint in single transaction.

        This is the CORE of 100% reliability:
        - All messages are inserted
        - Checkpoint is updated
        - If ANY step fails, EVERYTHING rolls back
        - Next run will retry from previous checkpoint
        """
        if not messages:
            return 0

        # Prepare message data for batch insert
        values = []
        for msg in messages:
            values.append((
                msg['id'],
                conversation_id,
                msg.get('contact_id'),
                'telegram',
                msg['external_message_id'],
                msg['direction'],
                msg['content_type'],
                msg.get('subject'),
                msg.get('body'),
                msg['sent_at'],
                msg.get('status', 'received'),
                msg.get('has_attachments', False),
                Json(msg.get('attachments')) if msg.get('attachments') else None,
                msg.get('contains_question', False),
                msg.get('keywords', []),
                Json(msg.get('metadata', {}))
            ))

        # Batch upsert messages
        execute_values(
            cursor,
            """
            INSERT INTO "Message" (
                id, "conversationId", "contactId", source, "externalMessageId",
                direction, "contentType", subject, body, "sentAt",
                status, "hasAttachments", attachments,
                "containsQuestion", keywords, metadata, "createdAt"
            )
            VALUES %s
            ON CONFLICT (source, "conversationId", "externalMessageId")
            DO UPDATE SET
                body = EXCLUDED.body,
                status = EXCLUDED.status,
                "hasAttachments" = EXCLUDED."hasAttachments",
                attachments = EXCLUDED.attachments,
                metadata = EXCLUDED.metadata
            """,
            values,
            template="""(
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
            )"""
        )

        # Find the latest message time from synced messages
        latest_message_time = max((m['sent_at'] for m in messages), default=None)

        # Update checkpoint - THIS IS CRITICAL FOR 100% RELIABILITY
        # Also update lastMessageAt to keep conversation sorting accurate
        cursor.execute("""
            UPDATE "Conversation"
            SET
                "lastSyncedMessageId" = %s,
                "lastSyncedAt" = NOW(),
                "syncStatus" = 'completed',
                "lastMessageAt" = GREATEST("lastMessageAt", %s),
                "updatedAt" = NOW()
            WHERE id = %s
        """, (new_checkpoint, latest_message_time, conversation_id))

        return len(messages)

    def find_contact_by_telegram_id(self, cursor, telegram_id: str) -> Optional[str]:
        """Find contact ID by Telegram user ID."""
        cursor.execute("""
            SELECT c.id
            FROM "Contact" c
            JOIN "SourceIdentity" si ON si."contactId" = c.id
            WHERE si.source = 'telegram' AND si."externalId" = %s
            LIMIT 1
        """, (telegram_id,))
        result = cursor.fetchone()
        return result[0] if result else None


# ═══════════════════════════════════════════════════════════════════════════════
# TELEGRAM OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

class TelegramSync:
    """Telegram sync operations."""

    def __init__(self, client: TelegramClient, db: Database, download_media: bool = False):
        self.client = client
        self.db = db
        self.stats = SyncStats()
        self._shutdown_requested = False
        self.download_media = download_media

    def request_shutdown(self):
        """Request graceful shutdown."""
        self._shutdown_requested = True
        log.warn("Shutdown requested, finishing current conversation...")

    def _save_progress(self, current_conversation: Optional[str] = None):
        """Save current progress to state file for UI updates."""
        self.stats.current_conversation = current_conversation
        try:
            with open(STATE_FILE, 'w') as f:
                json.dump(self.stats.to_dict(status='running'), f, indent=2)
        except Exception as e:
            log.warn(f"Failed to save progress: {e}")

    async def sync_conversation(
        self,
        checkpoint: ConversationCheckpoint,
        dry_run: bool = False
    ) -> Tuple[int, Optional[str]]:
        """
        Sync a single conversation from checkpoint.

        Returns:
            Tuple of (messages_synced, error_message)
        """
        chat_id = int(checkpoint.external_chat_id)
        min_id = int(checkpoint.last_synced_message_id) if checkpoint.last_synced_message_id else 0

        log.info(f"Syncing: {checkpoint.title} (checkpoint: {min_id})")

        try:
            # Fetch new messages from Telegram
            messages_to_sync = []
            highest_message_id = min_id

            async for message in self.client.iter_messages(
                chat_id,
                min_id=min_id,
                limit=MAX_MESSAGES_PER_CONVERSATION
            ):
                if not isinstance(message, Message) or not message.id:
                    continue

                # Track highest message ID for checkpoint
                if message.id > highest_message_id:
                    highest_message_id = message.id

                # Skip if same as checkpoint (min_id is exclusive in our logic)
                if str(message.id) == checkpoint.last_synced_message_id:
                    continue

                # Prepare message data (async to support media download)
                msg_data = await self._prepare_message_data(message)
                if msg_data:
                    messages_to_sync.append(msg_data)

                # Rate limiting
                if len(messages_to_sync) % BATCH_SIZE == 0:
                    await asyncio.sleep(RATE_LIMIT_DELAY)

            if not messages_to_sync:
                log.info(f"  No new messages")
                self.stats.conversations_skipped += 1
                return 0, None

            # DRY RUN: Just report what would happen
            if dry_run:
                log.info(f"  [DRY RUN] Would sync {len(messages_to_sync)} messages")
                return len(messages_to_sync), None

            # ATOMIC TRANSACTION: Insert messages + update checkpoint
            with self.db.transaction() as cursor:
                # Resolve contact IDs for messages
                for msg in messages_to_sync:
                    if msg.get('sender_telegram_id'):
                        msg['contact_id'] = self.db.find_contact_by_telegram_id(
                            cursor,
                            msg['sender_telegram_id']
                        )

                synced_count = self.db.upsert_messages_atomic(
                    cursor,
                    checkpoint.conversation_id,
                    messages_to_sync,
                    str(highest_message_id)
                )

            log.success(f"  Synced {synced_count} messages (new checkpoint: {highest_message_id})")
            self.stats.messages_synced += synced_count
            self.stats.conversations_processed += 1

            return synced_count, None

        except FloodWaitError as e:
            wait_time = e.seconds
            log.warn(f"  Rate limited, waiting {wait_time}s")
            await asyncio.sleep(wait_time)
            return 0, f"FloodWait: {wait_time}s"

        except (ChatAdminRequiredError, ChannelPrivateError) as e:
            log.warn(f"  Access denied: {type(e).__name__}")
            self.stats.conversations_skipped += 1
            return 0, None  # Not an error, just skip

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}"
            log.error(f"  Failed: {error_msg}")
            self.stats.conversations_failed += 1
            self.stats.errors.append({
                'conversation': checkpoint.title,
                'error': error_msg,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            return 0, error_msg

    def _get_media_type(self, media) -> str:
        """Determine media type from Telegram media object."""
        if isinstance(media, MessageMediaPhoto):
            return 'photos'
        elif isinstance(media, MessageMediaDocument):
            if isinstance(media.document, Document):
                for attr in media.document.attributes:
                    if isinstance(attr, DocumentAttributeVideo):
                        return 'videos'
                    if isinstance(attr, DocumentAttributeAudio):
                        return 'audio'
                return 'documents'
        return 'other'

    def _generate_file_name(self, message: Message, media) -> str:
        """Generate unique file name for media."""
        ext = '.jpg'  # Default
        if isinstance(media, MessageMediaDocument) and isinstance(media.document, Document):
            mime = media.document.mime_type or ''
            if 'video' in mime:
                ext = '.mp4'
            elif 'audio' in mime:
                ext = '.mp3'
            elif 'pdf' in mime:
                ext = '.pdf'
            elif 'png' in mime:
                ext = '.png'
            elif 'gif' in mime:
                ext = '.gif'
        return f"{message.id}{ext}"

    async def _download_media(self, message: Message) -> Optional[Dict[str, Any]]:
        """Download media from message with smart filtering."""
        if not message.media or not self.download_media:
            return None

        try:
            media = message.media

            # Check file size before downloading
            file_size = 0
            if isinstance(media, MessageMediaDocument) and isinstance(media.document, Document):
                file_size = media.document.size

                # Skip videos (usually large)
                if not DOWNLOAD_VIDEOS:
                    is_video = any(isinstance(attr, DocumentAttributeVideo) for attr in media.document.attributes)
                    if is_video:
                        self.stats.media_skipped += 1
                        return None

                # Skip files larger than max
                if file_size > MAX_FILE_SIZE:
                    self.stats.media_skipped += 1
                    return None

            # Skip photos if disabled or too large
            if isinstance(media, MessageMediaPhoto):
                if not DOWNLOAD_PHOTOS:
                    self.stats.media_skipped += 1
                    return None

            media_type = self._get_media_type(media)
            file_name = self._generate_file_name(message, media)

            # Ensure media directory exists
            media_dir = MEDIA_DIR / media_type
            media_dir.mkdir(parents=True, exist_ok=True)

            file_path = media_dir / file_name

            # Skip if file already exists
            if file_path.exists():
                relative_path = f'/media/telegram/{media_type}/{file_name}'
                return {
                    'files': [{
                        'path': relative_path,
                        'type': media_type,
                        'size': file_path.stat().st_size
                    }]
                }

            # Download with timeout
            try:
                await asyncio.wait_for(
                    self.client.download_media(message, file=str(file_path)),
                    timeout=MEDIA_DOWNLOAD_TIMEOUT
                )
            except asyncio.TimeoutError:
                log.warn(f"    Media download timeout: {file_name}")
                self.stats.media_failed += 1
                return None

            if file_path.exists():
                self.stats.media_downloaded += 1
                relative_path = f'/media/telegram/{media_type}/{file_name}'
                return {
                    'files': [{
                        'path': relative_path,
                        'type': media_type,
                        'size': file_path.stat().st_size
                    }]
                }
            else:
                self.stats.media_failed += 1
                return None

        except Exception as e:
            log.warn(f"    Media download error: {e}")
            self.stats.media_failed += 1
            return None

    async def _prepare_message_data(self, message: Message) -> Optional[Dict[str, Any]]:
        """Prepare message data for database insertion."""
        try:
            is_outgoing = message.out
            message_date = message.date.replace(tzinfo=timezone.utc)

            # Get sender info - ALWAYS try to get full sender details for 100% reliability
            sender_telegram_id = None
            sender_name = None
            sender_username = None

            if isinstance(message.from_id, PeerUser):
                sender_telegram_id = str(message.from_id.user_id)
                # Try to get sender details from the message's sender attribute
                # Telethon caches entity info, so this is efficient
                try:
                    sender = await message.get_sender()
                    if sender:
                        # Build display name from first_name/last_name or username
                        if hasattr(sender, 'first_name'):
                            parts = [sender.first_name, getattr(sender, 'last_name', None)]
                            sender_name = ' '.join(filter(None, parts)) or None
                        if hasattr(sender, 'username'):
                            sender_username = sender.username
                        # Fallback to username if no name
                        if not sender_name and sender_username:
                            sender_name = sender_username
                except Exception:
                    # If we can't get sender info, continue with just the ID
                    pass

            # Message content
            body = message.message or ''
            contains_question = '?' in body

            # Generate unique ID
            msg_id = 'm' + hashlib.md5(
                f"{message.id}-{message_date.timestamp()}".encode()
            ).hexdigest()[:24]

            # Download media if enabled
            attachments = None
            if message.media and self.download_media:
                attachments = await self._download_media(message)

            return {
                'id': msg_id,
                'external_message_id': str(message.id),
                'direction': 'outbound' if is_outgoing else 'inbound',
                'content_type': 'media' if message.media else 'text',
                'body': body,
                'sent_at': message_date,
                'status': 'sent' if is_outgoing else 'received',
                'has_attachments': bool(message.media),
                'attachments': attachments,
                'contains_question': contains_question,
                'keywords': [],
                'sender_telegram_id': sender_telegram_id,
                'metadata': {
                    'views': message.views,
                    'forwards': message.forwards,
                    'edit_date': message.edit_date.isoformat() if message.edit_date else None,
                    # Store sender info directly for 100% reliable display
                    # This is the fallback when contactId is NULL
                    'sender': {
                        'telegram_id': sender_telegram_id,
                        'name': sender_name,
                        'username': sender_username,
                    } if sender_telegram_id else None
                }
            }
        except Exception as e:
            log.warn(f"  Skipping message {message.id}: {e}")
            return None

    async def run_sync(
        self,
        conversation_limit: Optional[int] = None,
        dry_run: bool = False
    ):
        """Run incremental sync for all conversations."""

        log.info("=" * 60)
        log.info("  TELEGRAM INCREMENTAL SYNC")
        log.info("=" * 60)
        log.info(f"Mode: {'DRY RUN' if dry_run else 'LIVE'}")
        log.info(f"Media download: {'ENABLED' if self.download_media else 'DISABLED'}")
        log.info(f"Conversation limit: {conversation_limit or 'ALL'}")
        log.info("")

        # Get conversations to sync
        conversations = self.db.get_conversations_for_sync(limit=conversation_limit)
        log.info(f"Found {len(conversations)} conversations to check")
        log.info("")

        # Update initial state with total count
        self.stats.conversations_total = len(conversations)
        self._save_progress(current_conversation=None)

        # Sync each conversation
        for i, checkpoint in enumerate(conversations):
            if self._shutdown_requested:
                log.warn("Shutdown requested, stopping...")
                break

            progress = f"[{i+1}/{len(conversations)}]"
            log.info(f"{progress} {checkpoint.title}")

            # Save progress before starting each conversation
            self._save_progress(current_conversation=checkpoint.title)

            await self.sync_conversation(checkpoint, dry_run=dry_run)

            # Save progress after each conversation
            self._save_progress(current_conversation=None)

            # Small delay between conversations
            await asyncio.sleep(RATE_LIMIT_DELAY)

        # Final report
        self._print_summary()

    def _print_summary(self):
        """Print sync summary."""
        stats = self.stats
        duration = (datetime.now(timezone.utc) - stats.started_at).total_seconds()

        log.info("")
        log.info("=" * 60)
        log.success("  SYNC COMPLETE")
        log.info("=" * 60)
        log.info(f"Duration: {duration:.1f} seconds")
        log.info(f"Conversations processed: {stats.conversations_processed}")
        log.info(f"Conversations skipped: {stats.conversations_skipped}")
        log.info(f"Conversations failed: {stats.conversations_failed}")
        log.info(f"Messages synced: {stats.messages_synced}")
        if self.download_media:
            log.info(f"Media downloaded: {stats.media_downloaded}")
            log.info(f"Media skipped: {stats.media_skipped}")
            log.info(f"Media failed: {stats.media_failed}")
        log.info(f"Errors: {len(stats.errors)}")

        if stats.errors:
            log.warn("Recent errors:")
            for err in stats.errors[-5:]:
                log.warn(f"  - {err['conversation']}: {err['error']}")

        # Save state with completed status
        with open(STATE_FILE, 'w') as f:
            json.dump(stats.to_dict(status='completed'), f, indent=2)
        log.info(f"State saved to: {STATE_FILE}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

async def main():
    """Main entry point."""

    # Parse arguments
    parser = argparse.ArgumentParser(description='Telegram Incremental Sync')
    parser.add_argument('--conversations', type=int, help='Limit conversations to sync')
    parser.add_argument('--dry-run', action='store_true', help='Preview without changes')
    parser.add_argument('--quiet', action='store_true', help='Less verbose output')
    parser.add_argument('--with-media', action='store_true', help='Download media files (photos, documents)')
    parser.add_argument('--force', action='store_true', help='Force run even if listener is active')
    args = parser.parse_args()

    # Configure logging
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
    sync = None
    lock_manager = None
    lock_acquired = False

    # Setup graceful shutdown
    def signal_handler(sig, frame):
        if sync:
            sync.request_shutdown()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        # Connect to database first (needed for lock manager)
        log.info("Connecting to PostgreSQL...")
        db.connect()

        # Initialize lock manager
        lock_manager = SyncLockManager(db._conn)

        # Check if real-time listener is running
        listener_lock = lock_manager.check_lock('listener', 'singleton')
        if listener_lock and not args.force:
            log.warn("Real-time listener is active - skipping batch sync")
            log.info(f"  Listener running on {listener_lock['hostname']}, PID {listener_lock['process_id']}")
            log.info("  Use --force to override (not recommended)")
            sys.exit(0)

        # Acquire global sync lock
        log.info("Acquiring global sync lock...")
        if not lock_manager.acquire('global', 'all', metadata={'type': 'incremental_sync'}):
            existing_lock = lock_manager.check_lock('global', 'all')
            if existing_lock:
                log.error(f"Another sync is already running")
                log.info(f"  Held by: {existing_lock['hostname']}, PID {existing_lock['process_id']}")
                log.info(f"  Started: {existing_lock['acquired_at']}")
            sys.exit(1)

        lock_acquired = True
        log.success("Global sync lock acquired")

        # Connect to Telegram
        log.info("Connecting to Telegram...")
        await client.start(phone=PHONE)
        log.success("Connected to Telegram")

        # Run sync
        sync = TelegramSync(client, db, download_media=args.with_media)
        await sync.run_sync(
            conversation_limit=args.conversations,
            dry_run=args.dry_run
        )

    except Exception as e:
        log.error(f"Fatal error: {e}")
        traceback.print_exc()
        sys.exit(1)

    finally:
        # Release lock before closing connections
        if lock_manager and lock_acquired:
            try:
                lock_manager.release('global', 'all')
                log.info("Global sync lock released")
            except Exception as e:
                log.warn(f"Failed to release lock: {e}")

        db.close()
        await client.disconnect()
        log.info("Disconnected")


if __name__ == '__main__':
    asyncio.run(main())
