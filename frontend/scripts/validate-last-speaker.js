const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEAM_MEMBERS = ['Shalin', 'Jesus', 'Prathamesh', 'Beast Insights'];

async function main() {
  // Get Customer Groups conversations with their analysis
  const convs = await prisma.conversation.findMany({
    where: {
      tags: { some: { tag: { name: 'Customer Groups' } } }
    },
    select: {
      id: true,
      title: true,
      aiAction: true,
      aiUrgencyLevel: true,
      aiSuggestedAction: true,
      messages: {
        where: {
          body: { not: null },
          NOT: { body: '' }
        },
        orderBy: { sentAt: 'desc' },
        take: 5,
        select: {
          sentAt: true,
          direction: true,
          body: true,
          metadata: true
        }
      }
    },
    orderBy: { lastMessageAt: 'desc' }
  });

  console.log('\n=== VALIDATION: Last Speaker vs AI Action ===\n');

  const issues = [];

  convs.forEach(c => {
    // Filter out bot messages
    const realMessages = c.messages.filter(m => {
      const body = (m.body || '').trim();
      if (body.length < 10) return false;
      if (body.includes('BeastInsightsBOT')) return false;
      const meta = m.metadata;
      if (meta && meta.sender && meta.sender.username === 'BeastInsightsBOT') return false;
      return true;
    });

    const lastMsg = realMessages[0];
    if (!lastMsg) {
      console.log(`${c.title.slice(0,30).padEnd(32)} | No meaningful messages`);
      return;
    }

    const daysSince = Math.floor((Date.now() - new Date(lastMsg.sentAt).getTime()) / (1000*60*60*24));

    // Determine if last speaker was team or customer
    const meta = lastMsg.metadata;
    let senderName = meta?.sender?.name || '';
    let isTeam = lastMsg.direction === 'outbound' || TEAM_MEMBERS.some(t => senderName.toLowerCase().includes(t.toLowerCase()));

    const lastSpeaker = isTeam ? 'TEAM' : 'CUST';
    const action = c.aiAction || 'N/A';
    const urgency = c.aiUrgencyLevel || 'N/A';

    // Flag potential issues
    let flag = '';
    if (lastSpeaker === 'CUST' && daysSince >= 2 && action === 'On Track') {
      flag = '⚠️ ISSUE: Customer waiting 2+ days but marked On Track';
      issues.push({ title: c.title, issue: flag });
    }
    if (lastSpeaker === 'CUST' && daysSince >= 3 && urgency === 'low') {
      flag = '⚠️ ISSUE: Customer waiting 3+ days but low urgency';
      issues.push({ title: c.title, issue: flag });
    }

    console.log(`${c.title.slice(0,30).padEnd(32)} | Last: ${lastSpeaker} | Days: ${String(daysSince).padStart(2)} | Action: ${action.padEnd(12)} | Urgency: ${urgency}`);
    if (flag) console.log(`   --> ${flag}`);
  });

  console.log('\n=== SUMMARY ===');
  console.log(`Total conversations: ${convs.length}`);
  console.log(`Potential issues found: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n=== ISSUES DETAIL ===');
    issues.forEach(i => {
      console.log(`- ${i.title}: ${i.issue}`);
    });
  }

  await prisma.$disconnect();
}

main().catch(console.error);
