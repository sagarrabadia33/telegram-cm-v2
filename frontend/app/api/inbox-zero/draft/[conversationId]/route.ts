import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';
import {
  formatMessagesForPrompt,
  getTagName,
  getLastMessageContext,
  extractUserCommitmentsFromMessages,
} from '@/app/lib/inbox-zero/prompts';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Extended tone options with preset support
type DraftTone = 'casual' | 'professional' | 'warm' | 'empathetic' | 'brief' | 'friendly';

// Enhanced draft prompt that uses tone profile
const TONE_AWARE_DRAFT_PROMPT = `Generate a contextually appropriate reply that matches the user's authentic writing style.

=== CRITICAL: UNDERSTAND THE CONVERSATION STATE FIRST ===

LAST MESSAGE SENDER: {lastMessageDirection}
CONVERSATION STATE: {conversationState}

BEFORE GENERATING A REPLY, CHECK:
1. What did the USER (YOU) last say? Don't repeat or contradict it.
2. What commitments has the USER already made? Don't suggest them again.
3. Has the conversation been resolved? If yes, DON'T generate a reply that reopens it.

COMMON MISTAKES TO AVOID:
- User already sent a meeting link → DON'T suggest sending a meeting link
- User already provided pricing → DON'T suggest sending pricing
- User said "let's connect in an hour" → DON'T suggest scheduling a call
- They said "ok thank you" → This is acknowledgment, maybe no reply needed
- User is waiting for THEIR response → Generate a follow-up, not a new offer

=== USER'S AUTHENTIC WRITING STYLE (from analyzed patterns) ===

GREETING PATTERNS they typically use: {greetingPatterns}
SIGN-OFF PATTERNS they typically use: {signOffPatterns}
COMMON PHRASES they use: {commonPhrases}
FORMALITY LEVEL: {formalityLevel} (0 = very casual, 1 = very formal)
EMOJI USAGE: {emojiUsage}
TYPICAL MESSAGE LENGTH: {averageLength} characters

SAMPLE MESSAGES from this user:
{sampleMessages}

=== TONE PRESET: {tone} ===
- casual: Match their natural relaxed style
- professional: More formal while keeping their voice
- warm: Add more warmth/friendliness
- empathetic: Show understanding and care
- brief: Short, punchy response in their style
- friendly: Upbeat, positive energy

RELATIONSHIP TAG: {tag}

=== INTERNAL NOTES (business context from team) ===
{notesContext}

WHAT USER HAS ALREADY COMMITTED TO IN THIS CONVERSATION:
{userCommitments}

CONVERSATION HISTORY (RECENT):
{lastMessages}

=== WHAT TO GENERATE ===

Based on conversation state:
- IF "waiting_on_them": Generate a gentle follow-up or nothing
- IF "waiting_on_you": Generate response to their unanswered question/request
- IF "concluded": Generate nothing or a brief closing (if needed)
- IF "ongoing": Generate appropriate next message

Generate a reply that:
1. SOUNDS EXACTLY LIKE the user based on their patterns above
2. Uses their greeting style if starting a message
3. Uses their typical phrases where natural
4. Matches their emoji usage frequency
5. Is the right length for their style
6. Does NOT repeat commitments already made
7. Moves conversation forward (not sideways or backward)
8. Is actionable and specific

If no reply is needed (conversation concluded), output: [NO_REPLY_NEEDED]

Output ONLY the reply text, nothing else.`;

// POST /api/inbox-zero/draft/[conversationId] - Generate draft reply
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { tone = 'casual' } = await request.json() as { tone?: DraftTone };

    // Fetch conversation with messages, tags, and notes
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 20,
          select: {
            body: true,
            direction: true,
            sentAt: true,
          },
        },
        tags: {
          include: {
            tag: { select: { id: true, name: true } },
          },
        },
        triage: true,
        contact: {
          select: {
            displayName: true,
            firstName: true,
          },
        },
        // Include notes for context - they contain important business context
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5, // Last 5 notes for context
          select: {
            type: true,
            content: true,
            createdAt: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get the first tag's ID for tag-specific tone profile
    const primaryTagId = conversation.tags[0]?.tag?.id || null;

    // Try to get tone profile (tag-specific first, then global fallback)
    // Wrapped in try-catch to handle case where ToneProfile table doesn't exist yet
    let toneProfile = null;
    try {
      if (primaryTagId) {
        toneProfile = await prisma.toneProfile.findUnique({
          where: { tagId: primaryTagId },
        });
      }
      // Fallback to global profile
      if (!toneProfile) {
        toneProfile = await prisma.toneProfile.findFirst({
          where: { tagId: null },
        });
      }
    } catch (toneError) {
      console.warn('ToneProfile query failed (table may not exist):', toneError);
      // Continue without tone profile - will use defaults
    }

    // Format tone profile data for prompt
    let greetingPatterns = 'No specific patterns - use natural greetings';
    let signOffPatterns = 'No specific patterns - use natural sign-offs';
    let commonPhrases = 'No specific patterns detected';
    let formalityLevel = '0.5 (balanced)';
    let emojiUsage = 'Moderate emoji usage';
    let averageLength = '50-100';
    let sampleMessages = 'No sample messages available';

    if (toneProfile) {
      greetingPatterns = Array.isArray(toneProfile.greetingPatterns)
        ? (toneProfile.greetingPatterns as string[]).join(', ')
        : greetingPatterns;
      signOffPatterns = Array.isArray(toneProfile.signOffPatterns)
        ? (toneProfile.signOffPatterns as string[]).join(', ')
        : signOffPatterns;
      commonPhrases = Array.isArray(toneProfile.commonPhrases)
        ? (toneProfile.commonPhrases as string[]).join(', ')
        : commonPhrases;
      formalityLevel = `${toneProfile.formalityLevel.toFixed(2)} (${
        toneProfile.formalityLevel < 0.3 ? 'casual' :
        toneProfile.formalityLevel < 0.7 ? 'balanced' : 'formal'
      })`;
      emojiUsage = toneProfile.emojiFrequency > 0.5 ? 'Frequent emoji user' :
                   toneProfile.emojiFrequency > 0.2 ? 'Occasional emoji user' :
                   'Rarely uses emojis';
      averageLength = `~${toneProfile.averageLength} characters`;
      if (Array.isArray(toneProfile.sampleMessages) && toneProfile.sampleMessages.length > 0) {
        sampleMessages = (toneProfile.sampleMessages as string[])
          .slice(0, 5)
          .map((m, i) => `${i + 1}. "${m}"`)
          .join('\n');
      }
    } else {
      // Fallback: Get some recent outbound messages as samples
      const userMessages = await prisma.message.findMany({
        where: {
          direction: 'outbound',
          body: { not: null },
        },
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: { body: true },
      });
      if (userMessages.length > 0) {
        sampleMessages = userMessages
          .slice(0, 5)
          .map((m, i) => `${i + 1}. "${m.body}"`)
          .join('\n');
      }
    }

    // Get tag name for context
    const tagName = getTagName(conversation.tags);

    // Build notes context for AI
    let notesContext = 'No internal notes recorded.';
    if (conversation.notes && conversation.notes.length > 0) {
      const formattedNotes = conversation.notes.map(note => {
        const date = new Date(note.createdAt);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const typeLabel = note.type === 'meeting' ? '📅 Meeting' :
                          note.type === 'call' ? '📞 Call' : '📝 Note';
        return `  [${dateStr}] ${typeLabel}: ${note.content.slice(0, 300)}${note.content.length > 300 ? '...' : ''}`;
      });
      notesContext = formattedNotes.join('\n');
    }

    // Get conversation state context
    const { lastMessageDirection } = getLastMessageContext(conversation.messages);
    const conversationState = conversation.triage?.status === 'actioned' ? 'concluded' :
      (conversation.messages[0]?.direction === 'outbound' ? 'waiting_on_them' : 'waiting_on_you');

    // Extract what user has already committed to
    const userCommitments = extractUserCommitmentsFromMessages(conversation.messages);

    // Build conversation summary
    const lastMessages = formatMessagesForPrompt(conversation.messages);

    // Build prompt with full context including tone profile
    const prompt = TONE_AWARE_DRAFT_PROMPT
      .replace('{greetingPatterns}', greetingPatterns)
      .replace('{signOffPatterns}', signOffPatterns)
      .replace('{commonPhrases}', commonPhrases)
      .replace('{formalityLevel}', formalityLevel)
      .replace('{emojiUsage}', emojiUsage)
      .replace('{averageLength}', averageLength)
      .replace('{sampleMessages}', sampleMessages)
      .replace('{tone}', tone)
      .replace('{tag}', tagName)
      .replace('{notesContext}', notesContext)
      .replace('{lastMessageDirection}', lastMessageDirection)
      .replace('{conversationState}', conversationState)
      .replace('{userCommitments}', userCommitments)
      .replace('{lastMessages}', lastMessages);

    // Call AI for draft - using Sonnet for better tone matching
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt,
      }],
    });

    const draftReply = response.content[0].type === 'text'
      ? response.content[0].text.trim()
      : '';

    // Update triage record with draft
    if (conversation.triage) {
      await prisma.messageTriage.update({
        where: { id: conversation.triage.id },
        data: {
          draftReply,
          draftTone: tone,
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      draft: draftReply,
      tone,
      conversationId,
      usedToneProfile: !!toneProfile,
      toneProfileId: toneProfile?.id || null,
    });
  } catch (error) {
    console.error('Error generating draft:', error);
    // Log detailed error info for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Draft error details:', { errorMessage, errorStack });
    return NextResponse.json(
      { error: 'Failed to generate draft reply', details: errorMessage },
      { status: 500 }
    );
  }
}

// PUT /api/inbox-zero/draft/[conversationId] - Update draft reply
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { draft, tone } = await request.json();

    const triage = await prisma.messageTriage.findUnique({
      where: { conversationId },
    });

    if (!triage) {
      return NextResponse.json(
        { error: 'Triage not found' },
        { status: 404 }
      );
    }

    await prisma.messageTriage.update({
      where: { id: triage.id },
      data: {
        draftReply: draft,
        draftTone: tone,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating draft:', error);
    return NextResponse.json(
      { error: 'Failed to update draft' },
      { status: 500 }
    );
  }
}
