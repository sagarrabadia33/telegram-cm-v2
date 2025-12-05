# Telegram CRM V2 - Master Plan

**Single Source of Truth - Do Not Deviate From This Plan**

---

## 🎯 Project Vision

Build a **100x reliable, scalable, multi-source messaging CRM** with near real-time experience that never fails.

**Core principle:** Event-driven architecture that handles Telegram, WhatsApp, Slack, and any future messaging platform.

---

## 📐 Architecture Decision (LOCKED)

### **Technology Stack**

| Layer | Technology | Version | Why This Choice |
|-------|-----------|---------|-----------------|
| **Frontend** | Next.js | 16.x | Keep existing UI, proven |
| **API Gateway** | NestJS | 10.x | Enterprise Node.js, modular, WebSocket support |
| **Message Queue** | BullMQ | 5.x | Most reliable Node.js queue, Redis-backed |
| **Cache + Pub/Sub** | Redis | 7.x | In-memory speed, job persistence |
| **Database** | PostgreSQL | 16 | Already setup (Azure), ACID guarantees |
| **Real-time** | Socket.io | 4.x | WebSocket, fallback to polling |
| **Telegram SDK** | GramJS | Latest | TypeScript-native, event-driven |
| **Logging** | Pino | Latest | Structured JSON logs |
| **Observability** | Sentry | Latest | Error tracking |
| **Deployment** | Railway | - | Multi-service support |

### **Why NOT Python + Telethon**

❌ **Problems with hybrid approach:**
- Child processes can zombie
- No supervision, weak error handling
- Timeout issues (60s API limit)
- File-based sessions lose state
- 2x deployment complexity
- No type safety across boundaries

✅ **Benefits of full TypeScript:**
- Single language, type safety end-to-end
- No child processes, native async/await
- Proper supervision with NestJS
- Stateless workers, no file dependencies
- One deployment pipeline

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  FRONTEND (Next.js)                     │
│  ✅ Existing conversations UI (preserved)              │
│  🆕 Socket.io client (real-time updates)               │
└──────────┬─────────────────────────────────────────┬────┘
           │ HTTP REST                    WebSocket │
           │                                         │
┌──────────▼─────────────────────────────────────────▼────┐
│              API GATEWAY (NestJS)                       │
│  📍 REST endpoints (conversations, contacts, messages)  │
│  📍 WebSocket Gateway (Socket.io server)               │
│  📍 Enqueue jobs to BullMQ                             │
│  📍 Broadcast events to connected clients              │
│  📍 Authentication & validation                         │
└────┬─────────────────────────────────────────────┬──────┘
     │                                             │
┌────▼─────────────────┐                 ┌────────▼────────┐
│   PostgreSQL         │                 │  Redis          │
│   Schema: telegram_crm│                 │  - BullMQ jobs  │
│   - 18 tables        │                 │  - Pub/Sub      │
│   - Already created  │                 │  - Rate limits  │
└──────────────────────┘                 │  - Cache        │
                                         └────────┬────────┘
                                                  │
                     ┌────────────────────────────┼────────────┐
                     │                            │            │
            ┌────────▼──────────┐      ┌─────────▼──────┐ ┌──▼─────────┐
            │ Telegram Worker   │      │ WhatsApp       │ │ Slack      │
            │ (NestJS Process)  │      │ Worker         │ │ Worker     │
            │                   │      │ (Phase 2)      │ │ (Phase 2)  │
            │ ⚡ Event Listener │      │                │ │            │
            │ ⚡ Message Sender  │      │                │ │            │
            └───────────────────┘      └────────────────┘ └────────────┘
```

---

## 🔄 Real-Time Message Flow (How It Works)

### **Receiving Messages (Inbound)**

```
Telegram User sends message
    ↓ <100ms
Telegram Servers (Updates API push event)
    ↓
Your App - Event Listener (GramJS)
    ↓ Receives event instantly
    ↓
BullMQ Queue
    ↓ Enqueue job: 'process-incoming-message'
    ↓ Job persisted in Redis (survives crashes)
    ↓
Worker picks up job
    ↓ Find/create Contact (via SourceIdentity)
    ↓ Find/create Conversation
    ↓ Insert Message into PostgreSQL
    ↓ Emit event: 'new-message'
    ↓
WebSocket Gateway (Socket.io)
    ↓ Broadcast to subscribed clients
    ↓
Frontend receives event
    ↓ Update conversation list
    ↓ Add message to chat view
    ✓ User sees message in <500ms
```

### **Sending Messages (Outbound)**

```
User clicks "Send" in CRM UI
    ↓
POST /api/messages
    ↓ Validate request
    ↓ Enqueue job: 'send-message'
    ↓ Return: { messageId, status: 'sending' }
    ↓ <50ms response
    ↓
Frontend shows "Sending..."
    ↓
Worker picks up job
    ↓ Get contact's Telegram ID (SourceIdentity)
    ↓ Call GramJS sendMessage()
    ↓ Wait for Telegram confirmation (200-800ms)
    ↓ Update Message status: 'sent'
    ↓ Emit event: 'message-sent'
    ↓
WebSocket pushes update
    ↓
Frontend updates UI: "Sent ✓"
    ✓ User sees confirmation in <1s
```

---

## 📅 Build Timeline (4 Weeks - Phase 1)

### **Week 1: Foundation + Docker Setup**

**Day 1-2: Project Setup**
- ✅ Initialize NestJS project structure
- ✅ Set up Docker Compose (Redis + PostgreSQL local)
- ✅ Configure modules: Database, Redis, Config
- ✅ Environment configuration (dev/prod)
- ✅ Basic health check endpoint

**Day 3-4: Database Integration**
- ✅ Connect Prisma to PostgreSQL
- ✅ Create database service
- ✅ Test CRUD operations
- ✅ Set up migrations

**Day 5-7: BullMQ Setup**
- ✅ Initialize BullMQ queues
- ✅ Create base worker structure
- ✅ Test job processing
- ✅ Add Bull Board UI (job monitoring)

**Deliverable:** NestJS app running with Redis + PostgreSQL + BullMQ working

---

### **Week 2: Telegram Real-Time Sync (Inbound)**

**Day 8-9: GramJS Integration**
- 🔄 Install and configure GramJS
- 🔄 Create TelegramService module
- 🔄 Implement authentication flow
- 🔄 Store session in database (TelegramSession table)
- 🔄 Test connection to Telegram

**Day 10-12: Event Listener Implementation**
- 🔄 Set up Updates API listener
- 🔄 Handle NewMessage events
- 🔄 Create job: 'process-incoming-message'
- 🔄 Implement entity resolution (Contact ↔ SourceIdentity)
- 🔄 Store messages in PostgreSQL

**Day 13-14: Testing & Polish**
- 🔄 Test with real Telegram account
- 🔄 Handle edge cases (groups, media, edits)
- 🔄 Error handling + retry logic
- 🔄 Logging

**Deliverable:** Receive Telegram messages in real-time, stored in database

---

### **Week 3: WebSocket + Send Messages (Outbound)**

**Day 15-16: WebSocket Gateway**
- 🔄 Set up Socket.io in NestJS
- 🔄 Create EventsGateway module
- 🔄 Implement room-based subscriptions
- 🔄 Test real-time message push
- 🔄 Update Next.js frontend (add Socket.io client)

**Day 17-18: API Endpoints**
- 🔄 GET /api/conversations (list)
- 🔄 GET /api/conversations/:id (detail)
- 🔄 GET /api/conversations/:id/messages (list)
- 🔄 POST /api/messages (send message)
- 🔄 Validation with DTOs

**Day 19-21: Send Message Worker**
- 🔄 Create job: 'send-message'
- 🔄 Implement GramJS sendMessage()
- 🔄 Handle rate limits (30/sec)
- 🔄 Track message status (sending → sent → delivered)
- 🔄 Push status updates via WebSocket

**Deliverable:** Full bidirectional messaging working, real-time UI updates

---

### **Week 4: Testing + Deployment**

**Day 22-23: End-to-End Testing**
- 🔄 Test full conversation flow
- 🔄 Test with multiple conversations
- 🔄 Test error scenarios (rate limits, network failures)
- 🔄 Load testing (simulate 100 concurrent messages)

**Day 24-25: Railway Deployment**
- 🔄 Set up Railway project (API + Worker + Redis)
- 🔄 Configure environment variables
- 🔄 Deploy and test production
- 🔄 Set up monitoring (logs, error tracking)

**Day 26-28: Polish & Documentation**
- 🔄 Fix bugs from testing
- 🔄 Update API documentation
- 🔄 Write deployment guide
- 🔄 Create video walkthrough

**Deliverable:** Production-ready Telegram CRM deployed to Railway

---

## 📁 Project Structure (NestJS)

```
telegram-crm-v2/
├── src/
│   ├── app.module.ts                    # Root module
│   │
│   ├── config/                          # Configuration
│   │   ├── config.module.ts
│   │   ├── config.service.ts            # Environment vars
│   │   └── validation.schema.ts
│   │
│   ├── database/                        # Database layer
│   │   ├── database.module.ts
│   │   ├── prisma.service.ts            # Prisma client
│   │   └── migrations/
│   │
│   ├── queue/                           # BullMQ setup
│   │   ├── queue.module.ts
│   │   ├── queue.service.ts
│   │   └── processors/                  # Job processors
│   │       ├── incoming-message.processor.ts
│   │       └── send-message.processor.ts
│   │
│   ├── telegram/                        # Telegram integration
│   │   ├── telegram.module.ts
│   │   ├── telegram.service.ts          # GramJS wrapper
│   │   ├── telegram.listener.ts         # Event handler
│   │   └── telegram.worker.ts           # Background worker
│   │
│   ├── contacts/                        # Contacts API
│   │   ├── contacts.module.ts
│   │   ├── contacts.controller.ts
│   │   ├── contacts.service.ts
│   │   └── dto/
│   │
│   ├── conversations/                   # Conversations API
│   │   ├── conversations.module.ts
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   └── dto/
│   │
│   ├── messages/                        # Messages API
│   │   ├── messages.module.ts
│   │   ├── messages.controller.ts
│   │   ├── messages.service.ts
│   │   └── dto/
│   │
│   ├── websocket/                       # Real-time gateway
│   │   ├── websocket.module.ts
│   │   ├── events.gateway.ts            # Socket.io server
│   │   └── events.service.ts
│   │
│   └── main.ts                          # Bootstrap
│
├── prisma/
│   ├── schema.prisma                    # Already created
│   └── migrations/
│
├── docker-compose.yml                   # Local Redis + PostgreSQL
├── .env.local                           # Local environment
├── .env.production                      # Production env (Railway)
├── nest-cli.json                        # NestJS config
├── tsconfig.json                        # TypeScript config
└── package.json                         # Dependencies
```

---

## 🐳 Local Development Setup

### **Prerequisites**

- Node.js 18+
- Docker Desktop
- Azure PostgreSQL (already configured)

### **First-Time Setup**

```bash
# 1. Clone and install
cd telegram-crm-v2
npm install

# 2. Start local services (Redis + PostgreSQL)
docker-compose up -d

# 3. Test connections
npm run health:check

# 4. Start development
npm run start:dev

# 5. Open Bull Board (job monitoring)
open http://localhost:3000/admin/queues
```

### **Docker Compose Services**

```yaml
# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    # Used for: BullMQ jobs, caching, rate limiting

  postgres-local:
    image: postgres:16-alpine
    ports: ["5433:5432"]  # Note: 5433 to avoid conflict with Azure
    # Used for: Local testing only
    # Production uses: Azure PostgreSQL
```

### **Environment Configuration**

```bash
# .env.local (Development)
NODE_ENV=development
DATABASE_URL=postgresql://telegram_crm:PASSWORD@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require
REDIS_URL=redis://localhost:6379
TELEGRAM_API_ID=36716941
TELEGRAM_API_HASH=ae68fdd057f70a871b00c989e7131df8
TELEGRAM_PHONE_NUMBER=+917259685040

# Railway (Production) - Set in dashboard
NODE_ENV=production
DATABASE_URL=postgresql://telegram_crm:PASSWORD@qb-insights.postgres.database.azure.com:5432/postgres?schema=telegram_crm&sslmode=require
REDIS_URL=${REDIS_URL}  # Railway Redis addon
TELEGRAM_API_ID=36716941
TELEGRAM_API_HASH=ae68fdd057f70a871b00c989e7131df8
TELEGRAM_PHONE_NUMBER=+917259685040
```

---

## 🎯 Key Technical Decisions (DO NOT CHANGE)

### **1. Queue Job Types**

```typescript
// All jobs are typed and tracked
enum QueueJob {
  // Inbound
  PROCESS_INCOMING_MESSAGE = 'process-incoming-message',
  SYNC_CONVERSATION_HISTORY = 'sync-conversation-history',
  UPDATE_CONTACT_STATUS = 'update-contact-status',

  // Outbound
  SEND_MESSAGE = 'send-message',
  SEND_CAMPAIGN = 'send-campaign',
  SEND_WORKFLOW_MESSAGE = 'send-workflow-message',

  // Maintenance
  CLEANUP_OLD_JOBS = 'cleanup-old-jobs',
  REGENERATE_SUMMARY = 'regenerate-summary'
}
```

### **2. Rate Limiting Strategy**

```typescript
// Telegram: 30 messages/second
const sendMessageQueue = new Queue('send-messages', {
  limiter: {
    max: 30,
    duration: 1000,
    groupKey: 'telegram'
  }
});

// WhatsApp: 80 messages/second (Business API)
const whatsappQueue = new Queue('send-whatsapp', {
  limiter: {
    max: 80,
    duration: 1000
  }
});
```

### **3. Error Handling & Retries**

```typescript
// All jobs have automatic retry with exponential backoff
const jobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 10000  // 10s, 20s, 40s, 80s, 160s
  },
  timeout: 300000,  // 5 minutes max
  removeOnComplete: 100,   // Keep last 100 for debugging
  removeOnFail: 500        // Keep last 500 failures
};
```

### **4. WebSocket Event Types**

```typescript
// Server → Client events
enum ServerEvent {
  NEW_MESSAGE = 'new-message',
  MESSAGE_SENT = 'message-sent',
  MESSAGE_DELIVERED = 'message-delivered',
  MESSAGE_READ = 'message-read',
  TYPING_INDICATOR = 'typing',
  CONTACT_STATUS_CHANGE = 'contact-status-change'
}

// Client → Server events
enum ClientEvent {
  JOIN_CONVERSATION = 'join-conversation',
  LEAVE_CONVERSATION = 'leave-conversation',
  TYPING_START = 'typing-start',
  TYPING_STOP = 'typing-stop'
}
```

---

## 📊 Success Metrics (Goals)

| Metric | Target | How We Measure |
|--------|--------|----------------|
| **Message receive latency** | <500ms | Timestamp diff (Telegram sent → UI shown) |
| **Message send latency** | <1s | API call → "Sent ✓" shown |
| **WebSocket latency** | <100ms | Event emit → Client receive |
| **Job processing time** | <2s avg | BullMQ metrics |
| **Queue throughput** | 1000+ jobs/min | Bull Board dashboard |
| **Error rate** | <1% | Sentry error tracking |
| **Uptime** | 99.9% | Railway metrics |

---

## 🚫 What We Will NOT Do (Anti-Patterns)

1. ❌ **No polling** - All sync is event-driven
2. ❌ **No child processes** - All workers are NestJS processes
3. ❌ **No file-based state** - All state in database or Redis
4. ❌ **No synchronous APIs** - All long operations go through queue
5. ❌ **No mixed languages** - TypeScript only (except frontend)
6. ❌ **No feature creep** - Build Phase 1, then Phase 2
7. ❌ **No premature optimization** - Make it work, then make it fast

---

## 🔍 Monitoring & Observability

### **Development**

```bash
# Bull Board - Queue monitoring
http://localhost:3000/admin/queues

# Prisma Studio - Database viewer
npm run db:studio

# Logs - Structured JSON
tail -f logs/app.log | pino-pretty
```

### **Production (Railway)**

```bash
# View logs
railway logs

# Sentry errors
https://sentry.io/your-project

# Bull Board (deployed)
https://your-app.railway.app/admin/queues
```

---

## 📚 Reference Documentation

- **NestJS Docs:** https://docs.nestjs.com
- **BullMQ Docs:** https://docs.bullmq.io
- **GramJS Docs:** https://gram.js.org
- **Socket.io Docs:** https://socket.io/docs/v4/
- **Prisma Docs:** https://www.prisma.io/docs

---

## 🎯 Current Phase: Week 1 - Foundation

**Status:** ✅ PostgreSQL setup complete, Redis + NestJS next

**Next Steps:**
1. Create `docker-compose.yml`
2. Initialize NestJS project
3. Set up BullMQ
4. Test entire stack locally

**Do not proceed to Week 2 until Week 1 is 100% complete.**

---

## 📞 Questions During Development

If you encounter:
- **Architecture questions** → Refer to this README
- **Technical blockers** → Document in issues, discuss before deviating
- **Scope creep ideas** → Add to "Phase 2 backlog", do not implement now

**This README is the contract. Follow it strictly.**

---

Last Updated: November 24, 2025
Version: 2.0
Status: Phase 1 - Week 1 Started
