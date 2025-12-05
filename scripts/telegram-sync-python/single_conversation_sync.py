#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
                    SINGLE CONVERSATION SYNC
═══════════════════════════════════════════════════════════════════════════════

Syncs a single conversation by its internal database ID.
Used by the frontend to sync individual chats on-demand.

Usage:
    python3 single_conversation_sync.py <conversation_id>

Output:
    Writes progress to single-sync-state.json for frontend polling.
"""

import os
import sys
import json
import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import psycopg2
from psycopg2.extras import Json
from telethon import TelegramClient
from telethon.tl.types import (
    Message, PeerUser,
    MessageMediaPhoto, MessageMediaDocument,
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
STATE_FILE = Path(__file__).parent / 'single-sync-state.json'

# Database
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

# Telegram credentials
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
# Use separate session file to avoid conflicts with realtime listener
# Copy from main session if this one doesn't exist
SESSION_PATH = Path(__file__).parent / 'telegram_session_single'
MAIN_SESSION_PATH = Path(__file__).parent / 'telegram_session.session'

def ensure_session_copy():
    """Copy main session to single sync session if needed."""
    import shutil
    single_session_file = Path(str(SESSION_PATH) + '.session')
    if not single_session_file.exists() and MAIN_SESSION_PATH.exists():
        shutil.copy(MAIN_SESSION_PATH, single_session_file)
        print(f"Copied session file to {single_session_file}")

# Sync settings
MAX_MESSAGES = 1000  # Max messages to fetch in single sync
BATCH_SIZE = 100


def save_state(state: Dict[str, Any]):
    """Save current state to file."""
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)


class SingleConversationSync:
    def __init__(self, client: TelegramClient, conn):
        self.client = client
        self.conn = conn
        self.messages_synced = 0

    def get_conversation(self, conversation_id: str) -> Optional[Dict[str, Any]]:
        """Get conversation details from database."""
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT id, "externalChatId", title, "lastSyncedMessageId"
                FROM telegram_crm."Conversation"
                WHERE id = %s
            """, (conversation_id,))
            row = cur.fetchone()
            if row:
                return {
                    'id': row[0],
                    'external_chat_id': row[1],
                    'title': row[2],
                    'last_synced_message_id': row[3],
                }
            return None

    def find_contact_by_telegram_id(self, telegram_id: str) -> Optional[str]:
        """Find contact ID by telegram ID using SourceIdentity table."""
        with self.conn.cursor() as cur:
            cur.execute("""
                SELECT c.id
                FROM telegram_crm."Contact" c
                JOIN telegram_crm."SourceIdentity" si ON si."contactId" = c.id
                WHERE si.source = 'telegram' AND si."externalId" = %s
                LIMIT 1
            """, (telegram_id,))
            row = cur.fetchone()
            return row[0] if row else None

    async def sync(self, conversation_id: str) -> Dict[str, Any]:
        """Sync a single conversation."""
        result = {
            'success': False,
            'conversation_id': conversation_id,
            'messages_synced': 0,
            'error': None,
        }

        # Get conversation details
        conv = self.get_conversation(conversation_id)
        if not conv:
            result['error'] = 'Conversation not found'
            return result

        chat_id = int(conv['external_chat_id'])
        min_id = int(conv['last_synced_message_id']) if conv['last_synced_message_id'] else 0

        # Update state
        state = {
            'conversation_id': conversation_id,
            'conversation_title': conv['title'],
            'status': 'running',
            'started_at': datetime.now(timezone.utc).isoformat(),
            'messages_synced': 0,
            'checkpoint': min_id,
        }
        save_state(state)

        print(f"Syncing: {conv['title']} (checkpoint: {min_id})")

        try:
            # Fetch messages from Telegram
            messages_to_sync = []
            highest_message_id = min_id

            async for message in self.client.iter_messages(
                chat_id,
                min_id=min_id,
                limit=MAX_MESSAGES
            ):
                if not isinstance(message, Message) or not message.id:
                    continue

                if message.id > highest_message_id:
                    highest_message_id = message.id

                # Skip if same as checkpoint
                if str(message.id) == conv['last_synced_message_id']:
                    continue

                # Prepare message data (async to get sender info)
                msg_data = await self._prepare_message_data(message)
                if msg_data:
                    messages_to_sync.append(msg_data)

                # Update progress periodically
                if len(messages_to_sync) % 50 == 0:
                    state['messages_fetched'] = len(messages_to_sync)
                    save_state(state)

            if not messages_to_sync:
                print(f"  No new messages")
                result['success'] = True
                result['messages_synced'] = 0
                state['status'] = 'completed'
                state['completed_at'] = datetime.now(timezone.utc).isoformat()
                save_state(state)
                return result

            print(f"  Found {len(messages_to_sync)} new messages")

            # Atomic insert
            with self.conn.cursor() as cur:
                # Resolve contact IDs
                for msg in messages_to_sync:
                    if msg.get('sender_telegram_id'):
                        msg['contact_id'] = self.find_contact_by_telegram_id(msg['sender_telegram_id'])

                # Insert messages (matching incremental_sync.py schema)
                for msg in messages_to_sync:
                    cur.execute("""
                        INSERT INTO telegram_crm."Message" (
                            id, "conversationId", "contactId", source, "externalMessageId",
                            direction, "contentType", subject, body, "sentAt",
                            status, "hasAttachments", attachments,
                            "containsQuestion", keywords, metadata, "createdAt"
                        ) VALUES (
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW()
                        )
                        ON CONFLICT (source, "conversationId", "externalMessageId")
                        DO UPDATE SET
                            body = EXCLUDED.body,
                            status = EXCLUDED.status,
                            "hasAttachments" = EXCLUDED."hasAttachments",
                            attachments = EXCLUDED.attachments,
                            metadata = EXCLUDED.metadata
                    """, (
                        msg['id'],
                        conversation_id,
                        msg.get('contact_id'),
                        'telegram',
                        msg['external_message_id'],
                        msg['direction'],
                        msg['content_type'],
                        None,  # subject
                        msg['body'],
                        msg['sent_at'],
                        'received',  # status
                        bool(msg.get('attachments')),  # hasAttachments
                        Json(msg.get('attachments')) if msg.get('attachments') else None,
                        msg.get('contains_question', False),
                        [],  # keywords
                        Json(msg.get('metadata', {})),  # metadata with sender info
                    ))

                # Find the latest message time from synced messages
                latest_message_time = max(
                    (msg['sent_at'] for msg in messages_to_sync),
                    default=None
                )

                # Update checkpoint and lastMessageAt
                cur.execute("""
                    UPDATE telegram_crm."Conversation"
                    SET "lastSyncedMessageId" = %s,
                        "lastSyncedAt" = NOW(),
                        "lastMessageAt" = GREATEST("lastMessageAt", %s::timestamptz),
                        "updatedAt" = NOW()
                    WHERE id = %s
                """, (str(highest_message_id), latest_message_time, conversation_id))

                self.conn.commit()

            self.messages_synced = len(messages_to_sync)
            result['success'] = True
            result['messages_synced'] = self.messages_synced

            state['status'] = 'completed'
            state['messages_synced'] = self.messages_synced
            state['new_checkpoint'] = highest_message_id
            state['completed_at'] = datetime.now(timezone.utc).isoformat()
            save_state(state)

            print(f"  Synced {self.messages_synced} messages (new checkpoint: {highest_message_id})")

        except FloodWaitError as e:
            result['error'] = f'Rate limited. Please wait {e.seconds} seconds.'
            state['status'] = 'failed'
            state['error'] = result['error']
            save_state(state)

        except (ChatAdminRequiredError, ChannelPrivateError) as e:
            result['error'] = f'Access denied: {type(e).__name__}'
            state['status'] = 'failed'
            state['error'] = result['error']
            save_state(state)

        except Exception as e:
            result['error'] = f'{type(e).__name__}: {str(e)}'
            state['status'] = 'failed'
            state['error'] = result['error']
            save_state(state)
            print(f"  Error: {result['error']}")

        return result

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

            # Determine content type
            content_type = 'text'
            if message.media:
                if isinstance(message.media, MessageMediaPhoto):
                    content_type = 'image'
                elif isinstance(message.media, MessageMediaDocument):
                    content_type = 'document'

            return {
                'id': msg_id,
                'external_message_id': str(message.id),
                'body': body,
                'direction': 'outbound' if is_outgoing else 'inbound',
                'sent_at': message_date.isoformat(),
                'content_type': content_type,
                'sender_telegram_id': sender_telegram_id,
                'contains_question': contains_question,
                'attachments': None,
                # Store sender info in metadata for 100% reliable display
                'metadata': {
                    'sender': {
                        'telegram_id': sender_telegram_id,
                        'name': sender_name,
                        'username': sender_username,
                    } if sender_telegram_id else None
                }
            }

        except Exception as e:
            print(f"    Error preparing message: {e}")
            return None


async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 single_conversation_sync.py <conversation_id>")
        sys.exit(1)

    conversation_id = sys.argv[1]
    lock_manager = None
    lock_acquired = False

    # Ensure we have a copy of the session file
    ensure_session_copy()

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)

    # Initialize lock manager
    lock_manager = SyncLockManager(conn)

    # Check if listener is running - if so, skip single sync (listener handles it)
    listener_lock = lock_manager.check_lock('listener', 'singleton')
    if listener_lock:
        print(f"Real-time listener is active - skipping single sync")
        print(f"  Listener running on {listener_lock['hostname']}, PID {listener_lock['process_id']}")
        # Return success since listener will handle the sync
        result = {
            'success': True,
            'conversation_id': conversation_id,
            'messages_synced': 0,
            'error': None,
            'skipped': 'listener_active'
        }
        print(json.dumps(result, indent=2))
        conn.close()
        sys.exit(0)

    # Acquire lock for this specific conversation
    if not lock_manager.acquire('single', conversation_id, metadata={'type': 'single_conversation_sync'}):
        existing_lock = lock_manager.check_lock('single', conversation_id)
        if existing_lock:
            print(f"Another sync is already running for this conversation")
            print(f"  Held by: {existing_lock['hostname']}, PID {existing_lock['process_id']}")
        sys.exit(1)

    lock_acquired = True
    print(f"Lock acquired for conversation {conversation_id}")

    # Connect to Telegram
    client = TelegramClient(str(SESSION_PATH), API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        print("Telegram session not authorized")
        if lock_acquired:
            lock_manager.release('single', conversation_id)
        conn.close()
        sys.exit(1)

    try:
        syncer = SingleConversationSync(client, conn)
        result = await syncer.sync(conversation_id)

        print(json.dumps(result, indent=2))
        sys.exit(0 if result['success'] else 1)

    finally:
        # Release lock
        if lock_manager and lock_acquired:
            try:
                lock_manager.release('single', conversation_id)
                print(f"Lock released for conversation {conversation_id}")
            except Exception as e:
                print(f"Warning: Failed to release lock: {e}")

        await client.disconnect()
        conn.close()


if __name__ == '__main__':
    asyncio.run(main())
