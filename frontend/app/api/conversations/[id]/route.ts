import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch the conversation by ID
    const conv = await prisma.conversation.findUnique({
      where: { id },
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

    if (!conv) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

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

    // Use actual message timestamp
    const actualLastMessageTime = lastMessage?.sentAt?.toISOString() || conv.createdAt.toISOString();

    const transformed = {
      id: conv.id,
      externalChatId: conv.externalChatId,
      name: displayName,
      avatar: initials,
      avatarUrl,
      type: conv.type,
      lastMessage: lastMessage?.body || 'No messages',
      lastMessageDirection: lastMessage?.direction || 'inbound',
      time: actualLastMessageTime,
      unread: conv.unreadCount || 0,
      online: contact?.isOnline || false,
      lastSeenAt: contact?.lastSeenAt?.toISOString() || null,
      phone: contact?.primaryPhone || '-',
      email: contact?.primaryEmail || '-',
      firstContact: conv.createdAt.toISOString(),
      totalMessages: conv._count.messages,
      memberCount: conv.telegramChat?.memberCount || null,
      tags,
      lastSyncedAt: conv.lastSyncedAt?.toISOString() || null,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Failed to fetch conversation:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversation' },
      { status: 500 }
    );
  }
}
