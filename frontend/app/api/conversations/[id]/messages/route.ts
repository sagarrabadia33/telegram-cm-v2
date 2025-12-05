import { NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    // Default to 100, max 500 messages per request
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    // Combined query: get conversation type and count in one go
    // Using select to minimize data transfer
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        type: true,
        _count: { select: { messages: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ messages: [], nextCursor: null, hasMore: false, total: 0 });
    }

    const isGroup = conversation.type === 'group' || conversation.type === 'supergroup';
    const totalMessages = conversation._count.messages;

    // Fetch messages with proper limit
    // For initial load: fetch LATEST messages (desc), then reverse for chronological display
    // For pagination with cursor: fetch older messages
    const messagesRaw = await prisma.message.findMany({
      where: { conversationId: id },
      // Fetch newest first so `take` gets the latest messages
      orderBy: { sentAt: 'desc' },
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        body: true,
        direction: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        status: true,
        contentType: true,
        hasAttachments: true,
        attachments: true,
        metadata: true, // Include metadata for sender fallback
        // Include sender info for group messages
        contact: isGroup ? {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
          },
        } : false,
      },
    });

    // Reverse to chronological order (oldest first) for display
    const messages = messagesRaw.reverse();

    const transformed = messages.map((msg) => {
      // Parse attachments for media display
      let media: { type: string; url: string; }[] = [];
      if (msg.hasAttachments && msg.attachments) {
        const attachments = msg.attachments as { files?: { path: string; type: string; size?: number }[] };
        if (attachments.files) {
          media = attachments.files.map((file) => ({
            type: file.type || 'unknown',
            // Convert path to API URL for serving media files
            // File paths are like /media/telegram/photos/xxx.jpg
            // We serve them via /api/media/telegram/photos/xxx.jpg
            url: file.path.startsWith('/media/')
              ? `/api${file.path}`
              : `/api/media${file.path}`,
          }));
        }
      }

      // Get sender info for group messages
      // Priority: 1. Contact from database, 2. Metadata fallback (stored during sync)
      let sender = null;
      if (isGroup) {
        if (msg.contact) {
          // Primary: Use contact from database
          sender = {
            id: msg.contact.id,
            name: msg.contact.displayName ||
                  [msg.contact.firstName, msg.contact.lastName].filter(Boolean).join(' ') ||
                  'Unknown',
            initials: (msg.contact.firstName?.[0] || msg.contact.displayName?.[0] || '?').toUpperCase(),
          };
        } else if (msg.metadata) {
          // Fallback: Use sender info from message metadata (stored during sync)
          // This ensures 100% reliable sender display even when contactId is NULL
          // Handle BOTH metadata formats:
          // - New format: { sender: { telegram_id, name, username } }
          // - Old format: { senderId, senderFirstName, senderLastName, senderUsername }
          const metadata = msg.metadata as {
            sender?: { telegram_id?: string; name?: string; username?: string };
            senderId?: string;
            senderFirstName?: string;
            senderLastName?: string;
            senderUsername?: string;
          };

          let name: string | null = null;
          let id: string = 'unknown';

          if (metadata.sender) {
            // New format
            name = metadata.sender.name || metadata.sender.username || null;
            id = metadata.sender.telegram_id || 'unknown';
          } else if (metadata.senderId || metadata.senderFirstName || metadata.senderUsername) {
            // Old format - construct name from firstName + lastName
            const parts = [metadata.senderFirstName, metadata.senderLastName].filter(Boolean);
            name = parts.length > 0 ? parts.join(' ') : metadata.senderUsername || null;
            id = metadata.senderId || 'unknown';
          }

          if (name) {
            sender = {
              id,
              name,
              initials: (name[0] || '?').toUpperCase(),
            };
          }
        }
      }

      return {
        id: msg.id,
        text: msg.body || '',
        sent: msg.direction === 'outbound',
        time: msg.sentAt.toISOString(),
        deliveredAt: msg.deliveredAt?.toISOString() || null,
        readAt: msg.readAt?.toISOString() || null,
        status: msg.status,
        contentType: msg.contentType,
        media: media.length > 0 ? media : null,
        sender,
      };
    });

    // Return with pagination info
    // hasMore is true if we returned a full page AND there are more messages
    const hasMore = messages.length === limit && messages.length < totalMessages;
    const nextCursor = hasMore ? messages[messages.length - 1]?.id : null;

    return NextResponse.json({
      messages: transformed,
      nextCursor,
      hasMore,
      total: totalMessages, // Total messages in conversation
      returned: messages.length, // Messages returned this request
    });
  } catch (error) {
    console.error('Failed to fetch messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
