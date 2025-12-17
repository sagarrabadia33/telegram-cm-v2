const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get 5 diverse Partner conversations for deep analysis
  const testIds = [
    'c5c0c3e2ce399006d4a7b1987',  // Reuven Cypers - Critical urgency
    'cdf12ec8d74faae4a4c45636a',  // Ashish Mittal - Critical urgency
    'v8961e4daa34838f311800369',  // Thomas K - Dormant, high urgency
    'cb68216f4ca9d7320841f858a',  // Beast Insights | Paymend - Committed group
    'cb725c899a60485fa727dba73',  // Jonas Nicoloff - High potential
  ];

  for (const id of testIds) {
    const conv = await prisma.conversation.findUnique({
      where: { id },
      select: {
        title: true,
        type: true,
        aiStatus: true,
        aiAction: true,
        aiUrgencyLevel: true,
        aiSummary: true,
        aiSuggestedAction: true,
        aiStatusReason: true,
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 30,
          select: {
            body: true,
            direction: true,
            sentAt: true,
            metadata: true
          }
        }
      }
    });

    if (!conv) continue;

    console.log('\n' + '='.repeat(100));
    console.log('CONVERSATION: ' + conv.title);
    console.log('Type: ' + conv.type);
    console.log('='.repeat(100));

    console.log('\n--- AI ANALYSIS ---');
    console.log('Status: ' + conv.aiStatus);
    console.log('Action: ' + conv.aiAction);
    console.log('Urgency: ' + conv.aiUrgencyLevel);
    console.log('Summary: ' + conv.aiSummary);
    console.log('Next Step: ' + conv.aiSuggestedAction);

    console.log('\n--- ACTUAL MESSAGES (most recent first) ---');
    const msgs = conv.messages.filter(m => m.body && m.body.trim().length > 5).slice(0, 15);

    for (const m of msgs) {
      const date = new Date(m.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const meta = m.metadata;
      const sender = m.direction === 'outbound' ? 'SHALIN' : (meta?.sender?.name || 'Partner');
      const body = (m.body || '').slice(0, 200);
      console.log('[' + date + '] ' + sender + ': ' + body + (m.body && m.body.length > 200 ? '...' : ''));
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
