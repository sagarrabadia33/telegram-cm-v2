#!/usr/bin/env python3
"""
Recovery Sync Script
====================
This script recovers missing messages that were lost due to the message ID collision bug.

The bug: The old unique constraint was (source, externalMessageId) without conversationId.
When messages from different conversations had the same message ID, they would collide.
The ON CONFLICT clause would UPDATE an existing row, effectively losing the original message.

Recovery strategy:
1. For each conversation, we delete ALL existing messages
2. Then re-fetch messages from Telegram and insert them fresh
3. The new unique constraint (source, conversationId, externalMessageId) prevents future collisions

This is a DESTRUCTIVE operation that replaces all message data with fresh data from Telegram.
Any local modifications to messages will be lost.
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

# Parse DATABASE_URL
def parse_database_url(url):
    """Parse PostgreSQL connection URL"""
    import urllib.parse
    parsed = urllib.parse.urlparse(url)
    return {
        'host': parsed.hostname,
        'port': parsed.port or 5432,
        'database': parsed.path[1:],  # Remove leading /
        'user': parsed.username,
        'password': urllib.parse.unquote(parsed.password) if parsed.password else None,
        'options': f"-c search_path=telegram_crm"
    }

def get_db_connection():
    """Get database connection"""
    db_config = parse_database_url(DATABASE_URL)
    return psycopg2.connect(**db_config)

async def get_conversation_by_external_id(conn, external_chat_id):
    """Get conversation by external chat ID"""
    cur = conn.cursor()
    cur.execute('''
        SELECT id, title, type, "externalChatId"
        FROM "Conversation"
        WHERE "externalChatId" = %s AND source = 'telegram'
    ''', (str(external_chat_id),))
    row = cur.fetchone()
    cur.close()
    if row:
        return {
            'id': row[0],
            'title': row[1],
            'type': row[2],
            'externalChatId': row[3]
        }
    return None

async def delete_conversation_messages(conn, conversation_id):
    """Delete all messages for a conversation"""
    cur = conn.cursor()
    cur.execute('''
        DELETE FROM "Message"
        WHERE "conversationId" = %s
    ''', (conversation_id,))
    deleted = cur.rowcount
    conn.commit()
    cur.close()
    return deleted

async def insert_messages_batch(conn, messages):
    """Insert messages in batch"""
    if not messages:
        return 0

    cur = conn.cursor()

    # Prepare data for batch insert
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

    # Batch insert with ON CONFLICT DO NOTHING
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

def generate_cuid():
    """Generate a CUID-like ID"""
    import random
    import string
    import time
    timestamp = hex(int(time.time() * 1000))[2:]
    random_part = ''.join(random.choices(string.ascii_lowercase + string.digits, k=12))
    return f"c{timestamp}{random_part}"

async def sync_conversation_messages(client, conn, conversation, message_limit=500, me_id=None):
    """Sync messages for a single conversation from Telegram"""
    external_chat_id = conversation['externalChatId']
    conversation_id = conversation['id']
    title = conversation['title'] or 'Private chat'

    print(f"\n  Syncing: {title} (ID: {external_chat_id})")

    try:
        # Get the chat entity
        if external_chat_id.startswith('-100'):
            # Channel/Supergroup
            channel_id = int(external_chat_id[4:])
            entity = await client.get_entity(PeerChannel(channel_id))
        elif external_chat_id.startswith('-'):
            # Regular group
            chat_id = int(external_chat_id[1:])
            entity = await client.get_entity(PeerChat(chat_id))
        else:
            # Private chat
            user_id = int(external_chat_id)
            entity = await client.get_entity(PeerUser(user_id))

        # Fetch messages
        messages = []
        async for message in client.iter_messages(entity, limit=message_limit):
            if not message.text and not message.media:
                continue

            # Determine direction
            is_outgoing = message.out if hasattr(message, 'out') else False
            direction = 'outbound' if is_outgoing else 'inbound'

            # Get sender info for metadata
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

            # Build message data
            msg_data = {
                'id': generate_cuid(),
                'conversationId': conversation_id,
                'contactId': None,  # Will be linked later if needed
                'source': 'telegram',
                'externalMessageId': str(message.id),
                'direction': direction,
                'contentType': 'text' if message.text else 'media',
                'body': message.text or '[Media]',
                'status': 'delivered',
                'sentAt': message.date,
                'containsQuestion': '?' in (message.text or ''),
                'hasAttachments': bool(message.media),
                'metadata': sender_info if sender_info else None
            }

            messages.append(msg_data)

        # Delete existing messages
        deleted = await delete_conversation_messages(conn, conversation_id)
        print(f"    Deleted {deleted} old messages")

        # Insert new messages
        if messages:
            inserted = await insert_messages_batch(conn, messages)
            print(f"    Inserted {inserted} messages from Telegram")
        else:
            print(f"    No messages found in Telegram")

        # Update conversation's lastMessageAt
        if messages:
            cur = conn.cursor()
            latest_msg = max(messages, key=lambda m: m['sentAt'])
            cur.execute('''
                UPDATE "Conversation"
                SET "lastMessageAt" = %s, "lastSyncedAt" = %s, "syncStatus" = 'success'
                WHERE id = %s
            ''', (latest_msg['sentAt'], datetime.now(timezone.utc), conversation_id))
            conn.commit()
            cur.close()

        return len(messages)

    except Exception as e:
        print(f"    ERROR: {str(e)}")
        return 0

async def main():
    """Main recovery function"""
    print("=" * 60)
    print("  MESSAGE RECOVERY SYNC")
    print("=" * 60)
    print(f"Started: {datetime.now()}")
    print()

    # Parse arguments
    import argparse
    parser = argparse.ArgumentParser(description='Recover messages from Telegram')
    parser.add_argument('--conversation', type=str, help='Specific conversation external ID to sync')
    parser.add_argument('--all', action='store_true', help='Sync all conversations')
    parser.add_argument('--limit', type=int, default=500, help='Maximum messages per conversation')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    args = parser.parse_args()

    if not args.conversation and not args.all:
        print("ERROR: Specify --conversation <id> or --all")
        print("  Example: python recovery_sync.py --conversation -1001234567890")
        print("  Example: python recovery_sync.py --all --limit 200")
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
        # Get all conversations
        cur.execute('''
            SELECT id, title, type, "externalChatId"
            FROM "Conversation"
            WHERE source = 'telegram' AND "isSyncDisabled" = false
            ORDER BY "lastMessageAt" DESC NULLS LAST
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

    print(f"\nFound {len(conversations)} conversations to sync")

    if args.dry_run:
        print("\n[DRY RUN] Would sync:")
        for conv in conversations:
            print(f"  - {conv['title'] or 'Private chat'} ({conv['externalChatId']})")
        await client.disconnect()
        conn.close()
        return

    # Confirm
    if args.all and len(conversations) > 10:
        print(f"\n⚠️  WARNING: This will re-sync {len(conversations)} conversations!")
        print("This will DELETE all existing messages and re-fetch from Telegram.")
        response = input("Type 'yes' to continue: ")
        if response.lower() != 'yes':
            print("Aborted.")
            await client.disconnect()
            conn.close()
            return

    # Sync each conversation
    total_messages = 0
    success_count = 0
    error_count = 0

    for i, conv in enumerate(conversations, 1):
        print(f"\n[{i}/{len(conversations)}]", end="")
        try:
            count = await sync_conversation_messages(
                client, conn, conv,
                message_limit=args.limit,
                me_id=me.id
            )
            total_messages += count
            success_count += 1
        except Exception as e:
            print(f"  ERROR syncing {conv['title']}: {e}")
            error_count += 1

        # Small delay to avoid rate limiting
        await asyncio.sleep(0.5)

    # Summary
    print("\n" + "=" * 60)
    print("  RECOVERY COMPLETE")
    print("=" * 60)
    print(f"Conversations synced: {success_count}")
    print(f"Conversations failed: {error_count}")
    print(f"Total messages recovered: {total_messages}")
    print(f"Finished: {datetime.now()}")

    await client.disconnect()
    conn.close()

if __name__ == '__main__':
    asyncio.run(main())
