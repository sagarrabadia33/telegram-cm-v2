import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Beast Insights Bot identifier
const BEAST_BOT_ID = '7262004897';
const BEAST_BOT_USERNAME = 'BeastInsightsBOT';

// ============================================================================
// TAG PRIORITY SYSTEM
// When a conversation has multiple AI-enabled tags, pick the highest priority.
// Priority is based on business criticality - what needs attention FIRST.
// ============================================================================
const TAG_PRIORITY: Record<string, number> = {
  'Churned': 1,         // Win-back - existential, time sensitive
  'Customer': 2,        // Shalin's direct relationships - escalations, payments
  'Customer Groups': 3, // Team handles - operational support
  'Partner': 4,         // BD relationships - referral pipeline
  'Prospect': 5,        // Sales pipeline - pre-revenue
};

// Default priority for unknown tags (lowest)
const DEFAULT_TAG_PRIORITY = 99;

/**
 * Select the primary tag for AI analysis from multiple tags.
 * Uses priority system: Churned > Customer > Customer Groups > Partner > Prospect
 * Returns the tag with highest priority (lowest number).
 */
function selectPrimaryTag(
  tags: Array<{ tag: { id: string; name: string; aiEnabled: boolean; aiSystemPrompt: string | null; aiTeamMembers: string[]; aiOwnerNames: string[] } }>
): { tag: { id: string; name: string; aiEnabled: boolean; aiSystemPrompt: string | null; aiTeamMembers: string[]; aiOwnerNames: string[] } } | null {
  // Filter to only AI-enabled tags with prompts
  const aiEnabledTags = tags.filter(t => t.tag.aiEnabled && t.tag.aiSystemPrompt);

  if (aiEnabledTags.length === 0) {
    // Fallback: any AI-enabled tag even without custom prompt
    const anyAiTag = tags.filter(t => t.tag.aiEnabled);
    if (anyAiTag.length === 0) return null;

    // Sort by priority
    return anyAiTag.sort((a, b) => {
      const priorityA = TAG_PRIORITY[a.tag.name] ?? DEFAULT_TAG_PRIORITY;
      const priorityB = TAG_PRIORITY[b.tag.name] ?? DEFAULT_TAG_PRIORITY;
      return priorityA - priorityB;
    })[0];
  }

  // Sort by priority (lower number = higher priority)
  return aiEnabledTags.sort((a, b) => {
    const priorityA = TAG_PRIORITY[a.tag.name] ?? DEFAULT_TAG_PRIORITY;
    const priorityB = TAG_PRIORITY[b.tag.name] ?? DEFAULT_TAG_PRIORITY;
    return priorityA - priorityB;
  })[0];
}

// Team member identifiers
const TEAM_MEMBERS = {
  shalin: { names: ['Shalin', 'Shalin R'], usernames: ['shalin_r'], role: 'CEO/Owner' },
  jesus: { names: ['Jesus', 'Jesus Alvarado'], usernames: ['jesalbo'], role: 'Customer Success' },
  prathamesh: { names: ['Prathamesh'], usernames: ['prathamesh_sranalytics'], role: 'Customer Success' },
};

const TEAM_USERNAMES = Object.values(TEAM_MEMBERS).flatMap(m => m.usernames);
const TEAM_NAMES = Object.values(TEAM_MEMBERS).flatMap(m => m.names);

/**
 * CROSS-CONVERSATION INTELLIGENCE
 * Fetch Shalin's private chat context with group members
 * This provides complete picture - issues in group may be resolved in private DMs
 */
async function fetchPrivateChatContext(
  groupMembers: Array<{ externalUserId: string; firstName?: string | null; lastName?: string | null; username?: string | null }>,
  conversationTitle: string
): Promise<string> {
  // Filter out team members to get only customer members
  const customerMembers = groupMembers.filter(m => {
    const username = m.username?.toLowerCase() || '';
    return !TEAM_USERNAMES.some(t => username.includes(t));
  });

  if (customerMembers.length === 0) {
    return '';
  }

  // Get customer external user IDs
  const customerUserIds = customerMembers.map(m => m.externalUserId);

  // Find Shalin's private conversations with these customers
  const privateChats = await prisma.conversation.findMany({
    where: {
      type: 'private',
      OR: [
        // Match by members
        {
          members: {
            some: {
              externalUserId: { in: customerUserIds }
            }
          }
        },
        // Match by externalChatId (for 1:1 chats, this is often the user ID)
        {
          externalChatId: { in: customerUserIds }
        }
      ]
    },
    select: {
      id: true,
      title: true,
      type: true,
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 30,
        select: {
          body: true,
          direction: true,
          sentAt: true,
          metadata: true,
        }
      },
      members: {
        select: {
          externalUserId: true,
          firstName: true,
          lastName: true,
          username: true,
        }
      }
    }
  });

  if (privateChats.length === 0) {
    return '';
  }

  // Format private chat context
  let privateContext = '\n🔒 PRIVATE CHAT CONTEXT (Shalin\'s direct messages with customer - use for complete picture):\n';
  privateContext += '⚠️ Issues that appear unresolved in group chat may have been addressed in these private messages.\n';

  for (const chat of privateChats) {
    if (chat.messages.length === 0) continue;

    // Get customer name from the chat
    const customerMember = chat.members.find(m =>
      customerUserIds.includes(m.externalUserId)
    );
    const customerName = customerMember
      ? [customerMember.firstName, customerMember.lastName].filter(Boolean).join(' ') || customerMember.username || 'Customer'
      : chat.title || 'Customer';

    privateContext += `\n--- Private chat with ${customerName} ---\n`;

    // Format messages (show last 20 meaningful ones in chronological order)
    const meaningfulMessages = chat.messages
      .filter(m => m.body && m.body.trim().length > 5)
      .slice(0, 20)
      .reverse();

    for (const msg of meaningfulMessages) {
      const time = new Date(msg.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const sender = msg.direction === 'outbound' ? 'Shalin' : customerName;
      const body = msg.body?.slice(0, 300) || '';
      privateContext += `[${time}] ${sender}: ${body}${msg.body && msg.body.length > 300 ? '...' : ''}\n`;
    }
  }

  privateContext += '\n';
  return privateContext;
}

// ============================================================================
// WORLD-CLASS INTELLIGENT MESSAGE PREPROCESSOR
// Extracts deep actionable intelligence before sending to AI
// ============================================================================

interface MessageMeta {
  sender?: {
    name?: string;
    username?: string;
    telegram_id?: string;
  };
}

interface ProcessedMessage {
  date: string;
  time: string;
  senderType: 'customer' | 'team' | 'bot';
  senderName: string;
  senderRole?: string;
  body: string;
  daysSinceNow: number;
  sentiment: 'positive' | 'negative' | 'neutral' | 'urgent';
  hasQuestion: boolean;
  hasUrgency: boolean;
  wordCount: number;
}

interface ConversationIntelligence {
  // Temporal signals - THE MOST CRITICAL
  daysSinceLastCustomerMessage: number | null;
  daysSinceLastTeamResponse: number | null;
  responseGap: number; // positive = team behind, negative = waiting on customer
  lastSpeaker: 'customer' | 'team' | 'bot' | null;
  customerWaiting: boolean;

  // Engagement trajectory
  messageVelocity: {
    last7Days: number;
    previous7Days: number;
    trend: 'increasing' | 'stable' | 'declining' | 'silent';
  };

  // Conversation state
  totalMessages: number;
  customerMessages: number;
  teamMessages: number;
  botMessages: number;

  // Open items detection (from recent messages)
  potentialOpenItems: string[];

  // Last meaningful exchange
  lastCustomerMessage: string | null;
  lastTeamMessage: string | null;

  // Key participants
  activeTeamMembers: string[];
  customerParticipants: string[];

  // ========== NEW: WORLD-CLASS INTELLIGENCE ==========

  // Sentiment Analysis
  sentimentTrajectory: 'improving' | 'stable' | 'deteriorating' | 'unknown';
  recentSentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  frustrationSignals: string[]; // Specific phrases indicating frustration

  // Urgency Detection
  urgencyLevel: 'critical' | 'high' | 'medium' | 'low';
  urgencyKeywords: string[]; // ASAP, urgent, deadline, etc.
  hasExternalPressure: boolean; // "my client", "our investors", "board meeting"

  // Conversation Quality
  avgCustomerMsgLength: number;
  avgTeamResponseLength: number;
  responseAdequacy: 'thorough' | 'adequate' | 'brief' | 'insufficient';
  unansweredQuestions: string[];

  // Pattern Detection
  repeatedTopics: string[]; // Same issue mentioned multiple times
  escalationPattern: boolean; // Customer getting more frustrated over time
  resolutionAttempts: number; // How many times team tried to resolve

  // Relationship Health (0-100)
  healthScore: number;
  healthFactors: {
    responsiveness: number; // 0-25
    sentiment: number; // 0-25
    engagement: number; // 0-25
    resolution: number; // 0-25
  };

  // Lifecycle Stage
  lifecycleStage: 'onboarding' | 'active' | 'at_risk' | 'dormant' | 'churning';

  // Key Insights (pre-computed for AI)
  criticalInsights: string[];
}

// ============================================================================
// SENTIMENT & PATTERN ANALYSIS HELPERS
// ============================================================================

// Sentiment keywords for classification
const SENTIMENT_PATTERNS = {
  positive: [
    'thank', 'thanks', 'great', 'awesome', 'perfect', 'excellent', 'love', 'amazing',
    'helpful', 'appreciate', 'wonderful', 'fantastic', 'impressed', 'happy', 'glad',
    'works great', 'well done', 'good job', 'exactly what', 'solved', 'working now',
    'working again', 'works now', 'fixed', 'all good', 'looks good', 'nice'
  ],
  negative: [
    'frustrated', 'annoyed', 'disappointed', 'unacceptable', 'terrible', 'awful',
    'worst', 'useless', 'not working', 'still waiting', 'no response',
    'waste of time', 'ridiculous', 'incompetent'
  ],
  // Only flag as urgent if it's an ACTIVE issue phrase, not just a word
  urgent: [
    'asap', 'urgent', 'emergency', 'immediately', 'right now',
    'time sensitive', 'can\'t wait', 'is blocking', 'is a blocker',
    'production is down', 'site is down', 'app is down', 'system is down',
    'critical issue', 'major issue'
  ],
  // Real frustration patterns - require context, not just single words
  frustration: [
    'still not working', 'still broken', 'still waiting', 'still no',
    'yet another issue', 'how many times', 'already told you',
    'keeps happening', 'same issue again', 'nothing changed', 'no progress',
    'been waiting for days', 'been waiting for weeks', 'unacceptable', 'ridiculous',
    'this is frustrating', 'very frustrated', 'so frustrated'
  ],
  // Resolution indicators - used to invalidate old issues
  resolution: [
    'working now', 'working again', 'works now', 'works again', 'fixed',
    'resolved', 'all good', 'looks good', 'perfect', 'thank you', 'thanks',
    'great', 'awesome', 'exactly what i needed', 'that solved it'
  ],
  externalPressure: [
    'my client is', 'our client needs', 'my boss is asking', 'board meeting tomorrow',
    'investor meeting', 'demo tomorrow', 'presentation tomorrow', 'launch date',
    'go live date', 'contract deadline', 'audit coming', 'compliance deadline'
  ]
};

// Analyze sentiment of a single message
function analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' | 'urgent' {
  const lower = text.toLowerCase();

  // Check urgent first (highest priority)
  const urgentScore = SENTIMENT_PATTERNS.urgent.filter(w => lower.includes(w)).length;
  if (urgentScore >= 2 || (urgentScore >= 1 && lower.includes('!'))) {
    return 'urgent';
  }

  const positiveScore = SENTIMENT_PATTERNS.positive.filter(w => lower.includes(w)).length;
  const negativeScore = SENTIMENT_PATTERNS.negative.filter(w => lower.includes(w)).length;

  // Weight negative higher - one negative signal is significant
  if (negativeScore >= 2 || (negativeScore >= 1 && positiveScore === 0)) {
    return 'negative';
  }
  if (positiveScore >= 2 || (positiveScore >= 1 && negativeScore === 0)) {
    return 'positive';
  }

  return 'neutral';
}

// Detect frustration signals in text
function detectFrustrationSignals(text: string): string[] {
  const lower = text.toLowerCase();

  // First check if this message contains resolution indicators
  // If customer says "working again" or "thanks", it's NOT frustration
  const hasResolution = SENTIMENT_PATTERNS.resolution.some(r => lower.includes(r));
  if (hasResolution) {
    return []; // This is a positive message, not frustration
  }

  return SENTIMENT_PATTERNS.frustration
    .filter(pattern => lower.includes(pattern))
    .map(pattern => {
      // Extract the surrounding context
      const idx = lower.indexOf(pattern);
      const start = Math.max(0, idx - 20);
      const end = Math.min(text.length, idx + pattern.length + 30);
      return text.slice(start, end).trim();
    });
}

// Detect urgency keywords
function detectUrgencyKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return SENTIMENT_PATTERNS.urgent.filter(w => lower.includes(w));
}

// Check for external pressure (client, boss, deadline mentions)
function hasExternalPressure(text: string): boolean {
  const lower = text.toLowerCase();
  return SENTIMENT_PATTERNS.externalPressure.some(w => lower.includes(w));
}

// Check if message contains a question
function containsQuestion(text: string): boolean {
  return text.includes('?') ||
    /\b(how|what|when|where|why|can you|could you|would you|is there|are there|do you|does it)\b/i.test(text);
}

// Extract questions from customer messages
function extractQuestions(messages: ProcessedMessage[]): string[] {
  const questions: string[] = [];
  for (const msg of messages) {
    if (msg.senderType === 'customer' && msg.hasQuestion) {
      // Split by ? and take meaningful parts
      const parts = msg.body.split('?').filter(p => p.trim().length > 10);
      for (const part of parts) {
        if (questions.length < 5) {
          questions.push((part.trim() + '?').slice(0, 150));
        }
      }
    }
  }
  return questions;
}

// Find questions that weren't answered (customer question not followed by team response)
function findUnansweredQuestions(messages: ProcessedMessage[]): string[] {
  const unanswered: string[] = [];

  // Only flag questions that are TRULY unanswered:
  // 1. From customer
  // 2. Within last 14 days
  // 3. No team response anywhere AFTER this question (within reasonable window)
  // 4. Must be an actual question, not rhetorical (has substance)

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // ONLY check questions from last 7 days (more conservative than 14)
    // Older questions are either resolved or customer would have followed up
    if (msg.daysSinceNow > 7) {
      continue;
    }

    if (msg.senderType === 'customer' && msg.hasQuestion) {
      // Skip very short questions (likely rhetorical or casual)
      if (msg.body.length < 15) continue;

      // Skip questions that are clearly rhetorical/emotional (contain laughter, exclamations)
      const lower = msg.body.toLowerCase();
      if (lower.includes('haha') || lower.includes('jaja') || lower.includes('lol') ||
          lower.includes('lmao') || lower.includes('😂') || lower.includes('🤣')) {
        continue;
      }

      // Look for ANY team response within the next 15 messages (newer, lower indices)
      // Don't break on customer messages - customers often send multiple msgs before getting reply
      let hasResponse = false;
      const lookAhead = Math.min(15, i); // Look at up to 15 newer messages
      for (let j = i - 1; j >= Math.max(0, i - lookAhead); j--) {
        if (messages[j].senderType === 'team') {
          hasResponse = true;
          break;
        }
      }

      if (!hasResponse && unanswered.length < 2) {
        // Only include if it looks like a real question needing an answer
        const question = msg.body.slice(0, 150);
        unanswered.push(question);
      }
    }
  }

  return unanswered;
}

// Detect repeated topics (same keywords appearing multiple times in customer messages)
function detectRepeatedTopics(messages: ProcessedMessage[]): string[] {
  const customerMessages = messages.filter(m => m.senderType === 'customer');
  const wordFreq = new Map<string, number>();

  // Common words to ignore
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
    'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it',
    'its', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'hi', 'hello', 'hey',
    'thanks', 'thank', 'please', 'ok', 'okay']);

  for (const msg of customerMessages) {
    const words = msg.body.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Find words appearing 3+ times across messages
  const repeated: string[] = [];
  for (const [word, count] of wordFreq.entries()) {
    if (count >= 3 && repeated.length < 5) {
      repeated.push(word);
    }
  }

  return repeated.sort((a, b) => (wordFreq.get(b) || 0) - (wordFreq.get(a) || 0));
}

// Calculate relationship health score (0-100)
function calculateHealthScore(intel: Partial<ConversationIntelligence>): {
  score: number;
  factors: { responsiveness: number; sentiment: number; engagement: number; resolution: number };
} {
  let responsiveness = 25; // Start at max
  let sentiment = 25;
  let engagement = 25;
  let resolution = 25;

  // Responsiveness (0-25): Penalize for slow responses
  if (intel.responseGap !== undefined) {
    if (intel.responseGap > 7) responsiveness = 0;
    else if (intel.responseGap > 5) responsiveness = 5;
    else if (intel.responseGap > 3) responsiveness = 10;
    else if (intel.responseGap > 1) responsiveness = 15;
    else if (intel.responseGap > 0) responsiveness = 20;
  }

  // Sentiment (0-25): Based on recent sentiment
  if (intel.recentSentiment === 'negative') sentiment = 5;
  else if (intel.recentSentiment === 'mixed') sentiment = 15;
  else if (intel.recentSentiment === 'neutral') sentiment = 20;

  // Penalize for frustration signals
  if (intel.frustrationSignals && intel.frustrationSignals.length > 0) {
    sentiment = Math.max(0, sentiment - intel.frustrationSignals.length * 5);
  }

  // Engagement (0-25): Based on velocity trend
  if (intel.messageVelocity) {
    if (intel.messageVelocity.trend === 'silent') engagement = 5;
    else if (intel.messageVelocity.trend === 'declining') engagement = 10;
    else if (intel.messageVelocity.trend === 'stable') engagement = 20;
  }

  // Resolution (0-25): Based on unanswered questions and repeated topics
  if (intel.unansweredQuestions && intel.unansweredQuestions.length > 0) {
    resolution = Math.max(0, resolution - intel.unansweredQuestions.length * 8);
  }
  if (intel.repeatedTopics && intel.repeatedTopics.length > 2) {
    resolution = Math.max(0, resolution - 10);
  }

  const score = responsiveness + sentiment + engagement + resolution;

  return {
    score,
    factors: { responsiveness, sentiment, engagement, resolution }
  };
}

// Determine lifecycle stage
function determineLifecycleStage(intel: Partial<ConversationIntelligence>): 'onboarding' | 'active' | 'at_risk' | 'dormant' | 'churning' {
  const daysSinceCustomer = intel.daysSinceLastCustomerMessage ?? 999;
  const velocity = intel.messageVelocity?.trend ?? 'silent';
  const healthScore = intel.healthScore ?? 50;

  // Churning: explicit frustration + declining engagement + poor health
  if (healthScore < 30 && intel.escalationPattern) {
    return 'churning';
  }

  // At risk: health below 50 or long silence after activity
  if (healthScore < 50 || (daysSinceCustomer > 14 && velocity === 'declining')) {
    return 'at_risk';
  }

  // Dormant: no activity for 30+ days
  if (daysSinceCustomer > 30 && velocity === 'silent') {
    return 'dormant';
  }

  // Onboarding: low total messages, recent start
  if ((intel.totalMessages ?? 0) < 20 && daysSinceCustomer < 30) {
    return 'onboarding';
  }

  return 'active';
}

// Generate critical insights (pre-computed for AI)
function generateCriticalInsights(intel: Partial<ConversationIntelligence>): string[] {
  const insights: string[] = [];

  // ONLY show insights that require ACTION from Shalin
  // Priority 1: Customer waiting for response (most actionable)
  if (intel.customerWaiting && (intel.daysSinceLastCustomerMessage ?? 0) >= 2) {
    const days = intel.daysSinceLastCustomerMessage;
    insights.push(`Respond to customer (waiting ${days} day${days === 1 ? '' : 's'})`);
  }

  // Priority 2: Unanswered questions (specific action needed)
  if (intel.unansweredQuestions && intel.unansweredQuestions.length > 0) {
    insights.push(`Answer ${intel.unansweredQuestions.length} open question${intel.unansweredQuestions.length === 1 ? '' : 's'}`);
  }

  // Priority 3: Active frustration (only if recent and unresolved)
  // Note: frustrationSignals are now filtered to only include genuine, unresolved frustration
  if (intel.frustrationSignals && intel.frustrationSignals.length > 0 && intel.sentimentTrajectory === 'deteriorating') {
    insights.push('Address customer frustration');
  }

  // Priority 4: External pressure (client/deadline)
  if (intel.hasExternalPressure && intel.customerWaiting) {
    insights.push('Customer has deadline pressure');
  }

  // Priority 5: Churning customer (only if real risk)
  if (intel.lifecycleStage === 'churning' && (intel.healthScore ?? 100) < 30) {
    insights.push('At risk of churning - follow up');
  }

  // Max 2 insights - more than that is noise
  return insights.slice(0, 2);
}

function classifySender(metadata: MessageMeta | null): { type: 'customer' | 'team' | 'bot'; name: string; role?: string } {
  if (!metadata?.sender) {
    return { type: 'customer', name: 'Unknown' };
  }

  const { name, username, telegram_id } = metadata.sender;

  // Check if it's the Beast Insights bot
  if (telegram_id === BEAST_BOT_ID || username === BEAST_BOT_USERNAME) {
    return { type: 'bot', name: 'Beast Insights Bot' };
  }

  // Check if it's a team member by username
  if (username && TEAM_USERNAMES.includes(username)) {
    for (const [key, member] of Object.entries(TEAM_MEMBERS)) {
      if (member.usernames.includes(username)) {
        return { type: 'team', name: name || key, role: member.role };
      }
    }
  }

  // Check if it's a team member by name
  if (name) {
    for (const [key, member] of Object.entries(TEAM_MEMBERS)) {
      if (member.names.some(n => name.includes(n))) {
        return { type: 'team', name: name, role: member.role };
      }
    }
  }

  // Default to customer
  return { type: 'customer', name: name || 'Customer' };
}

function extractConversationIntelligence(
  messages: Array<{ body: string | null; sentAt: Date; metadata: unknown; direction?: string | null }>,
  conversationTitle: string,
  isPrivateChat: boolean = false
): { intelligence: ConversationIntelligence; processedMessages: ProcessedMessage[] } {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const processed: ProcessedMessage[] = [];

  let lastCustomerDate: Date | null = null;
  let lastTeamDate: Date | null = null;
  let lastCustomerMsg: string | null = null;

  // Track last MEANINGFUL speaker (excludes bot broadcasts - used for "customer waiting" logic)
  let lastMeaningfulSpeaker: 'customer' | 'team' | null = null;
  let lastTeamMsg: string | null = null;
  let lastSpeaker: 'customer' | 'team' | 'bot' | null = null;

  let customerMsgCount = 0;
  let teamMsgCount = 0;
  let botMsgCount = 0;

  let msgsLast7Days = 0;
  let msgsPrev7Days = 0;

  const activeTeamSet = new Set<string>();
  const customerSet = new Set<string>();
  const potentialOpenItems: string[] = [];

  // NEW: Track for world-class intelligence
  const recentFrustrationSignals: string[] = []; // Only from last 7 days AND unresolved
  const recentUrgencyKeywords: string[] = []; // Only from last 7 days AND unresolved
  let hasAnyExternalPressure = false;
  let totalCustomerWordCount = 0;
  let totalTeamWordCount = 0;
  let customerMsgWithContent = 0;
  let teamMsgWithContent = 0;

  // Track sentiment over time for trajectory analysis
  const recentSentiments: Array<'positive' | 'negative' | 'neutral' | 'urgent'> = [];
  const olderSentiments: Array<'positive' | 'negative' | 'neutral' | 'urgent'> = [];

  // Track if issues have been resolved (messages are in DESC order, so we see resolutions first)
  let issueResolved = false;

  // Process messages (they come in DESC order - newest first)
  for (const msg of messages) {
    const meta = msg.metadata as MessageMeta;
    let { type, name, role } = classifySender(meta);

    // FIX: For private chats, use `direction` field to determine sender
    // In private chats, metadata.sender is often null, so we use direction:
    // - 'outbound' = Shalin/team sent this message
    // - 'inbound' = customer sent this message
    if (isPrivateChat && msg.direction) {
      if (msg.direction === 'outbound') {
        type = 'team';
        name = 'Shalin'; // In private chats, outbound is always from the account owner
        role = 'Owner';
      } else if (msg.direction === 'inbound') {
        type = 'customer';
        // Keep the name from metadata if available, otherwise use conversation title
        if (!meta?.sender?.name) {
          name = conversationTitle || 'Customer';
        }
      }
    }

    const daysSince = Math.floor((now.getTime() - msg.sentAt.getTime()) / (24 * 60 * 60 * 1000));

    const body = msg.body?.trim() || '';
    if (!body) continue; // Skip empty messages

    // NEW: Analyze message for sentiment, questions, urgency
    const msgSentiment = analyzeSentiment(body);
    const msgHasQuestion = containsQuestion(body);
    const msgHasUrgency = detectUrgencyKeywords(body).length > 0;
    const wordCount = body.split(/\s+/).length;

    // Track processed message with NEW fields
    processed.push({
      date: msg.sentAt.toISOString().slice(0, 10),
      time: msg.sentAt.toISOString().slice(11, 16),
      senderType: type,
      senderName: name,
      senderRole: role,
      body: body,
      daysSinceNow: daysSince,
      sentiment: msgSentiment,
      hasQuestion: msgHasQuestion,
      hasUrgency: msgHasUrgency,
      wordCount: wordCount,
    });

    // Count by type
    if (type === 'customer') {
      customerMsgCount++;
      totalCustomerWordCount += wordCount;
      customerMsgWithContent++;

      if (lastCustomerDate === null) {
        lastCustomerDate = msg.sentAt;
        lastCustomerMsg = body;
        lastSpeaker = 'customer';
        // Track meaningful speaker (excludes bots)
        if (lastMeaningfulSpeaker === null) lastMeaningfulSpeaker = 'customer';
      }
      customerSet.add(name);

      // Check if customer message indicates resolution (e.g., "working again", "thanks")
      const lower = body.toLowerCase();
      const msgHasResolution = SENTIMENT_PATTERNS.resolution.some(r => lower.includes(r));
      if (msgHasResolution && daysSince <= 7) {
        // Most recent customer message indicates resolution - clear previous signals
        issueResolved = true;
      }

      // NEW: Only collect frustration/urgency if RECENT (last 7 days) AND NOT already resolved
      // Since messages are in DESC order, if we've seen a resolution, older issues are resolved
      if (daysSince <= 7 && !issueResolved) {
        const frustration = detectFrustrationSignals(body);
        recentFrustrationSignals.push(...frustration);

        const urgency = detectUrgencyKeywords(body);
        recentUrgencyKeywords.push(...urgency);

        if (hasExternalPressure(body)) {
          hasAnyExternalPressure = true;
        }
      }

      // Track sentiment trajectory (recent = last 7 days, older = before that)
      if (daysSince <= 7) {
        recentSentiments.push(msgSentiment);
      } else {
        olderSentiments.push(msgSentiment);
      }
    } else if (type === 'team') {
      teamMsgCount++;
      totalTeamWordCount += wordCount;
      teamMsgWithContent++;

      if (lastTeamDate === null) {
        lastTeamDate = msg.sentAt;
        lastTeamMsg = body;
        if (lastSpeaker === null) lastSpeaker = 'team';
        // Track meaningful speaker (excludes bots)
        if (lastMeaningfulSpeaker === null) lastMeaningfulSpeaker = 'team';
      }
      activeTeamSet.add(name);
    } else {
      botMsgCount++;
      if (lastSpeaker === null) lastSpeaker = 'bot';
    }

    // Velocity tracking
    if (msg.sentAt >= sevenDaysAgo) {
      msgsLast7Days++;
    } else if (msg.sentAt >= fourteenDaysAgo) {
      msgsPrev7Days++;
    }

    // Detect potential open items (questions, requests from customer)
    if (type === 'customer' && potentialOpenItems.length < 3) {
      const lowerBody = body.toLowerCase();
      if (
        body.includes('?') ||
        lowerBody.includes('can you') ||
        lowerBody.includes('could you') ||
        lowerBody.includes('please') ||
        lowerBody.includes('need') ||
        lowerBody.includes('when will') ||
        lowerBody.includes('any update')
      ) {
        potentialOpenItems.push(body.slice(0, 150));
      }
    }
  }

  // Calculate response gap
  let responseGap = 0;
  if (lastCustomerDate && lastTeamDate) {
    const customerDays = Math.floor((now.getTime() - lastCustomerDate.getTime()) / (24 * 60 * 60 * 1000));
    const teamDays = Math.floor((now.getTime() - lastTeamDate.getTime()) / (24 * 60 * 60 * 1000));
    responseGap = teamDays - customerDays; // positive = team is behind
  }

  // Determine velocity trend
  let trend: 'increasing' | 'stable' | 'declining' | 'silent' = 'stable';
  if (msgsLast7Days === 0 && msgsPrev7Days === 0) {
    trend = 'silent';
  } else if (msgsLast7Days === 0 && msgsPrev7Days > 0) {
    trend = 'declining';
  } else if (msgsLast7Days > msgsPrev7Days * 1.5) {
    trend = 'increasing';
  } else if (msgsLast7Days < msgsPrev7Days * 0.5) {
    trend = 'declining';
  }

  // ========== NEW: Calculate world-class intelligence fields ==========

  // Sentiment trajectory analysis
  const countNegative = (arr: Array<'positive' | 'negative' | 'neutral' | 'urgent'>) =>
    arr.filter(s => s === 'negative' || s === 'urgent').length;
  const countPositive = (arr: Array<'positive' | 'negative' | 'neutral' | 'urgent'>) =>
    arr.filter(s => s === 'positive').length;

  let sentimentTrajectory: 'improving' | 'stable' | 'deteriorating' | 'unknown' = 'unknown';
  if (recentSentiments.length > 0 && olderSentiments.length > 0) {
    const recentNegRatio = countNegative(recentSentiments) / recentSentiments.length;
    const olderNegRatio = countNegative(olderSentiments) / olderSentiments.length;
    if (recentNegRatio > olderNegRatio + 0.2) {
      sentimentTrajectory = 'deteriorating';
    } else if (recentNegRatio < olderNegRatio - 0.2) {
      sentimentTrajectory = 'improving';
    } else {
      sentimentTrajectory = 'stable';
    }
  } else if (recentSentiments.length > 0) {
    sentimentTrajectory = 'stable';
  }

  // Recent sentiment (from last 7 days)
  let recentSentiment: 'positive' | 'negative' | 'neutral' | 'mixed' = 'neutral';
  if (recentSentiments.length > 0) {
    const posCount = countPositive(recentSentiments);
    const negCount = countNegative(recentSentiments);
    if (posCount > 0 && negCount > 0) {
      recentSentiment = 'mixed';
    } else if (negCount > posCount) {
      recentSentiment = 'negative';
    } else if (posCount > negCount) {
      recentSentiment = 'positive';
    }
  }

  // Urgency level based on RECENT UNRESOLVED keywords AND customer wait time
  const uniqueUrgencyKeywords = [...new Set(recentUrgencyKeywords)];
  let urgencyLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';

  // Calculate customer wait time (how long since customer message without team response)
  const customerWaitDays = lastCustomerDate
    ? Math.floor((now.getTime() - lastCustomerDate.getTime()) / (24 * 60 * 60 * 1000))
    : 0;
  const customerIsWaiting = lastMeaningfulSpeaker === 'customer' && customerWaitDays > 0;

  // URGENCY CALCULATION: Weight recent customer wait time heavily
  // This ensures conversations with waiting customers get proper urgency
  if (uniqueUrgencyKeywords.length >= 2) {
    urgencyLevel = 'critical';
  } else if (uniqueUrgencyKeywords.length >= 1 || hasAnyExternalPressure) {
    urgencyLevel = 'high';
  } else if (customerIsWaiting && customerWaitDays >= 3) {
    // Customer waiting 3+ days = high urgency even without explicit keywords
    urgencyLevel = 'high';
  } else if (customerIsWaiting && customerWaitDays >= 1) {
    // Customer waiting 1-2 days = medium urgency
    urgencyLevel = 'medium';
  } else if (recentFrustrationSignals.length > 0) {
    urgencyLevel = 'medium';
  }

  // ESCALATE urgency if customer is waiting AND there are frustration signals
  if (customerIsWaiting && recentFrustrationSignals.length > 0) {
    if (urgencyLevel === 'low') urgencyLevel = 'medium';
    else if (urgencyLevel === 'medium') urgencyLevel = 'high';
    else if (urgencyLevel === 'high' && customerWaitDays >= 2) urgencyLevel = 'critical';
  }

  // Response adequacy based on average message lengths
  const avgCustomerLen = customerMsgWithContent > 0 ? totalCustomerWordCount / customerMsgWithContent : 0;
  const avgTeamLen = teamMsgWithContent > 0 ? totalTeamWordCount / teamMsgWithContent : 0;
  let responseAdequacy: 'thorough' | 'adequate' | 'brief' | 'insufficient' = 'adequate';
  if (avgTeamLen === 0 && customerMsgCount > 0) {
    responseAdequacy = 'insufficient';
  } else if (avgTeamLen < avgCustomerLen * 0.3) {
    responseAdequacy = 'brief';
  } else if (avgTeamLen >= avgCustomerLen * 1.5) {
    responseAdequacy = 'thorough';
  }

  // Find unanswered questions
  const unansweredQuestions = findUnansweredQuestions(processed);

  // Detect repeated topics
  const repeatedTopics = detectRepeatedTopics(processed);

  // Detect escalation pattern (frustration increasing AND repeated topics)
  const escalationPattern = sentimentTrajectory === 'deteriorating' &&
    (recentFrustrationSignals.length > 2 || repeatedTopics.length > 2);

  // Count resolution attempts (team messages that seem to address issues)
  const resolutionAttempts = processed.filter(m =>
    m.senderType === 'team' &&
    (m.body.toLowerCase().includes('fix') ||
     m.body.toLowerCase().includes('resolved') ||
     m.body.toLowerCase().includes('solution') ||
     m.body.toLowerCase().includes('try this') ||
     m.body.toLowerCase().includes('should work'))
  ).length;

  // Build partial intelligence for health score calculation
  const partialIntel: Partial<ConversationIntelligence> = {
    responseGap,
    recentSentiment,
    frustrationSignals: [...new Set(recentFrustrationSignals)].slice(0, 3), // Only recent unresolved
    messageVelocity: { last7Days: msgsLast7Days, previous7Days: msgsPrev7Days, trend },
    unansweredQuestions,
    repeatedTopics,
    totalMessages: messages.length,
    daysSinceLastCustomerMessage: lastCustomerDate
      ? Math.floor((now.getTime() - lastCustomerDate.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    escalationPattern,
  };

  // Calculate health score
  const { score: healthScore, factors: healthFactors } = calculateHealthScore(partialIntel);

  // Add health score to partial for lifecycle calculation
  partialIntel.healthScore = healthScore;

  // Determine lifecycle stage
  const lifecycleStage = determineLifecycleStage(partialIntel);

  // Build complete intelligence object
  const intelligence: ConversationIntelligence = {
    // Original fields
    daysSinceLastCustomerMessage: lastCustomerDate
      ? Math.floor((now.getTime() - lastCustomerDate.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    daysSinceLastTeamResponse: lastTeamDate
      ? Math.floor((now.getTime() - lastTeamDate.getTime()) / (24 * 60 * 60 * 1000))
      : null,
    responseGap,
    lastSpeaker,
    // Use lastMeaningfulSpeaker (excludes bot broadcasts) for "customer waiting" detection
    // This ensures bot broadcasts don't mask the fact that a customer is waiting for a response
    customerWaiting: lastMeaningfulSpeaker === 'customer' && responseGap > 0,

    messageVelocity: {
      last7Days: msgsLast7Days,
      previous7Days: msgsPrev7Days,
      trend,
    },

    totalMessages: messages.length,
    customerMessages: customerMsgCount,
    teamMessages: teamMsgCount,
    botMessages: botMsgCount,

    potentialOpenItems,
    lastCustomerMessage: lastCustomerMsg,
    lastTeamMessage: lastTeamMsg,

    activeTeamMembers: Array.from(activeTeamSet),
    customerParticipants: Array.from(customerSet),

    // ========== NEW: World-class intelligence fields ==========
    sentimentTrajectory,
    recentSentiment,
    frustrationSignals: [...new Set(recentFrustrationSignals)].slice(0, 3), // Only recent unresolved

    urgencyLevel,
    urgencyKeywords: uniqueUrgencyKeywords.slice(0, 3), // Only recent unresolved
    hasExternalPressure: hasAnyExternalPressure,

    avgCustomerMsgLength: Math.round(avgCustomerLen),
    avgTeamResponseLength: Math.round(avgTeamLen),
    responseAdequacy,
    unansweredQuestions,

    repeatedTopics,
    escalationPattern,
    resolutionAttempts,

    healthScore,
    healthFactors,

    lifecycleStage,

    criticalInsights: [], // Will be populated below
  };

  // Generate critical insights (depends on complete intelligence)
  intelligence.criticalInsights = generateCriticalInsights(intelligence);

  return { intelligence, processedMessages: processed };
}

function formatIntelligenceForPrompt(
  intel: ConversationIntelligence,
  messages: ProcessedMessage[],
  title: string,
  notes?: Array<{ type: string; content: string; createdAt: Date }>
): string {
  const lines: string[] = [];

  lines.push(`=== CUSTOMER: ${title} ===`);
  lines.push('');

  // ========== INTERNAL NOTES (IMPORTANT CONTEXT FROM TEAM) ==========
  if (notes && notes.length > 0) {
    lines.push('📝 INTERNAL NOTES (context from team - DO NOT share with customer):');
    notes.forEach(note => {
      const date = new Date(note.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const typeLabel = note.type === 'meeting' ? '📅 Meeting' : note.type === 'call' ? '📞 Call' : '📝 Note';
      lines.push(`  [${dateStr}] ${typeLabel}: ${note.content.slice(0, 200)}${note.content.length > 200 ? '...' : ''}`);
    });
    lines.push('');
    lines.push('⚠️  Consider these notes when generating summary and suggested actions.');
    lines.push('');
  }

  // ========== CRITICAL INSIGHTS (PRE-COMPUTED) ==========
  if (intel.criticalInsights.length > 0) {
    lines.push('🚨 CRITICAL INSIGHTS (ACT ON THESE):');
    intel.criticalInsights.forEach(insight => {
      lines.push(`  ⚡ ${insight}`);
    });
    lines.push('');
  }

  // ========== RELATIONSHIP HEALTH SCORE ==========
  lines.push('💚 RELATIONSHIP HEALTH:');
  const healthEmoji = intel.healthScore >= 70 ? '🟢' : intel.healthScore >= 40 ? '🟡' : '🔴';
  lines.push(`  ${healthEmoji} Overall Score: ${intel.healthScore}/100 (${intel.lifecycleStage.toUpperCase()})`);
  lines.push(`  → Responsiveness: ${intel.healthFactors.responsiveness}/25`);
  lines.push(`  → Sentiment: ${intel.healthFactors.sentiment}/25`);
  lines.push(`  → Engagement: ${intel.healthFactors.engagement}/25`);
  lines.push(`  → Resolution: ${intel.healthFactors.resolution}/25`);
  lines.push('');

  // ========== TEMPORAL STATUS (URGENCY) ==========
  lines.push('📊 CONVERSATION STATUS:');

  if (intel.customerWaiting) {
    lines.push(`⚠️  CUSTOMER WAITING: Last customer message ${intel.daysSinceLastCustomerMessage} days ago, team hasn't responded`);
  }

  if (intel.lastSpeaker === 'customer') {
    lines.push(`→ Last speaker: CUSTOMER (they're waiting for a response)`);
  } else if (intel.lastSpeaker === 'team') {
    lines.push(`→ Last speaker: Team (ball is in customer's court)`);
  } else if (intel.lastSpeaker === 'bot') {
    lines.push(`→ Last speaker: Bot notification (no human response needed)`);
  }

  if (intel.daysSinceLastCustomerMessage !== null) {
    lines.push(`→ Last customer message: ${intel.daysSinceLastCustomerMessage} days ago`);
  }
  if (intel.daysSinceLastTeamResponse !== null) {
    lines.push(`→ Last team response: ${intel.daysSinceLastTeamResponse} days ago`);
  }

  if (intel.responseGap > 0) {
    lines.push(`→ Response gap: Team is ${intel.responseGap} days behind`);
  } else if (intel.responseGap < 0) {
    lines.push(`→ Response gap: Waiting on customer for ${Math.abs(intel.responseGap)} days`);
  }

  // ========== URGENCY & SENTIMENT ==========
  lines.push('');
  lines.push('🎯 URGENCY & SENTIMENT:');
  const urgencyEmoji = intel.urgencyLevel === 'critical' ? '🔴' : intel.urgencyLevel === 'high' ? '🟠' : intel.urgencyLevel === 'medium' ? '🟡' : '🟢';
  lines.push(`  ${urgencyEmoji} Urgency: ${intel.urgencyLevel.toUpperCase()}`);
  if (intel.urgencyKeywords.length > 0) {
    lines.push(`  → Keywords detected: ${intel.urgencyKeywords.join(', ')}`);
  }
  if (intel.hasExternalPressure) {
    lines.push(`  ⚠️  EXTERNAL PRESSURE: Customer mentioned client/deadline/boss`);
  }

  const sentimentEmoji = intel.recentSentiment === 'positive' ? '😊' : intel.recentSentiment === 'negative' ? '😠' : intel.recentSentiment === 'mixed' ? '😐' : '😶';
  lines.push(`  ${sentimentEmoji} Recent sentiment: ${intel.recentSentiment.toUpperCase()}`);
  lines.push(`  → Trajectory: ${intel.sentimentTrajectory.toUpperCase()}`);

  if (intel.frustrationSignals.length > 0) {
    lines.push(`  ⚠️  Frustration signals: "${intel.frustrationSignals[0]}"`);
  }

  if (intel.escalationPattern) {
    lines.push(`  🚨 ESCALATION PATTERN DETECTED: Customer frustration increasing`);
  }

  // ========== ENGAGEMENT ==========
  lines.push('');
  lines.push('📈 ENGAGEMENT:');
  lines.push(`→ Messages last 7 days: ${intel.messageVelocity.last7Days}`);
  lines.push(`→ Messages previous 7 days: ${intel.messageVelocity.previous7Days}`);
  lines.push(`→ Trend: ${intel.messageVelocity.trend.toUpperCase()}`);
  lines.push(`→ Response adequacy: ${intel.responseAdequacy.toUpperCase()} (avg customer: ${intel.avgCustomerMsgLength} words, avg team: ${intel.avgTeamResponseLength} words)`);

  // ========== PARTICIPANTS ==========
  lines.push('');
  lines.push('👥 PARTICIPANTS:');
  lines.push(`→ Customer contacts: ${intel.customerParticipants.join(', ') || 'Unknown'}`);
  lines.push(`→ Team involved: ${intel.activeTeamMembers.join(', ') || 'None yet'}`);
  lines.push(`→ Message breakdown: ${intel.customerMessages} customer, ${intel.teamMessages} team, ${intel.botMessages} bot`);
  lines.push(`→ Resolution attempts by team: ${intel.resolutionAttempts}`);

  // ========== UNANSWERED QUESTIONS ==========
  if (intel.unansweredQuestions.length > 0) {
    lines.push('');
    lines.push('❓ UNANSWERED QUESTIONS (customer waiting for answers):');
    intel.unansweredQuestions.forEach((q, i) => {
      lines.push(`  ${i + 1}. "${q}"`);
    });
  }

  // ========== REPEATED TOPICS (PATTERN DETECTION) ==========
  if (intel.repeatedTopics.length > 0) {
    lines.push('');
    lines.push('🔄 REPEATED TOPICS (customer keeps mentioning):');
    lines.push(`  → ${intel.repeatedTopics.join(', ')}`);
  }

  // ========== OPEN ITEMS ==========
  if (intel.potentialOpenItems.length > 0) {
    lines.push('');
    lines.push('📋 POTENTIAL OPEN ITEMS (questions/requests from customer):');
    intel.potentialOpenItems.forEach((item, i) => {
      lines.push(`  ${i + 1}. "${item}"`);
    });
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('RECENT MESSAGES (newest first):');
  lines.push('');

  // Format messages - limit to 30 most recent with content
  // Include sentiment and question markers for each message
  const recentMessages = messages.slice(0, 30);
  for (const msg of recentMessages) {
    const roleTag = msg.senderType === 'team'
      ? `[TEAM: ${msg.senderName}${msg.senderRole ? ` - ${msg.senderRole}` : ''}]`
      : msg.senderType === 'bot'
        ? '[BOT]'
        : `[CUSTOMER: ${msg.senderName}]`;

    // Add sentiment/urgency markers
    const markers: string[] = [];
    if (msg.sentiment === 'negative') markers.push('😠NEG');
    if (msg.sentiment === 'urgent') markers.push('🔴URG');
    if (msg.sentiment === 'positive') markers.push('😊POS');
    if (msg.hasQuestion) markers.push('❓Q');
    if (msg.hasUrgency) markers.push('⏰');

    const markerStr = markers.length > 0 ? ` ${markers.join(' ')}` : '';

    lines.push(`[${msg.date}] ${roleTag}${markerStr}`);
    lines.push(msg.body.slice(0, 500));
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// DEFAULT AI PROMPT - This is the template users can customize in AI Settings
// When a tag has no custom prompt, this is used. Users can copy and modify this.
// ============================================================================

export const DEFAULT_AI_SYSTEM_PROMPT = `You are an AI assistant analyzing customer conversations for a CRM system.

TEAM CONTEXT:
- Owner/CEO names: {{ownerNames}}
- Team members: {{teamMembers}}
- Bot messages (automated) should NOT be counted as team responses

YOUR MISSION: Provide actionable intelligence. Surface what needs attention NOW.

CRITICAL RULES:

1. TIME IS EVERYTHING
   - If customer sent last message AND it's been 2+ days = they're waiting = RED FLAG
   - If team sent last message = ball is in customer's court = usually OK
   - Silent for 7+ days after active engagement = concerning
   - Bot messages don't count as team responses

2. ACTION, NOT STATUS
   Think "what should happen next?"
   - "Reply Now" = customer waiting, needs response
   - "Schedule Call" = complex issue needs discussion
   - "Send Resource" = customer needs education/docs
   - "Check In" = been quiet, worth a touchpoint
   - "Escalate" = owner needs to personally handle
   - "On Track" = nothing needed right now

3. SPECIFICITY IS EVERYTHING
   BAD: "Customer needs follow-up"
   GOOD: "Customer asked about API rate limits 3 days ago. No response yet. They seem stuck on integration."

4. URGENCY SCORING
   - Customer waiting 3+ days = HIGH
   - Multiple unresolved issues = HIGH
   - Competitor mention = CRITICAL
   - Payment/billing issues = CRITICAL
   - Customer frustrated tone = HIGH
   - Routine questions answered = LOW
   - Waiting on customer = LOW

OUTPUT FORMAT (strict JSON - do not deviate):
{
  "action": "Reply Now" | "Schedule Call" | "Send Resource" | "Check In" | "Escalate" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "daysWaiting": <number or null if not applicable>,
  "summary": "<1-2 sentences: What's happening + what's at stake. Lead with urgency if any.>",
  "nextStep": "<Specific action: who should do what. Be concrete.>",
  "openItems": ["<list of unresolved customer questions/requests if any>"],
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "<if risk > low, explain why with evidence from conversation>"
}`;

// Build the effective system prompt - uses custom if provided, otherwise default
function buildSystemPrompt(
  customPrompt: string | null,
  ownerNames: string[],
  teamMembers: string[]
): string {
  const basePrompt = customPrompt?.trim() || DEFAULT_AI_SYSTEM_PROMPT;

  // Replace placeholders with actual values
  return basePrompt
    .replace('{{ownerNames}}', ownerNames.length > 0 ? ownerNames.join(', ') : 'Not specified')
    .replace('{{teamMembers}}', teamMembers.length > 0 ? teamMembers.join(', ') : 'Not specified');
}

interface IntelligentAnalysisResult {
  // Common fields
  action: string; // Customer: Reply Now, Escalate, etc. Partner: Reply Now, Send Intro, Nurture, etc.
  urgency: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  nextStep: string;
  risk: 'none' | 'low' | 'medium' | 'high';
  riskReason: string | null;
  // Customer-specific fields
  daysWaiting?: number | null;
  openItems?: string[];
  // Partner-specific fields
  status?: 'nurturing' | 'high_potential' | 'active' | 'committed' | 'dormant';
}

// Map new format to existing database fields
function mapToDbFields(result: IntelligentAnalysisResult): {
  aiStatus: string;
  aiStatusReason: string;
  aiSummary: string;
  aiChurnRisk: string;
  aiChurnSignals: string[];
  aiSuggestedAction: string;
  aiAction: string;
} {
  let status: string;

  // PARTNER: Use status directly from AI response if provided
  if (result.status) {
    status = result.status; // nurturing, high_potential, active, committed, dormant
  } else {
    // CUSTOMER: Map action to status
    switch (result.action) {
      case 'Escalate to Shalin':
      case 'Escalate':
        status = 'needs_owner';
        break;
      case 'Reply Now':
      case 'Schedule Call':
      case 'Send Resource':
        status = result.urgency === 'critical' || result.urgency === 'high' ? 'at_risk' : 'team_handling';
        break;
      case 'Check In':
        status = 'monitoring';
        break;
      case 'Monitor':
        status = 'monitoring';
        break;
      case 'On Track':
      default:
        status = 'resolved';
        break;
    }

    // Override status if high risk
    if (result.risk === 'high' || result.urgency === 'critical') {
      if (result.action === 'Escalate to Shalin' || result.action === 'Escalate') {
        status = 'needs_owner';
      } else {
        status = 'at_risk';
      }
    }

    // CRITICAL FIX: Never mark as "resolved" if there are open items
    if (status === 'resolved' && result.openItems && result.openItems.length > 0) {
      status = 'team_handling';
    }

    // Also check if summary mentions unresolved/waiting/pending
    const summaryLower = result.summary.toLowerCase();
    if (status === 'resolved' && (
      summaryLower.includes('unresolved') ||
      summaryLower.includes('no resolution') ||
      summaryLower.includes('waiting for') ||
      summaryLower.includes('pending') ||
      summaryLower.includes('investigating') ||
      summaryLower.includes('looking into')
    )) {
      status = 'team_handling';
    }
  }

  // Build status reason with urgency context
  let statusReason = result.summary;
  if (result.daysWaiting && result.daysWaiting > 0) {
    statusReason = `[${result.daysWaiting}d waiting] ${statusReason}`;
  }

  // Build churn signals (openItems is Customer-specific, may not exist for Partner)
  const openItems = result.openItems || [];
  const churnSignals = result.riskReason ? [result.riskReason, ...openItems] : openItems;

  return {
    aiStatus: status,
    aiStatusReason: statusReason,
    aiSummary: result.summary,
    aiChurnRisk: result.risk === 'none' ? 'low' : result.risk,
    aiChurnSignals: churnSignals,
    aiSuggestedAction: result.nextStep,
    aiAction: result.action, // Store raw AI action recommendation
  };
}

// POST /api/ai/analyze-conversations - Analyze tagged conversations
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { tagId, conversationIds, forceRefresh = false } = await request.json();

    // Get the tag configuration
    let tag = null;
    if (tagId) {
      tag = await prisma.tag.findUnique({
        where: { id: tagId },
        select: {
          id: true,
          name: true,
          aiEnabled: true,
          aiSystemPrompt: true,
          aiTeamMembers: true,
          aiOwnerNames: true,
          aiAnalysisInterval: true,
        },
      });
    }

    // Build query for conversations to analyze
    const whereClause: Record<string, unknown> = {
      isSyncDisabled: false,
    };

    if (conversationIds?.length > 0) {
      whereClause.id = { in: conversationIds };
    } else if (tagId) {
      whereClause.tags = { some: { tagId } };
    }

    // Only analyze if there are new messages since last analysis (unless force refresh)
    if (!forceRefresh) {
      whereClause.OR = [
        { aiLastAnalyzedMsgId: null },
        { aiStatusUpdatedAt: null },
      ];
    }

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 50,
          select: {
            id: true,
            body: true,
            direction: true,
            sentAt: true,
            externalMessageId: true,
            metadata: true,
          },
        },
        members: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            externalUserId: true,
          },
        },
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                aiEnabled: true,
                aiSystemPrompt: true,
                aiTeamMembers: true,
                aiOwnerNames: true,
              },
            },
          },
        },
        // Include notes for AI context - notes provide important business context
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 notes should be enough for context
          select: {
            type: true,
            content: true,
            createdAt: true,
          },
        },
      },
      take: 50,
    });

    const results: Array<{
      conversationId: string;
      title: string;
      action: string;
      urgency: string;
      success: boolean;
      error?: string;
      skipped?: boolean;
    }> = [];

    // Process conversations
    for (const conv of conversations) {
      try {
        // Skip if no messages
        if (conv.messages.length === 0) {
          results.push({
            conversationId: conv.id,
            title: conv.title || 'Unknown',
            action: 'Monitor',
            urgency: 'low',
            success: true,
            skipped: true,
          });
          continue;
        }

        // Check if we need to analyze (new messages since last analysis)
        const lastMsgId = conv.messages[0]?.externalMessageId;
        if (!forceRefresh && lastMsgId === conv.aiLastAnalyzedMsgId) {
          results.push({
            conversationId: conv.id,
            title: conv.title || 'Unknown',
            action: conv.aiStatus || 'Monitor',
            urgency: 'low',
            success: true,
            skipped: true,
          });
          continue;
        }

        // Extract intelligence from messages
        // Pass isPrivateChat flag to properly classify senders using direction field
        const isPrivateChat = conv.type === 'private';
        const { intelligence, processedMessages } = extractConversationIntelligence(
          conv.messages,
          conv.title || 'Customer',
          isPrivateChat
        );

        // Skip if no meaningful messages
        if (processedMessages.length === 0) {
          results.push({
            conversationId: conv.id,
            title: conv.title || 'Unknown',
            action: 'Monitor',
            urgency: 'low',
            success: true,
            skipped: true,
          });
          continue;
        }

        // Format for AI prompt - include notes for business context
        const contextString = formatIntelligenceForPrompt(
          intelligence,
          processedMessages,
          conv.title || 'Customer',
          conv.notes // Pass notes for AI context
        );

        // CROSS-CONVERSATION INTELLIGENCE: For group conversations, fetch private chat context
        // This provides complete picture - issues in group may be resolved in Shalin's DMs
        let privateChatContext = '';
        if (conv.type === 'group' || conv.type === 'supergroup') {
          privateChatContext = await fetchPrivateChatContext(conv.members, conv.title || 'Unknown');
        }

        // ====================================================================
        // TAG PRIORITY SELECTION
        // When conversation has multiple AI-enabled tags, use priority system:
        // Churned > Customer > Customer Groups > Partner > Prospect
        // ====================================================================
        const primaryTagWrapper = selectPrimaryTag(conv.tags);
        const primaryTag = primaryTagWrapper?.tag || tag;
        const primaryTagName = primaryTag?.name || 'Unknown';

        // Get config from the PRIMARY tag (highest priority)
        const ownerNames = (primaryTag?.aiOwnerNames as string[]) || [];
        const teamMembers = (primaryTag?.aiTeamMembers as string[]) || [];

        // Build system prompt from PRIMARY tag
        const systemPrompt = buildSystemPrompt(
          primaryTag?.aiSystemPrompt || null,
          ownerNames,
          teamMembers
        );

        // Determine output format based on PRIMARY tag type
        const isPartnerConversation = primaryTagName === 'Partner';
        const isChurnedConversation = primaryTagName === 'Churned';

        // Tag-specific OUTPUT FORMAT
        let OUTPUT_FORMAT: string;

        if (isChurnedConversation) {
          // CHURNED: Win-back focused analysis
          OUTPUT_FORMAT = `OUTPUT FORMAT (strict JSON - MUST include all these fields):
{
  "status": "winnable" | "long_shot" | "lost" | "re_engaged" | "won_back",
  "action": "Win Back Call" | "Send Offer" | "Personal Outreach" | "Final Attempt" | "Close File" | "Celebrate Win",
  "urgency": "critical" | "high" | "medium" | "low",
  "daysSinceChurn": <number - days since they stopped paying/engaging>,
  "churnReason": "<Why they churned: payment_failed | competitor | no_value | budget | bad_experience | unknown>",
  "summary": "<1-2 sentences: Why they left + current win-back status. Be specific about the reason.>",
  "nextStep": "<Specific win-back action. Be concrete and personalized.>",
  "winBackPotential": "high" | "medium" | "low",
  "winBackSignals": ["<positive signals that suggest they might come back>"]
}

WIN-BACK POTENTIAL ASSESSMENT:
- high: Recent churn (<30 days), payment issue (not value issue), still engaging, mentioned they miss it
- medium: 30-90 days churned, left for competitor but not locked in, budget issue that might resolve
- low: 90+ days churned, explicit negative feedback, moved to competitor permanently, bad relationship

URGENCY CALIBRATION (time is critical for win-back):
- critical: Churned <14 days ago AND showing re-engagement signals OR payment failed but no cancellation
- high: Churned 14-30 days ago OR recently responded to outreach OR asking about pricing again
- medium: Churned 30-60 days ago OR had good relationship before leaving
- low: Churned 60+ days ago with no recent engagement OR explicitly said "not interested"

CHURN REASON DETECTION:
- payment_failed: Payment issues mentioned, card declined, billing problems
- competitor: Mentioned trying/using alternative, comparing to others
- no_value: Didn't see ROI, not using the product, confusion about features
- budget: Cost concerns, downsizing, cutting expenses
- bad_experience: Frustration, complaints, unresolved issues
- unknown: No clear reason detected`;
        } else if (isPartnerConversation) {
          // PARTNER: Relationship nurturing focused
          OUTPUT_FORMAT = `OUTPUT FORMAT (strict JSON - MUST include all these fields):
{
  "status": "nurturing" | "high_potential" | "active" | "committed" | "dormant",
  "action": "Reply Now" | "Schedule Call" | "Send Intro" | "Follow Up" | "Nurture" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "<1-2 sentences: How you met, their network/value, current relationship state.>",
  "nextStep": "<Specific action for Shalin. Be concrete and actionable.>",
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "<if risk > low, explain why>"
}

URGENCY CALIBRATION (be aggressive for partners):
- critical: Partner waiting 7+ days OR inbound lead waiting 3+ days OR referral opportunity slipping
- high: Partner waiting 3-7 days OR inbound lead waiting 1-3 days OR same-day engagement needs response
- medium: Active discussion, ball in partner's court, or follow-up needed within week
- low: On track, no pending items, or Shalin just responded`;
        } else {
          // CUSTOMER / CUSTOMER GROUPS: Support focused
          OUTPUT_FORMAT = `OUTPUT FORMAT (strict JSON - MUST include all these fields):
{
  "action": "Reply Now" | "Schedule Call" | "Send Resource" | "Check In" | "Escalate" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "daysWaiting": <number or null if not applicable>,
  "summary": "<1-2 sentences: What's happening + what's at stake. Lead with urgency if any.>",
  "nextStep": "<Specific action: who should do what. Be concrete.>",
  "openItems": ["<list of unresolved customer questions/requests if any>"],
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "<if risk > low, explain why with evidence from conversation>"
}`;
        }

        // Build the analysis prompt
        // Build context description for the prompt
        const hasPrivateChat = privateChatContext.length > 0;

        const analysisPrompt = `${systemPrompt}

${contextString}
${privateChatContext}
Based on the conversation status and messages above${hasPrivateChat ? ', INCLUDING the private chat context between Shalin and the customer' : ''}, provide your analysis.
IMPORTANT:
1. If "CUSTOMER WAITING" is flagged in the status, that's likely high priority
2. Bot messages are NOT team responses - only human team member messages count
3. Be specific about what needs to happen next
4. Include daysWaiting in your response if customer is waiting for a reply
${hasPrivateChat ? '5. CRITICAL: Check the private chat messages - issues that appear unresolved in the group may have been addressed privately. Update your analysis accordingly.' : ''}

${OUTPUT_FORMAT}

Return ONLY valid JSON. No markdown, no explanation.`;

        // Call Claude for analysis
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: analysisPrompt,
          }],
        });

        const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

        // Parse JSON response
        let analysis: IntelligentAnalysisResult;
        try {
          const cleanedResponse = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          analysis = JSON.parse(cleanedResponse);
        } catch {
          console.error('Failed to parse AI response:', responseText);
          throw new Error('Invalid AI response format');
        }

        // Map to database fields
        const dbFields = mapToDbFields(analysis);

        // Update the conversation with AI analysis results + world-class intelligence
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            // Original AI fields (from LLM output)
            aiStatus: dbFields.aiStatus,
            aiStatusReason: dbFields.aiStatusReason,
            aiStatusUpdatedAt: new Date(),
            aiSummary: dbFields.aiSummary,
            aiSummaryUpdatedAt: new Date(),
            aiChurnRisk: dbFields.aiChurnRisk,
            aiChurnSignals: dbFields.aiChurnSignals,
            aiSuggestedAction: dbFields.aiSuggestedAction,
            aiAction: dbFields.aiAction, // Store AI's raw action recommendation
            aiLastAnalyzedMsgId: lastMsgId,
            aiAnalyzing: false,

            // TAG PRIORITY: Store which tag was used for analysis (for transparency)
            aiAnalyzedTagId: primaryTag?.id || null,
            aiAnalyzedTagName: primaryTagName !== 'Unknown' ? primaryTagName : null,

            // WORLD-CLASS INTELLIGENCE FIELDS (pre-computed, 100% reliable)
            aiHealthScore: intelligence.healthScore,
            aiHealthFactors: intelligence.healthFactors,
            aiLifecycleStage: intelligence.lifecycleStage,
            // For Partners, use AI's urgency (context-aware) instead of pre-computed
            // Partner urgency rules are different - inbound leads, relationship stages matter more
            aiUrgencyLevel: isPartnerConversation ? analysis.urgency : intelligence.urgencyLevel,
            aiSentiment: intelligence.recentSentiment,
            aiSentimentTrajectory: intelligence.sentimentTrajectory,
            aiFrustrationSignals: intelligence.frustrationSignals,
            aiCriticalInsights: intelligence.criticalInsights,
          },
        });

        results.push({
          conversationId: conv.id,
          title: conv.title || 'Unknown',
          action: analysis.action,
          urgency: analysis.urgency,
          success: true,
        });
      } catch (error) {
        console.error(`Error analyzing conversation ${conv.id}:`, error);

        // Reset analyzing state on error
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { aiAnalyzing: false },
        }).catch(() => {});

        results.push({
          conversationId: conv.id,
          title: conv.title || 'Unknown',
          action: 'Monitor',
          urgency: 'low',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      processed: results.length,
      analyzed: results.filter(r => r.success && !r.skipped).length,
      skipped: results.filter(r => r.skipped).length,
      failed: results.filter(r => !r.success).length,
      results,
      timing: {
        durationMs: duration,
        avgPerConversation: results.filter(r => !r.skipped).length > 0
          ? Math.round(duration / results.filter(r => !r.skipped).length)
          : 0,
      },
    });
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return NextResponse.json(
      { error: 'Failed to analyze conversations' },
      { status: 500 }
    );
  }
}

// GET /api/ai/analyze-conversations - Get analysis status for a tag
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tagId');

    if (!tagId) {
      return NextResponse.json({ error: 'tagId is required' }, { status: 400 });
    }

    // Get tag config
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
      select: {
        id: true,
        name: true,
        aiEnabled: true,
        aiSystemPrompt: true,
        aiTeamMembers: true,
        aiOwnerNames: true,
        aiAnalysisInterval: true,
        aiLastAnalyzedAt: true,
      },
    });

    if (!tag) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 });
    }

    // Get analysis stats for conversations with this tag
    const stats = await prisma.conversation.groupBy({
      by: ['aiStatus'],
      where: {
        tags: { some: { tagId } },
        isSyncDisabled: false,
      },
      _count: true,
    });

    const statusCounts = {
      needs_owner: 0,
      team_handling: 0,
      at_risk: 0,
      resolved: 0,
      monitoring: 0,
      unanalyzed: 0,
    };

    stats.forEach(s => {
      if (s.aiStatus && s.aiStatus in statusCounts) {
        statusCounts[s.aiStatus as keyof typeof statusCounts] = s._count;
      } else {
        statusCounts.unanalyzed += s._count;
      }
    });

    return NextResponse.json({
      tag: {
        id: tag.id,
        name: tag.name,
        aiEnabled: tag.aiEnabled,
        aiSystemPrompt: tag.aiSystemPrompt,
        aiTeamMembers: tag.aiTeamMembers,
        aiOwnerNames: tag.aiOwnerNames,
        aiAnalysisInterval: tag.aiAnalysisInterval,
        aiLastAnalyzedAt: tag.aiLastAnalyzedAt,
      },
      statusCounts,
    });
  } catch (error) {
    console.error('Error getting AI analysis status:', error);
    return NextResponse.json(
      { error: 'Failed to get analysis status' },
      { status: 500 }
    );
  }
}
