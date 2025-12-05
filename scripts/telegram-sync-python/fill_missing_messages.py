#!/usr/bin/env python3
"""
Fill Missing Messages Script
============================
This script fills in missing messages for affected conversations WITHOUT deleting existing data.

It fetches messages from Telegram and inserts only those that don't already exist in the database.
Uses ON CONFLICT DO NOTHING to preserve all existing messages.

This is a SAFE, NON-DESTRUCTIVE operation.
"""

import os
import sys
import asyncio
import json
from datetime import datetime, timezone
from telethon import TelegramClient
from telethon.tl.types import PeerChannel, PeerChat, PeerUser, User, Chat, Channel
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# Load environment
script_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(os.path.dirname(script_dir))
env_path = os.path.join(project_root, 'frontend', '.env.local')
load_dotenv(env_path)

# Telegram config
API_ID = os.getenv('TELEGRAM_API_ID')
API_HASH = os.getenv('TELEGRAM_API_HASH')
SESSION_PATH = os.path.join(script_dir, 'telegram_session')

# Database config
DATABASE_URL = os.getenv('DATABASE_URL')

def parse_database_url(url):
    """Parse PostgreSQL connection URL"""
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'database': parsed.path[1:],
        'user': parsed.username,
        'password': urllib.parse.unquote(parsed.password) if parsed.password else None,
        'options': f"-c search_path=telegram_crm"
    }

def get_db_connection():
    """Get database connection"""
    db_config = parse_database_url(DATABASE_URL)
    return psycopg2.connect(**db_config)

def generate_cuid():
    """Generate a CUID-like ID"""
    import random
    import string
    import time
    timestamp = hex(int(time.time() * 1000))[2:]
    random_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"c{timestamp}{random_part}"

async def get_existing_message_ids(conn, conversation_id):
    """Get set of existing message IDs for a conversation"""
    cur = conn.cursor()
    cur.execute('''
        SELECT "externalMessageId"
        FROM "Message"
        WHERE "conversationId" = %s AND source = 'telegram'
    ''', (conversation_id,))
    ids = set(row[0] for row in cur.fetchall())
    cur.close()
    return ids

async def insert_messages_batch(conn, messages):
    """Insert messages in batch, skipping existing ones"""
    if not messages:
        return 0

    cur = conn.cursor()

    values = []
    for msg in messages:
        values.append((
            msg['id'],
            msg['conversationId'],
            msg.get('contactId'),
            msg['source'],
            msg['externalMessageId'],
            msg['direction'],
            msg['contentType'],
            msg.get('subject'),
            msg.get('body'),
            msg.get('status'),
            msg['sentAt'],
            msg.get('deliveredAt'),
            msg.get('readAt'),
            msg.get('containsQuestion', False),
            msg.get('sentiment'),
            msg.get('keywords', []),
            msg.get('hasAttachments', False),
            json.dumps(msg.get('attachments')) if msg.get('attachments') else None,
            json.dumps(msg.get('metadata')) if msg.get('metadata') else None,
            datetime.now(timezone.utc)
        ))

    # Batch insert with ON CONFLICT DO NOTHING - preserves existing data
    execute_values(cur, '''
        INSERT INTO "Message" (
            id, "conversationId", "contactId", source, "externalMessageId",
            direction, "contentType", subject, body, status,
            "sentAt", "deliveredAt", "readAt", "containsQuestion", sentiment,
            keywords, "hasAttachments", attachments, metadata, "createdAt"
        ) VALUES %s
        ON CONFLICT (source, "conversationId", "externalMessageId") DO NOTHING
    ''', values)

    inserted = cur.rowcount
    conn.commit()
    cur.close()
    return inserted

async def fill_conversation_messages(client, conn, conversation, message_limit=1000, me_id=None):
    """Fill missing messages for a single conversation"""
    external_chat_id = conversation['externalChatId']
    conversation_id = conversation['id']
    title = conversation['title'] or 'Private chat'

    print(f"\n  Filling: {title} (ID: {external_chat_id})")

    try:
        # Get existing message IDs
        existing_ids = await get_existing_message_ids(conn, conversation_id)
        print(f"    Existing messages in DB: {len(existing_ids)}")

        # Get the chat entity
        if external_chat_id.startswith('-100'):
            channel_id = int(external_chat_id[4:])
            entity = await client.get_entity(PeerChannel(channel_id))
        elif external_chat_id.startswith('-'):
            chat_id = int(external_chat_id[1:])
            entity = await client.get_entity(PeerChat(chat_id))
        else:
            user_id = int(external_chat_id)
            entity = await client.get_entity(PeerUser(user_id))

        # Fetch messages from Telegram
        new_messages = []
        skipped = 0
        async for message in client.iter_messages(entity, limit=message_limit):
            msg_id = str(message.id)

            # Skip if already exists
            if msg_id in existing_ids:
                skipped += 1
                continue

            if not message.text and not message.media:
                continue

            # Determine direction
            is_outgoing = message.out if hasattr(message, 'out') else False
            direction = 'outbound' if is_outgoing else 'inbound'

            # Get sender info
            sender_info = {}
            if message.sender:
                sender = message.sender
                if isinstance(sender, User):
                    sender_info = {
                        'senderId': str(sender.id),
                        'senderUsername': sender.username,
                        'senderFirstName': sender.first_name,
                        'senderLastName': sender.last_name
                    }
                elif isinstance(sender, (Chat, Channel)):
                    sender_info = {
                        'senderId': str(sender.id),
                        'senderTitle': sender.title
                    }

            msg_data = {
                'id': generate_cuid(),
                'conversationId': conversation_id,
                'contactId': None,
                'source': 'telegram',
                'externalMessageId': msg_id,
                'direction': direction,
                'contentType': 'text' if message.text else 'media',
                'body': message.text or '[Media]',
                'status': 'delivered',
                'sentAt': message.date,
                'containsQuestion': '?' in (message.text or ''),
                'hasAttachments': bool(message.media),
                'metadata': sender_info if sender_info else None
            }

            new_messages.append(msg_data)

        print(f"    Messages from Telegram: {len(new_messages) + skipped} (skipped {skipped} existing)")

        # Insert only new messages
        if new_messages:
            inserted = await insert_messages_batch(conn, new_messages)
            print(f"    ✓ Inserted {inserted} NEW messages")
        else:
            print(f"    No new messages to insert")
            inserted = 0

        # Update conversation's lastMessageAt if we have new messages
        if new_messages:
            cur = conn.cursor()
            cur.execute('''
                UPDATE "Conversation"
                SET "lastSyncedAt" = %s, "syncStatus" = 'success'
                WHERE id = %s
            ''', (datetime.now(timezone.utc), conversation_id))
            conn.commit()
            cur.close()

        return inserted

    except Exception as e:
        print(f"    ERROR: {str(e)}")
        return 0

async def main():
    """Main function"""
    print("=" * 60)
    print("  FILL MISSING MESSAGES (NON-DESTRUCTIVE)")
    print("=" * 60)
    print(f"Started: {datetime.now()}")
    print()

    import argparse
    parser = argparse.ArgumentParser(description='Fill missing messages from Telegram (safe, non-destructive)')
    parser.add_argument('--conversation', type=str, help='Specific conversation external ID to sync')
    parser.add_argument('--affected', action='store_true', help='Sync only conversations with detected gaps')
    parser.add_argument('--limit', type=int, default=1000, help='Maximum messages to fetch per conversation')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    args = parser.parse_args()

    if not args.conversation and not args.affected:
        print("ERROR: Specify --conversation <id> or --affected")
        print("  Example: python fill_missing_messages.py --conversation -1001234567890")
        print("  Example: python fill_missing_messages.py --affected --limit 500")
        sys.exit(1)

    # Connect to database
    conn = get_db_connection()
    print("✓ Connected to database")

    # Connect to Telegram
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    print(f"✓ Connected to Telegram as: {me.first_name} (@{me.username})")

    # Get conversations to sync
    cur = conn.cursor()

    if args.conversation:
        cur.execute('''
            SELECT id, title, type, "externalChatId"
            FROM "Conversation"
            WHERE "externalChatId" = %s AND source = 'telegram'
        ''', (args.conversation,))
    else:
        # Get conversations with detected message gaps
        # These are conversations where sequential message IDs have gaps > 10
        cur.execute('''
            WITH msg_sequences AS (
                SELECT
                    "conversationId",
                    CAST("externalMessageId" AS INTEGER) as msg_id,
                    LAG(CAST("externalMessageId" AS INTEGER)) OVER (
                        PARTITION BY "conversationId"
                        ORDER BY CAST("externalMessageId" AS INTEGER)
                    ) as prev_msg_id
                FROM "Message"
                WHERE source = 'telegram'
                    AND "externalMessageId" ~ '^[0-9]+$'
            ),
            gap_conversations AS (
                SELECT DISTINCT "conversationId"
                FROM msg_sequences
                WHERE msg_id - prev_msg_id > 10
                GROUP BY "conversationId"
                HAVING COUNT(*) > 5
            )
            SELECT c.id, c.title, c.type, c."externalChatId"
            FROM "Conversation" c
            INNER JOIN gap_conversations g ON c.id = g."conversationId"
            WHERE c.source = 'telegram' AND c."isSyncDisabled" = false
            ORDER BY c."lastMessageAt" DESC NULLS LAST
        ''')

    conversations = []
    for row in cur.fetchall():
        conversations.append({
            'id': row[0],
            'title': row[1],
            'type': row[2],
            'externalChatId': row[3]
        })
    cur.close()

    print(f"\nFound {len(conversations)} conversations to fill")

    if args.dry_run:
        print("\n[DRY RUN] Would fill missing messages for:")
        for conv in conversations:
            print(f"  - {conv['title'] or 'Private chat'} ({conv['externalChatId']})")
        await client.disconnect()
        conn.close()
        return

    # Fill each conversation
    total_inserted = 0
    success_count = 0
    error_count = 0

    for i, conv in enumerate(conversations, 1):
        print(f"\n[{i}/{len(conversations)}]", end="")
        try:
            count = await fill_conversation_messages(
                client, conn, conv,
                message_limit=args.limit,
                me_id=me.id
            )
            total_inserted += count
            success_count += 1
        except Exception as e:
            print(f"  ERROR filling {conv['title']}: {e}")
            error_count += 1

        # Rate limiting delay
        await asyncio.sleep(0.5)

    # Summary
    print("\n" + "=" * 60)
    print("  FILL COMPLETE")
    print("=" * 60)
    print(f"Conversations processed: {success_count}")
    print(f"Conversations failed: {error_count}")
    print(f"Total NEW messages inserted: {total_inserted}")
    print(f"Finished: {datetime.now()}")

    await client.disconnect()
    conn.close()

if __name__ == '__main__':
    asyncio.run(main())
