import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * POST /api/conversations/[id]/send
 *
 * LINEAR-STYLE OUTBOX PATTERN: Queue a message for reliable delivery
 *
 * The message is stored in OutgoingMessage table with status 'pending'.
 * The Telegram worker picks it up and sends it, then updates status to 'sent'.
 *
 * This ensures 100% delivery even if the worker crashes - messages are never lost.
 *
 * Request body:
 * {
 *   text?: string,              // Message text (required if no attachment)
 *   replyToMessageId?: string,  // External message ID to reply to
 *   attachment?: {              // Optional attachment
 *     type: 'photo' | 'document' | 'video' | 'audio' | 'voice',
 *     url: string,              // URL or storage key
 *     filename?: string,        // Original filename
 *     mimeType?: string,        // MIME type
 *     caption?: string          // Caption for media
 *   }
 * }
 *
 * Response:
 * {
 *   success: true,
 *   message: {
 *     id: string,               // OutgoingMessage ID
 *     status: 'pending',
 *     text: string,
 *     createdAt: string
 *   }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();

    const {
      text,
      replyToMessageId,
      attachment,
    } = body;

    // Validate: must have text or attachment
    if (!text && !attachment) {
      return NextResponse.json(
        { error: 'Message must have text or attachment' },
        { status: 400 }
      );
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, title: true, externalChatId: true, source: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Only support Telegram for now
    if (conversation.source !== 'telegram') {
      return NextResponse.json(
        { error: 'Only Telegram conversations are supported for sending messages' },
        { status: 400 }
      );
    }

    // Create outgoing message in queue
    const outgoingMessage = await prisma.outgoingMessage.create({
      data: {
        conversationId,
        text: text || null,
        replyToMessageId: replyToMessageId || null,
        attachmentType: attachment?.type || null,
        attachmentUrl: attachment?.url || null,
        attachmentName: attachment?.filename || null,
        attachmentMimeType: attachment?.mimeType || null,
        attachmentCaption: attachment?.caption || null,
        status: 'pending',
      },
    });

    return NextResponse.json({
      success: true,
      message: {
        id: outgoingMessage.id,
        status: outgoingMessage.status,
        text: outgoingMessage.text,
        attachmentType: outgoingMessage.attachmentType,
        createdAt: outgoingMessage.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to queue message:', error);
    return NextResponse.json(
      { error: 'Failed to queue message for delivery' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/conversations/[id]/send
 *
 * Get pending/recent outgoing messages for a conversation.
 * Useful for showing "sending..." status in the UI.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    const outgoingMessages = await prisma.outgoingMessage.findMany({
      where: {
        conversationId,
        // Get pending, sending, or recently sent (last hour)
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
      messages: outgoingMessages.map((m) => ({
        id: m.id,
        status: m.status,
        text: m.text,
        attachmentType: m.attachmentType,
        sentMessageId: m.sentMessageId,
        errorMessage: m.errorMessage,
        createdAt: m.createdAt.toISOString(),
        sentAt: m.sentAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error('Failed to get outgoing messages:', error);
    return NextResponse.json(
      { error: 'Failed to get outgoing messages' },
      { status: 500 }
    );
  }
}
