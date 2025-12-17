import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/contacts
 *
 * Returns contacts (conversations) with enriched stats for the Contacts page.
 * Supports:
 * - filtering by type: all, private (people), group, supergroup, channel
 * - filtering by tag: tagId parameter for server-side tag filtering
 * - pagination: limit (default 50), cursor (for infinite scroll)
 * - search: server-side search on name, username, phone
 * - quickFilter: server-side smart filters (active7d, active30d, untagged, highVolume, newThisWeek, needFollowUp)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get('type') || 'all';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const cursor = searchParams.get('cursor');
    const search = searchParams.get('search')?.toLowerCase().trim();
    const quickFilter = searchParams.get('quickFilter'); // Server-side quick filter
    const tagIdsParam = searchParams.get('tagIds'); // Tag filter for Stripe-style filter bar (multi-select)
    const tagIds = tagIdsParam ? tagIdsParam.split(',').filter(Boolean) : [];

    // Build type filter
    const typeWhere = typeFilter === 'all'
      ? { type: { in: ['private', 'group', 'supergroup', 'channel'] } }
      : typeFilter === 'people'
        ? { type: 'private' }
        : { type: typeFilter };

    // Build search filter for server-side search
    const searchWhere = search ? {
      OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { contact: { firstName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { lastName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { displayName: { contains: search, mode: 'insensitive' as const } } },
        { contact: { primaryPhone: { contains: search } } },
        { telegramChat: { username: { contains: search, mode: 'insensitive' as const } } },
      ],
    } : {};

    // Build tag filter for Stripe-style filter bar (multi-select with OR logic)
    const tagWhere = tagIds.length > 0 ? {
      tags: {
        some: {
          tagId: { in: tagIds },
        },
      },
    } : {};

    // Calculate date cutoffs for quick filters
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Build quick filter where clause (server-side filtering)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let quickFilterWhere: any = {};
    let needsMessageCount = false; // For highVolume filter
    let needsFollowUpFilter = false; // For needFollowUp filter

    if (quickFilter) {
      switch (quickFilter) {
        case 'active7d':
          quickFilterWhere = {
            lastMessageAt: { gte: sevenDaysAgo },
            messages: { some: {} }, // has at least one message
          };
          break;
        case 'active30d':
          quickFilterWhere = {
            lastMessageAt: { gte: thirtyDaysAgo },
            messages: { some: {} },
          };
          break;
        case 'untagged':
          quickFilterWhere = {
            tags: { none: {} },
          };
          break;
        case 'highVolume':
          // Special handling - need to filter after fetching
          needsMessageCount = true;
          break;
        case 'newThisWeek':
          quickFilterWhere = {
            createdAt: { gte: sevenDaysAgo },
          };
          break;
        case 'needFollowUp':
          // Complex filter - handled post-fetch
          needsFollowUpFilter = true;
          quickFilterWhere = {
            lastMessageAt: { lte: sevenDaysAgo }, // No activity in 7+ days
            messages: { some: {} }, // Has messages
          };
          break;
        case 'noReply':
          // They sent messages but we haven't replied - handled post-fetch
          quickFilterWhere = {
            messages: { some: {} },
          };
          break;
      }
    }

    // Filter-aware base where for accurate counts (respect tag/search/quick filters)
    const filteredBaseWhere = {
      isSyncDisabled: false,
      ...searchWhere,
      ...tagWhere,
      ...quickFilterWhere,
    };

    // UNFILTERED total count for "All" box in filter bar (should always show total contacts)
    const unfilteredTotalPromise = prisma.conversation.count({
      where: {
        isSyncDisabled: false,
        type: { in: ['private', 'group', 'supergroup', 'channel'] },
      },
    });

    // Counts reflecting current filters (except type filter) so dropdown numbers match the filtered set
    const globalTotalPromise = prisma.conversation.count({
      where: {
        ...filteredBaseWhere,
        type: { in: ['private', 'group', 'supergroup', 'channel'] },
      },
    });

    const countsPromise = Promise.all([
      prisma.conversation.count({ where: { ...filteredBaseWhere, type: { in: ['private', 'group', 'supergroup', 'channel'] } } }),
      prisma.conversation.count({ where: { ...filteredBaseWhere, type: 'private' } }),
      prisma.conversation.count({ where: { ...filteredBaseWhere, type: { in: ['group', 'supergroup'] } } }),
      prisma.conversation.count({ where: { ...filteredBaseWhere, type: 'channel' } }),
    ]);

    // DYNAMIC SMART FILTER COUNTS: Calculate quick filter counts from the TOTAL database
    // These are accurate counts for all contacts, not just the current page
    const quickFilterCountsPromise = Promise.all([
      // Active in 7 days (has messages + lastMessageAt within 7 days)
      prisma.conversation.count({
        where: {
          isSyncDisabled: false,
          type: { in: ['private', 'group', 'supergroup', 'channel'] },
          lastMessageAt: { gte: sevenDaysAgo },
          messages: { some: {} }, // has at least one message
        },
      }),
      // Active in 30 days
      prisma.conversation.count({
        where: {
          isSyncDisabled: false,
          type: { in: ['private', 'group', 'supergroup', 'channel'] },
          lastMessageAt: { gte: thirtyDaysAgo },
          messages: { some: {} },
        },
      }),
      // Untagged (no tags assigned)
      prisma.conversation.count({
        where: {
          isSyncDisabled: false,
          type: { in: ['private', 'group', 'supergroup', 'channel'] },
          tags: { none: {} },
        },
      }),
      // High volume (50+ messages) - use having in a subquery approach
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Conversation" c
        WHERE c."isSyncDisabled" = false
        AND c.type IN ('private', 'group', 'supergroup', 'channel')
        AND (SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = c.id) >= 50
      `,
      // New this week (created in last 7 days)
      prisma.conversation.count({
        where: {
          isSyncDisabled: false,
          type: { in: ['private', 'group', 'supergroup', 'channel'] },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      // Need follow-up: inactive for 7+ days, has messages, received more than sent
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM "Conversation" c
        WHERE c."isSyncDisabled" = false
        AND c.type IN ('private', 'group', 'supergroup', 'channel')
        AND c."lastMessageAt" <= ${sevenDaysAgo}
        AND (SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = c.id) > 0
        AND (SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = c.id AND m.direction = 'inbound') >
            (SELECT COUNT(*) FROM "Message" m WHERE m."conversationId" = c.id AND m.direction = 'outbound')
      `,
    ]);

    // Fetch conversations with all needed data (including quickFilter and tag filter)
    const conversations = await prisma.conversation.findMany({
      where: {
        isSyncDisabled: false,
        ...typeWhere,
        ...searchWhere,
        ...tagWhere,
        ...quickFilterWhere,
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1, // Fetch one extra to check if there are more
      select: {
        id: true,
        externalChatId: true,
        title: true,
        type: true,
        avatarUrl: true,
        createdAt: true,
        lastMessageAt: true,
        lastSyncedAt: true,
        metadata: true,
        // AI Conversation Intelligence fields
        aiStatus: true,
        aiStatusReason: true,
        aiStatusUpdatedAt: true,
        aiSummary: true,
        aiSummaryUpdatedAt: true,
        aiChurnRisk: true,
        aiChurnSignals: true,
        aiSuggestedAction: true,
        aiAction: true, // AI's raw action recommendation
        aiAnalyzing: true,
        aiLastAnalyzedMsgId: true,
        lastSyncedMessageId: true,
        // Manual status override and AI recommendation
        manualStatus: true,
        manualStatusSetAt: true,
        aiStatusRecommendation: true,
        aiStatusRecommendationReason: true,
        // World-class intelligence fields
        aiHealthScore: true,
        aiHealthFactors: true,
        aiLifecycleStage: true,
        aiUrgencyLevel: true,
        aiSentiment: true,
        aiSentimentTrajectory: true,
        aiFrustrationSignals: true,
        aiCriticalInsights: true,
        // Tag priority transparency
        aiAnalyzedTagId: true,
        aiAnalyzedTagName: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            displayName: true,
            primaryPhone: true,
            primaryEmail: true,
            avatarUrl: true,
            notes: true,
            isOnline: true,
            lastSeenAt: true,
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
                id: true,
                name: true,
                color: true,
                aiEnabled: true, // Include AI enabled status for tag
              },
            },
          },
        },
        _count: {
          select: {
            messages: true,
            members: true, // For groups - member count from GroupMember table
          },
        },
      },
      orderBy: {
        lastMessageAt: 'desc',
      },
    });

    // Determine if there are more results
    const hasMore = conversations.length > limit;
    const paginatedConversations = hasMore ? conversations.slice(0, limit) : conversations;
    const nextCursor = hasMore ? paginatedConversations[paginatedConversations.length - 1]?.id : null;

    // Get message stats per conversation (inbound/outbound counts) - only for returned conversations
    const conversationIds = paginatedConversations.map(c => c.id);
    const messageStats = await prisma.message.groupBy({
      by: ['conversationId', 'direction'],
      where: {
        conversationId: { in: conversationIds },
      },
      _count: true,
    });

    // Create a map for quick lookup
    const statsMap = new Map<string, { inbound: number; outbound: number }>();
    messageStats.forEach(stat => {
      const existing = statsMap.get(stat.conversationId) || { inbound: 0, outbound: 0 };
      if (stat.direction === 'inbound') {
        existing.inbound = stat._count;
      } else {
        existing.outbound = stat._count;
      }
      statsMap.set(stat.conversationId, existing);
    });

    // Wait for counts (run in parallel with conversation fetch)
    const [unfilteredTotal, globalTotal, countResults, quickFilterResults] = await Promise.all([
      unfilteredTotalPromise,
      globalTotalPromise,
      countsPromise,
      quickFilterCountsPromise,
    ]);

    // Transform for the frontend
    const transformed = paginatedConversations.map((conv) => {
      const contact = conv.contact;
      const isGroup = conv.type === 'group' || conv.type === 'supergroup';
      const isChannel = conv.type === 'channel';

      // Get display name
      let displayName = conv.title || 'Unknown';
      if (conv.type === 'private' && contact) {
        displayName =
          contact.displayName ||
          [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
          conv.title ||
          'Unknown';
      }

      // Generate initials
      const initials = displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || '??';

      // Get avatar URL
      let avatarUrl = conv.avatarUrl || null;
      if (conv.type === 'private' && contact?.avatarUrl) {
        avatarUrl = contact.avatarUrl;
      }

      // Get message stats
      const msgStats = statsMap.get(conv.id) || { inbound: 0, outbound: 0 };

      // Extract tags
      const tags = conv.tags.map((ct) => ({
        id: ct.tag.id,
        name: ct.tag.name,
        color: ct.tag.color,
      }));

      // Get notes from contact or conversation metadata
      const notes = contact?.notes ||
        ((conv.metadata as Record<string, unknown>)?.notes as string) ||
        null;

      // Member count: prefer telegramChat.memberCount, fallback to _count.members
      const memberCount = conv.telegramChat?.memberCount || conv._count.members || null;

      return {
        id: conv.id,
        externalChatId: conv.externalChatId,
        name: displayName,
        initials,
        avatarUrl,
        type: conv.type,

        // Contact info (for private chats)
        phone: contact?.primaryPhone || null,
        email: contact?.primaryEmail || null,
        username: conv.telegramChat?.username || null,

        // Status
        isOnline: contact?.isOnline || false,
        lastSeenAt: contact?.lastSeenAt?.toISOString() || null,

        // Stats
        totalMessages: conv._count.messages,
        messagesReceived: msgStats.inbound,
        messagesSent: msgStats.outbound,
        memberCount: isGroup || isChannel ? memberCount : null,

        // Dates
        firstContactDate: conv.createdAt.toISOString(),
        lastInteraction: conv.lastMessageAt?.toISOString() || conv.createdAt.toISOString(),
        lastSyncedAt: conv.lastSyncedAt?.toISOString() || null,

        // Organization
        tags,
        notes,

        // For groups: whether we have member data
        hasMemberData: isGroup ? conv._count.members > 0 : false,

        // AI Conversation Intelligence
        aiStatus: conv.aiStatus || null,
        aiStatusReason: conv.aiStatusReason || null,
        aiStatusUpdatedAt: conv.aiStatusUpdatedAt?.toISOString() || null,
        aiSummary: conv.aiSummary || null,
        aiSummaryUpdatedAt: conv.aiSummaryUpdatedAt?.toISOString() || null,
        aiChurnRisk: conv.aiChurnRisk || null,
        aiChurnSignals: conv.aiChurnSignals || null,
        aiSuggestedAction: conv.aiSuggestedAction || null,
        aiAction: conv.aiAction || null, // AI's raw action recommendation
        // Check if any tag has AI enabled
        hasAiEnabled: conv.tags.some(ct => ct.tag.aiEnabled === true),
        // Analyzing state - true when AI is currently processing
        aiAnalyzing: conv.aiAnalyzing || false,
        // Has new messages that haven't been analyzed yet
        aiNeedsUpdate: conv.lastSyncedMessageId !== conv.aiLastAnalyzedMsgId,
        // Manual status override and AI recommendation
        manualStatus: conv.manualStatus || null,
        manualStatusSetAt: conv.manualStatusSetAt?.toISOString() || null,
        aiStatusRecommendation: conv.aiStatusRecommendation || null,
        aiStatusRecommendationReason: conv.aiStatusRecommendationReason || null,

        // WORLD-CLASS INTELLIGENCE FIELDS (pre-computed, 100% reliable)
        aiHealthScore: conv.aiHealthScore || null,
        aiHealthFactors: conv.aiHealthFactors as { responsiveness: number; sentiment: number; engagement: number; resolution: number } | null,
        aiLifecycleStage: conv.aiLifecycleStage || null,
        aiUrgencyLevel: conv.aiUrgencyLevel || null,
        aiSentiment: conv.aiSentiment || null,
        aiSentimentTrajectory: conv.aiSentimentTrajectory || null,
        aiFrustrationSignals: conv.aiFrustrationSignals as string[] | null,
        aiCriticalInsights: conv.aiCriticalInsights as string[] | null,
        // Tag priority transparency
        aiAnalyzedTagId: conv.aiAnalyzedTagId || null,
        aiAnalyzedTagName: conv.aiAnalyzedTagName || null,
      };
    });

    // Post-fetch filtering for complex filters (highVolume, noReply, needFollowUp)
    let finalTransformed = transformed;

    if (needsMessageCount && quickFilter === 'highVolume') {
      // Filter for contacts with 50+ messages
      finalTransformed = transformed.filter(c => c.totalMessages >= 50);
    }

    if (quickFilter === 'noReply') {
      // They sent messages (inbound > 0) but we haven't sent any (outbound = 0)
      finalTransformed = transformed.filter(c => c.messagesReceived > 0 && c.messagesSent === 0);
    }

    if (needsFollowUpFilter && quickFilter === 'needFollowUp') {
      // More received than sent AND no activity in 7+ days
      finalTransformed = transformed.filter(c => c.messagesReceived > c.messagesSent);
    }

    // Use pre-calculated counts for the filter tabs
    // All counts respect current filters (tag, search, quick filter) for accurate Type dropdown numbers
    // countResults[0] = filtered "all types", countResults[1-3] = filtered by type
    const counts = {
      all: countResults[0], // Filtered count - reflects tag/search/quick filter selection
      people: countResults[1],
      groups: countResults[2],
      channels: countResults[3],
    };

    // Unfiltered total for the main "All" box in the primary filter bar (always shows total contacts)
    const unfilteredCounts = {
      all: unfilteredTotal,
    };

    // DYNAMIC QUICK FILTER COUNTS - accurate totals from database
    const quickFilterCounts = {
      active7d: quickFilterResults[0],
      active30d: quickFilterResults[1],
      untagged: quickFilterResults[2],
      highVolume: Number(quickFilterResults[3][0]?.count || 0), // Convert bigint from raw query
      newThisWeek: quickFilterResults[4],
      needFollowUp: Number(quickFilterResults[5][0]?.count || 0), // Convert bigint from raw query
    };

    return NextResponse.json({
      contacts: finalTransformed,
      counts, // Filtered counts for Type dropdown
      unfilteredCounts, // Unfiltered total for main "All" box
      activeQuickFilter: quickFilter || null,
      activeTagIds: tagIds, // Current tag filter for Stripe-style bar (multi-select)
      quickFilterCounts, // New: accurate counts for smart filters
      pagination: {
        hasMore,
        nextCursor,
        total: globalTotal,
        returned: transformed.length,
      },
    });
  } catch (error) {
    console.error('Failed to fetch contacts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch contacts' },
      { status: 500 }
    );
  }
}
