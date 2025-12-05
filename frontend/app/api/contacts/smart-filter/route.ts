import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Filter criteria interface
interface FilterCriteria {
  lastActiveWithin: number | null;      // days - contacts active within X days
  lastActiveOutside: number | null;     // days - contacts NOT active in X days
  tags: string[] | null;                // tag names (empty array = untagged)
  type: ('private' | 'group' | 'supergroup' | 'channel')[] | null;
  messageCountMin: number | null;
  messageCountMax: number | null;
  hasPhone: boolean | null;
  hasUsername: boolean | null;
  memberCountMin: number | null;        // for groups/channels
  memberCountMax: number | null;
}

// AI prompt for parsing natural language queries
const SYSTEM_PROMPT = `You are a contact filter parser for a CRM system. Given a natural language query about contacts, return a JSON object with filter criteria.

Available filter fields:
- lastActiveWithin: number (days) - contacts active within X days
- lastActiveOutside: number (days) - contacts NOT active in X days
- tags: string[] - filter by tag names. Use empty array [] for untagged contacts
- type: array of 'private' | 'group' | 'supergroup' | 'channel' (use ['private'] for "people", ['group', 'supergroup'] for "groups")
- messageCountMin: number - minimum total messages
- messageCountMax: number - maximum total messages
- hasPhone: boolean - contact has phone number
- hasUsername: boolean - contact has username
- memberCountMin: number - minimum member count (for groups/channels)
- memberCountMax: number - maximum member count

Rules:
1. Only include fields that are explicitly mentioned or clearly implied in the query
2. Use null for fields not mentioned
3. "untagged" means tags: []
4. "people" or "person" means type: ['private']
5. "groups" means type: ['group', 'supergroup']
6. "channels" means type: ['channel']
7. "active" typically means lastActiveWithin
8. "inactive" or "dormant" typically means lastActiveOutside
9. "high volume" typically means messageCountMin: 50

Return ONLY valid JSON with the structure: { "interpretation": "human readable summary", "criteria": {...filter fields...} }`;

/**
 * POST /api/contacts/smart-filter
 * AI-powered natural language filter parsing for contacts
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body as { query: string };

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your_anthropic_api_key_here') {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY is not configured' },
        { status: 500 }
      );
    }

    // Get available tags for context
    const availableTags = await prisma.tag.findMany({
      select: { name: true },
    });
    const tagNames = availableTags.map(t => t.name);

    // Build the user prompt with context
    const userPrompt = `Available tags in the system: ${tagNames.length > 0 ? tagNames.join(', ') : 'none'}

User query: "${query}"

Parse this query and return the filter criteria as JSON.`;

    // Call Claude Haiku for fast parsing
    const response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract response text
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude API');
    }

    // Parse the JSON response
    let parsed: { interpretation: string; criteria: FilterCriteria };
    try {
      // Extract JSON from the response (handle potential markdown code blocks)
      let jsonStr = content.text.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error('Failed to parse AI response:', content.text);
      return NextResponse.json(
        { error: 'Failed to parse filter criteria' },
        { status: 500 }
      );
    }

    const criteria = parsed.criteria;

    // Now apply the filter criteria to get matching contacts
    const matchingContactIds = await applyFilterCriteria(criteria);

    return NextResponse.json({
      success: true,
      data: {
        interpretation: parsed.interpretation,
        filterCriteria: criteria,
        matchingContactIds,
        matchCount: matchingContactIds.length,
      },
    });
  } catch (error) {
    console.error('Error in smart filter:', error);
    return NextResponse.json(
      {
        error: 'Failed to process smart filter',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Apply filter criteria to get matching contact IDs
 */
async function applyFilterCriteria(criteria: FilterCriteria): Promise<string[]> {
  // Get all contacts with their data
  const conversations = await prisma.conversation.findMany({
    where: {
      isSyncDisabled: false,
    },
    include: {
      contact: {
        select: {
          primaryPhone: true,
        },
      },
      telegramChat: {
        select: {
          memberCount: true,
          username: true,
        },
      },
      tags: {
        include: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
      _count: {
        select: {
          messages: true,
          members: true,
        },
      },
    },
  });

  // Get message stats for each conversation
  const conversationIds = conversations.map(c => c.id);
  const messageStats = await prisma.message.groupBy({
    by: ['conversationId'],
    where: {
      conversationId: { in: conversationIds },
    },
    _count: true,
  });

  const messageCountMap = new Map<string, number>();
  messageStats.forEach(stat => {
    messageCountMap.set(stat.conversationId, stat._count);
  });

  const now = new Date();

  // Filter contacts based on criteria
  const matchingIds = conversations
    .filter(conv => {
      // Type filter
      if (criteria.type !== null && criteria.type.length > 0) {
        if (!criteria.type.includes(conv.type as 'private' | 'group' | 'supergroup' | 'channel')) {
          return false;
        }
      }

      // Last active within X days
      // Only count as "active" if they have actual message activity
      if (criteria.lastActiveWithin !== null) {
        const totalMessages = messageCountMap.get(conv.id) || conv._count.messages;
        if (totalMessages === 0) {
          // No messages = not active, regardless of createdAt
          return false;
        }
        const cutoffDate = new Date(now.getTime() - criteria.lastActiveWithin * 24 * 60 * 60 * 1000);
        const lastActive = conv.lastMessageAt || conv.createdAt;
        if (lastActive < cutoffDate) {
          return false;
        }
      }

      // Last active outside X days (inactive)
      if (criteria.lastActiveOutside !== null) {
        const totalMessages = messageCountMap.get(conv.id) || conv._count.messages;
        // If no messages, they're considered inactive
        if (totalMessages === 0) {
          // Let them pass the "inactive" filter
        } else {
          const cutoffDate = new Date(now.getTime() - criteria.lastActiveOutside * 24 * 60 * 60 * 1000);
          const lastActive = conv.lastMessageAt || conv.createdAt;
          if (lastActive >= cutoffDate) {
            return false;
          }
        }
      }

      // Tags filter
      if (criteria.tags !== null) {
        const contactTags = conv.tags.map(ct => ct.tag.name.toLowerCase());

        if (criteria.tags.length === 0) {
          // Empty array means untagged
          if (contactTags.length > 0) {
            return false;
          }
        } else {
          // Must have at least one of the specified tags
          const hasMatchingTag = criteria.tags.some(tag =>
            contactTags.includes(tag.toLowerCase())
          );
          if (!hasMatchingTag) {
            return false;
          }
        }
      }

      // Message count filters
      const totalMessages = messageCountMap.get(conv.id) || conv._count.messages;

      if (criteria.messageCountMin !== null && totalMessages < criteria.messageCountMin) {
        return false;
      }

      if (criteria.messageCountMax !== null && totalMessages > criteria.messageCountMax) {
        return false;
      }

      // Has phone filter
      if (criteria.hasPhone !== null) {
        const hasPhone = !!conv.contact?.primaryPhone;
        if (criteria.hasPhone !== hasPhone) {
          return false;
        }
      }

      // Has username filter
      if (criteria.hasUsername !== null) {
        const hasUsername = !!conv.telegramChat?.username;
        if (criteria.hasUsername !== hasUsername) {
          return false;
        }
      }

      // Member count filters (for groups/channels)
      const memberCount = conv.telegramChat?.memberCount || conv._count.members || 0;

      if (criteria.memberCountMin !== null && memberCount < criteria.memberCountMin) {
        return false;
      }

      if (criteria.memberCountMax !== null && memberCount > criteria.memberCountMax) {
        return false;
      }

      return true;
    })
    .map(conv => conv.id);

  return matchingIds;
}
