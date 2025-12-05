#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════════════
                    BACKFILL SENDER METADATA FOR GROUP MESSAGES
═══════════════════════════════════════════════════════════════════════════════

This script backfills sender information in message metadata for group messages
that are missing contactId. This ensures 100% reliable sender display in the UI.

Usage:
    python3 backfill_sender_metadata.py                    # Process all group messages
    python3 backfill_sender_metadata.py --conversation-id <id>  # Process single conversation
    python3 backfill_sender_metadata.py --dry-run          # Preview without changes

Author: telegram-crm-v2
"""

import os
import sys
import json
import asyncio
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import psycopg2
from psycopg2.extras import Json
from telethon import TelegramClient
from telethon.tl.types import PeerUser, User
from dotenv import load_dotenv

# Load environment
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Database
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

# Telegram credentials
API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
SESSION_PATH = Path(__file__).parent / 'telegram_session'

# Cache for user lookups
user_cache: Dict[str, Optional[Dict[str, Any]]] = {}


async def get_user_info(client: TelegramClient, telegram_id: str) -> Optional[Dict[str, Any]]:
    """Get user info from Telegram, with caching."""
    if telegram_id in user_cache:
        return user_cache[telegram_id]

    try:
        user = await client.get_entity(int(telegram_id))
        if isinstance(user, User):
            name = None
            if user.first_name:
                parts = [user.first_name, user.last_name]
                name = ' '.join(filter(None, parts)) or None

            result = {
                'telegram_id': telegram_id,
                'name': name or user.username,
                'username': user.username,
            }
            user_cache[telegram_id] = result
            return result
    except Exception as e:
        print(f"  Could not get user {telegram_id}: {e}")

    user_cache[telegram_id] = None
    return None


async def backfill_conversation(client: TelegramClient, conn, conversation_id: str, title: str, external_chat_id: str, dry_run: bool = False) -> int:
    """Backfill sender metadata for a single conversation."""
    cursor = conn.cursor()

    # Get messages with NULL contactId in this group conversation
    cursor.execute("""
        SELECT m.id, m."externalMessageId", m.metadata
        FROM telegram_crm."Message" m
        WHERE m."conversationId" = %s
          AND m."contactId" IS NULL
          AND m.direction = 'inbound'
    """, (conversation_id,))

    messages = cursor.fetchall()
    if not messages:
        print(f"  No messages to backfill")
        return 0

    print(f"  Found {len(messages)} messages to backfill")

    # Fetch actual messages from Telegram to get sender info
    try:
        chat_id = int(external_chat_id)
        telegram_messages = {}

        # Create a map of external message IDs to Telegram messages
        async for msg in client.iter_messages(chat_id, limit=1000):
            if msg.id:
                telegram_messages[str(msg.id)] = msg

        updated_count = 0
        for msg_id, external_msg_id, existing_metadata in messages:
            if external_msg_id not in telegram_messages:
                continue

            tg_msg = telegram_messages[external_msg_id]

            # Get sender ID
            sender_telegram_id = None
            if isinstance(tg_msg.from_id, PeerUser):
                sender_telegram_id = str(tg_msg.from_id.user_id)

            if not sender_telegram_id:
                continue

            # Get user info
            user_info = await get_user_info(client, sender_telegram_id)
            if not user_info or not (user_info.get('name') or user_info.get('username')):
                continue

            # Prepare updated metadata
            metadata = existing_metadata or {}
            if isinstance(metadata, str):
                metadata = json.loads(metadata)

            metadata['sender'] = user_info

            if dry_run:
                print(f"    [DRY RUN] Would update {msg_id}: {user_info.get('name', user_info.get('username'))}")
            else:
                cursor.execute("""
                    UPDATE telegram_crm."Message"
                    SET metadata = %s
                    WHERE id = %s
                """, (Json(metadata), msg_id))

            updated_count += 1

        if not dry_run:
            conn.commit()

        return updated_count

    except Exception as e:
        print(f"  Error: {e}")
        conn.rollback()
        return 0


async def main():
    parser = argparse.ArgumentParser(description='Backfill sender metadata for group messages')
    parser.add_argument('--conversation-id', type=str, help='Process only this conversation')
    parser.add_argument('--dry-run', action='store_true', help='Preview without changes')
    args = parser.parse_args()

    print("=" * 60)
    print("  BACKFILL SENDER METADATA")
    print("=" * 60)
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    print()

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Connect to Telegram
    client = TelegramClient(str(SESSION_PATH), API_ID, API_HASH)
    await client.connect()

    if not await client.is_user_authorized():
        print("Error: Telegram session not authorized")
        sys.exit(1)

    try:
        # Get group conversations to process
        if args.conversation_id:
            cursor.execute("""
                SELECT id, title, "externalChatId"
                FROM telegram_crm."Conversation"
                WHERE id = %s
            """, (args.conversation_id,))
        else:
            cursor.execute("""
                SELECT id, title, "externalChatId"
                FROM telegram_crm."Conversation"
                WHERE type IN ('group', 'supergroup')
                  AND source = 'telegram'
                  AND "isSyncDisabled" = FALSE
                ORDER BY "lastMessageAt" DESC NULLS LAST
            """)

        conversations = cursor.fetchall()
        print(f"Found {len(conversations)} conversations to process")
        print()

        total_updated = 0
        for conv_id, title, external_chat_id in conversations:
            print(f"Processing: {title}")
            updated = await backfill_conversation(
                client, conn, conv_id, title, external_chat_id,
                dry_run=args.dry_run
            )
            total_updated += updated
            print(f"  Updated: {updated}")
            print()

        print("=" * 60)
        print(f"Total messages updated: {total_updated}")
        print("=" * 60)

    finally:
        cursor.close()
        conn.close()
        await client.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
