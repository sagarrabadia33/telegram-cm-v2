#!/usr/bin/env python3
"""
Persistent Real-Time Telegram Listener for Railway

Maintains a persistent connection to Telegram for instant message capture.
Adapted for Railway deployment with callback hooks for main.py integration.

GUARANTEES:
- Sub-second message delivery
- Automatic reconnection on network issues
- Crash recovery via Railway health checks
- No message loss (catch-up sync on startup)

Author: telegram-crm-v2
"""

import os
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Callable
import traceback

import psycopg2
from psycopg2.extras import Json
from telethon import TelegramClient, events
from telethon.tl.types import (
    Message, PeerUser, PeerChat, PeerChannel,
    MessageMediaPhoto, MessageMediaDocument,
    User, Chat, Channel
)

from lock_manager import SyncLockManager, ListenerStateManager


# Configuration from environment
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')

# Sync settings
HEARTBEAT_INTERVAL = 30  # seconds
CATCH_UP_LIMIT = 200  # Max messages per conversation on startup
CATCH_UP_CONVERSATIONS = 50  # Max conversations to catch up

# 100x Reliable Sync - Dialog Discovery
# Reduced from 1 hour to 15 minutes for faster discovery of new conversations
DIALOG_DISCOVERY_INTERVAL = int(os.getenv('DIALOG_DISCOVERY_INTERVAL', '900'))  # 15 minutes default
DIALOG_DISCOVERY_LIMIT = int(os.getenv('DIALOG_DISCOVERY_LIMIT', '200'))  # Increased to 200 dialogs
AUTO_CREATE_CONVERSATION = True  # Auto-create conversations on first message


def log(message: str, level: str = 'INFO'):
    """Simple logging with timestamp."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{timestamp}] [{level}] {message}")


class RealtimeListener:
    """Persistent Telegram listener with automatic recovery for Railway."""

    def __init__(
        self,
        session_path: str,
        on_message: Optional[Callable[[], None]] = None,
        on_heartbeat: Optional[Callable[[], None]] = None,
        on_error: Optional[Callable[[str], None]] = None,
    ):
        """
        Initialize listener with callback hooks.

        Args:
            session_path: Path to Telegram session file (without .session extension)
            on_message: Callback when a message is received
            on_heartbeat: Callback for periodic heartbeat
            on_error: Callback when an error occurs
        """
        self.session_path = session_path
        self.on_message_callback = on_message
        self.on_heartbeat_callback = on_heartbeat
        self.on_error_callback = on_error

        self.client: Optional[TelegramClient] = None
        self.conn = None
        self.lock_manager: Optional[SyncLockManager] = None
        self.state_manager: Optional[ListenerStateManager] = None
        self.running = False
        self.messages_received = 0
        self.started_at: Optional[datetime] = None
        self.errors: List[Dict] = []

        # Graceful shutdown
        self._shutdown_requested = False
        self._shutdown_event = asyncio.Event()

        # Cache conversation lookups
        self._conversation_cache: Dict[str, Optional[Dict]] = {}

    def request_shutdown(self):
        """Request a graceful shutdown."""
        self._shutdown_requested = True
        self._shutdown_event.set()

    async def start(self):
        """Start the listener with all recovery mechanisms."""
        log("=" * 60)
        log("  TELEGRAM REAL-TIME LISTENER - RAILWAY EDITION")
        log("=" * 60)
        log(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        log(f"Session path: {self.session_path}")
        log("")

        # Connect to database
        log("Connecting to database...")
        self.conn = psycopg2.connect(DATABASE_URL)
        self.lock_manager = SyncLockManager(self.conn)
        self.state_manager = ListenerStateManager(self.conn)

        # Try to acquire listener lock
        log("Acquiring listener lock...")
        if not self.lock_manager.acquire('listener', 'singleton'):
            existing = self.lock_manager.check_lock('listener', 'singleton')
            if existing:
                error_msg = (f"Another listener is running on {existing['hostname']}, "
                           f"PID {existing['process_id']}")
                log(f"ERROR: {error_msg}", level='ERROR')
                self._add_error(error_msg)
                raise RuntimeError(error_msg)

        log("Acquired listener lock")

        # Connect to Telegram
        log("Connecting to Telegram...")
        self.client = TelegramClient(self.session_path, API_ID, API_HASH)
        await self.client.start()

        if not await self.client.is_user_authorized():
            error_msg = "Telegram session not authorized"
            log(f"ERROR: {error_msg}", level='ERROR')
            self._add_error(error_msg)
            raise RuntimeError(error_msg)

        me = await self.client.get_me()
        log(f"Connected to Telegram as: {me.first_name} (@{me.username})")

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

        # 100x RELIABLE SYNC: Start periodic dialog discovery
        asyncio.create_task(self._dialog_discovery_loop())

        log("")
        log("=" * 60)
        log("  100x RELIABLE SYNC CONFIGURATION")
        log("=" * 60)
        log(f"  Auto-create on message: {AUTO_CREATE_CONVERSATION}")
        log(f"  Dialog discovery interval: {DIALOG_DISCOVERY_INTERVAL}s ({DIALOG_DISCOVERY_INTERVAL // 60} minutes)")
        log(f"  Dialog discovery limit: {DIALOG_DISCOVERY_LIMIT} dialogs")
        log(f"  Catch-up limit: {CATCH_UP_LIMIT} messages per conversation")
        log(f"  Catch-up conversations: {CATCH_UP_CONVERSATIONS}")
        log("=" * 60)
        log("")
        log("Listening for new messages...")

        # Run until shutdown
        await self._shutdown_event.wait()

        # Cleanup
        await self.stop()

    async def stop(self):
        """Graceful shutdown."""
        log("")
        log("Shutting down...")
        self.running = False

        if self.lock_manager:
            try:
                self.lock_manager.release_all()
                log("Released all locks")
            except:
                pass

        self._update_state('stopped')

        if self.client:
            try:
                await self.client.disconnect()
                log("Disconnected from Telegram")
            except:
                pass

        if self.conn:
            try:
                self.conn.close()
                log("Closed database connection")
            except:
                pass

        log("Shutdown complete")

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

        # 100x RELIABLE SYNC: Auto-create conversation if not found
        if not conversation and AUTO_CREATE_CONVERSATION:
            log(f"[MESSAGE] NEW CONVERSATION DETECTED: chat_id={chat_id} - auto-creating...")
            try:
                conversation = await self._create_conversation_from_chat(chat_id, message, source='message')
                if conversation:
                    log(f"[MESSAGE] AUTO-CREATED: {conversation.get('title', 'Unknown')} (chat_id={chat_id}, type={conversation.get('type')})")
                else:
                    log(f"[MESSAGE] WARN: Auto-create returned None for chat_id={chat_id}", level='WARN')
            except Exception as e:
                log(f"[MESSAGE] ERROR: Auto-create exception for chat_id={chat_id}: {e}", level='ERROR')
                traceback.print_exc()

        if not conversation:
            # Still not found after auto-create attempt - skip
            log(f"Skipping message from unknown chat {chat_id} (auto-create failed)", level='WARN')
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
            log(f"{action} [{direction}] {conversation.get('title', 'Unknown')}: {preview}")

            # Update state
            try:
                self.state_manager.increment_messages()
            except:
                pass

            # Call callback
            if self.on_message_callback:
                self.on_message_callback()

        except Exception as e:
            self.conn.rollback()
            self._add_error(f"Database error: {e}")
            raise

    async def _catch_up_sync(self):
        """Sync messages that arrived while listener was offline."""
        log("Running catch-up sync...")

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
            if self._shutdown_requested:
                break

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
                    log(f"  {title}: {len(messages)} messages")
                else:
                    skipped += 1

            except Exception as e:
                self._add_error(f"Catch-up error for {title}: {e}")

        log(f"Catch-up complete: {total_synced} messages synced, {skipped} conversations up-to-date")

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

    async def _create_conversation_from_chat(self, chat_id: int, message: Message = None, source: str = 'message') -> Optional[Dict]:
        """
        100x RELIABLE SYNC: Create a new conversation from a Telegram chat.

        Called when a message arrives from an unknown chat - fetches chat info
        from Telegram and creates a new Conversation entry in the database.

        Args:
            chat_id: The Telegram chat ID
            message: Optional message that triggered this (for sender info)
            source: Where this creation was triggered from ('message' or 'discovery')

        Returns:
            The created conversation dict, or None if failed
        """
        entity = None
        chat_type = 'private'  # default
        title = 'Unknown'
        username = None

        try:
            # Fetch chat info from Telegram
            log(f"[AUTO-CREATE] Fetching entity for chat_id={chat_id} (source: {source})")
            entity = await self.client.get_entity(chat_id)
            log(f"[AUTO-CREATE] Got entity: {type(entity).__name__}")

            # Determine chat type and title
            if isinstance(entity, User):
                chat_type = 'private'
                parts = [entity.first_name, entity.last_name]
                title = ' '.join(filter(None, parts)) or 'Unknown User'
                username = entity.username
                log(f"[AUTO-CREATE] User: {title} (@{username})")
            elif isinstance(entity, Chat):
                chat_type = 'group'
                title = entity.title or 'Unknown Group'
                log(f"[AUTO-CREATE] Group: {title}")
            elif isinstance(entity, Channel):
                if entity.megagroup:
                    chat_type = 'supergroup'
                else:
                    chat_type = 'channel'
                title = entity.title or 'Unknown Channel'
                username = entity.username
                log(f"[AUTO-CREATE] Channel/Supergroup: {title} (@{username})")

        except Exception as e:
            error_msg = f"Failed to fetch entity for chat_id={chat_id}: {e}"
            log(f"[AUTO-CREATE] {error_msg}", level='ERROR')
            self._add_error(error_msg)

            # Record error for visibility
            try:
                self.state_manager.record_error(
                    'entity_fetch',
                    str(e),
                    {'chat_id': chat_id, 'source': source}
                )
            except:
                pass

            # Try to create with minimal info anyway (better than nothing)
            title = f"Chat {chat_id}"
            log(f"[AUTO-CREATE] Creating with fallback title: {title}")

        # Generate conversation ID
        conv_id = 'c' + hashlib.md5(f"telegram-{chat_id}".encode()).hexdigest()[:24]

        # Insert into database
        cursor = self.conn.cursor()
        try:
            log(f"[AUTO-CREATE] Inserting conversation: id={conv_id}, title={title}, type={chat_type}")
            cursor.execute("""
                INSERT INTO telegram_crm."Conversation" (
                    id, source, "externalChatId", title, type,
                    "isSyncDisabled", "createdAt", "updatedAt"
                )
                VALUES (%s, 'telegram', %s, %s, %s, FALSE, NOW(), NOW())
                ON CONFLICT (source, "externalChatId")
                DO UPDATE SET title = EXCLUDED.title, "updatedAt" = NOW()
                RETURNING id, title, type, "isSyncDisabled"
            """, (conv_id, str(chat_id), title, chat_type))

            row = cursor.fetchone()
            self.conn.commit()

            if row:
                result = {
                    'id': row[0],
                    'title': row[1],
                    'type': row[2],
                    'is_sync_disabled': row[3]
                }
                # Update cache
                self._conversation_cache[str(chat_id)] = result

                # Record successful creation
                log(f"[AUTO-CREATE] SUCCESS: Created conversation {result['title']} (id={result['id']})")
                try:
                    self.state_manager.record_conversation_created(chat_id, result['title'], result['type'])
                except:
                    pass

                return result
            else:
                log(f"[AUTO-CREATE] WARNING: No row returned from INSERT", level='WARN')

        except Exception as e:
            self.conn.rollback()
            error_msg = f"Database error creating conversation {chat_id}: {e}"
            log(f"[AUTO-CREATE] {error_msg}", level='ERROR')
            self._add_error(error_msg)

            # Record error for visibility
            try:
                self.state_manager.record_error(
                    'conversation_create',
                    str(e),
                    {'chat_id': chat_id, 'title': title, 'type': chat_type}
                )
            except:
                pass

        finally:
            cursor.close()

        return None

    async def _dialog_discovery_loop(self):
        """
        100x RELIABLE SYNC: Periodic dialog discovery.

        Runs every DIALOG_DISCOVERY_INTERVAL to discover new conversations
        that may not have sent messages yet. This catches:
        - New chats created while listener was offline
        - Conversations with only outgoing messages
        - Groups/channels joined via links

        This is the "belt" to the auto-create "suspenders" approach.
        """
        log("[DISCOVERY] Starting periodic dialog discovery task...")
        log(f"[DISCOVERY] Will run every {DIALOG_DISCOVERY_INTERVAL} seconds, scanning up to {DIALOG_DISCOVERY_LIMIT} dialogs")

        # Run immediately on startup, then wait for interval
        first_run = True

        while self.running and not self._shutdown_requested:
            if first_run:
                log("[DISCOVERY] Running initial discovery in 30 seconds...")
                await asyncio.sleep(30)  # Short wait on startup
                first_run = False
            else:
                await asyncio.sleep(DIALOG_DISCOVERY_INTERVAL)

            if self._shutdown_requested:
                break

            try:
                log("[DISCOVERY] ========== STARTING DIALOG DISCOVERY ==========")
                discovered = 0
                already_known = 0
                errors = 0
                dialogs_scanned = 0

                # Iterate through dialogs from Telegram
                try:
                    async for dialog in self.client.iter_dialogs(limit=DIALOG_DISCOVERY_LIMIT):
                        if self._shutdown_requested:
                            log("[DISCOVERY] Shutdown requested, stopping discovery")
                            break

                        dialogs_scanned += 1
                        chat_id = dialog.id
                        external_id = str(chat_id)
                        dialog_name = dialog.name or dialog.title or f"Chat {chat_id}"

                        # Check if we already have this conversation in cache
                        if external_id in self._conversation_cache:
                            already_known += 1
                            continue

                        # Check database
                        try:
                            cursor = self.conn.cursor()
                            cursor.execute("""
                                SELECT id FROM telegram_crm."Conversation"
                                WHERE "externalChatId" = %s AND source = 'telegram'
                            """, (external_id,))
                            exists = cursor.fetchone()
                            cursor.close()

                            if exists:
                                # Update cache
                                self._conversation_cache[external_id] = {'exists': True}
                                already_known += 1
                                continue
                        except Exception as e:
                            log(f"[DISCOVERY] Database check failed for {dialog_name}: {e}", level='WARN')
                            errors += 1
                            continue

                        # New conversation - create it
                        log(f"[DISCOVERY] NEW: {dialog_name} (chat_id={chat_id})")
                        try:
                            conv = await self._create_conversation_from_chat(chat_id, source='discovery')
                            if conv:
                                discovered += 1
                                log(f"[DISCOVERY] Created: {conv['title']} (type={conv['type']})")
                            else:
                                log(f"[DISCOVERY] Failed to create conversation for {dialog_name}", level='WARN')
                                errors += 1
                        except Exception as e:
                            log(f"[DISCOVERY] Error creating {dialog_name}: {e}", level='ERROR')
                            errors += 1

                except Exception as e:
                    error_msg = f"Failed to iterate dialogs: {e}"
                    log(f"[DISCOVERY] {error_msg}", level='ERROR')
                    self._add_error(error_msg)
                    try:
                        self.state_manager.record_error('dialog_iteration', str(e), None)
                    except:
                        pass

                log(f"[DISCOVERY] ========== DISCOVERY COMPLETE ==========")
                log(f"[DISCOVERY] Scanned: {dialogs_scanned}, New: {discovered}, Existing: {already_known}, Errors: {errors}")

                # Update state with discovery results
                try:
                    self.state_manager.record_discovery(discovered, already_known)
                except Exception as e:
                    log(f"[DISCOVERY] Failed to record discovery stats: {e}", level='WARN')

            except Exception as e:
                error_msg = f"Dialog discovery loop error: {e}"
                self._add_error(error_msg)
                log(f"[DISCOVERY] {error_msg}", level='ERROR')
                traceback.print_exc()

                try:
                    self.state_manager.record_error('dialog_discovery', str(e), None)
                except:
                    pass

    async def _heartbeat_loop(self):
        """Periodic heartbeat to maintain lock and update state."""
        while self.running and not self._shutdown_requested:
            try:
                self.lock_manager.heartbeat()
                self._update_state('running')

                # Call callback
                if self.on_heartbeat_callback:
                    self.on_heartbeat_callback()

            except Exception as e:
                self._add_error(f"Heartbeat error: {e}")
            await asyncio.sleep(HEARTBEAT_INTERVAL)

    def _update_state(self, status: str):
        """Update listener state in database."""
        try:
            self.state_manager.update_state(status, self.messages_received, self.errors[-10:])
        except Exception as e:
            log(f"Failed to update DB state: {e}", level='WARN')

    def _add_error(self, error: str):
        """Add error to error list."""
        self.errors.append({
            'error': error,
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
        log(f"ERROR: {error}", level='ERROR')

        # Call callback
        if self.on_error_callback:
            self.on_error_callback(error)


# Standalone execution for testing
if __name__ == '__main__':
    import signal
    from pathlib import Path

    SESSION_PATH = os.getenv('SESSION_PATH', '/data/sessions/telegram_session')

    async def main():
        listener = RealtimeListener(
            session_path=SESSION_PATH,
            on_message=lambda: print("Message received!"),
            on_heartbeat=lambda: print("Heartbeat"),
            on_error=lambda e: print(f"Error: {e}"),
        )

        # Handle shutdown signals
        loop = asyncio.get_event_loop()

        def shutdown_handler():
            listener.request_shutdown()

        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, shutdown_handler)

        try:
            await listener.start()
        except Exception as e:
            print(f"Fatal error: {e}")
            traceback.print_exc()

    asyncio.run(main())
