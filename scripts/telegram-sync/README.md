# Telegram Full History Sync

Complete one-time script to sync your entire Telegram history (contacts, conversations, messages, media) to PostgreSQL.

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
- Session → `TelegramSession` table (auto-saved for resume)

## Prerequisites

1. **Environment Variables** (`.env.local`):
   ```bash
   TELEGRAM_API_ID=36716941
   TELEGRAM_API_HASH=ae68fdd057f70a871b00c989e7131df8
   TELEGRAM_PHONE_NUMBER=+917259685040
   DATABASE_URL="postgresql://..."
   ```

2. **Database Schema**: Run `npm run db:push` to create tables

3. **Dependencies**: Already installed via `npm install`

## Usage

### First Time Run

```bash
npm run sync:telegram
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
           - Store in database
   ```

3. **Progress Tracking**:
   - Saves to `scripts/telegram-sync/sync-progress.json`
   - Can resume if interrupted (Ctrl+C or crash)

### Resume After Interruption

Simply run the same command again:

```bash
npm run sync:telegram
```

The script automatically resumes from where it stopped.

### Output

```
🚀 Starting Telegram Full History Sync

================================================
📅 Started at: 2025-11-24T09:30:00.000Z
================================================

📊 Progress loaded:
   Contacts: ⏳
   Conversations: ⏳
   Processed dialogs: 0
   Total messages: 0
   Total media: 0

🔐 Connecting to Telegram...

✅ Connected to Telegram

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

Edit the script (`full-history-sync.ts`):

```typescript
const SKIPPED_CHATS = [
  'Ganeesham2 Residents',  // Already configured
  'Another Group',          // Add more here
];
```

### Adjust Rate Limiting

```typescript
const RATE_LIMIT_DELAY = 1000; // 1 second (safe)
// Or
const RATE_LIMIT_DELAY = 500;  // 0.5 seconds (faster, riskier)
```

### Batch Size

```typescript
const MESSAGE_FETCH_LIMIT = 100; // Messages per API call
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

Location: `scripts/telegram-sync/sync-progress.json`

```json
{
  "sessionString": "...",
  "contactsCompleted": true,
  "conversationsCompleted": false,
  "processedDialogs": ["123456", "789012"],
  "currentDialog": "Work Group",
  "currentMessageOffset": 12345,
  "totalContacts": 142,
  "totalConversations": 23,
  "totalMessages": 5432,
  "totalMedia": 892,
  "errors": [...],
  "startedAt": "2025-11-24T09:30:00.000Z",
  "lastUpdatedAt": "2025-11-24T10:15:23.456Z"
}
```

**To start fresh**: Delete this file

## Error Handling

- **Network errors**: Auto-retry with exponential backoff
- **Rate limits**: Script respects Telegram's limits
- **Auth errors**: Clear session and restart
- **Database errors**: Logged but sync continues
- **Media download errors**: Logged, message stored without media

All errors are logged in `sync-progress.json`:

```json
{
  "errors": [
    {
      "type": "media_download",
      "error": "Connection timeout",
      "timestamp": "2025-11-24T10:05:12.345Z"
    }
  ]
}
```

## Troubleshooting

### "AUTH_KEY_DUPLICATED" Error

Delete session and restart:
```bash
rm scripts/telegram-sync/sync-progress.json
npm run sync:telegram
```

### "FLOOD_WAIT" Error

Telegram rate limit hit. The script automatically waits.

### Session Expired

Re-authenticate:
```bash
# Delete progress file
rm scripts/telegram-sync/sync-progress.json

# Run again
npm run sync:telegram
```

### Out of Disk Space (Media)

Skip media downloads temporarily:
```typescript
// In full-history-sync.ts, comment out:
// const mediaInfo = await downloadMedia(client, message);
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
4. Increase `MESSAGE_FETCH_LIMIT` (risky for rate limits)

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

## License

Internal use only. Part of telegram-crm-v2 project.
