/**
 * Fetch CRM data from database and save as JSON
 * Run: node design-system/fetch-data.js
 */

const { PrismaClient } = require('../lib/generated/prisma');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function fetchData() {
  console.log('Fetching conversations from database...');

  // Fetch conversations with latest message, sorted by lastMessageAt descending
  const conversations = await prisma.conversation.findMany({
    where: {
      isSyncDisabled: false,
      type: 'private' // Only private chats for now
    },
    orderBy: {
      lastMessageAt: 'desc'
    },
    take: 50, // Limit to 50 most recent
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
          lastSeenAt: true
        }
      },
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 1,
        select: {
          body: true,
          direction: true,
          sentAt: true
        }
      },
      _count: {
        select: { messages: true }
      }
    }
  });

  console.log(`Found ${conversations.length} conversations`);

  // Transform data for the UI
  const transformedConversations = conversations.map(conv => {
    const contact = conv.contact;
    const lastMessage = conv.messages[0];

    // Generate display name
    let displayName = conv.title || 'Unknown';
    if (contact) {
      displayName = contact.displayName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        'Unknown';
    }

    // Generate initials
    const initials = displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';

    return {
      id: conv.id,
      externalChatId: conv.externalChatId,
      name: displayName,
      avatar: initials,
      lastMessage: lastMessage?.body || 'No messages',
      lastMessageDirection: lastMessage?.direction || 'inbound',
      time: lastMessage?.sentAt || conv.lastMessageAt || conv.createdAt,
      unread: 0, // Would need to track this separately
      online: contact?.isOnline || false,
      lastSeenAt: contact?.lastSeenAt,
      phone: contact?.primaryPhone || '-',
      email: contact?.primaryEmail || '-',
      firstContact: conv.createdAt,
      totalMessages: conv._count.messages
    };
  });

  // Save conversations
  const conversationsPath = path.join(__dirname, 'data-conversations.json');
  fs.writeFileSync(conversationsPath, JSON.stringify(transformedConversations, null, 2));
  console.log(`Saved ${transformedConversations.length} conversations to ${conversationsPath}`);

  // Fetch messages for each conversation (last 100 messages each)
  console.log('Fetching messages...');
  const messagesByConversation = {};

  for (const conv of conversations.slice(0, 20)) { // Limit to first 20 for performance
    const messages = await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { sentAt: 'asc' },
      take: 100,
      select: {
        id: true,
        body: true,
        direction: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        status: true,
        contentType: true
      }
    });

    messagesByConversation[conv.id] = messages.map(msg => ({
      id: msg.id,
      text: msg.body || '',
      sent: msg.direction === 'outbound',
      time: msg.sentAt,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      status: msg.status,
      contentType: msg.contentType
    }));
  }

  const messagesPath = path.join(__dirname, 'data-messages.json');
  fs.writeFileSync(messagesPath, JSON.stringify(messagesByConversation, null, 2));
  console.log(`Saved messages for ${Object.keys(messagesByConversation).length} conversations to ${messagesPath}`);

  console.log('Done!');
  await prisma.$disconnect();
}

fetchData().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
