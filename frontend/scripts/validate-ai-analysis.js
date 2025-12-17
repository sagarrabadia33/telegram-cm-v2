const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Team members to identify
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
  const conversationIds = [
    "vcab6f6f9cbf1db2f866bccde",
    "vdbcf6cf8843d5396592f0337",
    "v3fefa1dd7be40e80f02cd2bd",
    "veefac1406bdc4b1eec242200",
    "v25eac3e3b112a37905bc363b"
  ];

  console.log("═".repeat(100));
  console.log("AI ANALYSIS VALIDATION REPORT");
  console.log("═".repeat(100));
  console.log("");

  for (const convId of conversationIds) {
    const conv = await prisma.conversation.findUnique({
      where: { id: convId },
      select: {
        id: true,
        title: true,
        type: true,
        lastMessageAt: true,
        // AI Fields
        aiAction: true,
        aiUrgencyLevel: true,
        aiSummary: true,
        aiSuggestedAction: true,
        aiHealthScore: true,
        aiLifecycleStage: true,
        aiSentiment: true,
        aiSentimentTrajectory: true,
        aiFrustrationSignals: true,
        aiCriticalInsights: true,
        // Notes
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { type: true, content: true, createdAt: true }
        },
        // Messages - get recent meaningful ones
        messages: {
          where: {
            body: { not: null },
            NOT: { body: '' }
          },
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

    if (!conv) {
      console.log(`Conversation ${convId} not found`);
      continue;
    }

    console.log("═".repeat(100));
    console.log(`CONVERSATION: ${conv.title}`);
    console.log(`Type: ${conv.type} | Last Message: ${conv.lastMessageAt?.toISOString().split('T')[0] || 'N/A'}`);
    console.log("");

    // ======= AI ANALYSIS OUTPUT =======
    console.log("┌─── AI ANALYSIS OUTPUT ────────────────────────────────────────────────────────┐");
    console.log(`│ Action Badge: ${conv.aiAction || '(NOT SET)'}`);
    console.log(`│ Urgency: ${conv.aiUrgencyLevel || 'N/A'}`);
    console.log(`│ Health Score: ${conv.aiHealthScore || 'N/A'}/100`);
    console.log(`│ Lifecycle: ${conv.aiLifecycleStage || 'N/A'}`);
    console.log(`│ Sentiment: ${conv.aiSentiment || 'N/A'} | Trajectory: ${conv.aiSentimentTrajectory || 'N/A'}`);
    console.log("│");
    console.log(`│ Summary: ${conv.aiSummary || '(none)'}`);
    console.log("│");
    console.log(`│ Suggested Action: ${conv.aiSuggestedAction || '(none)'}`);
    if (conv.aiCriticalInsights && conv.aiCriticalInsights.length > 0) {
      console.log(`│ Critical Insights: ${conv.aiCriticalInsights.join('; ')}`);
    }
    if (conv.aiFrustrationSignals && conv.aiFrustrationSignals.length > 0) {
      console.log(`│ Frustration Signals: ${conv.aiFrustrationSignals.join('; ')}`);
    }
    console.log("└────────────────────────────────────────────────────────────────────────────────┘");
    console.log("");

    // ======= NOTES =======
    if (conv.notes.length > 0) {
      console.log("┌─── INTERNAL NOTES ────────────────────────────────────────────────────────────┐");
      conv.notes.forEach(n => {
        const date = n.createdAt.toISOString().split('T')[0];
        console.log(`│ [${date}] ${n.type.toUpperCase()}: ${n.content.slice(0, 70)}${n.content.length > 70 ? '...' : ''}`);
      });
      console.log("└────────────────────────────────────────────────────────────────────────────────┘");
      console.log("");
    }

    // ======= RECENT MESSAGES =======
    // Filter out bot messages and very short messages
    const realMessages = conv.messages.filter(m => {
      const body = (m.body || '').trim();
      if (body.length < 10) return false;

      // Check if it's a bot message
      const meta = m.metadata;
      if (meta && meta.sender) {
        if (isBot(meta.sender.name, meta.sender.username)) return false;
      }

      // Skip notification-style messages
      if (body.startsWith('📊') && body.length < 100) return false;
      if (body.includes('BeastInsightsBOT')) return false;

      return true;
    });

    console.log(`┌─── RECENT MESSAGES (${realMessages.length} meaningful) ──────────────────────────────────────┐`);

    let lastMeaningfulSpeaker = null;
    let lastMeaningfulDate = null;
    let customerWaitingDays = null;

    // Show last 10 messages (most recent first for analysis, then we'll reverse for display)
    const displayMessages = realMessages.slice(0, 10).reverse();

    displayMessages.forEach((m, idx) => {
      const date = m.sentAt.toISOString().split('T')[0];
      const meta = m.metadata;

      // Determine sender
      let senderName = 'Unknown';
      let senderType = 'CUST';

      if (meta && meta.sender && meta.sender.name) {
        senderName = meta.sender.name;
      } else if (m.direction === 'outbound') {
        senderName = 'Team';
      } else {
        senderName = conv.title.split(' ')[0] || 'Customer';
      }

      if (m.direction === 'outbound' || isTeamMember(senderName)) {
        senderType = 'TEAM';
      }

      const body = (m.body || '').replace(/\n/g, ' ').slice(0, 90);
      console.log(`│ ${date} [${senderType}] ${senderName}:`);
      console.log(`│   "${body}${m.body.length > 90 ? '...' : ''}"`);
    });

    console.log("└────────────────────────────────────────────────────────────────────────────────┘");
    console.log("");

    // ======= VALIDATION ANALYSIS =======
    console.log("┌─── VALIDATION ANALYSIS ──────────────────────────────────────────────────────┐");

    // Determine last meaningful speaker from the most recent messages
    const mostRecentMsg = realMessages[0];
    if (mostRecentMsg) {
      const meta = mostRecentMsg.metadata;
      let senderName = '';
      if (meta && meta.sender && meta.sender.name) {
        senderName = meta.sender.name;
      }

      const isTeam = mostRecentMsg.direction === 'outbound' || isTeamMember(senderName);
      lastMeaningfulSpeaker = isTeam ? 'TEAM' : 'CUSTOMER';
      lastMeaningfulDate = mostRecentMsg.sentAt;

      const daysSince = Math.floor((Date.now() - mostRecentMsg.sentAt.getTime()) / (1000 * 60 * 60 * 24));

      console.log(`│ Last meaningful speaker: ${lastMeaningfulSpeaker}`);
      console.log(`│ Days since last message: ${daysSince}`);
      console.log(`│ Customer waiting: ${lastMeaningfulSpeaker === 'CUSTOMER' ? 'YES - needs response' : 'No - ball in customer court'}`);

      // Check if AI action matches the situation
      const aiAction = conv.aiAction;
      const aiUrgency = conv.aiUrgencyLevel;

      if (lastMeaningfulSpeaker === 'CUSTOMER') {
        if (daysSince >= 3 && aiUrgency !== 'high' && aiUrgency !== 'critical') {
          console.log(`│ ⚠️  WARNING: Customer waiting ${daysSince} days but urgency is ${aiUrgency}`);
        }
        if (daysSince >= 1 && aiAction !== 'Reply Now' && aiAction !== 'Check In') {
          console.log(`│ ⚠️  WARNING: Customer waiting but action is "${aiAction}"`);
        }
      } else {
        if (daysSince < 7 && aiAction === 'Reply Now') {
          console.log(`│ ℹ️  Note: Team spoke last ${daysSince} days ago, action is "Reply Now"`);
        }
      }
    }

    // Check if notes were considered
    if (conv.notes.length > 0 && conv.aiSummary) {
      const summary = conv.aiSummary.toLowerCase();
      const noteMentioned = conv.notes.some(n => {
        const noteWords = n.content.toLowerCase().split(' ').filter(w => w.length > 4);
        return noteWords.some(word => summary.includes(word));
      });
      console.log(`│ Notes considered in summary: ${noteMentioned ? 'Likely YES' : 'Unclear'}`);
    }

    console.log("└────────────────────────────────────────────────────────────────────────────────┘");
    console.log("\n\n");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
