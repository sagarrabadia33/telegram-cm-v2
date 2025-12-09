# Telegram CRM V2

A comprehensive CRM system that syncs Telegram conversations in real-time, providing a web interface to manage and search through all your Telegram chats.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Telegram Sync System](#telegram-sync-system)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Operational Runbook](#operational-runbook)
- [Key Features](#key-features)
- [Troubleshooting](#troubleshooting)

---

## Overview

Telegram CRM V2 is a Next.js application that integrates with the Telegram API to:
- Sync all personal and group conversations
- Store messages, media, and participant information
- Provide a searchable web interface for managing conversations
- Support real-time message sync via a persistent Railway worker

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION ENVIRONMENT                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────────┐         ┌─────────────────────────────────┐   │
│   │   Next.js App   │         │     Railway Sync Worker         │   │
│   │   (Vercel)      │         │     (Python + Telethon)         │   │
│   │                 │         │                                 │   │
│   │  • Web UI       │         │  • 24/7 Telegram connection     │   │
│   │  • API Routes   │◄───────►│  • Real-time message sync       │   │
│   │  • SSR          │         │  • Catch-up on restart          │   │
│   │                 │         │  • Health endpoint (/health)    │   │
│   └────────┬────────┘         └────────────────┬────────────────┘   │
│            │                                   │                     │
│            │                                   │                     │
│            ▼                                   ▼                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                   Azure PostgreSQL                           │   │
│   │                   (telegram_crm schema)                      │   │
│   │                                                               │   │
│   │  • Conversations, Messages, Participants                     │   │
│   │  • TelegramWorkerSession (session storage)                   │   │
│   │  • SyncLock (distributed locking)                            │   │
│   │  • SyncMetadata (sync state tracking)                        │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         LOCAL ENVIRONMENT                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ┌─────────────────┐         ┌─────────────────────────────────┐   │
│   │   Next.js Dev   │         │     Python Sync Scripts         │   │
│   │   (localhost)   │         │     (manual execution)          │   │
│   │                 │         │                                 │   │
│   │  npm run dev    │         │  • sync_telegram.py             │   │
│   │  Port 3000      │         │  • telegram_listener.py         │   │
│   │                 │         │  • sync_media.py                │   │
│   └────────┬────────┘         └────────────────┬────────────────┘   │
│            │                                   │                     │
│            └───────────────┬───────────────────┘                     │
│                            ▼                                         │
│                  ┌─────────────────────┐                             │
│                  │   Same Azure DB     │                             │
│                  │   (shared with      │                             │
│                  │    production)      │                             │
│                  └─────────────────────┘                             │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
telegram-crm-v2/                 # Main repo (connected to Git, deploys to Vercel)
├── frontend/                    # Next.js 15 application
│   ├── app/                     # App Router pages and API routes
│   │   ├── api/                 # API endpoints
│   │   │   ├── conversations/   # Conversation CRUD + search
│   │   │   ├── media/           # Media file serving
│   │   │   ├── sync/            # Sync control endpoints
│   │   │   ├── stats/           # Dashboard statistics
│   │   │   └── search/          # Global search
│   │   ├── conversations/       # Conversation list page
│   │   └── page.tsx             # Dashboard home
│   ├── components/              # React components
│   │   ├── ui/                  # shadcn/ui components
│   │   └── ...                  # Feature components
│   ├── lib/                     # Utilities and Prisma client
│   ├── prisma/                  # Database schema
│   │   └── schema.prisma        # Prisma schema definition
│   └── public/                  # Static assets
│
├── scripts/                     # Python sync scripts (local dev)
│   └── telegram-sync-python/    # Telethon-based sync
│       ├── incremental_sync.py  # Incremental sync
│       ├── realtime_listener.py # Real-time listener (local)
│       ├── lock_manager.py      # Distributed locking
│       └── telegram_session.session  # Local auth session
│
├── telegram-sync-worker/        # Reference copy (NOT deployed from here!)
│   └── ...                      # See /tmp/telegram-sync-deploy for prod
│
└── README.md                    # This file

/tmp/telegram-sync-deploy/       # PRODUCTION WORKER (NOT in Git!)
├── main.py                      # Worker entry point
├── realtime_listener.py         # Real-time listener with 100x reliability
├── lock_manager.py              # Distributed locking + stale cleanup
├── session_manager.py           # Session restore/save from DB
├── Dockerfile                   # Container build
├── railway.toml                 # Railway config
└── requirements.txt             # Python dependencies
```

> **IMPORTANT**: The Railway worker deploys from `/tmp/telegram-sync-deploy/`, NOT from the Git repo. This is a separate directory that is manually deployed using `railway up`.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| shadcn/ui | Latest | UI component library |
| Prisma | 6.x | Database ORM |
| Lucide React | Latest | Icons |

### Backend (Sync Worker)

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11+ | Runtime |
| Telethon | 1.x | Telegram MTProto client |
| psycopg2 | 2.x | PostgreSQL driver |
| aiohttp | 3.x | HTTP server for health checks |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Vercel | Frontend hosting |
| Railway | Sync worker hosting (24/7) |
| Azure PostgreSQL | Database |

---

## Database Schema

All tables are in the `telegram_crm` schema.

### Core Tables

#### Conversation
Stores Telegram chat metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| tg_id | BigInt | Telegram chat ID |
| name | String | Chat name |
| type | String | private/group/channel |
| unread_count | Int | Unread message count |
| is_pinned | Boolean | Pinned status |
| is_archived | Boolean | Archived status |
| is_muted | Boolean | Muted status |
| last_message_date | DateTime | Last message timestamp |
| photo_path | String? | Profile photo path |
| participant_count | Int | Number of participants |
| about | String? | Chat description |

#### Message
Stores all synced messages.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| tg_id | BigInt | Telegram message ID |
| conversation_id | String | FK to Conversation |
| sender_id | String? | FK to Participant |
| sender_name | String? | Sender display name |
| text | String? | Message text content |
| date | DateTime | Message timestamp |
| is_outgoing | Boolean | Sent by current user |
| reply_to_msg_id | BigInt? | Reply reference |
| forward_from_name | String? | Forward source |
| media_type | String? | photo/video/document/etc |
| media_path | String? | Local media file path |
| media_mime_type | String? | MIME type |

#### Participant
Stores chat participants.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| tg_id | BigInt | Telegram user ID |
| conversation_id | String | FK to Conversation |
| first_name | String? | First name |
| last_name | String? | Last name |
| username | String? | @username |
| phone | String? | Phone number |
| is_bot | Boolean | Bot flag |
| is_self | Boolean | Current user flag |
| photo_path | String? | Profile photo path |

### Sync Management Tables

#### SyncMetadata
Tracks sync state per conversation.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| conversation_id | String | Unique FK to Conversation |
| last_synced_message_id | BigInt? | Last synced Telegram msg ID |
| last_synced_at | DateTime? | Last sync timestamp |
| sync_status | String | pending/syncing/completed/failed |
| full_sync_completed | Boolean | Full history synced |
| created_at | DateTime | Record creation time |
| updated_at | DateTime | Last update time |

#### SyncLock
Distributed locking for sync operations.

| Column | Type | Description |
|--------|------|-------------|
| id | Int | Primary key |
| lock_name | String | Unique lock identifier |
| locked_by | String | Worker/process identifier |
| locked_at | DateTime | Lock acquisition time |
| expires_at | DateTime | Lock expiration time |

#### TelegramWorkerSession
Stores Telegram session for Railway worker.

| Column | Type | Description |
|--------|------|-------------|
| id | Int | Primary key |
| session_name | String | Unique session identifier |
| session_data | Bytes | Binary session file (~229KB) |
| created_at | DateTime | Creation timestamp |
| updated_at | DateTime | Last update timestamp |

### Other Tables

#### Label
User-defined labels for conversations.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| name | String | Label name |
| color | String | Hex color code |

#### ConversationLabel
Many-to-many: Conversations <-> Labels.

---

## API Reference

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List all conversations with filters |
| GET | `/api/conversations/[id]` | Get conversation details |
| POST | `/api/conversations/[id]` | Update conversation (archive, pin, etc) |
| GET | `/api/conversations/[id]/members` | Get conversation participants |

**Query Parameters for GET /api/conversations:**
- `search` - Search by name/text
- `type` - Filter by type (private/group/channel)
- `isArchived` - Filter archived
- `isPinned` - Filter pinned
- `isMuted` - Filter muted
- `hasUnread` - Filter by unread status
- `labelId` - Filter by label
- `page`, `limit` - Pagination

### Messages

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations/[id]/messages` | Get messages for conversation |
| GET | `/api/conversations/[id]/messages/search` | Search within conversation |

### Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/media?path=...` | Serve media file from disk |
| GET | `/api/photos?path=...` | Serve profile photos |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...` | Global search across all messages |

### Sync Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sync/conversation` | Trigger sync for specific conversation |
| GET | `/api/sync/status` | Get sync status |
| POST | `/api/sync/all` | Trigger full sync |

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/stats/message-volume` | Message volume over time |

### Labels

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/labels` | List all labels |
| POST | `/api/labels` | Create label |
| PUT | `/api/labels/[id]` | Update label |
| DELETE | `/api/labels/[id]` | Delete label |
| POST | `/api/conversations/[id]/labels` | Add label to conversation |
| DELETE | `/api/conversations/[id]/labels/[labelId]` | Remove label |

---

## Telegram Sync System

### How It Works

1. **Session Authentication**: Telegram requires a session file containing authentication state, encryption keys, and DC (data center) info. This is stored in the `TelegramWorkerSession` table.

2. **Connection**: The Telethon library connects to Telegram's MTProto API using the session.

3. **Initial Sync**: On startup, performs a catch-up sync to fetch any messages missed while offline.

4. **Real-time Listening**: Maintains a persistent connection and receives new messages instantly via Telegram's update mechanism.

5. **Database Storage**: All messages, conversations, and participants are written to PostgreSQL.

### Production Worker (Railway)

The Railway worker runs 24/7 with automatic restart on failure:

```toml
# railway.toml
[deploy]
healthcheckPath = "/health"
startCommand = "python main.py"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
numReplicas = 1
```

**Startup Flow:**
1. Restore session from `TelegramWorkerSession` table
2. Connect to Telegram
3. Run catch-up sync (fetch missed messages)
4. Start real-time listener
5. Expose `/health` endpoint for monitoring

**Session Management:**
- Session is ~229KB binary file stored as BYTEA in PostgreSQL
- `clean_database_url()` strips Prisma's `?schema=xxx` param for psycopg2 compatibility
- Session is periodically saved back to database

### Local Development Scripts

Located in `scripts/telegram-sync-python/`:

| Script | Purpose |
|--------|---------|
| `sync_telegram.py` | Full conversation sync |
| `telegram_listener.py` | Real-time message listener |
| `sync_media.py` | Download media files |
| `sync_participants.py` | Sync participant info |
| `sync_all_messages.py` | Deep historical sync |

**Running locally:**
```bash
cd scripts/telegram-sync-python
python sync_telegram.py      # One-time sync
python telegram_listener.py  # Keep running for real-time
```

---

## Environment Setup

### Required Environment Variables

```bash
# Database (Azure PostgreSQL)
DATABASE_URL="postgresql://telegram_crm:PASSWORD@host:5432/postgres?schema=telegram_crm&sslmode=require"

# Telegram API (from https://my.telegram.org)
TELEGRAM_API_ID="12345678"
TELEGRAM_API_HASH="your_api_hash_here"

# Media storage path (local file system)
MEDIA_BASE_PATH="/path/to/telegram_media"

# For Railway worker only
SESSION_PATH="/data/sessions/telegram_session"
```

### Getting Telegram Credentials

1. Go to https://my.telegram.org
2. Log in with your phone number
3. Go to "API development tools"
4. Create a new application
5. Copy the `api_id` and `api_hash`

### First-Time Session Setup

```bash
cd scripts/telegram-sync-python
python sync_telegram.py
# Enter phone number when prompted
# Enter verification code from Telegram
# Session file is created: telegram_session.session
```

Then upload to database:
```bash
python /tmp/create-worker-session-table.py
```

---

## Local Development

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
# -> http://localhost:3000
```

### Database Commands

```bash
# Pull schema from existing database
npx prisma db pull

# Push schema changes to database
npx prisma db push

# Open Prisma Studio (database GUI)
npx prisma studio
```

### Running Sync Scripts

```bash
cd scripts/telegram-sync-python

# One-time full sync
python sync_telegram.py

# Real-time listener (keep running)
python telegram_listener.py

# Sync media files
python sync_media.py
```

---

## Production Deployment

### Frontend (Vercel)

The Next.js app is deployed to Vercel with:
- Automatic deployments from main branch
- Environment variables configured in Vercel dashboard
- Serverless API routes

### Sync Worker (Railway)

The Python worker is deployed to Railway from a **separate local directory** (not connected to Git):

**Deploy location**: `/tmp/telegram-sync-deploy/`

1. **Set up the deploy directory** (first time only):
   ```bash
   mkdir -p /tmp/telegram-sync-deploy
   # Copy files from telegram-sync-worker/ as a base
   cp telegram-sync-worker/* /tmp/telegram-sync-deploy/
   cd /tmp/telegram-sync-deploy
   railway link  # Link to your Railway project
   ```

2. **Environment variables** (set in Railway dashboard):
   - `DATABASE_URL` - PostgreSQL connection (without `?schema=xxx`)
   - `TELEGRAM_API_ID` - From my.telegram.org
   - `TELEGRAM_API_HASH` - From my.telegram.org

3. **Deploy changes:**
   ```bash
   cd /tmp/telegram-sync-deploy
   railway up
   ```

4. **Monitor:**
   ```bash
   cd /tmp/telegram-sync-deploy
   railway logs
   ```

### Why Railway for the Worker?

- **24/7 uptime**: Maintains persistent Telegram connection
- **Automatic restarts**: `restartPolicyType = "ON_FAILURE"`
- **Health monitoring**: `/health` endpoint
- **Session in DB**: Session stored in `TelegramWorkerSession` table (no volume needed)
- **Distributed locking**: `SyncLock` table prevents duplicate workers

---

## Operational Runbook

### Check Worker Health

```bash
cd /tmp/telegram-sync-deploy
railway logs | tail -50
```

Look for:
- `[INFO] Lock heartbeat updated` - Worker is alive
- `[INFO] New [IN] ...` - Messages being synced
- `[INFO] DISCOVERY completed` - Dialog discovery working

### Check Lock Status

```javascript
// Run from telegram-crm-v2 directory
DATABASE_URL="..." node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  const result = await client.query('SELECT * FROM telegram_crm.\"SyncLock\" WHERE \"lockType\" = \$1', ['listener']);
  console.log(result.rows);
  await client.end();
})();
"
```

### Release Stale Lock (if worker is stuck)

```javascript
// release-lock.js - Run from telegram-crm-v2 directory
DATABASE_URL="..." node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  await client.query('DELETE FROM telegram_crm.\"SyncLock\" WHERE \"lockType\" = \$1', ['listener']);
  console.log('Lock released!');
  await client.end();
})();
"
```

### Check Conversation Sync Status

```bash
DATABASE_URL="..." node -e "
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  await client.connect();
  // Search for a conversation
  const result = await client.query(\`
    SELECT c.id, c.title, c.type, c.\"createdAt\",
           (SELECT COUNT(*) FROM telegram_crm.\"Message\" m WHERE m.\"conversationId\" = c.id) as message_count,
           (SELECT MAX(m.\"createdAt\") FROM telegram_crm.\"Message\" m WHERE m.\"conversationId\" = c.id) as last_message_at
    FROM telegram_crm.\"Conversation\" c
    WHERE LOWER(c.title) LIKE '%search_term%'
  \`);
  console.log(result.rows);
  await client.end();
})();
"
```

### Redeploy Worker

```bash
cd /tmp/telegram-sync-deploy
railway up
# Wait for build to complete, then check logs
railway logs
```

### 100x Reliability Features

The production worker includes these self-healing mechanisms:

1. **Stale Lock Cleanup**: Automatically releases locks from dead containers (2-minute threshold)
2. **Conversation Validation**: Self-heals when conversation cache is corrupted
3. **Heartbeat Monitoring**: Updates heartbeat every 30 seconds
4. **Auto-retry**: Retries failed operations with exponential backoff
5. **Dialog Discovery**: Discovers new conversations every 15 minutes

---

## Key Features

### Conversation Management
- View all Telegram conversations in one place
- Filter by type (private/group/channel)
- Search across all messages
- Archive, pin, and mute conversations
- Apply custom labels

### Message Sync
- Real-time message sync via Railway worker
- Automatic catch-up on restart
- Full message history support
- Media file sync (photos, videos, documents)

### Search
- Global search across all conversations
- In-conversation search
- Search by sender, date, content

### Labels
- Create custom labels with colors
- Apply multiple labels to conversations
- Filter conversations by label

---

## Troubleshooting

### "Session not found" on Railway

The worker couldn't find the Telegram session. Check:
1. `DATABASE_URL` is set correctly (without `?schema=xxx`)
2. Session exists in `TelegramWorkerSession` table
3. Run `/tmp/create-worker-session-table.py` to upload session

### "database \"telegram_crm\" does not exist"

The DATABASE_URL uses schema-based isolation, not a separate database:
- Correct: `postgres?schema=telegram_crm&sslmode=require`
- Tables are in `telegram_crm` schema within `postgres` database

### "psycopg2 doesn't understand schema parameter"

The `session_manager.py` includes `clean_database_url()` to strip the `?schema=xxx` parameter that Prisma uses but psycopg2 doesn't support.

### Messages not syncing

1. Check Railway logs: `railway logs`
2. Verify worker is running: check `/health` endpoint
3. Check for errors in sync: look for "ERROR" in logs
4. Verify Telegram session is valid

### Media not loading

1. Check `MEDIA_BASE_PATH` is set correctly
2. Verify media files exist at the specified paths
3. Check file permissions
4. Run `sync_media.py` to download missing media

### Database connection issues

1. Verify DATABASE_URL is correct
2. Check SSL mode (`sslmode=require` for Azure)
3. Verify IP allowlist includes Railway/Vercel IPs
4. Test connection: `npx prisma db pull`

---

## Version History

- **v2.1** (December 2024): 100x reliability features - self-healing, stale lock cleanup
- **v2.0** (December 2024): Complete rewrite with Next.js 15, Railway worker
- **v1.0** (November 2024): Initial GramJS-based implementation

---

## Database Connection Details

| Component | Connection String Format |
|-----------|-------------------------|
| Next.js (Prisma) | `postgresql://user:pass@host:5432/postgres?schema=telegram_crm&sslmode=require` |
| Python Worker | `postgresql://user:pass@host:5432/postgres?sslmode=require` (no schema param) |

> **Note**: Python's psycopg2 doesn't understand the `?schema=xxx` parameter. The worker sets `search_path = telegram_crm` explicitly.

---

*Last updated: December 8, 2024*
