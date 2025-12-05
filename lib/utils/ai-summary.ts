import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface Message {
  content: string | null;
  isOutgoing: boolean;
  sentAt: string | Date;
  contact?: {
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
  } | null;
}

export interface ConversationSummary {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  intentLevel: 'high' | 'medium' | 'low';
  keyPoints: string[];
  lastTopic: string;
}

/**
 * Generate AI summary for a conversation using Claude Haiku
 * @param messages - Array of messages (last 100 recommended)
 * @param conversationTitle - Title/name of the conversation
 * @returns ConversationSummary object
 */
export async function generateConversationSummary(
  messages: Message[],
  conversationTitle: string = 'Unknown'
): Promise<ConversationSummary> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY is not configured in .env file');
  }

  if (!messages || messages.length === 0) {
    throw new Error('No messages provided for summary generation');
  }

  // Format messages for AI analysis
  const formattedMessages = messages
    .filter(m => m.content && m.content.trim().length > 0)
    .map((m) => {
      const sender = m.isOutgoing
        ? 'You'
        : m.contact?.firstName || m.contact?.username || 'Contact';

      const date = new Date(m.sentAt).toLocaleString();
      return `[${date}] ${sender}: ${m.content}`;
    })
    .join('\n');

  if (formattedMessages.length === 0) {
    throw new Error('No valid text messages found for summary generation');
  }

  // Create the prompt
  const prompt = `You are analyzing a Telegram conversation titled "${conversationTitle}". Analyze the following messages and provide a structured summary.

Messages (most recent first):
${formattedMessages}

Provide a JSON response with the following structure:
{
  "summary": "2-3 sentence summary of the conversation",
  "sentiment": "positive" | "neutral" | "negative",
  "intentLevel": "high" | "medium" | "low",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "lastTopic": "most recent topic discussed"
}

Guidelines:
- summary: Capture the main theme and current status of the conversation
- sentiment: Overall emotional tone of the conversation
- intentLevel: How likely the contact is to take action or engage further (high = very engaged, medium = somewhat interested, low = casual chat)
- keyPoints: 3-5 most important points discussed
- lastTopic: The most recent topic being discussed

Return ONLY valid JSON, no other text.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Extract the text content from the response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Parse the JSON response
    const summaryData = JSON.parse(content.text);

    // Validate the response structure
    if (!summaryData.summary || !summaryData.sentiment || !summaryData.intentLevel || !summaryData.keyPoints || !summaryData.lastTopic) {
      throw new Error('Invalid response structure from Claude API');
    }

    return {
      summary: summaryData.summary,
      sentiment: summaryData.sentiment,
      intentLevel: summaryData.intentLevel,
      keyPoints: Array.isArray(summaryData.keyPoints) ? summaryData.keyPoints : [],
      lastTopic: summaryData.lastTopic,
    };
  } catch (error) {
    console.error('Error generating conversation summary:', error);
    throw new Error(`Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Check if a conversation should be excluded from summary generation
 * @param conversationTitle - Title of the conversation
 * @returns boolean - true if should be excluded
 */
export function shouldExcludeFromSummary(conversationTitle: string | null): boolean {
  if (!conversationTitle) return false;

  const excludedGroups = [
    'Ganeesham2 Residents',
  ];

  return excludedGroups.some(excluded =>
    conversationTitle.toLowerCase().includes(excluded.toLowerCase())
  );
}
