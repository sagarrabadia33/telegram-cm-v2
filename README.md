# Telegram CRM V2

A comprehensive CRM system that syncs Telegram conversations in real-time, providing a web interface to manage and search through all your Telegram chats with AI-powered insights.

## Quick Reference (Copy-Paste Commands)

### Terminal Setup (Run this every new terminal)

```bash
# Navigate to project
cd /Users/sagarrabadia/telegram-crm-v2

# Database URL for all Prisma commands
export DATABASE_URL="postgresql://telegram_crm:F5HCHqct6%265ug3R7@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require"
```

### Common Commands

```bash
# Frontend development
cd /Users/sagarrabadia/telegram-crm-v2/frontend
npm run dev                    # Start on http://localhost:3000

# Database operations
npx prisma db push             # Apply schema changes
npx prisma generate            # Regenerate client after schema changes
npx prisma studio              # Open database GUI

# Deploy frontend (auto-deploys via GitHub)
git add -A && git commit -m "message" && git push origin main

# Deploy sync worker
cd /tmp/telegram-sync-deploy
railway up -d                  # -d for detached (non-interactive)

# View Railway logs
cd /tmp/telegram-sync-deploy
railway logs 2>&1 | tail -50

# TypeScript check
npx tsc --noEmit
```

---

## Deployment Configuration

### Production URLs

| Service | URL |
|---------|-----|
| Frontend | https://telegram-cm-v2-production.up.railway.app |
| Sync Worker Health | http://telegram-sync-worker.railway.internal:8080/health |
| Analytics | https://telegram-cm-v2-production.up.railway.app/analytics |

### Railway Project Structure

```
Railway Project: telegram-crm-v2
├── telegram-crm-v2-frontend    # Next.js app (auto-deploys from GitHub)
│   ├── Source: GitHub repo main branch
│   ├── Build: npm run build
│   └── Start: npm run start
│
└── telegram-sync-worker        # Python worker (manual deploy)
    ├── Source: /tmp/telegram-sync-deploy (NOT Git!)
    ├── Build: Docker (Dockerfile in folder)
    └── Start: python main.py
```

### Environment Variables

**Frontend (Railway Dashboard > telegram-crm-v2-frontend > Variables):**
```
DATABASE_URL=postgresql://telegram_crm:F5HCHqct6%265ug3R7@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require
OPENAI_API_KEY=sk-...
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash
```

**Sync Worker (Railway Dashboard > telegram-sync-worker > Variables):**
```
DATABASE_URL=postgresql://telegram_crm:F5HCHqct6%265ug3R7@qb-insights.postgres.database.azure.com:5432/postgres?sslmode=require
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_hash
```

> **Note**: Worker DATABASE_URL does NOT have `?schema=telegram_crm`. Python sets `search_path = telegram_crm` explicitly.

### Deploy Sync Worker (Step-by-Step)

```bash
# 1. Navigate to deploy directory (NOT the git repo!)
cd /tmp/telegram-sync-deploy

# 2. Make sure you're logged into Railway
railway whoami   # Should show your account

# 3. Link to project (only needed once)
railway link     # Select telegram-crm-v2 project, then telegram-sync-worker service

# 4. Deploy
railway up -d    # -d runs in background

# 5. Monitor logs
railway logs 2>&1 | tail -50
```

### Sync Worker Files (/tmp/telegram-sync-deploy/)

| File | Purpose |
|------|---------|
| main.py | Entry point, HTTP health server, download endpoint |
| realtime_listener.py | Telethon listener, message sync, outbox processing |
| lock_manager.py | Distributed locking, stale lock cleanup |
| session_manager.py | Load/save Telegram session from DB |
| Dockerfile | Container build config |
| railway.toml | Railway deployment config |
| requirements.txt | Python dependencies |

### Current Sync Worker Version

```
v2.5.5-20251211
- BytesIO with .name attribute for inline photo display
- Message reactions with persistence
- Outgoing message queue processing
- Group member sync for @mentions
```

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Tech Stack](#tech-stack)
- [Key Features](#key-features)
- [Frontend Architecture](#frontend-architecture)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Telegram Sync System](#telegram-sync-system)
- [Local Development](#local-development)
- [Operational Runbook](#operational-runbook)
- [Troubleshooting](#troubleshooting)
- [Version History](#version-history)

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
│   │  • OutgoingMessage / OutgoingReaction (outbox queues)        │   │
│   └─────────────────────────────────────────────────────────────┘   │
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
│   │   │   ├── conversations/   # Conversation CRUD + notes + chat + reactions
│   │   │   ├── contacts/        # Contacts with pagination + search + smart filter
│   │   │   ├── media/           # Media file serving + on-demand download
│   │   │   ├── sync/            # Sync control endpoints
│   │   │   ├── analytics/       # Analytics dashboard API
│   │   │   ├── upload/          # File upload handling
│   │   │   └── tags/            # Tag management
│   │   ├── components/          # React components
│   │   │   ├── AIAssistant.tsx  # AI chat + notes timeline panel
│   │   │   ├── ContactsTable.tsx # Contacts with infinite scroll
│   │   │   ├── ConversationsList.tsx # Conversations with caching
│   │   │   ├── MessageView.tsx  # Messages with reactions + @mentions
│   │   │   ├── AnalyticsDashboard.tsx # 3-tab analytics UI
│   │   │   └── ...
│   │   ├── lib/analytics/       # Analytics client + server
│   │   ├── types/               # TypeScript type definitions
│   │   ├── analytics/page.tsx   # Analytics dashboard route
│   │   └── page.tsx             # Main dashboard (3-panel layout)
│   ├── prisma/                  # Database schema
│   │   └── schema.prisma        # Prisma schema definition
│   └── public/                  # Static assets
│
├── telegram-sync-worker/        # Reference copy (NOT deployed from here!)
│   └── ...                      # See /tmp/telegram-sync-deploy for prod
│
└── README.md                    # This file

/tmp/telegram-sync-deploy/       # PRODUCTION WORKER (NOT in Git!)
├── main.py                      # Worker entry point + HTTP server
├── realtime_listener.py         # Real-time listener (v2.5.5)
├── lock_manager.py              # Distributed locking
├── session_manager.py           # Session management
├── Dockerfile                   # Container build
├── railway.toml                 # Railway config
└── requirements.txt             # Python dependencies
```

> **CRITICAL**: The Railway worker deploys from `/tmp/telegram-sync-deploy/`, NOT from the Git repo!

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
| aiohttp | 3.x | HTTP server for health + media |

### Infrastructure

| Service | Purpose |
|---------|---------|
| Railway | Frontend + Sync worker hosting |
| Azure PostgreSQL | Database (telegram_crm schema) |

---

## Key Features

### Message Reactions (v2.9)
- Telegram-style emoji reactions: 👍 ❤️ 🔥 🙏 😍 👎
- Hover to show reaction picker
- Click to toggle reaction
- One reaction per user (Telegram rule)
- Real-time persistence via OutgoingReaction queue

### Clipboard Paste Screenshots (v2.9.3)
- Ctrl+V / Cmd+V to paste screenshot directly
- Shows preview before sending
- Sends inline to both sender and receiver
- Works in private chats AND groups
- Filename: `screenshot_2025-12-11T11-20-35.png`

### Inline Photo Display (v2.7)
- Photos appear directly in chat bubbles
- On-demand download from Telegram API
- Blur preview with thumbnail while loading
- Per-image error handling with 2x auto-retry
- Click to view full size

### @Mention Autocomplete (v2.5)
- Type `@` in groups to trigger dropdown
- Shows group members with username/name
- Keyboard navigation (↑↓ Enter Escape)
- Admins shown first
- 526 members synced across 7 groups

### Smooth Upload Animation (v2.9.1)
- Fade + slide-up for new messages
- Scale + fade for attachment preview
- Pulse animation during upload

### AI Assistant (GPT-4 Powered)
- **Chat Tab**: Ask questions about conversation
- **Summary Tab**: Auto-generated summaries
- **Notes Tab**: Timeline of notes with types

### Analytics Dashboard (v2.8)
- 3 tabs: Overview | Core Features | Errors
- Linear-style dark theme
- Custom SVG charts
- Production-only tracking

---

## Frontend Architecture

### Views

1. **Messages View** (default) - 3-panel layout:
   - Left: Conversations list with search, filters, tags
   - Middle: Message view with reactions, @mentions
   - Right: AI Assistant panel

2. **Contacts View** - Full-width table:
   - Infinite scroll (50 per load)
   - Server-side search and filtering
   - Smart AI-powered filters
   - Bulk tagging

### State Management

- **Messages**: Cached with 5-minute TTL, preserves optimistic messages during refresh
- **Conversations**: Auto-refresh on sync
- **Contacts**: Server-side pagination with search

### Optimistic Updates

Messages sent show instantly without waiting for server:
1. Add message with `temp-{timestamp}` ID and `status: 'sending'`
2. Background refresh merges with optimistic messages (prevents flickering)
3. Status updates when worker processes outbox

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| Conversation | Chat metadata, tags, unread count |
| Message | All synced messages with reactions JSON |
| Contact | User information |
| ConversationNote | Notes timeline entries |
| Tag | User-defined labels |
| GroupMember | Group members for @mention |

### Outbox Tables (Linear-style queue)

| Table | Purpose |
|-------|---------|
| OutgoingMessage | Queued messages to send |
| OutgoingReaction | Queued reactions to send |
| FileUpload | Uploaded files with base64 data |

### Sync Management

| Table | Purpose |
|-------|---------|
| SyncLock | Distributed locking (2-min stale threshold) |
| TelegramWorkerSession | Session data (~229KB binary) |

---

## API Reference

### Messages

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations/[id]/messages` | GET | Get messages (paginated) |
| `/api/conversations/[id]/send` | POST | Send message (queues to outbox) |
| `/api/conversations/[id]/reactions` | POST | Add/remove reaction |

### Media

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/media/download` | GET | On-demand Telegram media download |
| `/api/media/outgoing/[key]` | GET | Serve uploaded files |
| `/api/upload` | POST | Upload file for sending |

### Members (@mention)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/conversations/[id]/members` | GET | Get group members |

---

## Telegram Sync System

### How It Works

1. **Session**: Stored in `TelegramWorkerSession` table
2. **Connection**: Telethon connects to Telegram MTProto
3. **Real-time**: Persistent connection for instant updates
4. **Outbox Processing**: Polls `OutgoingMessage` and `OutgoingReaction` every 0.5-5 seconds

### Outbox Pattern

```
User sends message → POST /api/send → OutgoingMessage (status: pending)
                                              ↓
                    Worker polls → Claims with lock → Telethon send_message
                                              ↓
                    Success → status: sent → Message created in DB
```

### 100x Reliability Features

1. **Stale Lock Cleanup**: Auto-releases locks from dead containers
2. **Self-Healing**: `[SELF-HEAL]` logs show automatic recovery
3. **Heartbeat**: Updates every 30 seconds
4. **Auto-retry**: 3 retries with exponential backoff
5. **BytesIO Fix**: v2.5.5 uses `.name` attribute for inline photos

---

## Local Development

### Frontend

```bash
cd /Users/sagarrabadia/telegram-crm-v2/frontend

# Install dependencies
npm install

# Set environment
export DATABASE_URL="postgresql://telegram_crm:F5HCHqct6%265ug3R7@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require"

# Generate Prisma client
npx prisma generate

# Start dev server
npm run dev
# → http://localhost:3000
```

### Database

```bash
# Apply schema changes
npx prisma db push

# Open GUI
npx prisma studio

# Pull existing schema
npx prisma db pull
```

### TypeScript Check

```bash
npx tsc --noEmit
```

---

## Operational Runbook

### Check Worker Health

```bash
cd /tmp/telegram-sync-deploy
railway logs 2>&1 | tail -50
```

Look for:
- `[INFO] Lock heartbeat updated` - Worker is alive
- `[INFO] [REACTIONS] PERSISTED` - Reactions working
- `[SELF-HEAL]` - Auto-recovery happened

### Release Stale Lock

```bash
cd /Users/sagarrabadia/telegram-crm-v2/frontend

DATABASE_URL="postgresql://telegram_crm:F5HCHqct6%265ug3R7@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require" npx tsx -e '
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
await prisma.$executeRaw`DELETE FROM "SyncLock" WHERE "lockType" = ${"listener"}`;
console.log("Lock released!");
await prisma.$disconnect();
'
```

### Redeploy Sync Worker

```bash
cd /tmp/telegram-sync-deploy
railway up -d
```

### View Recent Errors

```bash
cd /tmp/telegram-sync-deploy
railway logs 2>&1 | grep -i "error\|ERROR\|failed" | tail -20
```

---

## Troubleshooting

### Message disappears then reappears after sending

**Cause**: Background refresh replaces optimistic message before it's in DB.

**Fixed in**: v2.9.4 - `mergeWithOptimistic()` preserves `temp-*` messages during refresh.

### "Session not found" on Railway

1. Check `TelegramWorkerSession` table has session data
2. Verify DATABASE_URL doesn't have `?schema=` for Python

### Reactions not persisting

1. Check logs for `[REACTIONS] PERSISTED`
2. If missing, check for `column "updatedAt" does not exist` error
3. Message table has `timestamp` not `updatedAt`

### Photos show as "unnamed" in Telegram

**Fixed in**: v2.5.5 - Use `io.BytesIO(data)` with `buffer.name = "photo.jpg"`

---

## Version History

### v2.9.4 (December 11, 2024) - CURRENT
- Fix message flickering after send (preserve optimistic messages)
- Comprehensive README with deployment config

### v2.9.3 (December 11, 2024)
- Clipboard paste-to-send screenshots (Ctrl+V/Cmd+V)
- Works in private chats AND groups

### v2.9.2 (December 11, 2024)
- Inline photo fix - BytesIO with `.name` for Telegram display (v2.5.5 sync worker)

### v2.9.1 (December 11, 2024)
- UI cleanup - removed non-functional emoji button
- Smooth upload animations (3 CSS keyframes)

### v2.9 (December 11, 2024)
- Message reactions with full persistence
- Telegram-compliant: 1 reaction per user
- v2.5.3 sync worker with reaction loop

### v2.8 (December 2024)
- Analytics dashboard (3-tab Linear-style UI)
- Production-only event tracking

### v2.7 (December 2024)
- On-demand media download with blur preview
- Per-image error handling with auto-retry

### v2.6 (December 2024)
- Inline photo display in chat bubbles

### v2.5 (December 2024)
- @mention autocomplete for groups
- GroupMember table with auto-sync

### v2.4 (December 2024)
- World-class UX - zero skeleton flash
- Server-side smart filter counts

### v2.0 (December 2024)
- Complete rewrite with Next.js 15
- Railway worker with 100x reliability

---

## Database Connection Details

| Component | Format |
|-----------|--------|
| Next.js (Prisma) | `?schema=telegram_crm&sslmode=require` |
| Python Worker | `?sslmode=require` (no schema, sets search_path) |

### Connection String

```
Host: qb-insights.postgres.database.azure.com
Port: 5432
Database: postgres
Schema: telegram_crm
User: telegram_crm
Password: F5HCHqct6&5ug3R7
```

> **URL-encoded password**: `F5HCHqct6%265ug3R7` (& becomes %26)

---

*Last updated: December 11, 2024*
*Sync Worker Version: v2.5.5-20251211*
