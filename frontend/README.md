# Telegram CRM Frontend

A Next.js 16 application providing a Telegram CRM with AI-powered conversation intelligence for Customer Groups and Partners.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Database**: PostgreSQL (Azure) with Prisma ORM
- **AI**: Anthropic Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Styling**: CSS Variables (Linear-inspired dark theme)
- **Deployment**: Railway (frontend) + Python sync worker

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run development server
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) (port 3001 if 3000 is occupied)

**Default View**: Contacts (CRM-first experience)

## Architecture Overview

### Homepage: AI-Powered Inbox Zero Dashboard

The homepage (`/`) is an **Inbox Zero Dashboard** that helps users manage Telegram conversations efficiently using AI-powered triage.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Thursday, December 12                                                  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │        7 items need your attention                                │ │
│  │        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ (progress bar)             │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  🔴 RESPOND (17)                                  📋 COMMITMENTS       │
│  ───────────────                                  ─────────────────    │
│  People waiting on you                                                  │
│                                                                         │
│  ┌─────────────────────────────────────────┐     ⏰ OVERDUE            │
│  │ Jessica Chen · Hot Lead · 2d            │     • Send pricing to     │
│  │ "Can you send pricing details?"         │       Jessica (2d ago)    │
│  │ ⚡ You promised pricing 2 days ago      │                           │
│  │ [Click to expand draft reply]           │     📅 DUE TODAY          │
│  └─────────────────────────────────────────┘     • Follow up with      │
│                                                    Laura               │
│  📌 REVIEW (4)                                                         │
│  ───────────────                                                        │
│  Good to know, may need acknowledgment                                  │
│                                                                         │
│  ✓ CLEAR (28)                                                          │
│  ───────────────                                                        │
│  Group chatter, concluded conversations                                 │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📭 28 conversations across groups                               │   │
│  │                  [✓ Mark All as Read]                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Three-Bucket Triage System

1. **RESPOND** (Red): User must take action
   - Unanswered questions/requests from contacts
   - Unfulfilled commitments user made
   - Direct @mentions
   - Customer complaints

2. **REVIEW** (Blue): FYI, may need acknowledgment
   - Used sparingly for genuinely ambiguous cases
   - Updates that might need response

3. **CLEAR** (Green): No action needed
   - Concluded conversations
   - Acknowledgments ("ok", "thanks", "ty bro")
   - Group messages without direct involvement

---

## Key Features

### 1. AI-Powered Conversation Triage

**Location**: `app/api/inbox-zero/triage/route.ts`

Uses Claude AI with Speech Act Theory to classify conversations:

- **DIRECTIVE**: Request requiring action ("Can you...", "please let me know...")
- **COMMISSIVE**: Promise/commitment ("I'll send...", "Will do")
- **EXPRESSIVE**: Acknowledgment ("Thanks", "ok", "agreed")
- **ASSERTIVE**: Information/statement ("Done", "Here's the link")

**Models Used**:
- **Sonnet 4**: For tagged contacts (higher accuracy)
- **Haiku 3.5**: For untagged conversations (faster)

### 2. Cross-Conversation Context Resolution

**Location**: `app/lib/inbox-zero/context-resolver.ts`

Implements entity resolution to understand context across conversations:

- **Entity Resolution**: Links contacts across private chats and groups by Telegram username
- **Open Loop Tracking**: Detects unfulfilled requests and matches them to resolutions in other conversations
- **Topic-Based Matching**: Uses semantic keywords (access, telegram, payment, meeting, fix) to connect related messages
- **Cross-Conversation Override**: Automatically clears private chats when issues were addressed in related groups

**Example**: If Clint asks "please let me know when access has been restored" in private chat, and user later addresses this in a group chat with "@cmenendez69 welcome back", the system automatically marks the private chat as `clear`.

### 3. Conversation State Tracking

Each conversation has a state:
- `waiting_on_them`: Ball in their court
- `waiting_on_you`: User needs to respond
- `concluded`: Conversation naturally ended
- `ongoing`: Active back-and-forth

### 4. Commitment Tracking

**Location**: `app/api/inbox-zero/commitments/route.ts`

Extracts and tracks promises from messages:
- **Outbound**: Commitments user made to contacts
- **Inbound**: Promises contacts made to user
- Due date extraction and overdue detection

### 5. AI Draft Reply Generation

**Location**: `app/api/inbox-zero/draft/route.ts`

Generates contextually appropriate replies:
- Matches user's writing style
- Tag-aware strategies (Hot Lead vs Customer vs Partner)
- Tone selection: casual, professional, warm, empathetic
- Returns `[NO_REPLY_NEEDED]` when conversation is concluded

### 6. Speed Optimizations

- **In-Memory Caching**: 5-minute TTL keyed by conversation+lastMessageId
- **Parallel Batch Processing**: 5 conversations processed concurrently
- **Background Commitment Extraction**: Doesn't block triage response
- **Model Selection**: Haiku for untagged (faster), Sonnet for tagged (accurate)

**Performance**: ~1.5 seconds per conversation average

---

## File Structure

```
app/
├── page.tsx                          # Main page (default: Contacts view)
├── lib/
│   ├── prisma.ts                     # Prisma client singleton
│   └── inbox-zero/
│       ├── prompts.ts                # AI prompts (triage, draft, commitment)
│       └── context-resolver.ts       # Cross-conversation entity resolution
├── api/
│   ├── ai/
│   │   ├── analyze-conversations/
│   │   │   └── route.ts              # POST AI analysis (Customer Groups + Partners)
│   │   └── auto-analyze/
│   │       └── route.ts              # GET auto-triggered analysis
│   ├── conversations/
│   │   ├── route.ts                  # GET conversations list
│   │   └── [id]/
│   │       ├── route.ts              # GET/PATCH single conversation
│   │       ├── notes/route.ts        # GET/POST notes (triggers re-analysis)
│   │       ├── send/route.ts         # POST send message
│   │       ├── summary/route.ts      # GET AI summary
│   │       └── tags/route.ts         # GET/POST tags
│   ├── tags/route.ts                 # GET tags with AI config
│   └── inbox-zero/
│       ├── route.ts                  # GET dashboard data
│       ├── triage/route.ts           # POST trigger AI triage
│       ├── draft/route.ts            # POST generate draft reply
│       ├── commitments/route.ts      # GET/POST commitments
│       └── suggestions/route.ts      # GET tag suggestions
└── components/
    ├── ContactsTable.tsx             # Contacts list with AI action badges
    ├── ContactModal.tsx              # Contact details with AI Assistant tab
    ├── ConversationsList.tsx         # Messages view conversations
    ├── MessageThread.tsx             # Message display with media
    └── inbox-zero/
        ├── InboxZeroDashboard.tsx    # Main dashboard component
        ├── ProgressHeader.tsx        # Progress bar with counts
        ├── TriageSection.tsx         # Bucket section container
        ├── TriageCard.tsx            # Individual conversation card
        ├── DraftReplyEditor.tsx      # Expandable draft with tone selector
        ├── ToneSelector.tsx          # Tone picker component
        ├── ClearSection.tsx          # Compact clear bucket
        ├── CommitmentsPanel.tsx      # Right sidebar commitments
        └── AllCaughtUpState.tsx      # Empty state celebration
```

---

## Database Schema (Inbox Zero)

### MessageTriage
```prisma
model MessageTriage {
  id                String    @id @default(cuid())
  conversationId    String    @unique

  bucket            String    // 'respond' | 'review' | 'clear'
  confidence        Float
  reason            String?
  priorityScore     Int       // 1-10

  isDirectMention   Boolean
  isQuestion        Boolean
  hasOverduePromise Boolean
  isComplaint       Boolean

  conversationState String?   // 'waiting_on_them' | 'waiting_on_you' | 'concluded' | 'ongoing'
  suggestedAction   String?   // 'reply' | 'follow_up' | 'wait' | 'close'

  draftReply        String?
  draftTone         String?   @default("casual")

  status            String    @default("pending") // 'pending' | 'actioned' | 'snoozed'

  conversation      Conversation @relation(...)
}
```

### Commitment
```prisma
model Commitment {
  id                String    @id @default(cuid())
  conversationId    String

  content           String    // What was promised
  extractedFrom     String?   // Original quote
  dueDate           DateTime?
  direction         String    // 'outbound' | 'inbound'
  status            String    @default("pending")
  confidence        Float?

  conversation      Conversation @relation(...)
}
```

### TagSuggestion
```prisma
model TagSuggestion {
  id                String    @id @default(cuid())
  conversationId    String
  tagId             String

  reason            String
  confidence        Float
  signalType        String?   // 'buying_signal' | 'relationship' | 'intent'
  status            String    @default("pending")

  conversation      Conversation @relation(...)
  tag               Tag @relation(...)
}
```

---

## API Endpoints

### GET /api/inbox-zero
Returns dashboard data with bucketed conversations, commitments, and suggestions.

### POST /api/inbox-zero/triage
Triggers AI triage for conversations.
```json
{
  "conversationIds": ["id1", "id2"],  // Optional - specific IDs
  "forceRefresh": false               // Force re-triage
}
```

Response includes timing metrics:
```json
{
  "processed": 50,
  "results": [...],
  "timing": {
    "durationMs": 77486,
    "avgPerConversation": 1548,
    "cachedCount": 0,
    "crossConvOverrides": 1
  }
}
```

### POST /api/inbox-zero/draft
Generates AI draft reply.
```json
{
  "conversationId": "...",
  "tone": "casual"  // casual | professional | warm | empathetic
}
```

### PATCH /api/inbox-zero/triage/[conversationId]
Updates triage status (actioned, snoozed, dismissed).

---

## AI Prompts

### Triage Prompt Key Rules

Located in `app/lib/inbox-zero/prompts.ts`:

1. **CLEAR when**: THEM sent acknowledgment after USER delivered something
2. **RESPOND when**: THEM sent unfulfilled request, or USER made unfulfilled commitment
3. **REVIEW is RARE**: Only for genuinely ambiguous cases
4. **Bias**: When uncertain, prefer CLEAR over REVIEW, RESPOND over REVIEW

### Cross-Conversation Context

The triage system includes cross-conversation context in the prompt:
```
=== CROSS-CONVERSATION CONTEXT ===
This contact has 2 other conversations.
Recent activity in groups: "Kreatibong & Beast" (Yep, starting tomorrow...)
Open requests from this contact: "please let me know when access..."
```

---

## Design System

Uses Linear-inspired dark theme with CSS variables:

| Element | Variable |
|---------|----------|
| Background | `--bg-primary` (#0A0A0B) |
| Card | `--bg-secondary` (#0F0F10) |
| Border | `--border-subtle` (#1E1E20) |
| RESPOND | `--error` (#D25E65) |
| REVIEW | `--info` (#08AEEA) |
| CLEAR | `--success` (#2AF598) |
| Accent | `--accent-primary` (#5E6AD2) |

---

## Environment Variables

```env
DATABASE_URL="postgresql://..."
ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Development Commands

```bash
# Start dev server
npm run dev

# Generate Prisma client after schema changes
npx prisma generate

# Push schema to database
npx prisma db push

# View database
npx prisma studio
```

---

## Recent Improvements (Dec 2025)

### Inbox Zero System
1. **Cross-Conversation Context Resolution**: Entity resolution links contacts across conversations, automatically clearing private chats when issues are addressed in groups

2. **Speed Optimizations**: Caching, parallel processing, model selection optimization (~1.5s per conversation)

3. **Stricter Triage Criteria**: Review bucket reduced from many items to only 4 genuinely ambiguous cases

4. **Speech Act Theory**: AI uses linguistic theory (DIRECTIVE, COMMISSIVE, EXPRESSIVE, ASSERTIVE) for accurate classification

5. **Conversation State Tracking**: waiting_on_them, waiting_on_you, concluded, ongoing states

6. **Topic-Based Semantic Matching**: Keywords for access, telegram, payment, meeting, fix to connect related messages across conversations

### Customer Groups AI Intelligence
7. **Full AI Intelligence Pipeline**: Action badges, urgency levels, health scores, lifecycle stages for all Customer Group conversations

8. **Cross-Chat Intelligence**: Private DM context included in group chat analysis to avoid false escalations

9. **Pre-Computed Intelligence**: Temporal signals, sentiment analysis, frustration detection before AI prompt

10. **Smart Re-Analysis Triggers**: Auto re-analyze on new messages or notes added

### Partner Intelligence System (NEW)
11. **Partner-Specific AI**: Dedicated intelligence layer for Partner relationships with different urgency rules and actions

12. **Aggressive Urgency Calibration**: Partners use context-aware urgency (critical/high/medium/low) with stricter thresholds

13. **Relationship Stage Tracking**: nurturing → high_potential → active → committed → dormant

14. **Partner Actions**: Reply Now, Schedule Call, Send Intro, Follow Up, Nurture, On Track

15. **Inbound Lead Weighting**: Partners who reach out first get higher urgency prioritization

16. **Risk Detection**: Automatic flagging of cooling relationships, competitor mentions, declined meetings

### UX Improvements
17. **Contacts as Default View**: Homepage now defaults to Contacts (CRM-first experience) instead of Messages

18. **AI Action Badges**: Visual indicators on ContactsTable showing recommended actions with urgency colors

19. **AI Assistant Tab**: Contact modal includes AI Assistant tab with full intelligence display

---

## Customer Groups AI Intelligence System

A world-class AI-powered intelligence layer for Customer Group conversations. Provides reliable, accurate next actions and summaries by analyzing group chats, private DMs, and internal notes.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI INTELLIGENCE PIPELINE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │   GROUP     │   │   PRIVATE   │   │  INTERNAL   │   │    PRE-     │    │
│  │   CHAT      │ + │   CHAT      │ + │   NOTES     │ + │  COMPUTED   │    │
│  │  MESSAGES   │   │  CONTEXT    │   │             │   │   INTEL     │    │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│         │                 │                 │                 │            │
│         └────────────────┬┴─────────────────┴─────────────────┘            │
│                          ▼                                                 │
│                 ┌────────────────┐                                         │
│                 │  CLAUDE AI     │                                         │
│                 │  (Sonnet 4)    │                                         │
│                 └────────┬───────┘                                         │
│                          ▼                                                 │
│         ┌────────────────────────────────────┐                            │
│         │         AI OUTPUT                   │                            │
│         │  • Action (Reply Now, Escalate...) │                            │
│         │  • Urgency (critical/high/med/low) │                            │
│         │  • Summary (what's happening)      │                            │
│         │  • Next Step (specific action)     │                            │
│         │  • Health Score (0-100)            │                            │
│         │  • Lifecycle Stage                 │                            │
│         └────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `app/api/ai/analyze-conversations/route.ts` | Main analysis endpoint with full intelligence extraction |
| `app/api/ai/auto-analyze/route.ts` | Auto-triggered analysis for new messages/notes |
| `app/components/ContactsTable.tsx` | Displays AI action badges and tooltips |
| `app/components/ContactModal.tsx` | Contact details with AI Assistant tab |

### Cross-Conversation Intelligence

**The Problem**: Issues raised in group chats may be resolved in Shalin's private DMs with customers. Without cross-referencing, the AI would incorrectly flag resolved issues as urgent.

**The Solution**: For every group conversation analysis, the system:

1. **Identifies customer members** in the group (excluding team members)
2. **Finds Shalin's private chats** with those customers using `externalUserId` matching
3. **Fetches recent private messages** (last 30 messages)
4. **Includes private context in AI prompt** with explicit instructions to consider it

```typescript
// From app/api/ai/analyze-conversations/route.ts
async function fetchPrivateChatContext(groupMembers, conversationTitle) {
  // Filter out team members
  const customerMembers = groupMembers.filter(m => !isTeamMember(m));

  // Find private chats with these customers
  const privateChats = await prisma.conversation.findMany({
    where: {
      type: 'private',
      OR: [
        { members: { some: { externalUserId: { in: customerUserIds } } } },
        { externalChatId: { in: customerUserIds } }
      ]
    }
  });

  // Format for AI prompt
  return formatPrivateChatContext(privateChats);
}
```

**Example Impact**:

| Scenario | Without Cross-Chat | With Cross-Chat |
|----------|-------------------|-----------------|
| Payment issue in group, resolved in DM | "Escalate - Payment ignored 27 days!" | "Reply Now - Shalin addressed privately, acknowledge in group" |
| Customer cancelled but partnership discussed in DM | "Escalate - No response 28 days!" | "On Track - Partnership call scheduled privately" |
| Customer paused, Shalin checking in via DM | "Escalate - Dormant customer!" | "Check In - Shalin already reaching out privately" |

### Pre-Computed Intelligence

Before sending to Claude, the system extracts reliable intelligence from messages:

```typescript
interface ConversationIntelligence {
  // Temporal signals
  daysSinceLastCustomerMessage: number;
  daysSinceLastTeamResponse: number;
  customerWaiting: boolean;           // Critical for urgency
  lastSpeaker: 'customer' | 'team' | 'bot';

  // Engagement
  messageVelocity: { last7Days, previous7Days, trend };

  // Sentiment
  recentSentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  sentimentTrajectory: 'improving' | 'stable' | 'deteriorating';
  frustrationSignals: string[];       // Only recent, unresolved

  // Urgency
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  urgencyKeywords: string[];
  hasExternalPressure: boolean;       // "my client", "deadline"

  // Health
  healthScore: number;                // 0-100
  healthFactors: { responsiveness, sentiment, engagement, resolution };
  lifecycleStage: 'onboarding' | 'active' | 'at_risk' | 'dormant' | 'churning';

  // Action items
  unansweredQuestions: string[];
  potentialOpenItems: string[];
  criticalInsights: string[];
}
```

### AI Action Badges

| Action | When Used | Color |
|--------|-----------|-------|
| **Reply Now** | Customer waiting for response | Red |
| **Escalate** | Needs owner attention (critical issues) | Red |
| **Check In** | Dormant customer, worth a touchpoint | Yellow |
| **Schedule Call** | Complex issue needs discussion | Yellow |
| **Send Resource** | Customer needs docs/education | Blue |
| **Monitor** | Watching but no action needed | Gray |
| **On Track** | Everything good, no action needed | Green |

### Smart Re-Analysis Triggers

Analysis is automatically re-triggered when:

1. **New messages arrive**: Compares `lastSyncedMessageId` vs `aiLastAnalyzedMsgId`
2. **Notes are added**: Clears `aiLastAnalyzedMsgId` to force re-analysis
3. **Staleness check**: Conversations analyzed >24 hours ago with new activity

```typescript
// From app/api/conversations/[id]/notes/route.ts
// When a note is added, trigger re-analysis
await prisma.conversation.update({
  where: { id: conversationId },
  data: { aiLastAnalyzedMsgId: null }  // Forces re-analysis
});
```

### Database Fields

```prisma
model Conversation {
  // AI Analysis Results
  aiAction              String?   // "Reply Now", "Escalate", "On Track", etc.
  aiUrgencyLevel        String?   // "critical", "high", "medium", "low"
  aiSummary             String?   // What's happening
  aiSuggestedAction     String?   // Specific next step

  // Pre-computed Intelligence
  aiHealthScore         Int?      // 0-100
  aiHealthFactors       Json?     // { responsiveness, sentiment, engagement, resolution }
  aiLifecycleStage      String?   // "onboarding", "active", "at_risk", "dormant", "churning"
  aiSentiment           String?   // "positive", "negative", "neutral", "mixed"
  aiSentimentTrajectory String?   // "improving", "stable", "deteriorating"
  aiFrustrationSignals  String[]  // Recent frustration indicators
  aiCriticalInsights    String[]  // Pre-computed actionable insights

  // Analysis State
  aiLastAnalyzedMsgId   String?   // Last message ID analyzed
  aiAnalyzedAt          DateTime? // When last analyzed
  aiAnalyzing           Boolean   @default(false)
}
```

### Tag-Level AI Configuration

Each tag can have custom AI settings:

```prisma
model Tag {
  aiEnabled           Boolean   @default(true)
  aiSystemPrompt      String?   // Custom prompt (replaces default)
  aiTeamMembers       String[]  // ["Jesus", "Prathamesh"]
  aiOwnerNames        String[]  // ["Shalin"]
  aiAnalysisInterval  Int?      // Minutes between auto-analysis
}
```

### API Endpoints

#### POST /api/ai/analyze-conversations
Analyze conversations for a tag or specific IDs.

```json
{
  "tagId": "cmj1dy1ta001bms0fcxontomu",
  "conversationIds": ["id1", "id2"],  // Optional
  "forceRefresh": true                 // Force re-analysis
}
```

Response:
```json
{
  "processed": 30,
  "analyzed": 29,
  "skipped": 0,
  "failed": 1,
  "results": [
    {
      "conversationId": "...",
      "title": "Cloudlet | Beast Insight",
      "action": "Reply Now",
      "urgency": "high",
      "success": true
    }
  ],
  "timing": {
    "durationMs": 255816,
    "avgPerConversation": 8527
  }
}
```

#### GET /api/ai/auto-analyze
Check for stale conversations needing re-analysis.

#### POST /api/conversations/[id]/chat
AI chat interface for deep conversation analysis.

```json
{
  "message": "What are the key issues with this customer?",
  "deepAnalysis": true  // Include full context
}
```

### Validation

Run the validation script to verify analysis accuracy:

```bash
DATABASE_URL="..." node scripts/validate-full-analysis.js
```

Output shows each conversation with:
- Last speaker (TEAM/CUST)
- Days since last message
- AI Action and Urgency
- Summary and Suggested Action
- Flags for potential issues (e.g., customer waiting but low urgency)

### Performance

- **30 conversations**: ~4 minutes (with cross-chat lookups)
- **Per conversation**: ~8 seconds average
- **Model**: Claude Sonnet 4 (`claude-sonnet-4-20250514`)
- **Max tokens**: 600-700 per analysis

---

## Partner Intelligence System

A parallel AI intelligence layer for Partner relationships. Partners are referral sources (payment processors, ISOs, industry friends, existing customers who give referrals) with different relationship dynamics than Customer Groups.

### Partner vs Customer Groups

| Aspect | Customer Groups | Partner |
|--------|----------------|---------|
| Relationship | Support/Success | Business Development |
| Value Exchange | Paid subscription | 5% lifetime revenue share for referrals |
| Communication Style | Problem resolution | Relationship nurturing |
| Key Metrics | Health score, churn risk | Network value, referral potential |
| Urgency Focus | Response time, issue resolution | Opportunity management, relationship cooling |

### Partner Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PARTNER INTELLIGENCE PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐    │
│  │   GROUP     │   │   PRIVATE   │   │  INTERNAL   │   │    PRE-     │    │
│  │   CHAT      │ + │   CHAT      │ + │   NOTES     │ + │  COMPUTED   │    │
│  │  MESSAGES   │   │  CONTEXT    │   │             │   │   INTEL     │    │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘    │
│         │                 │                 │                 │            │
│         └────────────────┬┴─────────────────┴─────────────────┘            │
│                          ▼                                                 │
│                 ┌────────────────┐                                         │
│                 │  CLAUDE AI     │                                         │
│                 │  (Sonnet 4)    │                                         │
│                 └────────┬───────┘                                         │
│                          ▼                                                 │
│         ┌────────────────────────────────────┐                            │
│         │      PARTNER AI OUTPUT              │                            │
│         │  • Action (Reply Now, Follow Up...) │                            │
│         │  • Urgency (critical/high/med/low)  │                            │
│         │  • Status (nurturing/active/etc.)   │                            │
│         │  • Summary (relationship state)     │                            │
│         │  • Next Step (specific action)      │                            │
│         │  • Risk Level (none/low/med/high)   │                            │
│         └────────────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Partner Relationship Stages

| Stage | Description |
|-------|-------------|
| **nurturing** | Building relationship, exploring fit, early conversations, just met |
| **high_potential** | Strong network mentioned, influential position, actively engaging, INBOUND LEAD |
| **active** | Actively referring, ongoing collaboration, frequent communication |
| **committed** | Formal agreement signed, proven referral track record, DocuSign executed |
| **dormant** | Was engaged, gone quiet (7+ days no response after Shalin's message) |

### Partner Urgency Rules (Aggressive)

| Level | Criteria |
|-------|----------|
| 🔴 **CRITICAL** (respond TODAY) | Partner waiting 7+ days for response, demo/call request waiting 5+ days, referral ready NOW, inbound lead waiting 3+ days |
| 🟡 **HIGH** (24-48h) | Partner sent last message 3-7 days ago, direct question unanswered 2+ days, inbound lead waiting 1-3 days, meeting unconfirmed |
| 🟠 **MEDIUM** (3-5 days) | Shalin sent last message 3-7 days ago, need to follow up on promised intro, short responses after detailed engagement |
| 🟢 **LOW** (can wait 5+ days) | Active back-and-forth within 3 days, ball in partner's court, committed partners with established rhythm |

### Partner Action Badges

| Action | When Used | Color |
|--------|-----------|-------|
| **Reply Now** | Partner waiting for response, time-sensitive opportunity | Red |
| **Schedule Call** | Complex discussion needed, relationship needs deepening | Yellow |
| **Send Intro** | Partner ready to receive valuable connection from Shalin | Blue |
| **Follow Up** | Check on promised referral or previous discussion | Yellow |
| **Nurture** | Keep warm with periodic touchpoint (article, congrats) | Gray |
| **On Track** | Active relationship, no action needed now | Green |

### Partner Signals Detection

```typescript
// Positive signals (relationship progressing)
🟢 POSITIVE:
  - Mentioned specific referral names
  - Asked about commission structure
  - Made introduction
  - Scheduled call
  - Signed agreement
  - Expressed enthusiasm

// Warning signals (needs attention)
🟡 WARNING:
  - Gone quiet 5+ days
  - Unfulfilled promise
  - Short responses after detailed engagement
  - Declined meeting

// Risk signals (relationship at risk)
🔴 RISK:
  - 14+ days no response
  - Mentioned competitors
  - Multiple declined meetings
```

### Cross-Chat Context for Partner Groups

For Partner groups, the system includes private chat context showing 1:1 discussions with group members. This helps understand the full relationship state—commitments made privately affect group dynamics.

```typescript
// Example: Partner group "Paymend Partnership"
// System fetches private DMs between Shalin and each partner in the group
// AI prompt includes: "CROSS-CHAT CONTEXT: Recent private discussions..."
```

### Partner-Specific Configuration

Partner tag in database has custom AI settings:

```typescript
{
  name: "Partner",
  aiEnabled: true,
  aiSystemPrompt: `You are Shalin's partner relationship intelligence system...`,
  aiTeamMembers: [],
  aiOwnerNames: ["Shalin"]
}
```

### Smart Trigger for Partners

Same as Customer Groups, Partner conversations are auto-analyzed when:
1. **New messages arrive**: Compares `lastSyncedMessageId` vs `aiLastAnalyzedMsgId`
2. **Notes are added**: Clears `aiLastAnalyzedMsgId` to force re-analysis
3. **Manual trigger**: Via "Analyze" button in UI

### Partner AI Output Format

```json
{
  "status": "nurturing|high_potential|active|committed|dormant",
  "action": "Reply Now|Schedule Call|Send Intro|Follow Up|Nurture|On Track",
  "urgency": "critical|high|medium|low",
  "summary": "1-2 sentences: how met, their value/network, current relationship state",
  "nextStep": "Specific next step for Shalin - be concrete and actionable",
  "risk": "none|low|medium|high",
  "riskReason": "Brief evidence if risk > none"
}
