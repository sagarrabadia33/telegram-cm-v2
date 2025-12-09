import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    // Parse tag filter from query params
    const { searchParams } = new URL(request.url);
    const tagIds = searchParams.get('tagIds')?.split(',').filter(Boolean) || [];

    // Build where clause for tag filtering
    const tagFilter = tagIds.length > 0 ? {
      OR: [
        // Direct conversation tags
        {
          tags: {
            some: {
              tagId: { in: tagIds },
            },
          },
        },
        // Inherited from contact
        {
          contact: {
            tags: {
              some: {
                tagId: { in: tagIds },
              },
            },
          },
        },
      ],
    } : {};

    // Fetch conversations with their latest message
    // NOTE: We fetch more than needed and will sort/limit in JS based on actual message timestamps
    // because the lastMessageAt field on Conversation is unreliable (set from Telegram dialog order)
    const conversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        // Include private, group, and supergroup (exclude channels)
        type: {
          in: ['private', 'group', 'supergroup'],
        },
        // TELEGRAM-STYLE: Show ALL conversations including those without messages yet
        // This ensures contacts appear in the list even before first message
        // Tag filter
        ...tagFilter,
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
            isOnline: true,
            lastSeenAt: true,
            avatarUrl: true,
          },
        },
        // Fetch only the last message (optimized - single message per conversation)
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: {
            body: true,
            direction: true,
            sentAt: true,
          },
        },
        telegramChat: {
          select: {
            memberCount: true,
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
          select: { messages: true },
        },
      },
    });

    // Transform conversations
    const transformed = conversations.map((conv) => {
      const contact = conv.contact;
      const lastMessage = conv.messages[0];

      // Get display name: prefer title for groups, contact name for private
      let displayName = conv.title || 'Unknown';
      if (conv.type === 'private' && contact) {
        displayName =
          contact.displayName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
          conv.title ||
          'Unknown';
      }

      // Generate initials (2 chars max)
      const initials = displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '??';

      // Get avatar URL: prefer contact avatar for private chats, conversation avatar for groups
      let avatarUrl = conv.avatarUrl || null;
      if (conv.type === 'private' && contact?.avatarUrl) {
        avatarUrl = contact.avatarUrl;
      }

      // Extract tags from conversation
      const tags = conv.tags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      }));

      // 100% RELIABLE: Use actual message timestamp, NOT the unreliable lastMessageAt field
      const actualLastMessageTime = lastMessage?.sentAt?.toISOString() || conv.createdAt.toISOString();

      return {
        id: conv.id,
        externalChatId: conv.externalChatId,
        name: displayName,
        avatar: initials,
        avatarUrl, // Actual avatar image URL if available
        type: conv.type, // Include type for UI differentiation
        lastMessage: lastMessage?.body || 'No messages',
        lastMessageDirection: lastMessage?.direction || 'inbound',
        time: actualLastMessageTime, // Use actual message time, not unreliable lastMessageAt
        unread: conv.unreadCount || 0,
        online: contact?.isOnline || false,
        lastSeenAt: contact?.lastSeenAt?.toISOString() || null,
        phone: contact?.primaryPhone || '-',
        email: contact?.primaryEmail || '-',
        firstContact: conv.createdAt.toISOString(),
        totalMessages: conv._count.messages,
        memberCount: conv.telegramChat?.memberCount || null, // For groups
        tags, // Tags assigned to this conversation
        lastSyncedAt: conv.lastSyncedAt?.toISOString() || null, // When conversation was last synced
      };
    });

    // 100% RELIABLE SORT: Sort by actual last message time (descending)
    // This ensures conversations are ordered exactly by their most recent message
    // TELEGRAM-STYLE: Return ALL conversations so user can scroll to find any contact
    // Frontend uses virtual scrolling for performance
    transformed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Failed to fetch conversations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversations' },
      { status: 500 }
    );
  }
}
