import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/contacts
 *
 * Returns contacts (conversations) with enriched stats for the Contacts page.
 * Supports:
 * - filtering by type: all, private (people), group, supergroup, channel
 * - pagination: limit (default 50), cursor (for infinite scroll)
 * - search: server-side search on name, username, phone
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search')?.toLowerCase().trim();

    // Build type filter
    const typeWhere = typeFilter === 'all'
      ? { type: { in: ['private', 'group', 'supergroup', 'channel'] } }
      : typeFilter === 'people'
        ? { type: 'private' }
        : { type: typeFilter };

    // Build search filter for server-side search
    const searchWhere = search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { contact: { firstName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { lastName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { displayName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { primaryPhone: { contains: search } } },
        { telegramChat: { username: { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {};

    // Get total count for the type filter (for tabs - exclude search from count)
    const totalCountPromise = prisma.conversation.count({
      where: {
        isSyncDisabled: false,
        ...typeWhere,
      },
    });

    // Get counts by type for tabs (without search filter)
    const countsPromise = Promise.all([
      prisma.conversation.count({ where: { isSyncDisabled: false, type: { in: ['private', 'group', 'supergroup', 'channel'] } } }),
      prisma.conversation.count({ where: { isSyncDisabled: false, type: 'private' } }),
      prisma.conversation.count({ where: { isSyncDisabled: false, type: { in: ['group', 'supergroup'] } } }),
      prisma.conversation.count({ where: { isSyncDisabled: false, type: 'channel' } }),
    ]);

    // Fetch conversations with all needed data
    const conversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        ...typeWhere,
        ...searchWhere,
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1, // Fetch one extra to check if there are more
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

    // Determine if there are more results
    const hasMore = conversations.length > limit;
    const paginatedConversations = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? paginatedConversations[paginatedConversations.length - 1]?.id : null;

    // Get message stats per conversation (inbound/outbound counts) - only for returned conversations
    const conversationIds = paginatedConversations.map(c => c.id);
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

    // Wait for counts
    const [total, countResults] = await Promise.all([totalCountPromise, countsPromise]);

    // Transform for the frontend
    const transformed = paginatedConversations.map((conv) => {
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

    // Use pre-calculated counts for the filter tabs (from total DB, not just current page)
    const counts = {
      all: countResults[0],
      people: countResults[1],
      groups: countResults[2],
      channels: countResults[3],
    };

    return NextResponse.json({
      contacts: transformed,
      counts,
      pagination: {
        hasMore,
        nextCursor,
        total,
        returned: transformed.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
