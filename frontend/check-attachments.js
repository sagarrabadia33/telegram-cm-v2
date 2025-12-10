const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  console.log('=== Recent Messages with Attachments ===');
  const messages = await prisma.message.findMany({
    where: { hasAttachments: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      conversationId: true,
      direction: true,
      contentType: true,
      body: true,
      hasAttachments: true,
      attachments: true,
      createdAt: true
    }
  });

  for (const msg of messages) {
    console.log(`\n--- Message ${msg.id} ---`);
    console.log(`  Direction: ${msg.direction}`);
    console.log(`  ContentType: ${msg.contentType}`);
    console.log(`  Body: ${msg.body?.substring(0, 50) || '(empty)'}`);
    console.log(`  Attachments: ${JSON.stringify(msg.attachments, null, 2)}`);
    console.log(`  Created: ${msg.createdAt}`);
  }

  console.log('\n\n=== Recent Outgoing Messages with Attachments ===');
  const outgoing = await prisma.outgoingMessage.findMany({
    where: { attachmentUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      conversationId: true,
      status: true,
      attachmentType: true,
      attachmentUrl: true,
      attachmentName: true,
      sentAt: true,
      createdAt: true
    }
  });

  for (const msg of outgoing) {
    console.log(`\n--- OutgoingMessage ${msg.id} ---`);
    console.log(`  Status: ${msg.status}`);
    console.log(`  AttachmentType: ${msg.attachmentType}`);
    console.log(`  AttachmentUrl: ${msg.attachmentUrl}`);
    console.log(`  AttachmentName: ${msg.attachmentName}`);
    console.log(`  SentAt: ${msg.sentAt}`);
    console.log(`  Created: ${msg.createdAt}`);
  }

  console.log('\n\n=== FileUpload Table ===');
  const uploads = await prisma.fileUpload.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      storageKey: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true
    }
  });

  for (const upload of uploads) {
    console.log(`\n--- FileUpload ${upload.id} ---`);
    console.log(`  StorageKey: ${upload.storageKey}`);
    console.log(`  Filename: ${upload.filename}`);
    console.log(`  MimeType: ${upload.mimeType}`);
    console.log(`  Size: ${upload.size}`);
    console.log(`  Created: ${upload.createdAt}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
