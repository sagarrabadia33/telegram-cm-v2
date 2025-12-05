import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Constants for message limits
const STANDARD_MESSAGE_LIMIT = 50;
const DEEP_ANALYSIS_MESSAGE_LIMIT = 500; // Max for deep analysis

/**
 * POST /api/conversations/[id]/chat
 * Interactive AI chat with full conversation context
 * Uses Claude Haiku for fast, cost-effective responses
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { message, chatHistory = [], deepAnalysis = false } = body as {
      message: string;
      chatHistory?: ChatMessage[];
      deepAnalysis?: boolean;
    };

    // Determine message limit based on analysis mode
    const messageLimit = deepAnalysis ? DEEP_ANALYSIS_MESSAGE_LIMIT : STANDARD_MESSAGE_LIMIT;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Get conversation with messages and notes
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        title: true,
        type: true,
        metadata: true,
        summary: true,
        sentiment: true,
        keyPoints: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            notes: true,
            primaryEmail: true,
            primaryPhone: true,
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get total message count for context indicator
    const totalMessageCount = await prisma.message.count({
      where: { conversationId },
    });

    // Get messages for context (limited based on analysis mode)
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: 'desc' },
      take: messageLimit,
      select: {
        body: true,
        direction: true,
        sentAt: true,
        contact: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
          },
        },
      },
    });

    // Format messages for context
    const formattedMessages = messages
      .filter(m => m.body && m.body.trim().length > 0)
      .reverse() // Chronological order
      .map((m) => {
        const isOutgoing = m.direction === 'outbound';
        const sender = isOutgoing
          ? 'You'
          : (m.contact?.displayName ||
             [m.contact?.firstName, m.contact?.lastName].filter(Boolean).join(' ') ||
             'Contact');
        const date = new Date(m.sentAt).toLocaleString();
        return `[${date}] ${sender}: ${m.body}`;
      })
      .join('\n');

    // Extract notes from metadata
    const metadata = conversation.metadata as Record<string, unknown> | null;
    const conversationNotes = metadata?.notes as string | null;
    const contactNotes = conversation.contact?.notes;

    // Build context sections
    const contextSections: string[] = [];

    // Conversation info
    contextSections.push(`CONVERSATION: ${conversation.title || 'Unknown'} (${conversation.type})`);

    // Contact info if available
    if (conversation.contact) {
      const contact = conversation.contact;
      const contactName = contact.displayName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        'Unknown';
      contextSections.push(`CONTACT: ${contactName}`);
      if (contact.primaryEmail) contextSections.push(`Email: ${contact.primaryEmail}`);
      if (contact.primaryPhone) contextSections.push(`Phone: ${contact.primaryPhone}`);
    }

    // Notes context
    if (conversationNotes || contactNotes) {
      contextSections.push('\n--- BACKGROUND NOTES ---');
      if (conversationNotes) {
        contextSections.push(`Conversation Notes: ${conversationNotes}`);
      }
      if (contactNotes) {
        contextSections.push(`Contact Notes: ${contactNotes}`);
      }
    }

    // Existing AI summary if available
    if (conversation.summary) {
      contextSections.push('\n--- AI SUMMARY ---');
      contextSections.push(`Summary: ${conversation.summary}`);
      if (conversation.sentiment) {
        contextSections.push(`Sentiment: ${conversation.sentiment}`);
      }
      if (conversation.keyPoints && Array.isArray(conversation.keyPoints)) {
        contextSections.push(`Key Points: ${(conversation.keyPoints as string[]).join(', ')}`);
      }
    }

    // Message history
    contextSections.push('\n--- RECENT MESSAGES ---');
    contextSections.push(formattedMessages || 'No messages available');

    // Build the system prompt
    const systemPrompt = `You are an intelligent CRM assistant helping a user understand and manage their conversation with a contact. You have access to the full conversation history, background notes, and any existing AI analysis.

Your role is to:
1. Answer questions about the conversation accurately
2. Provide insights about the relationship and communication patterns
3. Help prepare for follow-ups or calls
4. Suggest appropriate responses when asked
5. Identify action items or important details

Be concise but thorough. When referencing specific messages, mention the sender and approximate time.

CONTEXT:
${contextSections.join('\n')}`;

    // Build messages array for Claude
    const claudeMessages: { role: 'user' | 'assistant'; content: string }[] = [];

    // Add chat history
    for (const msg of chatHistory.slice(-10)) { // Last 10 messages for context
      claudeMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current message
    claudeMessages.push({
      role: 'user',
      content: message,
    });

    // Call Claude Haiku for fast response
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    });

    // Extract response text
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Calculate actual messages used (after filtering empty ones)
    const messagesUsed = Math.min(messages.length, messageLimit);

    return NextResponse.json({
      success: true,
      data: {
        response: content.text,
        model: 'claude-3-5-haiku',
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        context: {
          messagesUsed,
          totalMessages: totalMessageCount,
          deepAnalysis,
        },
      },
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    return NextResponse.json(
      {
        error: 'Failed to process chat message',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
