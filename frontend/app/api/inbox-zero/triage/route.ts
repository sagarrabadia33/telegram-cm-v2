import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import {
  TRIAGE_PROMPT,
  COMMITMENT_PROMPT,
  formatMessagesForPrompt,
  getTagName,
  parseAIResponse,
} from '@/app/lib/inbox-zero/prompts';
import { getHolisticConversationContext } from '@/app/lib/inbox-zero/context-resolver';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface TriageResult {
  bucket: 'respond' | 'review' | 'clear';
  confidence: number;
  reason: string;
  isDirectMention: boolean;
  isQuestion: boolean;
  isComplaint: boolean;
  priorityScore: number;
  conversationState?: 'waiting_on_them' | 'waiting_on_you' | 'concluded' | 'ongoing';
  suggestedAction?: 'reply' | 'follow_up' | 'wait' | 'close' | null;
  openLoops?: string[];
  lastSpeechAct?: 'directive' | 'commissive' | 'assertive' | 'expressive' | 'declarative';
}

interface CommitmentResult {
  commitments: Array<{
    content: string;
    extractedFrom: string;
    direction: 'outbound' | 'inbound';
    dueDate: string | null;
    confidence: number;
  }>;
}

// In-memory cache for triage results (TTL: 5 minutes)
const triageCache = new Map<string, { result: TriageResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedTriage(conversationId: string, lastMessageId: string): TriageResult | null {
  const key = `${conversationId}:${lastMessageId}`;
  const cached = triageCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  return null;
}

function setCachedTriage(conversationId: string, lastMessageId: string, result: TriageResult): void {
  const key = `${conversationId}:${lastMessageId}`;
  triageCache.set(key, { result, timestamp: Date.now() });

  // Clean old cache entries (keep last 500)
  if (triageCache.size > 500) {
    const entries = Array.from(triageCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 100; i++) {
      triageCache.delete(entries[i][0]);
    }
  }
}

// POST /api/inbox-zero/triage - Trigger AI triage for conversations
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { conversationIds, forceRefresh = false } = await request.json();

    // Get conversations to triage
    // IMPORTANT: Include recent conversations even if unread is 0, because:
    // 1. The user may have marked as read but not responded
    // 2. There might be pending requests/commitments we need to track
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const triageStaleTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    const whereClause = conversationIds?.length > 0
      ? { id: { in: conversationIds } }
      : {
          isSyncDisabled: false,
          type: { in: ['private', 'group', 'supergroup'] },
          AND: [
            // Must have recent activity OR unread messages
            {
              OR: [
                { unreadCount: { gt: 0 } },
                { lastMessageAt: { gte: recentCutoff } },
              ],
            },
            // And must need triage (unless force refresh)
            ...(forceRefresh ? [] : [{
              OR: [
                { triage: null },
                { triage: { updatedAt: { lt: triageStaleTime } } },
              ],
            }]),
          ],
        };

    const conversations = await prisma.conversation.findMany({
      where: whereClause,
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 30, // More messages for better context
          select: {
            id: true,
            body: true,
            direction: true,
            sentAt: true,
            externalMessageId: true,
          },
        },
        tags: {
          include: {
            tag: { select: { name: true } },
          },
        },
        triage: true,
        contact: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            metadata: true,
          },
        },
      },
      take: 50, // Limit batch size
    });

    const results: Array<{
      conversationId: string;
      bucket: string;
      success: boolean;
      error?: string;
      cached?: boolean;
      crossConversationOverride?: boolean;
    }> = [];

    // Process conversations in parallel batches for speed
    const BATCH_SIZE = 5;
    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
      const batch = conversations.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (conv) => {
        try {
          // Skip if no messages
          if (conv.messages.length === 0) {
            results.push({
              conversationId: conv.id,
              bucket: 'clear',
              success: true,
            });
            return;
          }

          const lastMessageId = conv.messages[0]?.externalMessageId || '';

          // Check cache first (unless force refresh)
          if (!forceRefresh) {
            const cachedResult = getCachedTriage(conv.id, lastMessageId);
            if (cachedResult) {
              results.push({
                conversationId: conv.id,
                bucket: cachedResult.bucket,
                success: true,
                cached: true,
              });
              return;
            }
          }

          // STEP 1: Get cross-conversation context for private chats
          let crossConvContext: Awaited<ReturnType<typeof getHolisticConversationContext>> | null = null;
          let crossConvOverride = false;

          if (conv.type === 'private' && conv.contact?.id) {
            try {
              crossConvContext = await getHolisticConversationContext(conv.id);

              // Check if cross-conversation signals suggest this is resolved elsewhere
              if (crossConvContext.crossConversationSignals.issueLikelyResolvedElsewhere) {
                // Override AI triage - this issue was addressed in another conversation
                const overrideResult: TriageResult = {
                  bucket: 'clear',
                  confidence: 0.85,
                  reason: crossConvContext.crossConversationSignals.reason,
                  isDirectMention: false,
                  isQuestion: false,
                  isComplaint: false,
                  priorityScore: 2,
                  conversationState: 'concluded',
                  suggestedAction: 'close',
                };

                await prisma.messageTriage.upsert({
                  where: { conversationId: conv.id },
                  create: {
                    conversationId: conv.id,
                    ...overrideResult,
                    hasOverduePromise: false,
                    lastMessageId,
                  },
                  update: {
                    ...overrideResult,
                    lastMessageId,
                    updatedAt: new Date(),
                  },
                });

                setCachedTriage(conv.id, lastMessageId, overrideResult);

                results.push({
                  conversationId: conv.id,
                  bucket: 'clear',
                  success: true,
                  crossConversationOverride: true,
                });
                return;
              }
            } catch (e) {
              console.error('Error getting cross-conversation context:', e);
              // Continue with regular triage
            }
          }

          // STEP 2: Regular AI triage
          const tagName = getTagName(conv.tags);
          const messagesText = formatMessagesForPrompt(conv.messages);

          // Build enhanced prompt with cross-conversation context
          let contextAddition = '';
          if (crossConvContext && crossConvContext.relatedConversations.length > 0) {
            contextAddition = `\n\n=== CROSS-CONVERSATION CONTEXT ===
This contact has ${crossConvContext.relatedConversations.length} other conversations.
${crossConvContext.contactContext?.hasRecentGroupActivity
  ? `Recent activity in groups: ${crossConvContext.relatedConversations
      .filter(c => c.type !== 'private')
      .slice(0, 3)
      .map(c => `"${c.title}" (${c.lastMessageBody?.slice(0, 50) || 'no message'}...)`)
      .join(', ')}`
  : 'No recent group activity.'
}
${crossConvContext.contactContext?.openLoops && crossConvContext.contactContext.openLoops.length > 0
  ? `Open requests from this contact: ${crossConvContext.contactContext.openLoops
      .slice(0, 2)
      .map(l => `"${l.content.slice(0, 50)}..."`)
      .join(', ')}`
  : ''
}`;
          }

          const prompt = TRIAGE_PROMPT
            .replace('{tag}', tagName || 'Untagged')
            .replace('{type}', conv.type)
            .replace('{triagePreference}', conv.triagePreference || 'smart');

          const contactName = conv.contact?.displayName || conv.contact?.firstName || conv.title || 'Contact';

          // Use Haiku for speed on simple cases, Sonnet for complex tagged contacts
          const useHaiku = !tagName || tagName === 'Untagged';
          const model = useHaiku ? 'claude-3-5-haiku-20241022' : 'claude-sonnet-4-20250514';

          const triageResponse = await anthropic.messages.create({
            model,
            max_tokens: 600,
            messages: [{
              role: 'user',
              content: `${prompt}${contextAddition}

=== CONVERSATION WITH: ${contactName} ===

${messagesText}

Analyze this conversation using Speech Act Theory and determine the correct triage bucket.`,
            }],
          });

          const triageText = triageResponse.content[0].type === 'text'
            ? triageResponse.content[0].text
            : '';

          const triageResult = parseAIResponse<TriageResult>(triageText);

          if (!triageResult) {
            throw new Error('Failed to parse triage response');
          }

          // Cache the result
          setCachedTriage(conv.id, lastMessageId, triageResult);

          // Upsert triage record with conversation state
          await prisma.messageTriage.upsert({
            where: { conversationId: conv.id },
            create: {
              conversationId: conv.id,
              bucket: triageResult.bucket,
              confidence: triageResult.confidence,
              reason: triageResult.reason,
              priorityScore: triageResult.priorityScore,
              isDirectMention: triageResult.isDirectMention,
              isQuestion: triageResult.isQuestion,
              isComplaint: triageResult.isComplaint,
              hasOverduePromise: false,
              conversationState: triageResult.conversationState,
              suggestedAction: triageResult.suggestedAction,
              lastMessageId,
            },
            update: {
              bucket: triageResult.bucket,
              confidence: triageResult.confidence,
              reason: triageResult.reason,
              priorityScore: triageResult.priorityScore,
              isDirectMention: triageResult.isDirectMention,
              isQuestion: triageResult.isQuestion,
              isComplaint: triageResult.isComplaint,
              conversationState: triageResult.conversationState,
              suggestedAction: triageResult.suggestedAction,
              lastMessageId,
              updatedAt: new Date(),
            },
          });

          // Extract commitments in background (don't block response)
          extractCommitmentsAsync(conv.id, messagesText).catch(e =>
            console.error('Error extracting commitments:', e)
          );

          results.push({
            conversationId: conv.id,
            bucket: triageResult.bucket,
            success: true,
          });
        } catch (error) {
          console.error(`Error triaging conversation ${conv.id}:`, error);
          results.push({
            conversationId: conv.id,
            bucket: 'review',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }));
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      processed: results.length,
      results,
      timing: {
        durationMs: duration,
        avgPerConversation: results.length > 0 ? Math.round(duration / results.length) : 0,
        cachedCount: results.filter(r => r.cached).length,
        crossConvOverrides: results.filter(r => r.crossConversationOverride).length,
      },
    });
  } catch (error) {
    console.error('Error in triage:', error);
    return NextResponse.json(
      { error: 'Failed to triage conversations' },
      { status: 500 }
    );
  }
}

// Background commitment extraction
async function extractCommitmentsAsync(conversationId: string, messagesText: string) {
  try {
    const commitmentPrompt = COMMITMENT_PROMPT
      .replace('{userName}', 'User')
      .replace('{messages}', messagesText);

    const commitmentResponse = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: commitmentPrompt,
      }],
    });

    const commitmentText = commitmentResponse.content[0].type === 'text'
      ? commitmentResponse.content[0].text
      : '';

    const commitmentResult = parseAIResponse<CommitmentResult>(commitmentText);

    if (commitmentResult && commitmentResult.commitments) {
      for (const commitment of commitmentResult.commitments) {
        if (commitment.confidence >= 0.7) {
          // Check if commitment already exists (avoid duplicates)
          const existing = await prisma.commitment.findFirst({
            where: {
              conversationId,
              content: commitment.content,
              status: 'pending',
            },
          });

          if (!existing) {
            await prisma.commitment.create({
              data: {
                conversationId,
                content: commitment.content,
                extractedFrom: commitment.extractedFrom,
                direction: commitment.direction,
                dueDate: commitment.dueDate ? new Date(commitment.dueDate) : null,
                confidence: commitment.confidence,
              },
            });
          }
        }
      }
    }
  } catch (e) {
    console.error('Error in background commitment extraction:', e);
  }
}
