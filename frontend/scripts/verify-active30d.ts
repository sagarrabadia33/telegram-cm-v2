// Verify "Active in last 30 days" count accuracy
// This script queries the database directly to compare with client-side filter

import { prisma } from '../app/lib/prisma';

async function verifyActive30d() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  console.log('=== Active 30d Verification ===');
  console.log(`Now: ${now.toISOString()}`);
  console.log(`30 days ago cutoff: ${thirtyDaysAgo.toISOString()}`);
  console.log('');

  // Method 1: Direct SQL-like count using lastMessageAt
  const activeByLastMessageAt = await prisma.conversation.count({
    where: {
      isSyncDisabled: false,
      lastMessageAt: {
        gte: thirtyDaysAgo
      }
    }
  });

  // Method 2: Count with NULL lastMessageAt (would use createdAt)
  const noLastMessageButCreatedRecently = await prisma.conversation.count({
    where: {
      isSyncDisabled: false,
      lastMessageAt: null,
      createdAt: {
        gte: thirtyDaysAgo
      }
    }
  });

  // Total active (matches client-side logic)
  const totalActive30d = activeByLastMessageAt + noLastMessageButCreatedRecently;

  // Get total conversations for context
  const totalConversations = await prisma.conversation.count({
    where: {
      isSyncDisabled: false
    }
  });

  // Breakdown by type
  const byType = await prisma.conversation.groupBy({
    by: ['type'],
    where: {
      isSyncDisabled: false,
      OR: [
        { lastMessageAt: { gte: thirtyDaysAgo } },
        { lastMessageAt: null, createdAt: { gte: thirtyDaysAgo } }
      ]
    },
    _count: true
  });

  console.log('=== RESULTS ===');
  console.log(`Total conversations (not disabled): ${totalConversations}`);
  console.log('');
  console.log('Active in last 30 days:');
  console.log(`  - By lastMessageAt: ${activeByLastMessageAt}`);
  console.log(`  - By createdAt (no messages): ${noLastMessageButCreatedRecently}`);
  console.log(`  - TOTAL: ${totalActive30d}`);
  console.log('');
  console.log('Breakdown by type:');
  byType.forEach(t => {
    console.log(`  - ${t.type}: ${t._count}`);
  });
  console.log('');

  // Compare with expected value
  const expectedFromUI = 745;
  if (totalActive30d === expectedFromUI) {
    console.log(`✅ COUNT VERIFIED: ${totalActive30d} matches UI (${expectedFromUI})`);
  } else {
    console.log(`⚠️ COUNT MISMATCH: Database=${totalActive30d}, UI=${expectedFromUI}`);
    console.log(`   Difference: ${Math.abs(totalActive30d - expectedFromUI)} contacts`);
  }

  // Additional check: Sample some edge cases
  console.log('');
  console.log('=== Edge Case Samples ===');

  // Conversations exactly at the boundary
  const nearBoundary = await prisma.conversation.findMany({
    where: {
      isSyncDisabled: false,
      lastMessageAt: {
        gte: new Date(thirtyDaysAgo.getTime() - 60 * 60 * 1000), // 1 hour before cutoff
        lte: new Date(thirtyDaysAgo.getTime() + 60 * 60 * 1000)  // 1 hour after cutoff
      }
    },
    select: {
      id: true,
      title: true,
      lastMessageAt: true
    },
    take: 5
  });

  console.log(`Conversations near 30-day boundary (within 1 hour): ${nearBoundary.length}`);
  nearBoundary.forEach(c => {
    console.log(`  - "${c.title}" | lastMessageAt: ${c.lastMessageAt?.toISOString()}`);
  });

  await prisma.$disconnect();
}

verifyActive30d().catch(console.error);
