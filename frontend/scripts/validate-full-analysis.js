const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TEAM_MEMBERS = ['Shalin', 'Jesus', 'Prathamesh', 'Beast Insights'];
const BOT_USERNAMES = ['BeastInsightsBOT'];

function isTeamMember(name) {
  if (!name) return false;
  return TEAM_MEMBERS.some(tm => name.toLowerCase().includes(tm.toLowerCase()));
}

function isBot(name, username) {
  if (!name && !username) return false;
  const combined = (name || '') + (username || '');
  return BOT_USERNAMES.some(bot => combined.toLowerCase().includes(bot.toLowerCase()));
}

async function main() {
  // Get all Customer Groups conversations
  const convs = await prisma.conversation.findMany({
    where: {
      tags: { some: { tag: { name: 'Customer Groups' } } }
    },
    select: {
      id: true,
      title: true,
      type: true,
      lastMessageAt: true,
      aiAction: true,
      aiUrgencyLevel: true,
      aiSummary: true,
      aiSuggestedAction: true,
      aiHealthScore: true,
      aiChurnRisk: true,
      messages: {
        where: {
          body: { not: null },
          NOT: { body: '' }
        },
        orderBy: { sentAt: 'desc' },
        take: 10,
        select: {
          body: true,
          direction: true,
          sentAt: true,
          metadata: true
        }
      }
    },
    orderBy: { lastMessageAt: 'desc' }
  });

  console.log('═'.repeat(100));
  console.log('FULL ANALYSIS VALIDATION REPORT - ' + convs.length + ' Customer Groups Conversations');
  console.log('═'.repeat(100));
  console.log('');

  let issueCount = 0;
  const issues = [];

  for (const conv of convs) {
    // Filter out bot messages
    const realMessages = conv.messages.filter(m => {
      const body = (m.body || '').trim();
      if (body.length < 10) return false;
      if (body.includes('BeastInsightsBOT')) return false;
      const meta = m.metadata;
      if (meta && meta.sender && meta.sender.username === 'BeastInsightsBOT') return false;
      return true;
    });

    const lastMsg = realMessages[0];
    if (!lastMsg) continue;

    const daysSince = Math.floor((Date.now() - new Date(lastMsg.sentAt).getTime()) / (1000*60*60*24));

    // Determine last speaker
    const meta = lastMsg.metadata;
    let senderName = meta?.sender?.name || '';
    let isTeam = lastMsg.direction === 'outbound' || isTeamMember(senderName);
    const lastSpeaker = isTeam ? 'TEAM' : 'CUST';

    const action = conv.aiAction || 'N/A';
    const urgency = conv.aiUrgencyLevel || 'N/A';
    const summary = conv.aiSummary || 'No summary';

    // Check for potential issues
    let flag = '';

    // Issue 1: Customer waiting 3+ days but low urgency
    if (lastSpeaker === 'CUST' && daysSince >= 3 && urgency === 'low') {
      flag = '⚠️ Customer waiting ' + daysSince + 'd but urgency=low';
      issues.push({ title: conv.title, issue: flag });
      issueCount++;
    }

    // Issue 2: Customer waiting 2+ days but action is "On Track"
    if (lastSpeaker === 'CUST' && daysSince >= 2 && action === 'On Track') {
      flag = '⚠️ Customer waiting ' + daysSince + 'd but action=On Track';
      issues.push({ title: conv.title, issue: flag });
      issueCount++;
    }

    // Issue 3: Team spoke recently but action is "Reply Now" with high urgency
    if (lastSpeaker === 'TEAM' && daysSince <= 1 && action === 'Reply Now' && (urgency === 'high' || urgency === 'critical')) {
      flag = 'ℹ️ Team spoke ' + daysSince + 'd ago but Reply Now/high urgency';
    }

    // Print summary for each conversation
    console.log('─'.repeat(100));
    console.log(conv.title.slice(0,40).padEnd(42) + ' | ' + lastSpeaker + ' | ' + daysSince + 'd | ' + action.padEnd(12) + ' | ' + urgency);
    console.log('Summary: ' + summary.slice(0, 150) + (summary.length > 150 ? '...' : ''));
    if (conv.aiSuggestedAction) {
      console.log('Action:  ' + conv.aiSuggestedAction.slice(0, 150) + (conv.aiSuggestedAction.length > 150 ? '...' : ''));
    }
    if (flag) {
      console.log('FLAG:    ' + flag);
    }
  }

  console.log('');
  console.log('═'.repeat(100));
  console.log('SUMMARY');
  console.log('═'.repeat(100));
  console.log('Total conversations: ' + convs.length);
  console.log('Potential issues: ' + issueCount);

  if (issues.length > 0) {
    console.log('');
    console.log('ISSUES TO REVIEW:');
    issues.forEach(i => {
      console.log('  - ' + i.title + ': ' + i.issue);
    });
  } else {
    console.log('');
    console.log('✅ ALL ANALYSES APPEAR ACCURATE');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
