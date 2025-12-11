import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * POST /api/conversations/[id]/reactions
 *
 * LINEAR-STYLE OUTBOX PATTERN: Queue a reaction for reliable delivery
 *
 * The reaction is stored in OutgoingReaction table with status 'pending'.
 * The Telegram worker picks it up and sends it via SendReactionRequest,
 * then updates status to 'sent'.
 *
 * Request body:
 * {
 *   messageId: string,    // External Telegram message ID to react to
 *   emoji: string,        // Reaction emoji (e.g., "thumbs_up", "red_heart", "fire")
 *   action?: 'add' | 'remove'  // Default: 'add'
 * }
 *
 * Response:
 * {
 *   success: true,
 *   reaction: {
 *     id: string,
 *     status: 'pending',
 *     messageId: string,
 *     emoji: string,
 *     action: 'add' | 'remove',
 *     createdAt: string
 *   }
 * }
 */

// Telegram's standard quick-access reaction emojis
const ALLOWED_EMOJIS = ['👍', '❤️', '🔥', '🙏', '😍', '😂', '👎'];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();

    const { messageId, emoji, action = 'add' } = body;

    // Validate required fields
    if (!messageId) {
      return NextResponse.json(
        { error: 'messageId is required' },
        { status: 400 }
      );
    }

    if (!emoji) {
      return NextResponse.json(
        { error: 'emoji is required' },
        { status: 400 }
      );
    }

    // Validate emoji is in allowed list
    if (!ALLOWED_EMOJIS.includes(emoji)) {
      return NextResponse.json(
        { error: `Invalid emoji. Allowed: ${ALLOWED_EMOJIS.join(' ')}` },
        { status: 400 }
      );
    }

    // Validate action
    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json(
        { error: 'action must be "add" or "remove"' },
        { status: 400 }
      );
    }

    // Verify conversation exists and is Telegram
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, source: true, externalChatId: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (conversation.source !== 'telegram') {
      return NextResponse.json(
        { error: 'Reactions are only supported for Telegram conversations' },
        { status: 400 }
      );
    }

    // Create outgoing reaction in queue
    const outgoingReaction = await prisma.outgoingReaction.create({
      data: {
        conversationId,
        messageId: String(messageId),
        emoji,
        action,
        status: 'pending',
      },
    });

    console.log(`[REACTION] Queued ${action} reaction ${emoji} on message ${messageId} in conversation ${conversationId}`);

    return NextResponse.json({
      success: true,
      reaction: {
        id: outgoingReaction.id,
        status: outgoingReaction.status,
        messageId: outgoingReaction.messageId,
        emoji: outgoingReaction.emoji,
        action: outgoingReaction.action,
        createdAt: outgoingReaction.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('[REACTION] Failed to queue reaction:', error);
    return NextResponse.json(
      { error: 'Failed to queue reaction for delivery' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/conversations/[id]/reactions
 *
 * Get pending/recent outgoing reactions for a conversation.
 * Useful for optimistic UI updates.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    const outgoingReactions = await prisma.outgoingReaction.findMany({
      where: {
        conversationId,
        OR: [
          { status: { in: ['pending', 'sending'] } },
          {
            status: 'sent',
            sentAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
          {
            status: 'failed',
            updatedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({
      reactions: outgoingReactions.map((r) => ({
        id: r.id,
        status: r.status,
        messageId: r.messageId,
        emoji: r.emoji,
        action: r.action,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
        sentAt: r.sentAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error('[REACTION] Failed to get outgoing reactions:', error);
    return NextResponse.json(
      { error: 'Failed to get outgoing reactions' },
      { status: 500 }
    );
  }
}
