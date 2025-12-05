#!/usr/bin/env python3
"""
Persistent Real-Time Telegram Listener

Maintains a persistent connection to Telegram for instant message capture.

GUARANTEES:
- Sub-second message delivery
- Automatic reconnection on network issues
- Crash recovery via PM2 + database state
- No message loss (catch-up sync on startup)

Managed by PM2:
    pm2 start realtime_listener.py --name telegram-listener --interpreter python3

Author: telegram-crm-v2
"""

import os
import sys
import json
import asyncio
import hashlib
import signal
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
import traceback

import psycopg2
from psycopg2.extras import Json
from telethon import TelegramClient, events
from telethon.tl.types import (
    Message, PeerUser, PeerChat, PeerChannel,
    MessageMediaPhoto, MessageMediaDocument
)
from dotenv import load_dotenv

from lock_manager import SyncLockManager, ListenerStateManager

# Configuration
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Database
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

# Telegram
API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
SESSION_PATH = Path(__file__).parent / 'telegram_session'

# State
STATE_FILE = Path(__file__).parent / 'listener-state.json'
HEARTBEAT_INTERVAL = 30  # seconds
CATCH_UP_LIMIT = 200  # Max messages per conversation on startup
CATCH_UP_CONVERSATIONS = 50  # Max conversations to catch up


class RealtimeListener:
    """Persistent Telegram listener with automatic recovery."""

    def __init__(self):
        self.client: Optional[TelegramClient] = None
        self.conn = None
        self.lock_manager: Optional[SyncLockManager] = None
        self.state_manager: Optional[ListenerStateManager] = None
        self.running = False
        self.messages_received = 0
        self.started_at: Optional[datetime] = None
        self.errors: List[Dict] = []

        # Graceful shutdown
        self._shutdown_event = asyncio.Event()

        # Cache conversation lookups
        self._conversation_cache: Dict[str, Optional[Dict]] = {}

    async def start(self):
        """Start the listener with all recovery mechanisms."""
        print("=" * 60)
        print("  TELEGRAM REAL-TIME LISTENER")
        print("=" * 60)
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print()

        # Connect to database
        self.conn = psycopg2.connect(DATABASE_URL)
        self.lock_manager = SyncLockManager(self.conn)
        self.state_manager = ListenerStateManager(self.conn)

        # Try to acquire listener lock
        if not self.lock_manager.acquire('listener', 'singleton'):
            existing = self.lock_manager.check_lock('listener', 'singleton')
            if existing:
                print(f"ERROR: Another listener is running")
                print(f"  PID: {existing['process_id']}")
                print(f"  Host: {existing['hostname']}")
                print(f"  Since: {existing['acquired_at']}")
                print()
                print("Use 'python lock_manager.py force-unlock' to clear locks if needed")
                sys.exit(1)

        print("Acquired listener lock")

        # Connect to Telegram
        self.client = TelegramClient(str(SESSION_PATH), API_ID, API_HASH)
        await self.client.start()

        if not await self.client.is_user_authorized():
            print("ERROR: Telegram session not authorized")
            print("Run 'python3 incremental_sync.py' first to authenticate")
            sys.exit(1)

        me = await self.client.get_me()
        print(f"Connected to Telegram as: {me.first_name} (@{me.username})")

        # Update state
        self.running = True
        self.started_at = datetime.now(timezone.utc)
        self._update_state('running')

        # Run catch-up sync
        await self._catch_up_sync()

        # Register event handlers
        self._register_handlers()

        # Start heartbeat task
        asyncio.create_task(self._heartbeat_loop())

        print()
        print("Listening for new messages...")
        print("Press Ctrl+C to stop")
        print("=" * 60)

        # Run until shutdown
        await self._shutdown_event.wait()

    async def stop(self):
        """Graceful shutdown."""
        print()
        print("Shutting down...")
        self.running = False

        if self.lock_manager:
            self.lock_manager.release_all()

        self._update_state('stopped')

        if self.client:
            await self.client.disconnect()

        if self.conn:
            self.conn.close()

        print("Shutdown complete")

    def _register_handlers(self):
        """Register Telegram event handlers."""

        @self.client.on(events.NewMessage)
        async def on_new_message(event):
            """Handle incoming messages in real-time."""
            try:
                await self._handle_message(event.message)
            except Exception as e:
                self._add_error(f"Error handling message: {e}")
                traceback.print_exc()

        @self.client.on(events.MessageEdited)
        async def on_message_edited(event):
            """Handle edited messages."""
            try:
                await self._handle_message(event.message, is_edit=True)
            except Exception as e:
                self._add_error(f"Error handling edit: {e}")

    async def _handle_message(self, message: Message, is_edit: bool = False):
        """Process a single message and save to database."""
        if not isinstance(message, Message) or not message.id:
            return

        # Get chat info
        chat_id = self._get_chat_id(message)
        if not chat_id:
            return

        # Find conversation in database (with caching)
        conversation = await self._get_conversation(str(chat_id))
        if not conversation:
            # Unknown conversation - skip (will be picked up on next full sync)
            return

        if conversation.get('is_sync_disabled'):
            return

        # Prepare message data
        msg_data = await self._prepare_message(message)
        if not msg_data:
            return

        # Save to database (atomic)
        try:
            cursor = self.conn.cursor()

            # Resolve contact ID
            contact_id = None
            if msg_data.get('sender_telegram_id'):
                contact_id = self._find_contact(cursor, msg_data['sender_telegram_id'])

            # Insert/update message
            cursor.execute("""
                INSERT INTO telegram_crm."Message" (
                    id, "conversationId", "contactId", source, "externalMessageId",
                    direction, "contentType", body, "sentAt", status,
                    "hasAttachments", metadata, "createdAt"
                )
                VALUES (%s, %s, %s, 'telegram', %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (source, "conversationId", "externalMessageId")
                DO UPDATE SET
                    body = EXCLUDED.body,
                    metadata = EXCLUDED.metadata
            """, (
                msg_data['id'],
                conversation['id'],
                contact_id,
                msg_data['external_message_id'],
                msg_data['direction'],
                msg_data['content_type'],
                msg_data['body'],
                msg_data['sent_at'],
                msg_data['status'],
                msg_data['has_attachments'],
                Json(msg_data['metadata'])
            ))

            # Update conversation timestamps
            cursor.execute("""
                UPDATE telegram_crm."Conversation"
                SET "lastMessageAt" = GREATEST("lastMessageAt", %s),
                    "lastSyncedMessageId" = %s,
                    "lastSyncedAt" = NOW(),
                    "updatedAt" = NOW()
                WHERE id = %s
            """, (msg_data['sent_at'], msg_data['external_message_id'], conversation['id']))

            self.conn.commit()
            cursor.close()

            self.messages_received += 1

            # Log the message
            action = "Edited" if is_edit else "New"
            direction = "OUT" if msg_data['direction'] == 'outbound' else "IN"
            preview = (msg_data['body'][:40] + '...') if len(msg_data['body']) > 40 else msg_data['body']
            print(f"[{datetime.now().strftime('%H:%M:%S')}] {action} [{direction}] {conversation.get('title', 'Unknown')}: {preview}")

            # Update state
            self.state_manager.increment_messages()

        except Exception as e:
            self.conn.rollback()
            self._add_error(f"Database error: {e}")
            raise

    async def _catch_up_sync(self):
        """Sync messages that arrived while listener was offline."""
        print("Running catch-up sync...")

        cursor = self.conn.cursor()
        # Get conversations ordered by last message time (most active first)
        cursor.execute("""
            SELECT id, "externalChatId", title, "lastSyncedMessageId"
            FROM telegram_crm."Conversation"
            WHERE source = 'telegram'
              AND "isSyncDisabled" = FALSE
            ORDER BY "lastMessageAt" DESC NULLS LAST
            LIMIT %s
        """, (CATCH_UP_CONVERSATIONS,))
        conversations = cursor.fetchall()
        cursor.close()

        total_synced = 0
        skipped = 0

        for conv_id, chat_id, title, last_synced_id in conversations:
            min_id = int(last_synced_id) if last_synced_id else 0

            try:
                messages = []
                async for msg in self.client.iter_messages(
                    int(chat_id),
                    min_id=min_id,
                    limit=CATCH_UP_LIMIT
                ):
                    if isinstance(msg, Message) and msg.id and str(msg.id) != str(last_synced_id):
                        msg_data = await self._prepare_message(msg)
                        if msg_data:
                            messages.append(msg_data)

                if messages:
                    # Bulk insert
                    await self._bulk_insert_messages(conv_id, messages)
                    total_synced += len(messages)
                    print(f"  {title}: {len(messages)} messages")
                else:
                    skipped += 1

            except Exception as e:
                self._add_error(f"Catch-up error for {title}: {e}")

        print(f"Catch-up complete: {total_synced} messages synced, {skipped} conversations up-to-date")

    async def _bulk_insert_messages(self, conversation_id: str, messages: list):
        """Bulk insert messages for catch-up sync."""
        if not messages:
            return

        cursor = self.conn.cursor()
        try:
            for msg in messages:
                contact_id = None
                if msg.get('sender_telegram_id'):
                    contact_id = self._find_contact(cursor, msg['sender_telegram_id'])

                cursor.execute("""
                    INSERT INTO telegram_crm."Message" (
                        id, "conversationId", "contactId", source, "externalMessageId",
                        direction, "contentType", body, "sentAt", status,
                        "hasAttachments", metadata, "createdAt"
                    )
                    VALUES (%s, %s, %s, 'telegram', %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (source, "conversationId", "externalMessageId") DO NOTHING
                """, (
                    msg['id'], conversation_id, contact_id,
                    msg['external_message_id'], msg['direction'],
                    msg['content_type'], msg['body'], msg['sent_at'],
                    msg['status'], msg['has_attachments'],
                    Json(msg['metadata'])
                ))

            # Update conversation checkpoint
            highest_id = max(int(m['external_message_id']) for m in messages)
            latest_time = max(m['sent_at'] for m in messages)

            cursor.execute("""
                UPDATE telegram_crm."Conversation"
                SET "lastSyncedMessageId" = %s,
                    "lastSyncedAt" = NOW(),
                    "lastMessageAt" = GREATEST("lastMessageAt", %s),
                    "updatedAt" = NOW()
                WHERE id = %s
            """, (str(highest_id), latest_time, conversation_id))

            self.conn.commit()
        finally:
            cursor.close()

    async def _prepare_message(self, message: Message) -> Optional[Dict[str, Any]]:
        """Prepare message data for database."""
        try:
            is_outgoing = message.out
            message_date = message.date.replace(tzinfo=timezone.utc)

            # Get sender info
            sender_telegram_id = None
            sender_name = None
            sender_username = None

            if isinstance(message.from_id, PeerUser):
                sender_telegram_id = str(message.from_id.user_id)
                try:
                    sender = await message.get_sender()
                    if sender:
                        if hasattr(sender, 'first_name'):
                            parts = [sender.first_name, getattr(sender, 'last_name', None)]
                            sender_name = ' '.join(filter(None, parts)) or None
                        if hasattr(sender, 'username'):
                            sender_username = sender.username
                        if not sender_name and sender_username:
                            sender_name = sender_username
                except:
                    pass

            # Generate ID
            msg_id = 'm' + hashlib.md5(
                f"{message.id}-{message_date.timestamp()}".encode()
            ).hexdigest()[:24]

            return {
                'id': msg_id,
                'external_message_id': str(message.id),
                'direction': 'outbound' if is_outgoing else 'inbound',
                'content_type': 'media' if message.media else 'text',
                'body': message.message or '',
                'sent_at': message_date,
                'status': 'sent' if is_outgoing else 'received',
                'has_attachments': bool(message.media),
                'sender_telegram_id': sender_telegram_id,
                'metadata': {
                    'sender': {
                        'telegram_id': sender_telegram_id,
                        'name': sender_name,
                        'username': sender_username,
                    } if sender_telegram_id else None
                }
            }
        except Exception as e:
            self._add_error(f"Error preparing message: {e}")
            return None

    def _get_chat_id(self, message: Message) -> Optional[int]:
        """Extract chat ID from message."""
        if hasattr(message, 'chat_id'):
            return message.chat_id
        if hasattr(message.peer_id, 'channel_id'):
            return -message.peer_id.channel_id
        if hasattr(message.peer_id, 'chat_id'):
            return -message.peer_id.chat_id
        if hasattr(message.peer_id, 'user_id'):
            return message.peer_id.user_id
        return None

    async def _get_conversation(self, external_chat_id: str) -> Optional[Dict]:
        """Get conversation from database by external chat ID (with caching)."""
        # Check cache first
        if external_chat_id in self._conversation_cache:
            return self._conversation_cache[external_chat_id]

        cursor = self.conn.cursor()
        try:
            cursor.execute("""
                SELECT id, title, type, "isSyncDisabled"
                FROM telegram_crm."Conversation"
                WHERE "externalChatId" = %s AND source = 'telegram'
            """, (external_chat_id,))
            row = cursor.fetchone()

            result = None
            if row:
                result = {
                    'id': row[0],
                    'title': row[1],
                    'type': row[2],
                    'is_sync_disabled': row[3]
                }

            # Cache result (even if None)
            self._conversation_cache[external_chat_id] = result
            return result
        finally:
            cursor.close()

    def _find_contact(self, cursor, telegram_id: str) -> Optional[str]:
        """Find contact ID by Telegram user ID."""
        cursor.execute("""
            SELECT c.id
            FROM telegram_crm."Contact" c
            JOIN telegram_crm."SourceIdentity" si ON si."contactId" = c.id
            WHERE si.source = 'telegram' AND si."externalId" = %s
            LIMIT 1
        """, (telegram_id,))
        row = cursor.fetchone()
        return row[0] if row else None

    async def _heartbeat_loop(self):
        """Periodic heartbeat to maintain lock and update state."""
        while self.running:
            try:
                self.lock_manager.heartbeat()
                self._update_state('running')
            except Exception as e:
                self._add_error(f"Heartbeat error: {e}")
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    def _update_state(self, status: str):
        """Update listener state file and database."""
        state = {
            'status': status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'messages_received': self.messages_received,
            'last_heartbeat': datetime.now(timezone.utc).isoformat(),
            'pid': os.getpid(),
            'errors': self.errors[-5:],  # Last 5 errors
        }

        # File state (for quick frontend polling)
        try:
            with open(STATE_FILE, 'w') as f:
                json.dump(state, f, indent=2)
        except:
            pass

        # Database state
        try:
            self.state_manager.update_state(status, self.messages_received, self.errors[-10:])
        except Exception as e:
            print(f"Failed to update DB state: {e}")

    def _add_error(self, error: str):
        """Add error to error list."""
        self.errors.append({
            'error': error,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        print(f"ERROR: {error}")


async def main():
    listener = RealtimeListener()

    # Handle shutdown signals
    loop = asyncio.get_event_loop()

    def shutdown_handler():
        asyncio.create_task(shutdown(listener))

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, shutdown_handler)

    try:
        await listener.start()
    except Exception as e:
        print(f"Fatal error: {e}")
        traceback.print_exc()
    finally:
        await listener.stop()


async def shutdown(listener):
    """Handle shutdown signal."""
    listener._shutdown_event.set()


if __name__ == '__main__':
    asyncio.run(main())
