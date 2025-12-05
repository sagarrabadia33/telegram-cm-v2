#!/usr/bin/env python3
"""
Clean Telegram sync data from database.
Use this to start a fresh sync.
"""

import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).parent.parent.parent / '.env.local'
load_dotenv(env_path)

DATABASE_URL = os.getenv('DATABASE_URL')

# Clean DATABASE_URL for psycopg2
if DATABASE_URL and '?schema=' in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split('?schema=')[0]

def clean_telegram_data():
    """Clean all Telegram-related data from database."""
    print('🧹 Cleaning Telegram data from database...')
    print('ℹ️  Schema: telegram_crm (other schemas are not affected)')
    print()

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # Set search_path to telegram_crm schema only (safety check)
        cursor.execute('SET search_path TO telegram_crm')

        # Verify we're in the correct schema
        cursor.execute('SELECT current_schema()')
        current_schema = cursor.fetchone()[0]
        print(f'  ✅ Working in schema: {current_schema}')
        print()

        print('  ↳ Deleting Messages from Telegram...')
        cursor.execute("""
            DELETE FROM "Message" WHERE "source" = 'telegram'
        """)
        messages_deleted = cursor.rowcount

        print('  ↳ Deleting TelegramChat entries...')
        cursor.execute("""
            DELETE FROM "TelegramChat"
        """)
        telegram_chats_deleted = cursor.rowcount

        print('  ↳ Deleting Conversations from Telegram...')
        cursor.execute("""
            DELETE FROM "Conversation" WHERE "source" = 'telegram'
        """)
        conversations_deleted = cursor.rowcount

        print('  ↳ Deleting SourceIdentities from Telegram...')
        cursor.execute("""
            DELETE FROM "SourceIdentity" WHERE "source" = 'telegram'
        """)
        source_identities_deleted = cursor.rowcount

        print('  ↳ Deleting Contacts (only those with ONLY Telegram source)...')
        cursor.execute("""
            DELETE FROM "Contact"
            WHERE id IN (
                SELECT c.id FROM "Contact" c
                LEFT JOIN "SourceIdentity" si ON si."contactId" = c.id AND si.source != 'telegram'
                WHERE si.id IS NULL
                AND EXISTS (
                    SELECT 1 FROM "SourceIdentity" si2
                    WHERE si2."contactId" = c.id AND si2.source = 'telegram'
                )
            )
        """)
        contacts_deleted = cursor.rowcount

        conn.commit()

        print('\n✅ Database cleaned successfully!')
        print(f'  📊 Statistics:')
        print(f'     • Messages deleted: {messages_deleted}')
        print(f'     • Conversations deleted: {conversations_deleted}')
        print(f'     • TelegramChats deleted: {telegram_chats_deleted}')
        print(f'     • SourceIdentities deleted: {source_identities_deleted}')
        print(f'     • Contacts deleted: {contacts_deleted}')

        cursor.close()
        conn.close()

    except Exception as e:
        print(f'❌ Error cleaning database: {e}')
        raise

def clean_progress_file():
    """Delete sync progress file."""
    progress_file = Path(__file__).parent / 'sync-progress.json'

    if progress_file.exists():
        progress_file.unlink()
        print('✅ Progress file deleted')
    else:
        print('ℹ️  No progress file found')

if __name__ == '__main__':
    print('=' * 50)
    print('🚨 WARNING: This will delete ALL Telegram data!')
    print('=' * 50)
    print()

    response = input('Are you sure you want to continue? (yes/no): ')

    if response.lower() == 'yes':
        clean_telegram_data()
        clean_progress_file()
        print('\n🎯 Ready to start fresh sync!')
        print('   Run: python3 full_history_sync.py')
    else:
        print('❌ Cancelled')
