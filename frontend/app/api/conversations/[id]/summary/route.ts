import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import {
  generateConversationSummary,
  shouldExcludeFromSummary,
  type Message,
  type NotesContext,
} from '@/app/lib/ai-summary';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { regenerate = false } = body;

    // Get conversation details with notes and contact info
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        externalChatId: true,
        title: true,
        type: true,
        summary: true,
        summaryGeneratedAt: true,
        metadata: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            notes: true,
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

    // Check if conversation should be excluded
    if (shouldExcludeFromSummary(conversation.title)) {
      return NextResponse.json(
        {
          error: `Conversation "${conversation.title}" is excluded from summary generation`,
        },
        { status: 400 }
      );
    }

    // If summary already exists and regenerate is false, return existing summary
    if (conversation.summary && !regenerate) {
      const existingSummary = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          summary: true,
          sentiment: true,
          intentLevel: true,
          keyPoints: true,
          lastTopic: true,
          summaryGeneratedAt: true,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Summary already exists',
        data: {
          summary: existingSummary?.summary,
          sentiment: existingSummary?.sentiment,
          intentLevel: existingSummary?.intentLevel,
          keyPoints: existingSummary?.keyPoints || [],
          lastTopic: existingSummary?.lastTopic,
          summaryGeneratedAt: existingSummary?.summaryGeneratedAt?.toISOString(),
          fromCache: true,
        },
      });
    }

    // Get last 100 messages for this conversation
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'desc' },
      take: 100,
      select: {
        id: true,
        body: true,
        direction: true,
        sentAt: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    });

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found for this conversation' },
        { status: 400 }
      );
    }

    // Format messages for AI analysis
    const formattedMessages: Message[] = messages.map((m) => {
      const senderName = m.contact
        ? m.contact.displayName ||
          [m.contact.firstName, m.contact.lastName].filter(Boolean).join(' ') ||
          'Contact'
        : 'Contact';

      return {
        content: m.body,
        isOutgoing: m.direction === 'outbound',
        sentAt: m.sentAt.toISOString(),
        senderName,
      };
    });

    // Build notes context for AI
    const metadata = conversation.metadata as Record<string, unknown> | null;
    const conversationNotes = metadata?.notes as string | null;
    const contactNotes = conversation.contact?.notes || null;
    const contactName = conversation.contact
      ? conversation.contact.displayName ||
        [conversation.contact.firstName, conversation.contact.lastName].filter(Boolean).join(' ') ||
        null
      : null;

    const notesContext: NotesContext = {
      conversationNotes,
      contactNotes,
      contactName,
    };

    // Generate summary using AI with notes context
    const summaryData = await generateConversationSummary(
      formattedMessages,
      conversation.title || 'Unknown',
      notesContext
    );

    // Store summary in database
    const now = new Date();
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        summary: summaryData.summary,
        sentiment: summaryData.sentiment,
        intentLevel: summaryData.intentLevel,
        keyPoints: summaryData.keyPoints,
        lastTopic: summaryData.lastTopic,
        summaryGeneratedAt: now,
      },
    });

    return NextResponse.json({
      success: true,
      message: regenerate
        ? 'Summary regenerated successfully'
        : 'Summary generated successfully',
      data: {
        summary: summaryData.summary,
        sentiment: summaryData.sentiment,
        intentLevel: summaryData.intentLevel,
        keyPoints: summaryData.keyPoints,
        lastTopic: summaryData.lastTopic,
        summaryGeneratedAt: now.toISOString(),
        fromCache: false,
      },
    });
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate summary',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Get existing summary
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        summary: true,
        sentiment: true,
        intentLevel: true,
        keyPoints: true,
        lastTopic: true,
        summaryGeneratedAt: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    if (!conversation.summary) {
      // Return success with null data instead of 404 to prevent console errors
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No summary available for this conversation',
      });
    }

    // Calculate new messages since summary was generated
    let newMessageCount = 0;
    if (conversation.summaryGeneratedAt) {
      newMessageCount = await prisma.message.count({
        where: {
          conversationId,
          sentAt: {
            gt: conversation.summaryGeneratedAt,
          },
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        summary: conversation.summary,
        sentiment: conversation.sentiment,
        intentLevel: conversation.intentLevel,
        keyPoints: conversation.keyPoints || [],
        lastTopic: conversation.lastTopic,
        summaryGeneratedAt: conversation.summaryGeneratedAt?.toISOString(),
        newMessagesSinceGenerated: newMessageCount,
      },
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
