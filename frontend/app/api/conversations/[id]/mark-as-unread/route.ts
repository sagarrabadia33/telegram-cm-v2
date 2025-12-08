import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * POST /api/conversations/[id]/mark-as-unread
 *
 * Marks a conversation as unread:
 * - Sets unreadCount to 1 (minimum to show unread badge)
 * - Clears lastReadAt to indicate unread state
 *
 * Useful for users who want to remind themselves
 * to follow up on a conversation later.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Update conversation to mark as unread
    // Set unreadCount to at least 1 to show badge
    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        unreadCount: 1,
        lastReadAt: null, // Clear read timestamp
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
        lastReadAt: updated.lastReadAt?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Failed to mark conversation as unread:', error);
    return NextResponse.json(
      { error: 'Failed to mark conversation as unread' },
      { status: 500 }
    );
  }
}
