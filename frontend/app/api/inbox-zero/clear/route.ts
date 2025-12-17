import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// POST /api/inbox-zero/clear - Mark conversations as read (clear bucket)
export async function POST(request: NextRequest) {
  try {
    const { conversationIds, clearAll = false } = await request.json();

    let conversationsToUpdate: string[] = [];

    if (clearAll) {
      // Get all conversations in the clear bucket
      const clearConversations = await prisma.conversation.findMany({
        where: {
          unreadCount: { gt: 0 },
          triage: { bucket: 'clear' },
        },
        select: { id: true },
      });
      conversationsToUpdate = clearConversations.map(c => c.id);
    } else if (conversationIds?.length > 0) {
      conversationsToUpdate = conversationIds;
    } else {
      return NextResponse.json(
        { error: 'No conversations specified' },
        { status: 400 }
      );
    }

    if (conversationsToUpdate.length === 0) {
      return NextResponse.json({
        cleared: 0,
        message: 'No conversations to clear',
      });
    }

    // Mark conversations as read
    const result = await prisma.conversation.updateMany({
      where: { id: { in: conversationsToUpdate } },
      data: {
        unreadCount: 0,
        lastReadAt: new Date(),
      },
    });

    // Update triage status to actioned
    await prisma.messageTriage.updateMany({
      where: { conversationId: { in: conversationsToUpdate } },
      data: {
        status: 'actioned',
        actionedAt: new Date(),
      },
    });

    return NextResponse.json({
      cleared: result.count,
      message: `Marked ${result.count} conversations as read`,
    });
  } catch (error) {
    console.error('Error clearing conversations:', error);
    return NextResponse.json(
      { error: 'Failed to clear conversations' },
      { status: 500 }
    );
  }
}
