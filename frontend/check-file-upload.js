const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  const storageKey = 'upload_119ecbda-f265-41f0-b4b0-60b612a7c77e';

  console.log(`Looking up FileUpload with storageKey: ${storageKey}`);

  const fileUpload = await prisma.fileUpload.findUnique({
    where: { storageKey },
  });

  if (!fileUpload) {
    console.log('FileUpload NOT FOUND!');
    return;
  }

  console.log('\n=== FileUpload Record ===');
  console.log(`  ID: ${fileUpload.id}`);
  console.log(`  StorageKey: ${fileUpload.storageKey}`);
  console.log(`  Filename: ${fileUpload.filename}`);
  console.log(`  MimeType: ${fileUpload.mimeType}`);
  console.log(`  Size: ${fileUpload.size}`);
  console.log(`  ExpiresAt: ${fileUpload.expiresAt}`);
  console.log(`  Metadata keys: ${fileUpload.metadata ? Object.keys(fileUpload.metadata) : 'null'}`);

  const metadata = fileUpload.metadata;
  if (metadata?.base64Content) {
    console.log(`  base64Content length: ${metadata.base64Content.length} chars`);
    console.log(`  base64Content preview: ${metadata.base64Content.substring(0, 50)}...`);
  } else {
    console.log('  base64Content: NOT PRESENT!');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
