# Telegram CRM V2

A comprehensive CRM system that syncs Telegram conversations in real-time, providing a web interface to manage and search through all your Telegram chats with AI-powered insights.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Tech Stack](#tech-stack)
- [Frontend Architecture](#frontend-architecture)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Telegram Sync System](#telegram-sync-system)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Operational Runbook](#operational-runbook)
- [Key Features](#key-features)
- [UI Components](#ui-components)
- [Performance Optimizations](#performance-optimizations)
- [Troubleshooting](#troubleshooting)

---

## Overview

Telegram CRM V2 is a Next.js application that integrates with the Telegram API to:
- Sync all personal and group conversations in real-time
- Store messages, media, and participant information
- Provide a searchable web interface for managing conversations
- AI-powered conversation summaries and chat assistant
- Notes timeline for tracking context over time
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
│   │   (Railway)     │         │     (Python + Telethon)         │   │
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
│   │  • ConversationNote (notes timeline)                         │   │
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
telegram-crm-v2/
├── frontend/                    # Next.js 15 application
│   ├── app/                     # App Router pages and API routes
│   │   ├── api/                 # API endpoints
│   │   │   ├── conversations/   # Conversation CRUD + search + notes + chat
│   │   │   ├── contacts/        # Contacts with pagination + search + smart filter
│   │   │   ├── media/           # Media file serving
│   │   │   ├── sync/            # Sync control endpoints
│   │   │   ├── stats/           # Dashboard statistics
│   │   │   ├── search/          # Global search
│   │   │   ├── tags/            # Tag management
│   │   │   └── upload/          # File upload handling
│   │   ├── components/          # React components
│   │   │   ├── AIAssistant.tsx  # AI chat + notes timeline panel
│   │   │   ├── ContactsTable.tsx # Contacts with infinite scroll + deduplication
│   │   │   ├── ConversationsList.tsx # Conversations with caching
│   │   │   ├── MessageView.tsx  # Messages with infinite scroll
│   │   │   ├── NotesTimeline.tsx # Notes timeline component
│   │   │   ├── SmartFilterSection.tsx # AI-powered filters with server counts
│   │   │   ├── Skeleton.tsx     # Loading skeletons
│   │   │   └── ...              # Other feature components
│   │   ├── lib/                 # Utilities and Prisma client
│   │   ├── types/               # TypeScript type definitions
│   │   └── page.tsx             # Main dashboard (3-panel layout)
│   ├── prisma/                  # Database schema
│   │   └── schema.prisma        # Prisma schema definition
│   └── public/                  # Static assets
│
├── scripts/                     # Python sync scripts (local dev)
│   └── telegram-sync-python/    # Telethon-based sync
│       ├── incremental_sync.py  # Incremental sync
│       ├── realtime_listener.py # Real-time listener (local)
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

> **IMPORTANT**: The Railway worker deploys from `/tmp/telegram-sync-deploy/`, NOT from the Git repo.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.x | React framework with App Router |
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| Prisma | 6.x | Database ORM |
| OpenAI API | GPT-4 | AI summaries and chat |

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
| Railway | Next.js frontend + Sync worker hosting |
| Azure PostgreSQL | Database |

---

## Frontend Architecture

### Views

The application has two main views:

1. **Messages View** (default) - 3-panel layout:
   - Left: Conversations list with search, filters, and tags
   - Middle: Message view with infinite scroll
   - Right: AI Assistant panel with tabs (Chat, Summary, Notes)

2. **Contacts View** - Full-width table:
   - Table with infinite scroll (50 contacts per load)
   - Server-side search and filtering
   - Type filters (All, People, Groups, Channels)
   - Smart AI-powered filtering
   - Bulk tagging operations

### State Management

- **Conversations**: Cached locally, auto-refresh on sync
- **Messages**: Cached with 5-minute TTL for instant switching
- **Contacts**: Paginated with server-side search

### Real-time Updates

- Polling every 5 seconds for new messages
- WebSocket-ready architecture
- Optimistic UI updates for sent messages

---

## Database Schema

All tables are in the `telegram_crm` schema.

### Core Tables

#### Conversation
Stores Telegram chat metadata.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key (CUID) |
| externalChatId | String | Telegram chat ID |
| title | String | Chat name |
| type | String | private/group/supergroup/channel |
| avatarUrl | String? | Profile photo URL |
| lastMessageAt | DateTime? | Last message timestamp |
| unreadCount | Int | Unread message count |
| metadata | Json? | Additional metadata (notes, etc.) |
| isSyncDisabled | Boolean | Exclude from sync |

#### Message
Stores all synced messages.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key (CUID) |
| externalMessageId | String | Telegram message ID |
| conversationId | String | FK to Conversation |
| contactId | String? | FK to Contact (sender) |
| body | String? | Message text content |
| direction | String | inbound/outbound |
| sentAt | DateTime | Message timestamp |
| status | String | delivered/read/sent |
| contentType | String | text/image/video/document/etc |
| hasAttachments | Boolean | Has media attachments |
| attachments | Json? | Attachment metadata |

#### Contact
Stores contact information.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| externalContactId | String | Telegram user ID |
| firstName | String? | First name |
| lastName | String? | Last name |
| displayName | String? | Display name |
| primaryPhone | String? | Phone number |
| primaryEmail | String? | Email address |
| avatarUrl | String? | Profile photo URL |
| notes | String? | Contact notes |
| isOnline | Boolean | Online status |
| lastSeenAt | DateTime? | Last seen timestamp |

#### ConversationNote
Stores notes timeline entries.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key (CUID) |
| conversationId | String | FK to Conversation |
| type | String | note/meeting/call/file |
| title | String? | Note title |
| content | String | Note content |
| fileName | String? | Attachment filename |
| fileUrl | String? | Attachment URL |
| eventAt | DateTime? | When event occurred |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update |

#### Tag
User-defined labels for conversations and contacts.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key |
| name | String | Tag name |
| color | String? | Hex color code |

#### GroupMember
Stores group/channel member information for @mention autocomplete.

| Column | Type | Description |
|--------|------|-------------|
| id | String | Primary key (CUID) |
| conversationId | String | FK to Conversation |
| externalUserId | String | Telegram user ID |
| username | String? | Telegram username |
| firstName | String? | First name |
| lastName | String? | Last name |
| role | String? | admin/creator/member |
| joinedAt | DateTime? | When user joined |
| createdAt | DateTime | Record creation timestamp |
| updatedAt | DateTime | Last update timestamp |

### Sync Management Tables

#### SyncLock
Distributed locking for sync operations.

| Column | Type | Description |
|--------|------|-------------|
| id | Int | Primary key |
| lockType | String | Unique lock identifier |
| workerId | String | Worker/process identifier |
| acquiredAt | DateTime | Lock acquisition time |
| heartbeatAt | DateTime | Last heartbeat |
| expiresAt | DateTime | Lock expiration time |

#### TelegramWorkerSession
Stores Telegram session for Railway worker.

| Column | Type | Description |
|--------|------|-------------|
| id | Int | Primary key |
| sessionName | String | Unique session identifier |
| sessionData | Bytes | Binary session file (~229KB) |
| createdAt | DateTime | Creation timestamp |
| updatedAt | DateTime | Last update timestamp |

---

## API Reference

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List all conversations with filters |
| GET | `/api/conversations/[id]` | Get conversation details |
| PATCH | `/api/conversations/[id]` | Update conversation |
| GET | `/api/conversations/[id]/messages` | Get messages (paginated) |
| POST | `/api/conversations/[id]/send` | Send a message |

**Messages Pagination:**
```
GET /api/conversations/{id}/messages?limit=50&cursor={lastMessageId}

Response:
{
  "messages": [...],
  "nextCursor": "...",
  "hasMore": true,
  "total": 1234,
  "returned": 50
}
```

### Contacts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List contacts (paginated with search) |
| POST | `/api/contacts/smart-filter` | AI-powered smart filtering |
| POST | `/api/contacts/bulk-tag` | Bulk tag operations |

**Contacts Pagination:**
```
GET /api/contacts?limit=50&cursor={lastContactId}&search={query}&type={all|people|groups|channels}

Response:
{
  "contacts": [...],
  "counts": { "all": 100, "people": 50, "groups": 30, "channels": 20 },
  "quickFilterCounts": {
    "active7d": 70,      // Contacts active in last 7 days
    "active30d": 124,    // Contacts active in last 30 days
    "untagged": 761,     // Contacts without tags
    "highVolume": 148,   // Contacts with 50+ messages
    "newThisWeek": 15    // Contacts created in last 7 days
  },
  "pagination": {
    "hasMore": true,
    "nextCursor": "...",
    "total": 100,
    "returned": 50
  }
}
```

**Smart Filter Counts:**
The `quickFilterCounts` field provides server-calculated accurate counts for AI-powered smart filters. These are calculated from the entire database, not just the current page, ensuring accurate filter badges.

### Notes Timeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations/[id]/notes` | List all notes for conversation |
| POST | `/api/conversations/[id]/notes` | Create a new note |
| PUT | `/api/conversations/[id]/notes/[noteId]` | Update note |
| DELETE | `/api/conversations/[id]/notes/[noteId]` | Delete note |

**Note Types:**
- `note` - General text note
- `meeting` - Meeting notes with optional title
- `call` - Call summary
- `file` - File attachment with description

### AI Assistant

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations/[id]/chat` | Chat with AI about conversation |
| GET | `/api/conversations/[id]/summary` | Get AI-generated summary |

**Chat Request:**
```json
{
  "message": "What are the key action items from this conversation?",
  "conversationHistory": [...]
}
```

### Tags

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create tag |
| PUT | `/api/tags/[id]` | Update tag |
| DELETE | `/api/tags/[id]` | Delete tag |

### Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...` | Global search across all messages |

### Media

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/media/[path]` | Serve media file |

### Group Members (@mention)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations/[id]/members` | Get group members for @mention autocomplete |

**Members Response:**
```json
{
  "members": [
    {
      "id": "...",
      "odId": "123456789",
      "username": "johndoe",
      "firstName": "John",
      "lastName": "Doe",
      "displayName": "John Doe",
      "mentionText": "@johndoe",
      "role": "member",
      "isAdmin": false
    }
  ],
  "total": 50
}
```

---

## Telegram Sync System

### How It Works

1. **Session Authentication**: Telegram requires a session file stored in `TelegramWorkerSession` table.

2. **Connection**: Telethon connects to Telegram's MTProto API.

3. **Initial Sync**: On startup, performs catch-up sync for missed messages.

4. **Real-time Listening**: Maintains persistent connection for instant updates.

5. **Database Storage**: All data written to PostgreSQL.

### Production Worker (Railway)

The Railway worker runs 24/7 with automatic restart:

```toml
# railway.toml
[deploy]
healthcheckPath = "/health"
startCommand = "python main.py"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 5
numReplicas = 1
```

### 100x Reliability Features

1. **Stale Lock Cleanup**: Auto-releases locks from dead containers (2-minute threshold)
2. **Conversation Validation**: Self-heals corrupted cache
3. **Heartbeat Monitoring**: Updates every 30 seconds
4. **Auto-retry**: Exponential backoff for failed operations
5. **Dialog Discovery**: Discovers new conversations every 15 minutes
6. **Group Member Sync**: Automatically syncs group/channel members for @mention feature

---

## Environment Setup

### Required Environment Variables

```bash
# Database (Azure PostgreSQL)
DATABASE_URL="postgresql://telegram_crm:PASSWORD@host:5432/postgres?schema=telegram_crm&sslmode=require"

# Telegram API (from https://my.telegram.org)
TELEGRAM_API_ID="12345678"
TELEGRAM_API_HASH="your_api_hash_here"

# OpenAI (for AI features)
OPENAI_API_KEY="sk-..."

# Media storage path
MEDIA_BASE_PATH="/path/to/telegram_media"
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

---

## Production Deployment

### Frontend (Railway)

The Next.js app is deployed to Railway:
- Automatic deployments from main branch
- Environment variables configured in Railway dashboard

**Deploy manually:**
```bash
railway redeploy -y
```

### Sync Worker (Railway)

Deploy from `/tmp/telegram-sync-deploy/`:

```bash
cd /tmp/telegram-sync-deploy
railway up
```

**Monitor:**
```bash
railway logs
```

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

### Release Stale Lock

```javascript
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

---

## Key Features

### Conversation Management
- View all Telegram conversations (private, groups, channels)
- Real-time message sync
- Search across all messages
- Archive, pin, and mute conversations
- Apply custom tags/labels

### AI Assistant (GPT-4 Powered)
- **Chat Tab**: Ask questions about the conversation
- **Summary Tab**: Auto-generated conversation summaries
- **Notes Tab**: Timeline of notes with different types

### Notes Timeline
- Add notes, meeting summaries, call logs
- File attachments with descriptions
- Chronological timeline view
- Date grouping (Today, Yesterday, Dec 5, etc.)
- Keyboard shortcuts (N to add note, E to edit)

### Contacts Management
- Table view with all contacts
- Type filtering (People, Groups, Channels)
- Infinite scroll (50 per load) with zero layout shift
- Server-side search with 400ms debounce
- Smart AI-powered filtering with accurate server-side counts
- Bulk tagging operations
- Deduplication on append to prevent duplicate keys

### Lightning-Fast Performance
- Smart skeleton loading (only on true initial load, never during navigation)
- Message caching (5-minute TTL)
- Instant conversation switching
- Infinite scroll for messages and contacts with fixed-height containers
- Server-side pagination and search
- World-class UX with zero layout shift during scroll loading

### Media Support
- **Inline photo display** - Photos appear directly in chat bubbles (Telegram-style)
- Photos downloaded and stored as base64 data URLs for instant display
- Click on images to view full size in new tab
- Videos show as downloadable attachments
- Documents with filename and download button
- Audio messages and voice notes
- Max 5MB photos for inline display (larger shown as downloadable)

---

## UI Components

### Skeleton Loading (`Skeleton.tsx`)
Shimmer animations while content loads:
- `ConversationSkeleton` - Conversation list items
- `MessageSkeleton` - Message bubbles
- `ContactSkeleton` - Contact table rows
- `PageSkeleton` - Full page loading state

### Conversations List (`ConversationsList.tsx`)
- Staggered slide-in animations
- Unread count badges
- Online status indicators
- Tag display

### Message View (`MessageView.tsx`)
- Infinite scroll (load older on scroll up)
- Message grouping by date
- Read receipts and delivery status
- Media rendering
- Highlighted search results
- **@mention autocomplete**: Type `@` in groups to see member dropdown (Telegram-style)

### Contacts Table (`ContactsTable.tsx`)
- Infinite scroll with fixed-height (48px) loading container
- Multi-select with bulk actions
- Inline tag editing
- Smart filter integration with server-side accurate counts
- Deduplication on append to prevent duplicate key errors
- 400ms debounced search with inline spinner
- Zero skeleton flash (only shown on true initial load)

### Smart Filter Section (`SmartFilterSection.tsx`)
- AI-powered quick filters with accurate server-side counts
- Available filters:
  - **Active 7d**: Contacts with messages in last 7 days
  - **Active 30d**: Contacts with messages in last 30 days
  - **Untagged**: Contacts without any tags
  - **High volume**: Contacts with 50+ messages
  - **New this week**: Contacts created in last 7 days
- Filter counts update dynamically with every API fetch
- No page refresh needed for accurate numbers

### AI Assistant (`AIAssistant.tsx`)
- Tabbed interface (Chat, Summary, Notes)
- Real-time streaming responses
- Notes timeline integration

---

## Performance Optimizations

### Message Loading
- **Initial load**: 50 messages (instant display)
- **Caching**: 5-minute TTL per conversation
- **Infinite scroll**: Load older messages on scroll up
- **Scroll preservation**: Maintains position when loading more

### Contacts Loading
- **Initial load**: 50 contacts with skeleton animation
- **Server-side search**: Debounced (400ms) with duplicate detection
- **Infinite scroll**: IntersectionObserver with fixed-height loading container (no layout shift)
- **Type filtering**: Server-side for accurate counts
- **Smart filter counts**: Server-calculated totals for accurate filter badges
- **Deduplication**: Prevents React duplicate key errors on append

### UI Responsiveness
- Smart skeleton loading (only on true initial load)
- Optimistic UI updates
- Staggered animations (capped at 200ms total)
- Background data refresh
- Inline search spinner instead of full-page skeleton
- Fixed-height scroll loading containers (48px) for zero layout shift

---

## Troubleshooting

### "Session not found" on Railway

Check:
1. `DATABASE_URL` is set correctly (without `?schema=xxx` for Python)
2. Session exists in `TelegramWorkerSession` table

### Messages not syncing

1. Check Railway logs: `railway logs`
2. Verify worker is running: check `/health` endpoint
3. Check for stale locks

### Slow loading

1. Check browser network tab for API response times
2. Verify pagination is working (should load 50 items)
3. Clear browser cache

### Database connection issues

1. Verify DATABASE_URL is correct
2. Check SSL mode (`sslmode=require` for Azure)
3. Test connection: `npx prisma db pull`

---

## Version History

- **v2.6** (December 2024): Inline photo display
  - Telegram-style inline images in chat bubbles
  - Photos downloaded and stored as base64 data URLs
  - Click-to-view-fullsize functionality
  - Loading spinner during image load
  - Works for both private chats and groups
- **v2.5** (December 2024): @mention autocomplete for groups
  - Telegram-style @mention dropdown in group/supergroup chats
  - GroupMember table with automatic sync via discovery loop
  - Members API endpoint (`/api/conversations/[id]/members`)
  - Prioritizes admins/creators in autocomplete results
- **v2.4** (December 2024): World-class UX - zero skeleton flash, server-side smart filter counts, zero layout shift
  - Eliminated random skeleton flash during scroll and search
  - Added server-side `quickFilterCounts` for accurate smart filter badges
  - Fixed duplicate key React errors with deduplication on append
  - Fixed-height (48px) loading container for zero layout shift
  - Smooth 400ms debounced search with inline spinner
- **v2.3** (December 2024): Lightning-fast infinite scroll for contacts and messages
- **v2.2** (December 2024): Notes Timeline feature, AI Assistant improvements
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

*Last updated: December 10, 2024*
