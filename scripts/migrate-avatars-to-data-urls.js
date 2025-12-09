/**
 * Migration script: Convert local avatar files to base64 data URLs
 *
 * This fixes the production issue where avatars don't show because:
 * - Local: Avatar files exist at /public/media/avatars/...
 * - Production (Vercel): No access to these files
 *
 * Solution: Store avatars as data URLs in the database
 *
 * Run: DATABASE_URL="..." node scripts/migrate-avatars-to-data-urls.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Media base path - where local avatar files are stored
const MEDIA_BASE_PATH = path.join(__dirname, '..', 'public', 'media');

/**
 * Convert a local avatar file to a base64 data URL
 */
function fileToDataUrl(avatarUrl) {
  try {
    // avatarUrl format: /media/avatars/contacts/xxx.jpg
    // We need: public/media/avatars/contacts/xxx.jpg
    const relativePath = avatarUrl.replace(/^\/media\//, '');
    const fullPath = path.join(MEDIA_BASE_PATH, relativePath);

    if (!fs.existsSync(fullPath)) {
      console.log(`  File not found: ${fullPath}`);
      return null;
    }

    const fileBuffer = fs.readFileSync(fullPath);
    const base64 = fileBuffer.toString('base64');

    // Determine MIME type from extension
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';

    // Return data URL
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.log(`  Error reading file: ${error.message}`);
    return null;
  }
}

async function migrateContactAvatars() {
  console.log('\n=== Migrating Contact Avatars ===');

  const contacts = await prisma.contact.findMany({
    where: {
      avatarUrl: {
        not: null,
        startsWith: '/media/',
      },
    },
    select: { id: true, avatarUrl: true },
  });

  console.log(`Found ${contacts.length} contacts with local avatars`);

  let migrated = 0;
  let failed = 0;

  for (const contact of contacts) {
    console.log(`\nMigrating contact ${contact.id}:`);
    console.log(`  Current: ${contact.avatarUrl}`);

    const dataUrl = fileToDataUrl(contact.avatarUrl);

    if (dataUrl) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { avatarUrl: dataUrl },
      });
      console.log(`  Migrated to data URL (${dataUrl.length} chars)`);
      migrated++;
    } else {
      // Clear the avatarUrl if file doesn't exist
      await prisma.contact.update({
        where: { id: contact.id },
        data: { avatarUrl: null },
      });
      console.log(`  Cleared (file not found)`);
      failed++;
    }
  }

  console.log(`\nContact avatars: ${migrated} migrated, ${failed} cleared`);
  return { migrated, failed };
}

async function migrateConversationAvatars() {
  console.log('\n=== Migrating Conversation Avatars ===');

  const conversations = await prisma.conversation.findMany({
    where: {
      avatarUrl: {
        not: null,
        startsWith: '/media/',
      },
    },
    select: { id: true, avatarUrl: true },
  });

  console.log(`Found ${conversations.length} conversations with local avatars`);

  let migrated = 0;
  let failed = 0;

  for (const conv of conversations) {
    console.log(`\nMigrating conversation ${conv.id}:`);
    console.log(`  Current: ${conv.avatarUrl}`);

    const dataUrl = fileToDataUrl(conv.avatarUrl);

    if (dataUrl) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { avatarUrl: dataUrl },
      });
      console.log(`  Migrated to data URL (${dataUrl.length} chars)`);
      migrated++;
    } else {
      // Clear the avatarUrl if file doesn't exist
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { avatarUrl: null },
      });
      console.log(`  Cleared (file not found)`);
      failed++;
    }
  }

  console.log(`\nConversation avatars: ${migrated} migrated, ${failed} cleared`);
  return { migrated, failed };
}

async function main() {
  console.log('Avatar Migration Script');
  console.log('=======================');
  console.log(`Media base path: ${MEDIA_BASE_PATH}`);

  if (!fs.existsSync(MEDIA_BASE_PATH)) {
    console.error(`ERROR: Media base path does not exist: ${MEDIA_BASE_PATH}`);
    process.exit(1);
  }

  try {
    const contactResult = await migrateContactAvatars();
    const convResult = await migrateConversationAvatars();

    console.log('\n=== Migration Complete ===');
    console.log(`Contacts: ${contactResult.migrated} migrated, ${contactResult.failed} cleared`);
    console.log(`Conversations: ${convResult.migrated} migrated, ${convResult.failed} cleared`);
    console.log(`Total: ${contactResult.migrated + convResult.migrated} successfully migrated`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
