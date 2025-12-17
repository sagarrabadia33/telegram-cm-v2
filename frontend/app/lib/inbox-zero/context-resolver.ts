// Cross-Conversation Context Resolver
// Implements entity resolution and holistic context analysis across conversations
// Based on research from Amazon Science entity resolution and conversation intelligence platforms

import { prisma } from '@/app/lib/prisma';

export interface ContactContext {
  contactId: string;
  contactName: string;
  telegramUsername: string | null;
  telegramId: string;

  // All conversations involving this contact
  privateChats: ConversationContext[];
  groupsAsMember: ConversationContext[];

  // Cross-conversation signals
  hasRecentGroupActivity: boolean;
  lastGroupActivityAt: Date | null;
  lastPrivateChatAt: Date | null;

  // Resolution flags
  privateIssueResolvedInGroup: boolean;
  groupIssueResolvedInPrivate: boolean;

  // Open loops across all conversations
  openLoops: OpenLoop[];
  resolvedLoops: ResolvedLoop[];
}

export interface ConversationContext {
  conversationId: string;
  title: string;
  type: 'private' | 'group' | 'supergroup';
  lastMessageAt: Date;
  lastMessageDirection: 'inbound' | 'outbound';
  lastMessageBody: string | null;
  unreadCount: number;
}

export interface OpenLoop {
  type: 'request' | 'commitment' | 'question';
  content: string;
  conversationId: string;
  conversationTitle: string;
  askedAt: Date;
  askedBy: 'user' | 'them';
}

export interface ResolvedLoop {
  originalLoop: OpenLoop;
  resolvedIn: {
    conversationId: string;
    conversationTitle: string;
    resolvedAt: Date;
    resolutionMessage: string | null;
  };
}

// Patterns that indicate a request/commitment was addressed
const RESOLUTION_PATTERNS = [
  /\bdone\b/i,
  /\bfixed\b/i,
  /\bcompleted?\b/i,
  /\bresolved\b/i,
  /\bworking\b/i,
  /\bchecking\b/i,
  /\blooking into\b/i,
  /\bteam is\b/i,
  /\bstarting\b/i,
  /\bwe('ll| will)\b/i,
  /\bsending\b/i,
  /\bsent\b/i,
  /\bhere (is|are)\b/i,
  /\baccess.*(restored|granted)/i,
  /\bwelcome back\b/i, // User welcomed someone back = likely restored access
  /\brestore.*access\b/i,
  /\badded\b.*\bto\b/i, // Added to group
  /\bplease restore\b/i,
];

// Patterns that indicate an open request
const REQUEST_PATTERNS = [
  /please let me know when/i,
  /can you (please )?/i,
  /when will/i,
  /please (send|share|fix|update|check)/i,
  /waiting for/i,
  /need (you to|the)/i,
];

// Keywords for semantic matching - topic-based
const TOPIC_KEYWORDS: Record<string, string[]> = {
  access: ['access', 'restore', 'restored', 'login', 'credentials', 'blocked', 'unblock', 'permission'],
  telegram: ['tg', 'telegram', 'group', 'chat', 'channel', 'updates', 'stats'],
  payment: ['payment', 'card', 'stripe', 'invoice', 'subscription', 'renew', 'decline'],
  meeting: ['call', 'meet', 'meeting', 'schedule', 'calendar', 'zoom', 'google meet'],
  fix: ['fix', 'fixed', 'issue', 'bug', 'problem', 'error', 'broken', 'work'],
};

/**
 * Build comprehensive context for a contact across all their conversations
 */
export async function buildContactContext(contactId: string): Promise<ContactContext | null> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { sentAt: 'desc' },
            take: 15,
            select: {
              id: true,
              body: true,
              direction: true,
              sentAt: true,
            },
          },
        },
      },
    },
  });

  if (!contact) return null;

  const metadata = contact.metadata as { telegramId?: string; username?: string } | null;
  const telegramId = metadata?.telegramId || contact.primaryPhone?.replace('telegram_', '') || '';
  const telegramUsername = metadata?.username || null;

  const privateChats: ConversationContext[] = [];
  const groupsAsMember: ConversationContext[] = [];

  for (const conv of contact.conversations) {
    const lastMsg = conv.messages[0];
    const ctx: ConversationContext = {
      conversationId: conv.id,
      title: conv.title || 'Unknown',
      type: conv.type as 'private' | 'group' | 'supergroup',
      lastMessageAt: lastMsg?.sentAt || conv.lastMessageAt || new Date(0),
      lastMessageDirection: (lastMsg?.direction || 'inbound') as 'inbound' | 'outbound',
      lastMessageBody: lastMsg?.body || null,
      unreadCount: conv.unreadCount,
    };

    if (conv.type === 'private') {
      privateChats.push(ctx);
    } else {
      groupsAsMember.push(ctx);
    }
  }

  // Also find groups where this contact is mentioned (by username)
  // This is crucial for cross-conversation context resolution
  const mentionedGroupConversations: Array<{
    id: string;
    title: string | null;
    type: string;
    messages: Array<{ body: string | null; direction: string; sentAt: Date }>;
  }> = [];

  if (telegramUsername) {
    const groupsWithMentions = await prisma.conversation.findMany({
      where: {
        type: { in: ['group', 'supergroup'] },
        messages: {
          some: {
            body: { contains: `@${telegramUsername}`, mode: 'insensitive' },
            sentAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
          },
        },
      },
      include: {
        messages: {
          orderBy: { sentAt: 'desc' },
          take: 20, // More messages for better context
          select: {
            id: true,
            body: true,
            direction: true,
            sentAt: true,
          },
        },
      },
    });

    for (const conv of groupsWithMentions) {
      // Avoid duplicates
      if (!groupsAsMember.find(g => g.conversationId === conv.id)) {
        const lastMsg = conv.messages[0];
        groupsAsMember.push({
          conversationId: conv.id,
          title: conv.title || 'Unknown Group',
          type: conv.type as 'group' | 'supergroup',
          lastMessageAt: lastMsg?.sentAt || conv.lastMessageAt || new Date(0),
          lastMessageDirection: (lastMsg?.direction || 'inbound') as 'inbound' | 'outbound',
          lastMessageBody: lastMsg?.body || null,
          unreadCount: conv.unreadCount,
        });
      }
      // Add to the list for loop analysis
      mentionedGroupConversations.push({
        id: conv.id,
        title: conv.title,
        type: conv.type,
        messages: conv.messages,
      });
    }
  }

  // Combine contact's direct conversations with mentioned groups for loop analysis
  const allConversationsForAnalysis = [
    ...contact.conversations,
    ...mentionedGroupConversations.filter(
      mg => !contact.conversations.find(c => c.id === mg.id)
    ),
  ];

  // Analyze for cross-conversation resolution
  const { openLoops, resolvedLoops, privateIssueResolvedInGroup, groupIssueResolvedInPrivate } =
    await analyzeLoopsAcrossConversations(allConversationsForAnalysis, telegramUsername);

  const lastGroupActivityAt = groupsAsMember.length > 0
    ? new Date(Math.max(...groupsAsMember.map(g => g.lastMessageAt.getTime())))
    : null;

  const lastPrivateChatAt = privateChats.length > 0
    ? new Date(Math.max(...privateChats.map(p => p.lastMessageAt.getTime())))
    : null;

  return {
    contactId,
    contactName: contact.displayName || contact.firstName || 'Unknown',
    telegramUsername,
    telegramId,
    privateChats,
    groupsAsMember,
    hasRecentGroupActivity: groupsAsMember.some(
      g => g.lastMessageAt.getTime() > Date.now() - 24 * 60 * 60 * 1000
    ),
    lastGroupActivityAt,
    lastPrivateChatAt,
    privateIssueResolvedInGroup,
    groupIssueResolvedInPrivate,
    openLoops,
    resolvedLoops,
  };
}

/**
 * Analyze loops (requests/commitments) across all conversations
 */
async function analyzeLoopsAcrossConversations(
  conversations: Array<{
    id: string;
    title: string | null;
    type: string;
    messages: Array<{
      body: string | null;
      direction: string;
      sentAt: Date;
    }>;
  }>,
  telegramUsername: string | null
): Promise<{
  openLoops: OpenLoop[];
  resolvedLoops: ResolvedLoop[];
  privateIssueResolvedInGroup: boolean;
  groupIssueResolvedInPrivate: boolean;
}> {
  const openLoops: OpenLoop[] = [];
  const resolvedLoops: ResolvedLoop[] = [];
  let privateIssueResolvedInGroup = false;
  let groupIssueResolvedInPrivate = false;

  // Collect all requests from inbound messages (things they asked for)
  const inboundRequests: Array<{
    content: string;
    conversationId: string;
    conversationTitle: string;
    conversationType: string;
    askedAt: Date;
  }> = [];

  // Collect all resolutions from outbound messages (things user did)
  const outboundResolutions: Array<{
    content: string;
    conversationId: string;
    conversationTitle: string;
    conversationType: string;
    resolvedAt: Date;
  }> = [];

  for (const conv of conversations) {
    for (const msg of conv.messages) {
      if (!msg.body) continue;

      if (msg.direction === 'inbound') {
        // Check if it's a request
        for (const pattern of REQUEST_PATTERNS) {
          if (pattern.test(msg.body)) {
            inboundRequests.push({
              content: msg.body.slice(0, 200),
              conversationId: conv.id,
              conversationTitle: conv.title || 'Unknown',
              conversationType: conv.type,
              askedAt: msg.sentAt,
            });
            break;
          }
        }
      } else {
        // Check if it's a resolution
        for (const pattern of RESOLUTION_PATTERNS) {
          if (pattern.test(msg.body)) {
            outboundResolutions.push({
              content: msg.body.slice(0, 200),
              conversationId: conv.id,
              conversationTitle: conv.title || 'Unknown',
              conversationType: conv.type,
              resolvedAt: msg.sentAt,
            });
            break;
          }
        }
      }
    }
  }

  // Match requests to resolutions across conversations
  for (const request of inboundRequests) {
    // Look for a resolution that came AFTER this request
    const matchingResolution = outboundResolutions.find(
      res => res.resolvedAt > request.askedAt &&
             // Check for semantic similarity (simplified: keyword matching)
             hasSemanticOverlap(request.content, res.content)
    );

    if (matchingResolution) {
      resolvedLoops.push({
        originalLoop: {
          type: 'request',
          content: request.content,
          conversationId: request.conversationId,
          conversationTitle: request.conversationTitle,
          askedAt: request.askedAt,
          askedBy: 'them',
        },
        resolvedIn: {
          conversationId: matchingResolution.conversationId,
          conversationTitle: matchingResolution.conversationTitle,
          resolvedAt: matchingResolution.resolvedAt,
          resolutionMessage: matchingResolution.content,
        },
      });

      // Detect cross-conversation resolution
      if (request.conversationType === 'private' &&
          matchingResolution.conversationType !== 'private') {
        privateIssueResolvedInGroup = true;
      }
      if (request.conversationType !== 'private' &&
          matchingResolution.conversationType === 'private') {
        groupIssueResolvedInPrivate = true;
      }
    } else {
      // Still open
      openLoops.push({
        type: 'request',
        content: request.content,
        conversationId: request.conversationId,
        conversationTitle: request.conversationTitle,
        askedAt: request.askedAt,
        askedBy: 'them',
      });
    }
  }

  return {
    openLoops,
    resolvedLoops,
    privateIssueResolvedInGroup,
    groupIssueResolvedInPrivate,
  };
}

/**
 * Check if two messages have semantic overlap using topic-based matching
 */
function hasSemanticOverlap(text1: string, text2: string): boolean {
  const text1Lower = text1.toLowerCase();
  const text2Lower = text2.toLowerCase();

  // First check: Direct keyword overlap
  const keywords1 = extractKeywords(text1);
  const keywords2 = extractKeywords(text2);

  let matchCount = 0;
  for (const kw of keywords1) {
    if (keywords2.includes(kw)) matchCount++;
  }
  if (matchCount >= 1) return true;

  // Second check: Topic-based matching
  // If both messages are about the same topic, they're related
  for (const [_topic, topicKeywords] of Object.entries(TOPIC_KEYWORDS)) {
    const text1HasTopic = topicKeywords.some(kw => text1Lower.includes(kw));
    const text2HasTopic = topicKeywords.some(kw => text2Lower.includes(kw));
    if (text1HasTopic && text2HasTopic) return true;
  }

  return false;
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'to', 'of', 'in', 'for', 'on', 'with',
    'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if',
    'or', 'because', 'until', 'while', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it',
    'its', 'we', 'us', 'our', 'they', 'them', 'their', 'what', 'which', 'who',
    'please', 'thanks', 'thank', 'ok', 'okay', 'yes', 'no', 'hey', 'hi', 'hello',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Get holistic context for a conversation by looking at all related conversations
 */
export async function getHolisticConversationContext(conversationId: string): Promise<{
  primaryConversation: ConversationContext;
  relatedConversations: ConversationContext[];
  contactContext: ContactContext | null;
  crossConversationSignals: {
    issueLikelyResolvedElsewhere: boolean;
    relatedGroupActivity: string | null;
    recommendation: 'respond' | 'clear' | 'review';
    reason: string;
  };
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      messages: {
        orderBy: { sentAt: 'desc' },
        take: 15,
        select: {
          id: true,
          body: true,
          direction: true,
          sentAt: true,
        },
      },
    },
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const lastMsg = conversation.messages[0];
  const primaryConversation: ConversationContext = {
    conversationId: conversation.id,
    title: conversation.title || 'Unknown',
    type: conversation.type as 'private' | 'group' | 'supergroup',
    lastMessageAt: lastMsg?.sentAt || conversation.lastMessageAt || new Date(0),
    lastMessageDirection: (lastMsg?.direction || 'inbound') as 'inbound' | 'outbound',
    lastMessageBody: lastMsg?.body || null,
    unreadCount: conversation.unreadCount,
  };

  // Build contact context if this is a private chat
  let contactContext: ContactContext | null = null;
  let relatedConversations: ConversationContext[] = [];
  let crossConversationSignals = {
    issueLikelyResolvedElsewhere: false,
    relatedGroupActivity: null as string | null,
    recommendation: 'respond' as 'respond' | 'clear' | 'review',
    reason: 'No cross-conversation context available',
  };

  if (conversation.contactId) {
    contactContext = await buildContactContext(conversation.contactId);

    if (contactContext) {
      // Get all related conversations
      relatedConversations = [
        ...contactContext.privateChats.filter(c => c.conversationId !== conversationId),
        ...contactContext.groupsAsMember.filter(c => c.conversationId !== conversationId),
      ];

      // Analyze cross-conversation signals
      if (conversation.type === 'private' && contactContext.privateIssueResolvedInGroup) {
        crossConversationSignals.issueLikelyResolvedElsewhere = true;

        // Find the group where it was resolved
        const recentGroup = contactContext.groupsAsMember
          .filter(g => g.lastMessageAt > primaryConversation.lastMessageAt)
          .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())[0];

        if (recentGroup) {
          crossConversationSignals.relatedGroupActivity =
            `Addressed in group "${recentGroup.title}" at ${recentGroup.lastMessageAt.toISOString()}`;
          crossConversationSignals.recommendation = 'clear';
          crossConversationSignals.reason =
            `Issue from private chat appears to be addressed in group "${recentGroup.title}"`;
        }
      }

      // Check if there are open loops that need response
      const unaddressedLoops = contactContext.openLoops.filter(
        loop => loop.conversationId === conversationId && loop.askedBy === 'them'
      );

      if (unaddressedLoops.length > 0 && !crossConversationSignals.issueLikelyResolvedElsewhere) {
        crossConversationSignals.recommendation = 'respond';
        crossConversationSignals.reason =
          `${unaddressedLoops.length} open request(s) from contact need attention`;
      } else if (crossConversationSignals.issueLikelyResolvedElsewhere) {
        crossConversationSignals.recommendation = 'clear';
      } else if (contactContext.hasRecentGroupActivity && conversation.type === 'private') {
        // Recent group activity might indicate context
        crossConversationSignals.recommendation = 'review';
        crossConversationSignals.reason =
          'Recent activity in related group - review for context';
      }
    }
  }

  return {
    primaryConversation,
    relatedConversations,
    contactContext,
    crossConversationSignals,
  };
}
