import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET /api/inbox-zero - Get dashboard data with triaged conversations
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    // Fetch conversations that need attention:
    // 1. Has unread messages
    // 2. Has pending triage (even if read)
    // 3. Recent activity that hasn't been triaged as 'clear' or 'actioned'
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const conversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        type: { in: ['private', 'group', 'supergroup'] },
        OR: [
          { unreadCount: { gt: 0 } },
          { triage: { status: 'pending', bucket: { in: ['respond', 'review'] } } },
          {
            AND: [
              { lastMessageAt: { gte: recentCutoff } },
              { triage: null },
            ],
          },
        ],
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 5,
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
            tag: {
              select: {
                id: true,
                name: true,
                color: true,
              },
            },
          },
        },
        triage: true,
        telegramChat: {
          select: {
            type: true,
            title: true,
            memberCount: true,
          },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Bucket conversations
    const respond: typeof conversations = [];
    const review: typeof conversations = [];
    const clearGroups: Map<string, { id: string; name: string; count: number; conversations: typeof conversations }> = new Map();
    let clearCount = 0;

    for (const conv of conversations) {
      const triage = conv.triage;

      if (!triage) {
        // No triage yet - needs AI analysis
        // For now, put untagged in review, tagged in respond
        if (conv.tags.length === 0 && conv.type !== 'private') {
          // Group without tags - likely clear
          const groupKey = conv.telegramChat?.title || conv.title || conv.id;
          if (!clearGroups.has(groupKey)) {
            clearGroups.set(groupKey, {
              id: conv.id,
              name: groupKey,
              count: 0,
              conversations: []
            });
          }
          const group = clearGroups.get(groupKey)!;
          group.count += conv.unreadCount;
          group.conversations.push(conv);
          clearCount += conv.unreadCount;
        } else {
          // Has tags or is private - default to review
          review.push(conv);
        }
        continue;
      }

      // Use triage bucket
      switch (triage.bucket) {
        case 'respond':
          respond.push(conv);
          break;
        case 'review':
          review.push(conv);
          break;
        case 'clear':
          const groupKey = conv.telegramChat?.title || conv.title || conv.id;
          if (!clearGroups.has(groupKey)) {
            clearGroups.set(groupKey, {
              id: conv.id,
              name: groupKey,
              count: 0,
              conversations: []
            });
          }
          const group = clearGroups.get(groupKey)!;
          group.count += conv.unreadCount;
          group.conversations.push(conv);
          clearCount += conv.unreadCount;
          break;
      }
    }

    // Sort by priority within buckets
    respond.sort((a, b) => {
      const priorityA = a.triage?.priorityScore ?? 5;
      const priorityB = b.triage?.priorityScore ?? 5;
      return priorityB - priorityA;
    });

    // Fetch commitments
    const commitments = await prisma.commitment.findMany({
      where: {
        status: 'pending',
        direction: 'outbound', // User's promises
      },
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Categorize commitments
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const overdueCommitments = commitments.filter(c => c.dueDate && c.dueDate < now);
    const dueTodayCommitments = commitments.filter(c => c.dueDate && c.dueDate >= now && c.dueDate <= todayEnd);
    const upcomingCommitments = commitments.filter(c => !c.dueDate || c.dueDate > todayEnd);

    // Fetch pending tag suggestions
    const tagSuggestions = await prisma.tagSuggestion.findMany({
      where: {
        status: 'pending',
        confidence: { gte: 0.7 },
      },
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
          },
        },
        tag: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: { confidence: 'desc' },
      take: 10,
    });

    // Calculate progress
    const totalItems = respond.length + review.length;
    const completedToday = await prisma.messageTriage.count({
      where: {
        status: 'actioned',
        actionedAt: { gte: new Date(now.setHours(0, 0, 0, 0)) },
      },
    });

    // Transform for response
    const transformConversation = (conv: typeof conversations[0]) => ({
      id: conv.id,
      title: conv.title || conv.contact?.displayName || conv.contact?.firstName || 'Unknown',
      avatarUrl: conv.avatarUrl || conv.contact?.avatarUrl,
      type: conv.type,
      unreadCount: conv.unreadCount,
      lastMessage: conv.messages[0] ? {
        body: conv.messages[0].body,
        direction: conv.messages[0].direction,
        sentAt: conv.messages[0].sentAt,
      } : null,
      tags: conv.tags.map(t => ({
        id: t.tag.id,
        name: t.tag.name,
        color: t.tag.color,
      })),
      triage: conv.triage ? {
        bucket: conv.triage.bucket,
        reason: conv.triage.reason,
        priorityScore: conv.triage.priorityScore,
        draftReply: conv.triage.draftReply,
        draftTone: conv.triage.draftTone,
        isDirectMention: conv.triage.isDirectMention,
        isQuestion: conv.triage.isQuestion,
        hasOverduePromise: conv.triage.hasOverduePromise,
        isComplaint: conv.triage.isComplaint,
        conversationState: conv.triage.conversationState,
        suggestedAction: conv.triage.suggestedAction,
      } : null,
      memberCount: conv.telegramChat?.memberCount,
    });

    return NextResponse.json({
      buckets: {
        respond: respond.map(transformConversation),
        review: review.map(transformConversation),
        clear: {
          count: clearCount,
          groups: Array.from(clearGroups.values()).map(g => ({
            id: g.id,
            name: g.name,
            count: g.count,
          })),
        },
      },
      progress: {
        total: totalItems + clearCount,
        completed: completedToday,
        percentage: totalItems + clearCount > 0
          ? Math.round((completedToday / (totalItems + clearCount + completedToday)) * 100)
          : 100,
      },
      commitments: {
        overdue: overdueCommitments.map(c => ({
          id: c.id,
          content: c.content,
          dueDate: c.dueDate,
          conversationId: c.conversationId,
          contactName: c.conversation.contact?.displayName ||
                       c.conversation.contact?.firstName ||
                       c.conversation.title || 'Unknown',
        })),
        dueToday: dueTodayCommitments.map(c => ({
          id: c.id,
          content: c.content,
          dueDate: c.dueDate,
          conversationId: c.conversationId,
          contactName: c.conversation.contact?.displayName ||
                       c.conversation.contact?.firstName ||
                       c.conversation.title || 'Unknown',
        })),
        upcoming: upcomingCommitments.slice(0, 5).map(c => ({
          id: c.id,
          content: c.content,
          dueDate: c.dueDate,
          conversationId: c.conversationId,
          contactName: c.conversation.contact?.displayName ||
                       c.conversation.contact?.firstName ||
                       c.conversation.title || 'Unknown',
        })),
      },
      tagSuggestions: tagSuggestions.map(s => ({
        id: s.id,
        conversationId: s.conversationId,
        contactName: s.conversation.contact?.displayName ||
                     s.conversation.contact?.firstName ||
                     s.conversation.title || 'Unknown',
        suggestedTag: {
          id: s.tag.id,
          name: s.tag.name,
          color: s.tag.color,
        },
        reason: s.reason,
        confidence: s.confidence,
      })),
      lastTriagedAt: conversations[0]?.triage?.updatedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Error fetching inbox zero data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inbox zero data' },
      { status: 500 }
    );
  }
}
