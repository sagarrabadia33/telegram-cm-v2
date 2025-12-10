const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  // Find the message with the attachment we tested
  const message = await prisma.message.findUnique({
    where: { id: 'm1168e7530ec14dbbc6e3f66f' },
    include: { conversation: true }
  });

  if (!message) {
    console.log('Message not found!');
    return;
  }

  console.log('=== Message Data ===');
  console.log(`ID: ${message.id}`);
  console.log(`Conversation ID: ${message.conversationId}`);
  console.log(`Direction: ${message.direction}`);
  console.log(`ContentType: ${message.contentType}`);
  console.log(`HasAttachments: ${message.hasAttachments}`);
  console.log(`Attachments: ${JSON.stringify(message.attachments, null, 2)}`);

  // Now simulate what the API returns
  const isGroup = message.conversation.type === 'group' || message.conversation.type === 'supergroup';

  let media = [];
  if (message.hasAttachments && message.attachments) {
    const attachments = message.attachments;
    if (attachments.files) {
      media = attachments.files.map((file) => ({
        type: file.type || 'unknown',
        url: file.path.startsWith('/media/')
          ? `/api${file.path}`
          : `/api/media${file.path}`,
        name: file.name,
        mimeType: file.mimeType,
      }));
    }
  }

  console.log('\n=== Transformed Media ===');
  console.log(JSON.stringify(media, null, 2));
  console.log('\nFull URL would be: https://telegram-cm-v2-production.up.railway.app' + (media[0]?.url || 'N/A'));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
