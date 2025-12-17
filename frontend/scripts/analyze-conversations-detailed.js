const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // Find Customer Groups tag
  const tag = await prisma.tag.findFirst({
    where: { name: { contains: "Customer", mode: "insensitive" } },
    select: { id: true, name: true, aiSystemPrompt: true, aiEnabled: true, aiTeamMembers: true, aiOwnerNames: true }
  });

  if (!tag) {
    console.log("No Customer Groups tag found");
    return;
  }

  console.log("=== TAG CONFIG ===");
  console.log("Name:", tag.name);
  console.log("AI Enabled:", tag.aiEnabled);
  console.log("Team Members:", tag.aiTeamMembers);
  console.log("Owner Names:", tag.aiOwnerNames);
  console.log("");
  console.log("=== CUSTOM SYSTEM PROMPT ===");
  console.log(tag.aiSystemPrompt || "Using default prompt");
  console.log("");

  // Get 5 conversations with this tag that have AI analysis AND real messages
  const conversations = await prisma.conversation.findMany({
    where: {
      tags: { some: { tagId: tag.id } },
      aiSummary: { not: null },
      messages: {
        some: {
          body: { not: null },
          NOT: { body: "" }
        }
      }
    },
    select: {
      id: true,
      title: true,
      type: true,
      aiStatus: true,
      aiAction: true,
      aiSummary: true,
      aiSuggestedAction: true,
      aiUrgencyLevel: true,
      aiHealthScore: true,
      aiLifecycleStage: true,
      aiSentiment: true,
      aiSentimentTrajectory: true,
      aiFrustrationSignals: true,
      aiCriticalInsights: true,
      lastMessageAt: true,
      notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { type: true, content: true, createdAt: true }
      },
      messages: {
        where: {
          body: { not: null },
          NOT: { body: "" }
        },
        orderBy: { sentAt: "desc" },
        take: 20,
        select: { body: true, direction: true, sentAt: true, metadata: true }
      }
    },
    orderBy: { lastMessageAt: "desc" },
    take: 5
  });

  console.log("=== DETAILED ANALYSIS OF", conversations.length, "CONVERSATIONS ===\n");

  for (const conv of conversations) {
    console.log("═".repeat(100));
    console.log("CONVERSATION:", conv.title);
    console.log("Type:", conv.type, "| Last Activity:", conv.lastMessageAt ? conv.lastMessageAt.toISOString().split("T")[0] : "N/A");
    console.log("");

    console.log("┌─── AI ANALYSIS ───────────────────────────────────────────────────────────────┐");
    console.log("│ Status:", conv.aiStatus);
    console.log("│ Action:", conv.aiAction || "(NOT SET - needs re-analysis with new field)");
    console.log("│ Urgency:", conv.aiUrgencyLevel);
    console.log("│ Health Score:", conv.aiHealthScore + "/100");
    console.log("│ Lifecycle:", conv.aiLifecycleStage);
    console.log("│ Sentiment:", conv.aiSentiment, "| Trajectory:", conv.aiSentimentTrajectory);
    console.log("│");
    console.log("│ Summary:", conv.aiSummary);
    console.log("│");
    console.log("│ Suggested Action:", conv.aiSuggestedAction);
    console.log("│");
    if (conv.aiCriticalInsights && conv.aiCriticalInsights.length > 0) {
      console.log("│ Critical Insights:", conv.aiCriticalInsights.join("; "));
    }
    if (conv.aiFrustrationSignals && conv.aiFrustrationSignals.length > 0) {
      console.log("│ Frustration Signals:", conv.aiFrustrationSignals.join("; "));
    }
    console.log("└────────────────────────────────────────────────────────────────────────────────┘");
    console.log("");

    if (conv.notes.length > 0) {
      console.log("┌─── INTERNAL NOTES (" + conv.notes.length + ") ─────────────────────────────────────────────────┐");
      conv.notes.forEach(n => {
        const date = n.createdAt.toISOString().split("T")[0];
        console.log("│ [" + date + "] " + n.type.toUpperCase() + ": " + n.content.slice(0, 80) + (n.content.length > 80 ? "..." : ""));
      });
      console.log("└────────────────────────────────────────────────────────────────────────────────┘");
      console.log("");
    }

    console.log("┌─── RECENT MESSAGES (" + conv.messages.length + " with content) ──────────────────────────────────┐");
    // Filter out bot messages and show real conversations
    const realMessages = conv.messages.filter(m => {
      const body = (m.body || "").trim();
      // Skip empty or very short messages, and bot notifications
      if (body.length < 5) return false;
      if (body.includes("📊") && body.length < 50) return false;
      return true;
    });

    realMessages.slice(0, 10).forEach(m => {
      const date = m.sentAt.toISOString().split("T")[0];
      const meta = m.metadata;
      let sender = "UNKNOWN";
      if (meta && meta.sender && meta.sender.name) {
        sender = meta.sender.name;
      } else if (m.direction === "outbound") {
        sender = "TEAM";
      } else {
        sender = "CUSTOMER";
      }

      // Check if team member
      const teamMembers = ["Shalin", "Jesus", "Prathamesh", "Beast Insights"];
      const isTeam = teamMembers.some(tm => sender.includes(tm));
      const senderTag = isTeam ? "[TEAM]" : "[CUST]";

      const body = (m.body || "").replace(/\n/g, " ").slice(0, 100);
      console.log("│ " + date + " " + senderTag + " " + sender + ":");
      console.log("│   " + body + (m.body && m.body.length > 100 ? "..." : ""));
    });
    console.log("└────────────────────────────────────────────────────────────────────────────────┘");

    // My analysis
    console.log("");
    console.log("┌─── ACCURACY ASSESSMENT ───────────────────────────────────────────────────────┐");

    // Check last speaker
    const lastRealMsg = realMessages[0];
    if (lastRealMsg) {
      const meta = lastRealMsg.metadata;
      const sender = meta && meta.sender && meta.sender.name ? meta.sender.name : (lastRealMsg.direction === "outbound" ? "TEAM" : "CUSTOMER");
      const teamMembers = ["Shalin", "Jesus", "Prathamesh", "Beast Insights"];
      const isTeamLast = teamMembers.some(tm => sender.includes(tm));

      const daysSince = Math.floor((Date.now() - lastRealMsg.sentAt.getTime()) / (1000 * 60 * 60 * 24));

      console.log("│ Last real message:", daysSince, "days ago by", isTeamLast ? "TEAM" : "CUSTOMER");
      console.log("│ Customer waiting?:", !isTeamLast ? "YES - needs response" : "No - ball in customer's court");
    }

    // Check if notes were considered
    if (conv.notes.length > 0) {
      const summaryMentionsNotes = conv.aiSummary && conv.notes.some(n =>
        conv.aiSummary.toLowerCase().includes(n.content.slice(0, 20).toLowerCase())
      );
      console.log("│ Notes considered?:", summaryMentionsNotes ? "Likely YES" : "Unclear - may need better integration");
    }

    console.log("└────────────────────────────────────────────────────────────────────────────────┘");
    console.log("\n\n");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
