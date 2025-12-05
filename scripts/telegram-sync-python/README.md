# Telegram Full History Sync (Python/Telethon)

Complete one-time script to sync your entire Telegram history using Python and Telethon.

## Why Python/Telethon?

- **More stable**: Telethon is the most mature MTProto library (gramjs is based on it)
- **Production-ready**: Used by thousands of projects for large-scale syncs
- **No Node.js v24 buffer bugs**: Works reliably on all Python versions
- **Better for one-time syncs**: Proven track record for full history migrations

## Features

✅ **Complete History Sync**
- Fetches ALL contacts (users & groups)
- Fetches ALL conversations (private chats, groups, channels)
- Fetches ALL messages with full history (no limits)
- Downloads media files (photos, videos, documents, audio)

✅ **Production Ready**
- Progress tracking with auto-resume capability
- Rate limiting to avoid Telegram API bans (1s delay between calls)
- Batch processing for optimal performance
- Comprehensive error handling and logging
- Graceful shutdown (Ctrl+C saves progress)
- Skips blacklisted chats (e.g., "Ganeesham2 Residents")

✅ **Data Storage**
- Contacts → `Contact` + `SourceIdentity` tables
- Conversations → `Conversation` + `TelegramChat` tables
- Messages → `Message` table
- Media → `/public/media/telegram/{photos,videos,documents,audio}`
- Progress → `sync-progress.json` (auto-saved for resume)

## Prerequisites

1. **Python 3.9+** installed
2. **Dependencies** installed: `pip3 install -r requirements.txt --user`
3. **Environment Variables** (`.env.local`):
   ```bash
   TELEGRAM_API_ID=36716941
   TELEGRAM_API_HASH=ae68fdd057f70a871b00c989e7131df8
   TELEGRAM_PHONE_NUMBER=+917259685040
   DATABASE_URL="postgresql://..."
   ```
4. **Database Schema**: Already created via Prisma

## Usage

### First Time Run

```bash
cd scripts/telegram-sync-python
python3 full_history_sync.py
```

### What Happens

1. **Authentication**:
   - Prompts for phone code (SMS/Telegram)
   - Prompts for 2FA password (if enabled)
   - Saves session for future use

2. **Sync Process**:
   ```
   Step 1: Fetch & store ALL contacts
   Step 2: Fetch ALL conversations
   Step 3: For each conversation:
           - Fetch ALL messages (100 per API call)
           - Download media files
           - Store in PostgreSQL database
   ```

3. **Progress Tracking**:
   - Saves to `sync-progress.json`
   - Can resume if interrupted (Ctrl+C or crash)

### Resume After Interruption

Simply run the same command again:

```bash
python3 full_history_sync.py
```

The script automatically resumes from where it stopped.

## Output Example

```
🚀 Starting Telegram Full History Sync (Python/Telethon)

================================================
📅 Started at: 2025-11-24T10:00:00.000000+00:00
================================================

📊 Progress loaded:
   Contacts: ⏳
   Conversations: ⏳
   Processed dialogs: 0
   Total messages: 0
   Total media: 0

🔐 Connecting to Telegram...

Please enter the code you received: 12345
✅ Connected to Telegram

🔌 Connecting to PostgreSQL...
✅ Connected to PostgreSQL

📇 Syncing contacts...
✅ Synced 142 contacts

💬 Fetching all conversations...

📂 Processing: Alice (private)
  📨 Fetching messages...
    ↳ Fetched 50 messages (offset: 12345)
    ↳ Fetched 100 messages (offset: 12245)
  ✅ Completed: 523 messages

📂 Processing: Work Group (supergroup)
  📨 Fetching messages...
    ↳ Fetched 100 messages (offset: 98765)
  ✅ Completed: 1247 messages

⏭️  Skipping: Ganeesham2 Residents

================================================
✅ SYNC COMPLETED SUCCESSFULLY
================================================
📊 Final Stats:
   Contacts: 142
   Conversations: 45
   Messages: 15,234
   Media files: 2,451
   Errors: 3
   Duration: 45 minutes
================================================
```

## Configuration

### Skip Specific Chats

Edit the script (`full_history_sync.py` line 48):

```python
SKIPPED_CHATS = [
    'Ganeesham2 Residents',  # Already configured
    'Another Group',          # Add more here
]
```

### Adjust Rate Limiting

```python
RATE_LIMIT_DELAY = 1  # 1 second (safe)
# Or
RATE_LIMIT_DELAY = 0.5  # 0.5 seconds (faster, riskier)
```

### Batch Size

```python
MESSAGE_FETCH_LIMIT = 100  # Messages per API call
BATCH_SIZE = 50  # Commit frequency
```

## Media Storage

Media files are organized:

```
public/media/telegram/
├── photos/         # Images
├── videos/         # Video files
├── documents/      # PDFs, files
├── audio/          # Voice notes, audio
└── other/          # Other media types
```

File naming: `{hash}_{messageId}.{ext}`

Example: `a1b2c3d4_123456.jpg`

## Progress File

Location: `scripts/telegram-sync-python/sync-progress.json`

```json
{
  "session_string": null,
  "contacts_completed": true,
  "conversations_completed": false,
  "processed_dialogs": ["123456", "789012"],
  "current_dialog": "Work Group",
  "current_message_offset": 12345,
  "total_contacts": 142,
  "total_conversations": 23,
  "total_messages": 5432,
  "total_media": 892,
  "errors": [],
  "started_at": "2025-11-24T10:00:00+00:00",
  "last_updated_at": "2025-11-24T10:15:23+00:00"
}
```

**To start fresh**: Delete this file

## Telethon Session

Location: `scripts/telegram-sync-python/telegram_session.session`

This file stores your authenticated session. Keep it secure!

**To re-authenticate**: Delete this file and run the script again.

## Error Handling

- **Network errors**: Auto-retry with backoff
- **Rate limits**: Script respects Telegram's limits
- **Auth errors**: Clear session and restart
- **Database errors**: Logged but sync continues
- **Media download errors**: Logged, message stored without media

All errors are logged in `sync-progress.json`.

## Troubleshooting

### "EOF when reading a line"

You're running in a non-interactive shell. Run directly in your terminal:

```bash
cd /Users/sagarrabadia/telegram-crm-v2/scripts/telegram-sync-python
python3 full_history_sync.py
```

### Session Expired

Re-authenticate:
```bash
# Delete session file
rm telegram_session.session*

# Delete progress file (optional - starts fresh)
rm sync-progress.json

# Run again
python3 full_history_sync.py
```

### Database Connection Error

Verify your DATABASE_URL in `.env.local`:
```bash
cat ../../.env.local | grep DATABASE_URL
```

### Import Errors

Reinstall dependencies:
```bash
pip3 install -r requirements.txt --user --force-reinstall
```

## Performance

**Typical sync times** (depends on message count):
- Small account (5K messages): ~10 minutes
- Medium account (50K messages): ~1 hour
- Large account (500K messages): ~8-10 hours

**Optimization tips**:
1. Run during off-peak hours
2. Ensure stable internet connection
3. Use SSD for media storage
4. Adjust `RATE_LIMIT_DELAY` carefully (don't go below 0.5s)

## Safety

✅ **This script:**
- Only reads data (no writes to Telegram)
- Respects rate limits
- Saves progress for resume
- Handles errors gracefully

❌ **Do NOT:**
- Run multiple instances simultaneously
- Modify rate limiting below 500ms
- Interrupt during authentication

## Why Not Node.js/gramjs?

The gramjs library (v2.26.x) has connection issues with Node.js v24.11.0 due to a Buffer.allocUnsafe bug. While this is fixed in v24.11.1+, Telethon is:
- More mature (gramjs is based on Telethon)
- More stable for large-scale syncs
- Better documented
- More widely used in production

For your use case (one-time full history sync), Python/Telethon is the superior choice.

## Integration with NestJS CRM

This is a **standalone script** for one-time sync only. Your NestJS application continues to work normally:
- NestJS handles real-time messaging
- This script handles initial history migration
- Both use the same PostgreSQL database
- No architectural changes needed

## Future Use

Keep this script for:
- Re-syncing after long periods
- Syncing new accounts
- Disaster recovery
- Data migration

## Support

If sync fails:
1. Check `sync-progress.json` for errors
2. Verify `.env.local` credentials
3. Ensure database connectivity
4. Check Telegram API status
5. Verify Python dependencies installed

## License

Internal use only. Part of telegram-crm-v2 project.
