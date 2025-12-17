const { PrismaClient } = require('@prisma/client');
const Anthropic = require('@anthropic-ai/sdk').default;

const prisma = new PrismaClient();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEST_IDS = [
  'c06588a64c782ef44230286cf',
  'c26ff6d88fb4cc352e3a14c64',
  'c5c0c3e2ce399006d4a7b1987',
  'c7735ceecedc0d570566f9c5a'
];

async function analyzeConversation(conversationId) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 50,
        select: { body: true, direction: true, sentAt: true, metadata: true }
      },
      members: {
        select: { firstName: true, lastName: true, username: true, externalUserId: true }
      },
      tags: {
        include: {
          tag: {
            select: { id: true, name: true, aiSystemPrompt: true, aiTeamMembers: true, aiOwnerNames: true, aiStatusOptions: true, aiStatusLabels: true }
          }
        }
      },
      notes: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { type: true, content: true, createdAt: true }
      }
    }
  });

  if (!conv || conv.messages.length === 0) return null;

  const tagWithConfig = conv.tags.find(t => t.tag.aiSystemPrompt)?.tag;
  const systemPrompt = tagWithConfig?.aiSystemPrompt || '';
  const ownerNames = tagWithConfig?.aiOwnerNames || ['Shalin'];
  const statusOptions = (tagWithConfig?.aiStatusOptions || []).map(s => `"${s}"`).join(' | ');

  const memberMap = new Map();
  conv.members.forEach(m => {
    const name = [m.firstName, m.lastName].filter(Boolean).join(' ') || m.username || 'Unknown';
    memberMap.set(m.externalUserId, name);
  });

  const messagesText = conv.messages
    .filter(m => m.body && m.body.trim().length > 0)
    .map(m => {
      const time = new Date(m.sentAt).toLocaleString();
      const metadata = m.metadata;
      const senderId = metadata?.senderId;
      const senderName = metadata?.senderName || (senderId ? memberMap.get(senderId) : null);
      const sender = m.direction === 'outbound' ? 'Shalin' : (senderName || 'Partner');
      return `[${time}] ${sender}: ${m.body}`;
    })
    .join('\n');

  let notesContext = '';
  if (conv.notes && conv.notes.length > 0) {
    notesContext = '\n📝 INTERNAL NOTES (context from team):\n';
    conv.notes.forEach(note => {
      const dateStr = new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      notesContext += `  [${dateStr}] ${note.type}: ${note.content.slice(0, 200)}\n`;
    });
  }

  const outputFormat = `{
  "status": ${statusOptions || '"nurturing" | "high_potential" | "active" | "dormant" | "committed"'},
  "statusReason": "MAX 8 words. Key evidence only. Example: 'Call scheduled Tuesday 5PM IST'",
  "summary": "MAX 15 words. Who + current state. Example: 'Payment partner from Bangkok, call scheduled for Tuesday.'",
  "suggestedAction": "MAX 8 words. Verb + outcome. Example: 'Confirm meeting time via email'"
}`;

  const analysisPrompt = `${systemPrompt}

OWNER: ${ownerNames.join(', ')}
${notesContext}
=== CONVERSATION: ${conv.title || 'Partner'} (${conv.type}) ===
${messagesText}

Based on the conversation above, provide your analysis in this exact JSON format:
${outputFormat}

Return ONLY valid JSON.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 700,
    messages: [{ role: 'user', content: analysisPrompt }]
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
  return {
    analysis: JSON.parse(responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()),
    messageCount: conv.messages.length,
    notesCount: conv.notes?.length || 0,
    title: conv.title,
    recentMessages: conv.messages.slice(0, 5).map(m => ({
      direction: m.direction,
      body: m.body?.slice(0, 100),
      date: new Date(m.sentAt).toLocaleDateString()
    }))
  };
}

async function main() {
  console.log('\n=== ANALYZING 4 TEST CONVERSATIONS ===\n');

  for (const convId of TEST_IDS) {
    try {
      console.log('-------------------------------------------');
      const result = await analyzeConversation(convId);
      if (result) {
        console.log('📋 ' + result.title);
        console.log('   Messages: ' + result.messageCount + ', Notes: ' + result.notesCount);
        console.log('');
        console.log('   STATUS: ' + result.analysis.status);
        console.log('   REASON: ' + result.analysis.statusReason);
        console.log('   SUMMARY: ' + result.analysis.summary);
        console.log('   ACTION: ' + result.analysis.suggestedAction);
        console.log('');
        console.log('   RECENT MESSAGES (for verification):');
        result.recentMessages.forEach(m => {
          console.log(`     [${m.date}] ${m.direction}: ${m.body}...`);
        });
        console.log('');

        // Save to database
        await prisma.conversation.update({
          where: { id: convId },
          data: {
            aiStatus: result.analysis.status,
            aiStatusReason: result.analysis.statusReason,
            aiStatusUpdatedAt: new Date(),
            aiSummary: result.analysis.summary,
            aiSummaryUpdatedAt: new Date(),
            aiSuggestedAction: result.analysis.suggestedAction,
            aiAnalyzing: false
          }
        });
        console.log('   ✓ Saved to database');
      }
    } catch (err) {
      console.log('✗ Error:', err.message?.slice(0, 100));
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
