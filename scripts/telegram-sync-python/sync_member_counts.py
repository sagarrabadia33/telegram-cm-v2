#!/usr/bin/env python3
"""
Sync member counts for all Telegram groups and supergroups.
Updates the TelegramChat.memberCount field in the database.
"""

import os
import sys
import asyncio
from datetime import datetime, timezone
from pathlib import Path

import psycopg2
from telethon import TelegramClient
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.messages import GetFullChatRequest
from telethon.errors import ChatAdminRequiredError, ChannelPrivateError, FloodWaitError
from dotenv import load_dotenv

# Load environment
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
PHONE = os.getenv('TELEGRAM_PHONE_NUMBER', '')


async def main():
    """Main function."""
    print("=" * 60)
    print("  SYNC MEMBER COUNTS")
    print("=" * 60)

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Get all groups and supergroups
    cursor.execute("""
        SELECT tc.id, tc."telegramChatId", tc.type, tc.title, tc."memberCount"
        FROM telegram_crm."TelegramChat" tc
        WHERE tc.type IN ('group', 'supergroup')
        ORDER BY tc."lastSyncedAt" DESC NULLS LAST
    """)

    chats = cursor.fetchall()
    print(f"Found {len(chats)} groups/supergroups to update\n")

    if not chats:
        print("No groups found!")
        return

    # Connect to Telegram
    session_file = Path(__file__).parent / 'telegram_session'
    client = TelegramClient(str(session_file), API_ID, API_HASH)

    await client.start(phone=PHONE)
    print("Connected to Telegram\n")

    updated = 0
    skipped = 0
    failed = 0

    for tc_id, chat_id, chat_type, title, current_count in chats:
        print(f"  {title or 'Unknown'}...", end=" ")

        try:
            chat_id_int = int(chat_id)

            # Get member count from Telegram
            if chat_type == 'supergroup' or chat_id_int < 0:
                # Supergroups and channels use GetFullChannelRequest
                try:
                    entity = await client.get_entity(chat_id_int)
                    full_chat = await client(GetFullChannelRequest(entity))
                    member_count = full_chat.full_chat.participants_count
                except Exception:
                    # Try as regular group
                    try:
                        full_chat = await client(GetFullChatRequest(abs(chat_id_int)))
                        member_count = len(full_chat.users)
                    except Exception as e:
                        print(f"Error: {e}")
                        failed += 1
                        continue
            else:
                # Regular groups
                try:
                    full_chat = await client(GetFullChatRequest(abs(chat_id_int)))
                    member_count = len(full_chat.users)
                except Exception as e:
                    print(f"Error: {e}")
                    failed += 1
                    continue

            if member_count and member_count != current_count:
                cursor.execute("""
                    UPDATE telegram_crm."TelegramChat"
                    SET "memberCount" = %s, "lastSyncedAt" = NOW()
                    WHERE id = %s
                """, (member_count, tc_id))
                conn.commit()
                print(f"{member_count} members (updated)")
                updated += 1
            else:
                print(f"{member_count or current_count or '?'} members")
                skipped += 1

            await asyncio.sleep(0.3)  # Rate limit

        except FloodWaitError as e:
            print(f"Rate limited, waiting {e.seconds}s")
            await asyncio.sleep(e.seconds)
            failed += 1

        except (ChatAdminRequiredError, ChannelPrivateError):
            print("Access denied")
            skipped += 1

        except Exception as e:
            print(f"Error: {type(e).__name__}")
            failed += 1

    # Summary
    print("\n" + "=" * 60)
    print(f"  Updated: {updated}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed: {failed}")
    print("=" * 60)

    cursor.close()
    conn.close()
    await client.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
