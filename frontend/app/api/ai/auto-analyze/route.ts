import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Default system prompt for Customer Groups (fallback if no tag-specific prompt)
const DEFAULT_CUSTOMER_GROUPS_PROMPT = `You are an elite customer intelligence analyst for Beast Insights, a payments BI company. Your analysis directly impacts customer retention and revenue.

TEAM CONTEXT:
- Shalin (Owner): Escalate to Shalin for pricing, contracts, critical errors, partnership discussions, or when customer mentions him directly.
- Jesus & Prathamesh (Customer Success): Handle support, onboarding, feature questions, technical issues.

YOUR ANALYSIS FRAMEWORK:

1. CONVERSATION DYNAMICS
- Who initiated the last exchange? Customer waiting = urgency.
- What's the tone trajectory? (enthusiastic → neutral = warning)
- Are questions being answered or left hanging?
- Response times: Is the team responsive or slow?

2. CHURN RISK SIGNALS
🔴 HIGH RISK:
- Competitor mentions ("looking at alternatives", "trying X")
- Frustration language ("doesn't work", "waste of time", "disappointed", "confused")
- Cancellation/downgrade requests
- Data export/migration questions
- Silence after active engagement (7+ days)
- Multiple unresolved issues

🟡 MEDIUM RISK:
- Unanswered feature requests
- Declining engagement
- Confusion about product usage
- Team response delays (24+ hours)
- Generic/unenthusiastic customer responses

🟢 POSITIVE SIGNALS:
- Success stories ("this helped us", "great insight")
- Expansion interest (more features, team plans)
- Referral mentions
- Active engagement and questions

3. PSYCHOLOGICAL CUES
- Politeness decreasing over time = frustration building
- Short responses after previously detailed ones = disengagement
- Questioning value = they're comparing options
- Silence after a promise = they're waiting and watching

OUTPUT RULES:
- statusReason: Be SPECIFIC. Not "Customer needs follow-up" but "Asked about pricing 5 days ago, no response yet. Tone shifted from enthusiastic to neutral."
- churnSignals: Cite SPECIFIC evidence from the conversation.
- suggestedAction: Be actionable. Not "Follow up" but "Send a case study relevant to their use case, address the pricing question directly."

Only suggest actions when there's genuine value. Don't over-alert - Shalin trusts your judgment.`;

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

const DEFAULT_TAG_PRIORITY = 99;

/**
 * Select the primary tag for AI analysis from multiple tags.
 * Uses priority system: Churned > Customer > Customer Groups > Partner > Prospect
 */
function selectPrimaryTag(
  tags: Array<{ tag: { id: string; name: string; aiSystemPrompt: string | null; aiTeamMembers: string[]; aiOwnerNames: string[]; aiStatusOptions: unknown; aiStatusLabels: unknown } }>
): { tag: { id: string; name: string; aiSystemPrompt: string | null; aiTeamMembers: string[]; aiOwnerNames: string[]; aiStatusOptions: unknown; aiStatusLabels: unknown } } | null {
  if (tags.length === 0) return null;

  // Filter to tags with AI prompts first, then sort by priority
  const tagsWithPrompts = tags.filter(t => t.tag.aiSystemPrompt);

  if (tagsWithPrompts.length > 0) {
    return tagsWithPrompts.sort((a, b) => {
      const priorityA = TAG_PRIORITY[a.tag.name] ?? DEFAULT_TAG_PRIORITY;
      const priorityB = TAG_PRIORITY[b.tag.name] ?? DEFAULT_TAG_PRIORITY;
      return priorityA - priorityB;
    })[0];
  }

  // Fallback: sort all tags by priority
  return tags.sort((a, b) => {
    const priorityA = TAG_PRIORITY[a.tag.name] ?? DEFAULT_TAG_PRIORITY;
    const priorityB = TAG_PRIORITY[b.tag.name] ?? DEFAULT_TAG_PRIORITY;
    return priorityA - priorityB;
  })[0];
}

// Tag configuration type
interface TagConfig {
  id: string;
  name: string;
  aiSystemPrompt: string | null;
  aiTeamMembers: string[];
  aiOwnerNames: string[];
  aiStatusOptions: string[] | null;
  aiStatusLabels: Record<string, string> | null;
}

// Universal AI analysis result (works for any tag type)
interface AIAnalysisResult {
  status: string;
  statusReason: string;
  summary: string;
  suggestedAction: string;
  // Action badge field - the primary action indicator
  action?: 'Reply Now' | 'Schedule Call' | 'Send Resource' | 'Check In' | 'Escalate' | 'On Track' | 'Monitor';
  urgency?: 'critical' | 'high' | 'medium' | 'low';
  // Customer-specific fields (optional)
  churnRisk?: 'high' | 'medium' | 'low';
  churnSignals?: string[];
  // Partner-specific fields (optional)
  partnerSignals?: Array<{ type: string; signal: string }>;
  // Status recommendation (for manual override scenarios)
  statusRecommendation?: string | null;
  statusRecommendationReason?: string | null;
  // Track which tag was used for analysis
  analyzedByTag?: string;
}

interface MessageForAnalysis {
  body: string | null;
  direction: string;
  sentAt: Date;
  senderName?: string | null;
}

// Known team member Telegram IDs (Shalin, Jesus, Prathamesh, etc.)
// These are excluded when finding customer members in groups
const TEAM_TELEGRAM_IDS = new Set([
  // Add known team member IDs here - will be populated dynamically
]);

const TEAM_USERNAMES = ['shaaborwal', 'jesalbo', 'prathamesh_sranalytics'];

/**
 * Fetch Shalin's private chat context with group members
 * This provides cross-conversation intelligence for more accurate analysis
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
  // Private chats have type 'private' and the externalChatId often matches the user ID
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
        take: 30, // Get last 30 messages from private chat
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
  let privateContext = '\n🔒 PRIVATE CHAT CONTEXT (Shalin\'s direct messages with customer - use this for complete picture):\n';

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

    // Format messages (show last 20 meaningful ones)
    const meaningfulMessages = chat.messages
      .filter(m => m.body && m.body.trim().length > 5)
      .slice(0, 20)
      .reverse(); // Chronological order

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

function formatMessagesForAnalysis(messages: MessageForAnalysis[], tagName?: string): string {
  // Use appropriate labels based on tag type
  const isPartner = tagName?.toLowerCase().includes('partner');
  const outboundLabel = isPartner ? 'Shalin' : 'Team';
  const inboundLabel = isPartner ? 'Partner' : 'Customer';

  return messages
    .filter(m => m.body && m.body.trim().length > 0)
    .map(m => {
      const time = new Date(m.sentAt).toLocaleString();
      const sender = m.direction === 'outbound' ? outboundLabel : (m.senderName || inboundLabel);
      return `[${time}] ${sender}: ${m.body}`;
    })
    .join('\n');
}

// Build tag-specific output format instructions
function buildOutputFormat(tagConfig: TagConfig | null): string {
  const tagName = tagConfig?.name?.toLowerCase() || 'customer';

  if (tagName === 'customer') {
    // Customer-specific output format (Shalin's direct 1:1 relationships)
    return `{
  "status": "happy" | "needs_attention" | "at_risk" | "escalated" | "resolved",
  "action": "Personal Check-in" | "Address Concern" | "Celebrate Win" | "Discuss Renewal" | "Resolve Issue" | "Strengthen Relationship" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "relationshipHealth": "strong" | "stable" | "cooling" | "at_risk",
  "summary": "Current relationship state, any pending issues, recent wins or concerns.",
  "suggestedAction": "Specific action for Shalin. Be personal and relationship-focused.",
  "customerSentiment": "positive" | "neutral" | "frustrated" | "unknown",
  "openIssues": ["any unresolved concerns or requests"],
  "opportunities": ["expansion, referral, or upsell opportunities mentioned"]
}`;
  } else if (tagName === 'prospect') {
    // Prospect-specific output format (sales pipeline)
    return `{
  "status": "new_lead" | "qualifying" | "demo_scheduled" | "demo_completed" | "negotiating" | "closed_won" | "closed_lost" | "nurturing",
  "action": "Book Demo" | "Send Follow-up" | "Share Case Study" | "Send Proposal" | "Close Deal" | "Nurture" | "Re-engage" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "How you connected, their business, where they are in the sales process.",
  "suggestedAction": "Specific action for Shalin.",
  "buyingSignals": ["signals that indicate they're ready to buy"],
  "objections": ["concerns or hesitations they've raised"],
  "dealPotential": "high" | "medium" | "low"
}`;
  } else if (tagName === 'churned') {
    // Churned-specific output format (win-back)
    return `{
  "status": "winnable" | "long_shot" | "lost" | "re_engaged" | "won_back",
  "action": "Win Back Call" | "Send Offer" | "Personal Outreach" | "Final Attempt" | "Close File" | "Celebrate Win",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "Why they left + current win-back status.",
  "suggestedAction": "Specific win-back action.",
  "churnReason": "payment_failed | competitor | no_value | budget | bad_experience | unknown",
  "winBackPotential": "high" | "medium" | "low",
  "winBackSignals": ["positive signals that suggest they might come back"]
}`;
  } else if (tagName === 'partner') {
    // Partner-specific output format
    return `{
  "status": "nurturing" | "high_potential" | "active" | "dormant" | "committed",
  "action": "Reply Now" | "Schedule Call" | "Send Intro" | "Follow Up" | "Nurture" | "On Track",
  "urgency": "critical" | "high" | "medium" | "low",
  "summary": "Relationship context: how met, their value/network, current state.",
  "suggestedAction": "Specific, actionable next step for Shalin.",
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "if risk > low, explain why"
}`;
  } else {
    // Customer Groups-specific output format (team handles)
    return `{
  "action": "Reply Now" | "Schedule Call" | "Send Resource" | "Check In" | "Escalate" | "On Track" | "Monitor",
  "urgency": "critical" | "high" | "medium" | "low",
  "status": "needs_owner" | "team_handling" | "resolved" | "at_risk" | "monitoring",
  "summary": "1-2 sentence summary of current situation.",
  "suggestedAction": "Actionable recommendation.",
  "churnRisk": "high" | "medium" | "low",
  "churnSignals": ["Specific signal with evidence"],
  "risk": "none" | "low" | "medium" | "high",
  "riskReason": "if risk > low, explain why with evidence"
}`;
  }
}

// Analyze a single conversation (modular - works for any tag type)
async function analyzeConversation(conversationId: string): Promise<AIAnalysisResult | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
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
              aiSystemPrompt: true,
              aiTeamMembers: true,
              aiOwnerNames: true,
              aiStatusOptions: true,
              aiStatusLabels: true,
            },
          },
        },
      },
      // Include notes for AI context - notes provide important business context
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          type: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  if (!conv || conv.messages.length === 0) {
    return null;
  }

  // ====================================================================
  // TAG PRIORITY SELECTION
  // When conversation has multiple AI-enabled tags, use priority system:
  // Churned > Customer > Customer Groups > Partner > Prospect
  // ====================================================================
  const primaryTagWrapper = selectPrimaryTag(conv.tags);
  const primaryTag = primaryTagWrapper?.tag;

  const tagConfig: TagConfig | null = primaryTag ? {
    id: primaryTag.id,
    name: primaryTag.name,
    aiSystemPrompt: primaryTag.aiSystemPrompt,
    aiTeamMembers: primaryTag.aiTeamMembers,
    aiOwnerNames: primaryTag.aiOwnerNames,
    aiStatusOptions: primaryTag.aiStatusOptions as string[] | null,
    aiStatusLabels: primaryTag.aiStatusLabels as Record<string, string> | null,
  } : null;

  const systemPrompt = tagConfig?.aiSystemPrompt || DEFAULT_CUSTOMER_GROUPS_PROMPT;
  const teamMembers = tagConfig?.aiTeamMembers || ['Jesus', 'Prathamesh'];
  const ownerNames = tagConfig?.aiOwnerNames || ['Shalin'];
  const tagName = tagConfig?.name || 'Customer';

  // Build member map for sender names
  const memberMap = new Map<string, string>();
  conv.members.forEach(m => {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.username || 'Unknown';
    memberMap.set(m.externalUserId, name);
  });

  const messagesWithNames = conv.messages.map(m => {
    const metadata = m.metadata as { senderId?: string; senderName?: string } | null;
    const senderId = metadata?.senderId;
    const senderName = metadata?.senderName || (senderId ? memberMap.get(senderId) : null);
    return { ...m, senderName };
  });

  const messagesText = formatMessagesForAnalysis(messagesWithNames, tagName);

  // Format notes for context - notes are critical business context
  let notesContext = '';
  if (conv.notes && conv.notes.length > 0) {
    notesContext = '\n📝 INTERNAL NOTES (context from team - consider in your analysis):\n';
    conv.notes.forEach(note => {
      const date = new Date(note.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const typeLabel = note.type === 'meeting' ? '📅 Meeting' : note.type === 'call' ? '📞 Call' : '📝 Note';
      notesContext += `  [${dateStr}] ${typeLabel}: ${note.content.slice(0, 200)}${note.content.length > 200 ? '...' : ''}\n`;
    });
    notesContext += '\n';
  }

  // CROSS-CONVERSATION INTELLIGENCE: For group conversations, fetch Shalin's private chat context
  // This provides a complete picture - issues discussed in group may be resolved in private DMs
  let privateChatContext = '';
  if (conv.type === 'group' || conv.type === 'supergroup') {
    privateChatContext = await fetchPrivateChatContext(conv.members, conv.title || 'Unknown');
  }

  // Build output format based on tag type
  const outputFormat = buildOutputFormat(tagConfig);

  // Build context description for the prompt
  const hasNotes = conv.notes && conv.notes.length > 0;
  const hasPrivateChat = privateChatContext.length > 0;
  let contextDescription = 'the conversation above';
  if (hasNotes && hasPrivateChat) {
    contextDescription = 'the GROUP CONVERSATION, INTERNAL NOTES, and PRIVATE CHAT CONTEXT above';
  } else if (hasNotes) {
    contextDescription = 'the conversation above AND the internal notes';
  } else if (hasPrivateChat) {
    contextDescription = 'the GROUP CONVERSATION and PRIVATE CHAT CONTEXT above';
  }

  // Build the analysis prompt
  const analysisPrompt = `${systemPrompt}

${teamMembers.length > 0 ? `TEAM MEMBERS (handle routine support): ${teamMembers.join(', ')}` : ''}
OWNER (escalate important items to): ${ownerNames.join(', ')}
${notesContext}${privateChatContext}
=== GROUP CONVERSATION: ${conv.title || tagName} (${conv.type}) ===
${messagesText}

IMPORTANT: When analyzing, consider ALL context provided above including any private chat messages between Shalin and the customer. Issues that appear unresolved in the group chat may have been addressed in private messages.

Based on ${contextDescription}, provide your analysis in this exact JSON format:
${outputFormat}

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 700,
    messages: [{ role: 'user', content: analysisPrompt }],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  const cleanedResponse = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const result = JSON.parse(cleanedResponse);
  // Add which tag was used for analysis
  result.analyzedByTag = tagName;
  return result;
}

// POST /api/ai/auto-analyze - Trigger analysis for conversations with new messages
// This is called automatically when new messages arrive OR when notes change
// MODULAR: Works for any tag type (Customer, Partner, Prospect, etc.)
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { conversationIds, tagId, forceReanalyze } = await request.json();

    // Build query for conversations that need analysis
    const whereClause: Record<string, unknown> = {
      isSyncDisabled: false,
      aiAnalyzing: false, // Don't analyze if already analyzing
    };

    if (conversationIds?.length > 0) {
      whereClause.id = { in: conversationIds };
    } else if (tagId) {
      whereClause.tags = { some: { tagId } };
    }

    // Find conversations that might need analysis (has messages)
    const conversations = await prisma.conversation.findMany({
      where: {
        ...whereClause,
        lastSyncedMessageId: { not: null }, // Must have synced messages
      },
      select: {
        id: true,
        title: true,
        lastSyncedMessageId: true,
        aiLastAnalyzedMsgId: true,
        manualStatus: true, // Include manual status for recommendation logic
      },
      take: 50, // Fetch more to filter properly
    });

    // Filter to only those with actual new messages (lastSyncedMessageId !== aiLastAnalyzedMsgId)
    // OR force reanalyze if notes changed (forceReanalyze=true)
    const conversationsToAnalyze = forceReanalyze
      ? conversations.slice(0, 10) // Force reanalyze all matched conversations
      : conversations.filter(
          c => c.lastSyncedMessageId !== c.aiLastAnalyzedMsgId
        ).slice(0, 10); // Limit batch size for speed

    if (conversationsToAnalyze.length === 0) {
      return NextResponse.json({
        analyzed: 0,
        message: 'No conversations need analysis',
        timing: { durationMs: Date.now() - startTime },
      });
    }

    // Mark conversations as analyzing (optimistic UI update)
    await prisma.conversation.updateMany({
      where: { id: { in: conversationsToAnalyze.map(c => c.id) } },
      data: {
        aiAnalyzing: true,
        aiAnalyzingStartedAt: new Date(),
      },
    });

    const results: Array<{
      conversationId: string;
      title: string;
      success: boolean;
      status?: string;
      error?: string;
    }> = [];

    // Analyze each conversation
    for (const conv of conversationsToAnalyze) {
      try {
        const analysis = await analyzeConversation(conv.id);

        if (analysis) {
          // Get the current lastSyncedMessageId from the database (it may have changed)
          const currentConv = await prisma.conversation.findUnique({
            where: { id: conv.id },
            select: { lastSyncedMessageId: true, manualStatus: true },
          });

          // Build update data - MODULAR for any tag type
          const updateData: Record<string, unknown> = {
            aiStatus: analysis.status,
            aiStatusReason: analysis.statusReason,
            aiStatusUpdatedAt: new Date(),
            aiSummary: analysis.summary,
            aiSummaryUpdatedAt: new Date(),
            aiSuggestedAction: analysis.suggestedAction,
            // Store AI's action recommendation (the primary badge value)
            aiAction: analysis.action || null,
            aiUrgencyLevel: analysis.urgency || 'medium',
            // Mark as analyzed up to the current lastSyncedMessageId
            aiLastAnalyzedMsgId: currentConv?.lastSyncedMessageId || conv.lastSyncedMessageId,
            aiAnalyzing: false,
            aiAnalyzingStartedAt: null,
            // Track which tag was used for this analysis
            aiAnalyzedTagName: analysis.analyzedByTag || null,
          };

          // Add Customer-specific fields if present
          if (analysis.churnRisk) {
            updateData.aiChurnRisk = analysis.churnRisk;
          }
          if (analysis.churnSignals) {
            updateData.aiChurnSignals = analysis.churnSignals;
          }

          // Add status recommendation if AI suggests a change
          // Only set if user has manual override AND AI suggests different status
          if (currentConv?.manualStatus && analysis.statusRecommendation &&
              analysis.statusRecommendation !== currentConv.manualStatus) {
            updateData.aiStatusRecommendation = analysis.statusRecommendation;
            updateData.aiStatusRecommendationReason = analysis.statusRecommendationReason;
          } else if (analysis.statusRecommendation && analysis.statusRecommendation !== analysis.status) {
            // AI analyzed status differs from what it recommends (edge case)
            updateData.aiStatusRecommendation = analysis.statusRecommendation;
            updateData.aiStatusRecommendationReason = analysis.statusRecommendationReason;
          } else {
            // Clear any previous recommendation if no longer applicable
            updateData.aiStatusRecommendation = null;
            updateData.aiStatusRecommendationReason = null;
          }

          await prisma.conversation.update({
            where: { id: conv.id },
            data: updateData,
          });

          results.push({
            conversationId: conv.id,
            title: conv.title || 'Unknown',
            success: true,
            status: analysis.status,
          });
        }
      } catch (error) {
        console.error(`Error analyzing conversation ${conv.id}:`, error);

        // Clear analyzing state on error
        await prisma.conversation.update({
          where: { id: conv.id },
          data: {
            aiAnalyzing: false,
            aiAnalyzingStartedAt: null,
          },
        });

        results.push({
          conversationId: conv.id,
          title: conv.title || 'Unknown',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      analyzed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
      timing: {
        durationMs: Date.now() - startTime,
        avgPerConversation: Math.round((Date.now() - startTime) / conversationsToAnalyze.length),
      },
    });
  } catch (error) {
    console.error('Error in auto-analyze:', error);
    return NextResponse.json(
      { error: 'Failed to auto-analyze conversations' },
      { status: 500 }
    );
  }
}

// GET /api/ai/auto-analyze - Check for stale analyzing states and detect stale analysis
export async function GET() {
  try {
    // 1. Clean up conversations stuck in analyzing state for more than 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const staleAnalyzing = await prisma.conversation.updateMany({
      where: {
        aiAnalyzing: true,
        aiAnalyzingStartedAt: { lt: twoMinutesAgo },
      },
      data: {
        aiAnalyzing: false,
        aiAnalyzingStartedAt: null,
      },
    });

    // 2. STALENESS DETECTION: Find conversations with stale AI analysis
    // Criteria for staleness:
    // - Has AI analysis (aiSummary not null)
    // - Analysis is older than 24 hours (aiSummaryUpdatedAt < 24h ago)
    // - Has new messages since analysis (lastSyncedMessageId !== aiLastAnalyzedMsgId)
    // - Not currently being analyzed
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const staleAnalysis = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        aiAnalyzing: false,
        aiSummary: { not: null },
        aiSummaryUpdatedAt: { lt: twentyFourHoursAgo },
        lastSyncedMessageId: { not: null },
        NOT: {
          // Only include where lastSyncedMessageId differs from aiLastAnalyzedMsgId
          // This is a complex check - we do it in app logic below
        },
      },
      select: {
        id: true,
        title: true,
        lastSyncedMessageId: true,
        aiLastAnalyzedMsgId: true,
        aiSummaryUpdatedAt: true,
        lastMessageAt: true,
        tags: {
          select: {
            tag: { select: { id: true, name: true, aiEnabled: true } }
          }
        }
      },
      take: 100,
    });

    // Filter to only AI-enabled tags and those with new messages
    const conversationsNeedingReanalysis = staleAnalysis.filter(conv => {
      // Check if has AI-enabled tag
      const hasAiTag = conv.tags.some(t => t.tag.aiEnabled);
      if (!hasAiTag) return false;

      // Check if has new messages since last analysis
      if (conv.lastSyncedMessageId === conv.aiLastAnalyzedMsgId) return false;

      return true;
    });

    // 3. URGENT STALENESS: Conversations with activity in last 7 days but analysis is stale
    // These need re-analysis to ensure recommendations are current
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const urgentConversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        aiAnalyzing: false,
        // Has messages
        lastSyncedMessageId: { not: null },
        // Has recent activity in last 7 days (not dormant)
        lastMessageAt: { gt: sevenDaysAgo },
        // Has AI-enabled tag
        tags: {
          some: {
            tag: { aiEnabled: true }
          }
        },
      },
      select: {
        id: true,
        title: true,
        lastSyncedMessageId: true,
        aiLastAnalyzedMsgId: true,
      },
      take: 20,
    });

    // Filter urgent ones that have new messages
    const urgentNeedingReanalysis = urgentConversations.filter(
      conv => conv.lastSyncedMessageId !== conv.aiLastAnalyzedMsgId
    );

    return NextResponse.json({
      cleanedUp: staleAnalyzing.count,
      staleness: {
        staleConversations: conversationsNeedingReanalysis.length,
        urgentConversations: urgentNeedingReanalysis.length,
        conversationIds: conversationsNeedingReanalysis.map(c => c.id),
        urgentIds: urgentNeedingReanalysis.map(c => c.id),
      },
      message: `Cleaned up ${staleAnalyzing.count} stale states. Found ${conversationsNeedingReanalysis.length} stale + ${urgentNeedingReanalysis.length} urgent conversations needing re-analysis.`,
    });
  } catch (error) {
    console.error('Error in staleness detection:', error);
    return NextResponse.json(
      { error: 'Failed to detect stale states' },
      { status: 500 }
    );
  }
}
