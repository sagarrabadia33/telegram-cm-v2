// Debug: Check what lastInteraction values look like

import { prisma } from '../app/lib/prisma';

async function debugLastInteraction() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get conversations with stats
  const conversations = await prisma.conversation.findMany({
    where: { isSyncDisabled: false },
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      createdAt: true,
    },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });

  console.log('=== Last Interaction Debug ===');
  console.log(`Now: ${now.toISOString()}`);
  console.log(`30 days ago: ${thirtyDaysAgo.toISOString()}`);
  console.log('');

  // Count stats
  let lastMessageAtNull = 0;
  let lastMessageAtOld = 0;
  let createdAtRecent = 0;
  let wouldPassFilter = 0;

  for (const conv of conversations) {
    // This is what the API returns as lastInteraction
    const lastInteraction = conv.lastMessageAt?.toISOString() || conv.createdAt.toISOString();
    const lastInteractionDate = new Date(lastInteraction);

    const passesFilter = lastInteractionDate >= thirtyDaysAgo;

    if (!conv.lastMessageAt) {
      lastMessageAtNull++;
    } else if (conv.lastMessageAt < thirtyDaysAgo) {
      lastMessageAtOld++;
    }

    if (conv.createdAt >= thirtyDaysAgo) {
      createdAtRecent++;
    }

    if (passesFilter) {
      wouldPassFilter++;
    }
  }

  console.log('=== Sample of 50 conversations ===');
  console.log(`lastMessageAt is NULL: ${lastMessageAtNull}`);
  console.log(`lastMessageAt is older than 30d: ${lastMessageAtOld}`);
  console.log(`createdAt is within 30d: ${createdAtRecent}`);
  console.log(`Would pass filter (using API logic): ${wouldPassFilter}`);
  console.log('');

  // Show some examples
  console.log('=== Examples where lastMessageAt is NULL but createdAt is recent ===');
  const examples = conversations
    .filter(c => !c.lastMessageAt && c.createdAt >= thirtyDaysAgo)
    .slice(0, 5);

  examples.forEach(c => {
    const lastInteraction = c.lastMessageAt?.toISOString() || c.createdAt.toISOString();
    console.log(`  "${c.title}" | lastMessageAt: ${c.lastMessageAt?.toISOString() || 'NULL'} | createdAt: ${c.createdAt.toISOString()} | lastInteraction: ${lastInteraction}`);
  });

  // Show examples where lastMessageAt is OLD but createdAt is recent
  console.log('');
  console.log('=== Examples where lastMessageAt is OLD but createdAt is recent ===');
  const oldExamples = conversations
    .filter(c => c.lastMessageAt && c.lastMessageAt < thirtyDaysAgo && c.createdAt >= thirtyDaysAgo)
    .slice(0, 5);

  oldExamples.forEach(c => {
    const lastInteraction = c.lastMessageAt?.toISOString() || c.createdAt.toISOString();
    console.log(`  "${c.title}" | lastMessageAt: ${c.lastMessageAt?.toISOString() || 'NULL'} | createdAt: ${c.createdAt.toISOString()}`);
    console.log(`    lastInteraction (API returns): ${lastInteraction}`);
    console.log(`    Would pass filter: ${new Date(lastInteraction) >= thirtyDaysAgo}`);
  });

  // Get full stats
  console.log('');
  console.log('=== Full Database Stats ===');

  const totalConvs = await prisma.conversation.count({
    where: { isSyncDisabled: false },
  });

  const nullLastMessageAt = await prisma.conversation.count({
    where: { isSyncDisabled: false, lastMessageAt: null },
  });

  const recentCreatedAt = await prisma.conversation.count({
    where: { isSyncDisabled: false, createdAt: { gte: thirtyDaysAgo } },
  });

  const oldLastMessageAtButRecentCreatedAt = await prisma.conversation.count({
    where: {
      isSyncDisabled: false,
      lastMessageAt: { lt: thirtyDaysAgo },
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  console.log(`Total conversations: ${totalConvs}`);
  console.log(`With NULL lastMessageAt: ${nullLastMessageAt}`);
  console.log(`With createdAt >= 30 days ago: ${recentCreatedAt}`);
  console.log(`With OLD lastMessageAt but RECENT createdAt: ${oldLastMessageAtButRecentCreatedAt}`);
  console.log('');
  console.log(`⚠️ These ${oldLastMessageAtButRecentCreatedAt} contacts have OLD activity but RECENT sync date!`);
  console.log('   The filter uses lastMessageAt correctly, but the API falls back to createdAt when lastMessageAt is NULL.');

  await prisma.$disconnect();
}

debugLastInteraction().catch(console.error);
