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
    // TELEGRAM-STYLE INSTANT LOAD: Default to 50 messages for fast initial load
    // Users can scroll to load more via infinite scroll pagination
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);

    // Combined query: get conversation type, externalChatId, and count in one go
    // externalChatId is needed for on-demand media download from Telegram
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        type: true,
        externalChatId: true,  // Telegram chat ID for media downloads
        _count: { select: { messages: true } },
      },
    });

    if (!conversation) {
      return NextResponse.json({ messages: [], nextCursor: null, hasMore: false, total: 0 });
    }

    const isGroup = conversation.type === 'group' || conversation.type === 'supergroup';
    const totalMessages = conversation._count.messages;
    const telegramChatId = conversation.externalChatId;  // For on-demand media download

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
        externalMessageId: true,  // Telegram message ID for media downloads
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
        reactions: true, // Reaction pills (emoji + count + userReacted)
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
      // Parse attachments for media display with on-demand download support
      // Use message's externalMessageId and conversation's externalChatId for ALL messages
      // This ensures historical messages (before telegramMessageId was stored) work too
      const msgTelegramId = msg.externalMessageId ? parseInt(msg.externalMessageId, 10) : null;

      let media: {
        type: string;
        url: string;
        name?: string;
        mimeType?: string;
        size?: number;
        thumbnail?: string;
        telegramMessageId?: number;
        telegramChatId?: string;
      }[] = [];
      if (msg.hasAttachments && msg.attachments) {
        const attachments = msg.attachments as {
          files?: {
            path: string;
            type: string;
            size?: number;
            name?: string;
            mimeType?: string;
            storageKey?: string;
            base64?: string;  // Legacy: full base64 data URL
            thumbnail?: string;  // Blur preview thumbnail
          }[]
        };
        if (attachments.files) {
          media = attachments.files.map((file) => {
            // ALWAYS use on-demand download if we have telegram IDs (historical + new messages)
            // Priority: 1. On-demand from Telegram API, 2. base64 data URL, 3. Local path (fallback)
            let url: string;

            if (msgTelegramId && telegramChatId) {
              // ON-DEMAND: Use download proxy endpoint - works for ALL messages
              url = `/api/media/download?telegram_message_id=${msgTelegramId}&telegram_chat_id=${telegramChatId}`;
            } else if (file.base64) {
              // LEGACY: Direct base64 data URL
              url = file.base64;
            } else {
              // FALLBACK: Local file path (won't work in production Railway)
              url = file.path.startsWith('/media/')
                ? `/api${file.path}`
                : `/api/media${file.path}`;
            }

            return {
              type: file.type || 'unknown',
              url,
              name: file.name,
              mimeType: file.mimeType,
              size: file.size,
              thumbnail: file.thumbnail,  // Blur preview for images
              telegramMessageId: msgTelegramId || undefined,
              telegramChatId: telegramChatId || undefined,
            };
          });
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
        externalMessageId: msg.externalMessageId, // Telegram message ID for reactions
        text: msg.body || '',
        sent: msg.direction === 'outbound',
        time: msg.sentAt.toISOString(),
        deliveredAt: msg.deliveredAt?.toISOString() || null,
        readAt: msg.readAt?.toISOString() || null,
        status: msg.status,
        contentType: msg.contentType,
        media: media.length > 0 ? media : null,
        sender,
        reactions: msg.reactions as Array<{emoji: string; count: number; userReacted: boolean}> | null
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
