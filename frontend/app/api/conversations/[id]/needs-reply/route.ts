import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/conversations/[id]/needs-reply
 *
 * Checks if a conversation needs a reply based on:
 * 1. Last message direction (inbound = they messaged us)
 * 2. Conversation state (not concluded)
 * 3. Content type (questions/requests need replies)
 *
 * Returns:
 * - needsReply: boolean
 * - reason: why reply is needed (or not)
 * - lastMessageDirection: 'inbound' | 'outbound'
 * - conversationState: current state assessment
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch conversation with last few messages
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        type: true,
        aiStatus: true,
        aiSuggestedAction: true,
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 5,
          select: {
            id: true,
            body: true,
            direction: true,
            sentAt: true,
            containsQuestion: true,
          },
        },
        triage: {
          select: {
            bucket: true,
            conversationState: true,
            suggestedAction: true,
            isQuestion: true,
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

    const lastMessage = conversation.messages[0];

    if (!lastMessage) {
      return NextResponse.json({
        needsReply: false,
        reason: 'No messages in conversation',
        lastMessageDirection: null,
        conversationState: 'empty',
      });
    }

    const lastMessageDirection = lastMessage.direction;
    const lastMessageText = lastMessage.body?.toLowerCase() || '';

    // Check for concluded conversation patterns
    // These patterns match common acknowledgment/closing messages
    const concludedPatterns = [
      /^(thanks|thank you|thx|ty|thankyou)[\s!.]*$/i,
      /^(ok|okay|k|got it|understood)[\s!.]*$/i,
      /^(great|perfect|awesome|sounds good)[\s!.]*$/i,
      /^(done|noted|will do)[\s!.]*$/i,
      /^(bye|goodbye|talk later|ttyl)[\s!.]*$/i,
      /^(👍|👌|✅|🙏|😊)$/,
      // More flexible patterns that allow combinations
      /^(perfect|great|awesome|excellent),?\s*(thanks|thank you|thx|ty)?[\s!.]*$/i,
      /^(thanks|thank you|thx),?\s*(so much|a lot)?[\s!.]*$/i,
      /^(got it|understood|noted),?\s*(thanks|thank you)?[\s!.]*$/i,
    ];

    const isConversationConcluded = concludedPatterns.some(pattern =>
      pattern.test(lastMessageText.trim())
    );

    // Check if last message contains a question
    const hasQuestion =
      lastMessage.containsQuestion ||
      lastMessageText.includes('?') ||
      /\b(can you|could you|would you|will you|how|what|when|where|why|who)\b/i.test(lastMessageText);

    // Determine if reply is needed
    let needsReply = false;
    let reason = '';
    let conversationState = 'ongoing';

    if (lastMessageDirection === 'outbound') {
      // We sent the last message - waiting on them
      needsReply = false;
      reason = 'Waiting for their response';
      conversationState = 'waiting_on_them';
    } else if (isConversationConcluded) {
      // They sent but it's a concluding message
      needsReply = false;
      reason = 'Conversation appears concluded';
      conversationState = 'concluded';
    } else if (hasQuestion) {
      // They asked a question
      needsReply = true;
      reason = 'They asked a question';
      conversationState = 'waiting_on_you';
    } else {
      // They sent a message that's not a conclusion
      needsReply = true;
      reason = 'New message from them';
      conversationState = 'waiting_on_you';
    }

    // Use existing triage data if available for more accuracy
    if (conversation.triage) {
      if (conversation.triage.bucket === 'respond') {
        needsReply = true;
        reason = conversation.triage.suggestedAction || 'Marked for response in triage';
      }
      if (conversation.triage.conversationState) {
        conversationState = conversation.triage.conversationState;
      }
    }

    // Use AI suggestion if available
    const aiSuggestedAction = conversation.aiSuggestedAction;

    return NextResponse.json({
      needsReply,
      reason,
      lastMessageDirection,
      conversationState,
      hasQuestion,
      lastMessagePreview: lastMessage.body?.slice(0, 100) || null,
      aiSuggestedAction,
      aiStatus: conversation.aiStatus,
    });
  } catch (error) {
    console.error('Error checking needs-reply:', error);
    return NextResponse.json(
      { error: 'Failed to check if reply needed' },
      { status: 500 }
    );
  }
}
