import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * POST /api/conversations/[id]/mark-as-read
 *
 * Marks a conversation as read (Telegram-style):
 * - Resets unreadCount to 0
 * - Sets lastReadMessageId to the most recent message
 * - Sets lastReadAt to current timestamp
 *
 * This is called when a user opens/views a conversation.
 * Multi-device support: Since state is stored server-side,
 * all devices will see the updated read state.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the most recent message ID for this conversation
    const latestMessage = await prisma.message.findFirst({
      where: { conversationId: id },
      orderBy: { sentAt: 'desc' },
      select: { externalMessageId: true },
    });

    // Update conversation read state
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: 0,
        lastReadMessageId: latestMessage?.externalMessageId || null,
        lastReadAt: new Date(),
      },
      select: {
        id: true,
        unreadCount: true,
        lastReadMessageId: true,
        lastReadAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      conversation: {
        id: updated.id,
        unread: updated.unreadCount,
        lastReadMessageId: updated.lastReadMessageId,
        lastReadAt: updated.lastReadAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to mark conversation as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark conversation as read' },
      { status: 500 }
    );
  }
}
