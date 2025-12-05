#!/usr/bin/env python3
"""
Download media for messages that have hasAttachments=true but attachments=null.
This fixes messages that were synced without --with-media flag.
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
    Message, MessageMediaPhoto, MessageMediaDocument,
    Document, DocumentAttributeVideo, DocumentAttributeAudio
)
from dotenv import load_dotenv

# Load environment
ENV_PATH = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(ENV_PATH)

# Configuration
MEDIA_DIR = Path(__file__).parent.parent.parent / 'public' / 'media' / 'telegram'
DATABASE_URL = os.getenv('DATABASE_URL', '')
if '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

API_ID = int(os.getenv('TELEGRAM_API_ID', '0'))
API_HASH = os.getenv('TELEGRAM_API_HASH', '')
PHONE = os.getenv('TELEGRAM_PHONE_NUMBER', '')

# Media settings
MAX_FILE_SIZE = 10 * 1024 * 1024    # 10MB max
DOWNLOAD_PHOTOS = True
DOWNLOAD_VIDEOS = False
MEDIA_DOWNLOAD_TIMEOUT = 30


def get_media_type(media) -> str:
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


def generate_file_name(message_id: int, media) -> str:
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

    # Generate unique name using message ID hash
    hash_str = hashlib.md5(f"{message_id}".encode()).hexdigest()[:8]
    return f"{hash_str}_{message_id}{ext}"


async def download_media(client: TelegramClient, message: Message) -> Optional[Dict[str, Any]]:
    """Download media from message."""
    if not message.media:
        return None

    try:
        media = message.media

        # Check file size
        if isinstance(media, MessageMediaDocument) and isinstance(media.document, Document):
            file_size = media.document.size

            # Skip videos
            if not DOWNLOAD_VIDEOS:
                is_video = any(isinstance(attr, DocumentAttributeVideo) for attr in media.document.attributes)
                if is_video:
                    print(f"    Skipping video (too large)")
                    return None

            if file_size > MAX_FILE_SIZE:
                print(f"    Skipping file > {MAX_FILE_SIZE // 1024 // 1024}MB")
                return None

        # Skip photos if disabled
        if isinstance(media, MessageMediaPhoto) and not DOWNLOAD_PHOTOS:
            return None

        media_type = get_media_type(media)
        file_name = generate_file_name(message.id, media)

        # Ensure directory exists
        media_dir = MEDIA_DIR / media_type
        media_dir.mkdir(parents=True, exist_ok=True)

        file_path = media_dir / file_name

        # Skip if already exists
        if file_path.exists():
            print(f"    File exists: {file_name}")
            relative_path = f'/media/telegram/{media_type}/{file_name}'
            return {
                'files': [{
                    'path': relative_path,
                    'type': media_type,
                    'size': file_path.stat().st_size
                }]
            }

        # Download
        try:
            await asyncio.wait_for(
                client.download_media(message, file=str(file_path)),
                timeout=MEDIA_DOWNLOAD_TIMEOUT
            )
        except asyncio.TimeoutError:
            print(f"    Download timeout: {file_name}")
            return None

        if file_path.exists():
            print(f"    Downloaded: {file_name}")
            relative_path = f'/media/telegram/{media_type}/{file_name}'
            return {
                'files': [{
                    'path': relative_path,
                    'type': media_type,
                    'size': file_path.stat().st_size
                }]
            }

        return None

    except Exception as e:
        print(f"    Error: {e}")
        return None


async def main():
    """Main function."""
    print("=" * 60)
    print("  DOWNLOAD MISSING MEDIA")
    print("=" * 60)

    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    cursor = conn.cursor()

    # Find messages with missing media
    cursor.execute("""
        SELECT m.id, m."externalMessageId", c."externalChatId", c.title
        FROM telegram_crm."Message" m
        JOIN telegram_crm."Conversation" c ON m."conversationId" = c.id
        WHERE m."hasAttachments" = true
          AND m.attachments IS NULL
          AND m."contentType" = 'media'
        ORDER BY m."sentAt" DESC
        LIMIT 500
    """)

    missing = cursor.fetchall()
    print(f"Found {len(missing)} messages with missing media\n")

    if not missing:
        print("No missing media to download!")
        return

    # Connect to Telegram
    session_file = Path(__file__).parent / 'telegram_session'
    client = TelegramClient(str(session_file), API_ID, API_HASH)

    await client.start(phone=PHONE)
    print("Connected to Telegram\n")

    downloaded = 0
    failed = 0
    skipped = 0

    # Group messages by conversation for efficient fetching
    by_chat = {}
    for msg_id, ext_msg_id, chat_id, title in missing:
        if chat_id not in by_chat:
            by_chat[chat_id] = {'title': title, 'messages': []}
        by_chat[chat_id]['messages'].append((msg_id, int(ext_msg_id)))

    for chat_id, data in by_chat.items():
        title = data['title']
        messages = data['messages']
        print(f"\n{title} ({len(messages)} missing)")

        try:
            for db_msg_id, telegram_msg_id in messages:
                print(f"  Message {telegram_msg_id}...")

                # Get message from Telegram
                try:
                    message = await client.get_messages(int(chat_id), ids=telegram_msg_id)
                    if not message or not message.media:
                        print(f"    No media found on Telegram")
                        skipped += 1
                        continue

                    # Download media
                    attachments = await download_media(client, message)

                    if attachments:
                        # Update database
                        cursor.execute("""
                            UPDATE telegram_crm."Message"
                            SET attachments = %s
                            WHERE id = %s
                        """, (Json(attachments), db_msg_id))
                        conn.commit()
                        downloaded += 1
                    else:
                        skipped += 1

                except Exception as e:
                    print(f"    Error fetching: {e}")
                    failed += 1

                await asyncio.sleep(0.5)  # Rate limit

        except Exception as e:
            print(f"  Chat error: {e}")
            failed += len(messages)

    # Summary
    print("\n" + "=" * 60)
    print(f"  Downloaded: {downloaded}")
    print(f"  Skipped: {skipped}")
    print(f"  Failed: {failed}")
    print("=" * 60)

    cursor.close()
    conn.close()
    await client.disconnect()


if __name__ == '__main__':
    asyncio.run(main())
