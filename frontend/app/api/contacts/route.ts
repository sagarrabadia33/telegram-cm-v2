import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/contacts
 *
 * Returns contacts (conversations) with enriched stats for the Contacts page.
 * Supports filtering by type: all, private (people), group, supergroup, channel
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') || 'all';

    // Build type filter
    const typeWhere = typeFilter === 'all'
      ? { type: { in: ['private', 'group', 'supergroup', 'channel'] } }
      : typeFilter === 'people'
        ? { type: 'private' }
        : { type: typeFilter };

    // Fetch conversations with all needed data
    const conversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        ...typeWhere,
      },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            primaryPhone: true,
            primaryEmail: true,
            avatarUrl: true,
            notes: true,
            isOnline: true,
            lastSeenAt: true,
          },
        },
        telegramChat: {
          select: {
            memberCount: true,
            username: true,
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
        _count: {
          select: {
            messages: true,
            members: true, // For groups - member count from GroupMember table
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    // Get message stats per conversation (inbound/outbound counts)
    const conversationIds = conversations.map(c => c.id);
    const messageStats = await prisma.message.groupBy({
      by: ['conversationId', 'direction'],
      where: {
        conversationId: { in: conversationIds },
      },
      _count: true,
    });

    // Create a map for quick lookup
    const statsMap = new Map<string, { inbound: number; outbound: number }>();
    messageStats.forEach(stat => {
      const existing = statsMap.get(stat.conversationId) || { inbound: 0, outbound: 0 };
      if (stat.direction === 'inbound') {
        existing.inbound = stat._count;
      } else {
        existing.outbound = stat._count;
      }
      statsMap.set(stat.conversationId, existing);
    });

    // Transform for the frontend
    const transformed = conversations.map((conv) => {
      const contact = conv.contact;
      const isGroup = conv.type === 'group' || conv.type === 'supergroup';
      const isChannel = conv.type === 'channel';

      // Get display name
      let displayName = conv.title || 'Unknown';
      if (conv.type === 'private' && contact) {
        displayName =
          contact.displayName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
          conv.title ||
          'Unknown';
      }

      // Generate initials
      const initials = displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '??';

      // Get avatar URL
      let avatarUrl = conv.avatarUrl || null;
      if (conv.type === 'private' && contact?.avatarUrl) {
        avatarUrl = contact.avatarUrl;
      }

      // Get message stats
      const msgStats = statsMap.get(conv.id) || { inbound: 0, outbound: 0 };

      // Extract tags
      const tags = conv.tags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      }));

      // Get notes from contact or conversation metadata
      const notes = contact?.notes ||
        ((conv.metadata as Record<string, unknown>)?.notes as string) ||
        null;

      // Member count: prefer telegramChat.memberCount, fallback to _count.members
      const memberCount = conv.telegramChat?.memberCount || conv._count.members || null;

      return {
        id: conv.id,
        externalChatId: conv.externalChatId,
        name: displayName,
        initials,
        avatarUrl,
        type: conv.type,

        // Contact info (for private chats)
        phone: contact?.primaryPhone || null,
        email: contact?.primaryEmail || null,
        username: conv.telegramChat?.username || null,

        // Status
        isOnline: contact?.isOnline || false,
        lastSeenAt: contact?.lastSeenAt?.toISOString() || null,

        // Stats
        totalMessages: conv._count.messages,
        messagesReceived: msgStats.inbound,
        messagesSent: msgStats.outbound,
        memberCount: isGroup || isChannel ? memberCount : null,

        // Dates
        firstContactDate: conv.createdAt.toISOString(),
        lastInteraction: conv.lastMessageAt?.toISOString() || conv.createdAt.toISOString(),
        lastSyncedAt: conv.lastSyncedAt?.toISOString() || null,

        // Organization
        tags,
        notes,

        // For groups: whether we have member data
        hasMemberData: isGroup ? conv._count.members > 0 : false,
      };
    });

    // Count by type for the filter tabs
    const counts = {
      all: transformed.length,
      people: transformed.filter(c => c.type === 'private').length,
      groups: transformed.filter(c => c.type === 'group' || c.type === 'supergroup').length,
      channels: transformed.filter(c => c.type === 'channel').length,
    };

    return NextResponse.json({
      contacts: transformed,
      counts,
    });
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
