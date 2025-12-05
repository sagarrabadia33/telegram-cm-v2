import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';
dotenvConfig({ path: resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSyncStatus() {
  console.log('📊 Checking current database status...\n');

  try {
    const [
      contactsCount,
      conversationsCount,
      messagesCount,
      telegramChatsCount,
      sourceIdentitiesCount,
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.conversation.count(),
      prisma.message.count(),
      prisma.telegramChat.count(),
      prisma.sourceIdentity.count({ where: { source: 'telegram' } }),
    ]);

    console.log('📈 Current Database Stats:');
    console.log('   Contacts:', contactsCount);
    console.log('   Source Identities (Telegram):', sourceIdentitiesCount);
    console.log('   Conversations:', conversationsCount);
    console.log('   Telegram Chats:', telegramChatsCount);
    console.log('   Messages:', messagesCount);
    console.log('');

    if (conversationsCount > 0) {
      console.log('💬 Sample Conversations:');
      const conversations = await prisma.conversation.findMany({
        take: 10,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          _count: {
            select: { messages: true },
          },
        },
      });

      conversations.forEach((conv) => {
        console.log(
          `   - ${conv.title || 'Unnamed'} (${conv.type}): ${conv._count.messages} messages`,
        );
      });
      console.log('');
    }

    if (contactsCount === 0 && conversationsCount === 0 && messagesCount === 0) {
      console.log('❌ NO DATA FOUND - Sync has NOT been run yet!\n');
      console.log('To run the full history sync:');
      console.log('   npm run sync:telegram\n');
    } else {
      console.log('✅ Data exists in database');

      if (messagesCount > 0) {
        const oldestMessage = await prisma.message.findFirst({
          orderBy: { sentAt: 'asc' },
        });
        const newestMessage = await prisma.message.findFirst({
          orderBy: { sentAt: 'desc' },
        });

        console.log('\n📅 Message Date Range:');
        console.log(`   Oldest: ${oldestMessage?.sentAt.toISOString()}`);
        console.log(`   Newest: ${newestMessage?.sentAt.toISOString()}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSyncStatus();
