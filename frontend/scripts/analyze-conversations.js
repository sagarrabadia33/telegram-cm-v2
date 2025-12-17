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
  console.log("System Prompt:", tag.aiSystemPrompt ? tag.aiSystemPrompt.slice(0, 200) + "..." : "Using default");
  console.log("");

  // Get 5 conversations with this tag that have AI analysis
  const conversations = await prisma.conversation.findMany({
    where: {
      tags: { some: { tagId: tag.id } },
      aiSummary: { not: null }
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
      lastMessageAt: true,
      notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { type: true, content: true, createdAt: true }
      },
      messages: {
        orderBy: { sentAt: "desc" },
        take: 15,
        select: { body: true, direction: true, sentAt: true, metadata: true }
      }
    },
    take: 5
  });

  console.log("=== ANALYZING", conversations.length, "CONVERSATIONS ===\n");

  for (const conv of conversations) {
    console.log("━".repeat(80));
    console.log("CONVERSATION:", conv.title);
    console.log("Type:", conv.type);
    console.log("Last Message:", conv.lastMessageAt ? conv.lastMessageAt.toISOString().split("T")[0] : "N/A");
    console.log("");

    console.log("📊 AI ANALYSIS:");
    console.log("  Status:", conv.aiStatus);
    console.log("  Action:", conv.aiAction || "(not set - needs re-analysis)");
    console.log("  Urgency:", conv.aiUrgencyLevel);
    console.log("  Health Score:", conv.aiHealthScore);
    console.log("  Lifecycle:", conv.aiLifecycleStage);
    console.log("  Summary:", conv.aiSummary);
    console.log("  Suggested Action:", conv.aiSuggestedAction);
    console.log("");

    if (conv.notes.length > 0) {
      console.log("📝 NOTES (" + conv.notes.length + "):");
      conv.notes.forEach(n => {
        const date = n.createdAt.toISOString().split("T")[0];
        console.log("  [" + date + "] " + n.type + ": " + n.content.slice(0, 100) + (n.content.length > 100 ? "..." : ""));
      });
      console.log("");
    }

    console.log("💬 RECENT MESSAGES (newest first):");
    conv.messages.slice(0, 8).forEach(m => {
      const date = m.sentAt.toISOString().split("T")[0];
      const meta = m.metadata;
      const sender = meta && meta.sender && meta.sender.name ? meta.sender.name : (m.direction === "outbound" ? "TEAM" : "CUSTOMER");
      const body = (m.body || "").slice(0, 120);
      console.log("  [" + date + "] " + sender + ": " + body + (m.body && m.body.length > 120 ? "..." : ""));
    });
    console.log("\n");
  }

  await prisma.$disconnect();
}

main().catch(console.error);
