import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import {
  AnalyticsBatch,
  EVENT_CATEGORIES,
  DashboardMetrics,
  DailyStats,
  TrendData,
  FeatureUsageData,
  FilterUsageData,
  RecentEvent,
  EventType,
  SessionMetrics,
  PageTimeMetrics,
  ActionsByPage,
  ErrorMetrics,
  CoreFeaturesMetrics,
} from './types';

// Log a batch of events to the database
export async function logEventBatch(batch: AnalyticsBatch): Promise<void> {
  const { sessionId, deviceType, events } = batch;

  if (!events || events.length === 0) return;

  // Prepare events for bulk insert
  const eventsToInsert: Prisma.AnalyticsEventCreateManyInput[] = events.map((event) => ({
    eventType: event.eventType,
    eventCategory: event.eventCategory || EVENT_CATEGORIES[event.eventType as EventType] || 'unknown',
    sessionId,
    conversationId: event.conversationId || undefined,
    contactId: event.contactId || undefined,
    tagId: event.tagId || undefined,
    properties: event.properties ? (event.properties as Prisma.InputJsonValue) : Prisma.JsonNull,
    deviceType,
    viewMode: event.viewMode || undefined,
    durationMs: event.durationMs || undefined,
  }));

  // Bulk insert events
  await prisma.analyticsEvent.createMany({
    data: eventsToInsert,
  });
}

// Log a single event (for server-side tracking)
export async function logEvent(
  eventType: string,
  options?: {
    eventCategory?: string;
    sessionId?: string;
    userId?: string;
    conversationId?: string;
    contactId?: string;
    tagId?: string;
    properties?: Record<string, unknown>;
    deviceType?: string;
    viewMode?: string;
    durationMs?: number;
  }
): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      eventType,
      eventCategory: options?.eventCategory || EVENT_CATEGORIES[eventType as EventType] || 'unknown',
      sessionId: options?.sessionId,
      userId: options?.userId,
      conversationId: options?.conversationId,
      contactId: options?.contactId,
      tagId: options?.tagId,
      properties: options?.properties ? (options.properties as Prisma.InputJsonValue) : Prisma.JsonNull,
      deviceType: options?.deviceType,
      viewMode: options?.viewMode,
      durationMs: options?.durationMs,
    },
  });
}

// Get dashboard metrics
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all stats in parallel
  const [
    todayStats,
    weekStats,
    monthStats,
    trends,
    featureUsage,
    filterUsage,
    recentEvents,
    sessions,
    pageTime,
    actionsByPage,
    errors,
    coreFeatures,
  ] = await Promise.all([
    getStatsForPeriod(today, now),
    getStatsForPeriod(weekAgo, now),
    getStatsForPeriod(monthAgo, now),
    getTrends(monthAgo, now),
    getFeatureUsage(weekAgo, now),
    getFilterUsage(weekAgo, now),
    getRecentEvents(50),
    getSessionMetrics(monthAgo, now),
    getPageTimeMetrics(monthAgo, now),
    getActionsByPage(monthAgo, now),
    getErrorMetrics(monthAgo, now),
    getCoreFeatureMetrics(monthAgo, now),
  ]);

  return {
    today: todayStats,
    week: weekStats,
    month: monthStats,
    trends,
    featureUsage,
    filterUsage,
    recentEvents,
    sessions,
    pageTime,
    actionsByPage,
    errors,
    coreFeatures,
  };
}

// Get stats for a specific period
async function getStatsForPeriod(startDate: Date, endDate: Date): Promise<DailyStats> {
  const counts = await prisma.analyticsEvent.groupBy({
    by: ['eventType'],
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: {
      id: true,
    },
  });

  const countMap = new Map(counts.map((c) => [c.eventType, c._count.id]));

  return {
    conversationsOpened: countMap.get('conversation_opened') || 0,
    messagesSent: countMap.get('message_sent') || 0,
    contactsViewed: countMap.get('contact_selected') || 0,
    searchesPerformed: countMap.get('search_performed') || 0,
    aiPromptsSubmitted: countMap.get('ai_prompt_submitted') || 0,
    tagsAssigned: countMap.get('tag_assigned') || 0,
    notesCreated: countMap.get('note_created') || 0,
    filtersApplied: (countMap.get('quick_filter_applied') || 0) + (countMap.get('contacts_filtered') || 0),
  };
}

// Get daily trends for charts
async function getTrends(startDate: Date, endDate: Date): Promise<TrendData[]> {
  // Get events grouped by day and type
  const events = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      eventType: {
        in: ['conversation_opened', 'message_sent', 'search_performed'],
      },
    },
    select: {
      eventType: true,
      timestamp: true,
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // Group by date
  const dateMap = new Map<string, TrendData>();

  // Initialize all dates in range (use local date to avoid timezone issues)
  const currentDate = new Date(startDate);
  const endDateLocal = new Date(endDate);
  // Make sure we include today
  endDateLocal.setHours(23, 59, 59, 999);
  while (currentDate <= endDateLocal) {
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    dateMap.set(dateStr, {
      date: dateStr,
      conversationsOpened: 0,
      messagesSent: 0,
      searchesPerformed: 0,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Count events per day
  events.forEach((event) => {
    const dateStr = event.timestamp.toISOString().split('T')[0];
    const data = dateMap.get(dateStr);
    if (data) {
      if (event.eventType === 'conversation_opened') data.conversationsOpened++;
      else if (event.eventType === 'message_sent') data.messagesSent++;
      else if (event.eventType === 'search_performed') data.searchesPerformed++;
    }
  });

  return Array.from(dateMap.values());
}

// Get feature usage breakdown
async function getFeatureUsage(startDate: Date, endDate: Date): Promise<FeatureUsageData[]> {
  const counts = await prisma.analyticsEvent.groupBy({
    by: ['eventType'],
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: 'desc',
      },
    },
    take: 10,
  });

  // Map event types to friendly names
  const featureNames: Record<string, string> = {
    conversation_opened: 'Conversations',
    message_sent: 'Messages Sent',
    contact_selected: 'Contacts Viewed',
    search_performed: 'Searches',
    ai_prompt_submitted: 'AI Prompts',
    tag_assigned: 'Tags Assigned',
    note_created: 'Notes Created',
    quick_filter_applied: 'Quick Filters',
    view_switched: 'View Switches',
    tags_filtered: 'Tag Filters',
  };

  return counts.map((c) => ({
    feature: featureNames[c.eventType] || c.eventType,
    count: c._count.id,
  }));
}

// Get quick filter usage breakdown
async function getFilterUsage(startDate: Date, endDate: Date): Promise<FilterUsageData[]> {
  const events = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
      eventType: 'quick_filter_applied',
    },
    select: {
      properties: true,
    },
  });

  // Count filter types
  const filterCounts = new Map<string, number>();
  events.forEach((event) => {
    const props = event.properties as { filterType?: string } | null;
    const filterType = props?.filterType || 'unknown';
    filterCounts.set(filterType, (filterCounts.get(filterType) || 0) + 1);
  });

  // Map filter types to friendly names
  const filterNames: Record<string, string> = {
    active7d: 'Active 7 days',
    active30d: 'Active 30 days',
    untagged: 'Untagged',
    highVolume: 'High Volume',
    needFollowUp: 'Need Follow-up',
    noReply: 'No Reply',
    newThisWeek: 'New This Week',
  };

  return Array.from(filterCounts.entries())
    .map(([filter, count]) => ({
      filter: filterNames[filter] || filter,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// Get recent events for activity feed
async function getRecentEvents(limit: number): Promise<RecentEvent[]> {
  const events = await prisma.analyticsEvent.findMany({
    orderBy: {
      timestamp: 'desc',
    },
    take: limit,
    select: {
      id: true,
      eventType: true,
      eventCategory: true,
      properties: true,
      timestamp: true,
    },
  });

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType as EventType,
    eventCategory: event.eventCategory as any,
    properties: (event.properties as Record<string, unknown>) || {},
    timestamp: event.timestamp.toISOString(),
  }));
}

// Aggregate daily metrics (call this periodically or via cron)
export async function aggregateDailyMetrics(date?: Date): Promise<void> {
  const targetDate = date || new Date();
  const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

  const stats = await getStatsForPeriod(startOfDay, endOfDay);

  // Get filter-specific counts
  const filterEvents = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: {
        gte: startOfDay,
        lte: endOfDay,
      },
      eventType: 'quick_filter_applied',
    },
    select: {
      properties: true,
    },
  });

  const filterCounts: Record<string, number> = {
    filterActive7d: 0,
    filterActive30d: 0,
    filterUntagged: 0,
    filterHighVolume: 0,
    filterNeedFollowUp: 0,
  };

  filterEvents.forEach((event) => {
    const props = event.properties as { filterType?: string } | null;
    const filterType = props?.filterType;
    if (filterType === 'active7d') filterCounts.filterActive7d++;
    else if (filterType === 'active30d') filterCounts.filterActive30d++;
    else if (filterType === 'untagged') filterCounts.filterUntagged++;
    else if (filterType === 'highVolume') filterCounts.filterHighVolume++;
    else if (filterType === 'needFollowUp') filterCounts.filterNeedFollowUp++;
  });

  // Upsert daily metrics
  await prisma.dailyMetrics.upsert({
    where: {
      date_userId: {
        date: startOfDay,
        userId: null as unknown as string, // For single user, userId is null
      },
    },
    create: {
      date: startOfDay,
      conversationsOpened: stats.conversationsOpened,
      messagesSent: stats.messagesSent,
      contactsViewed: stats.contactsViewed,
      searchesPerformed: stats.searchesPerformed,
      aiPromptsSubmitted: stats.aiPromptsSubmitted,
      tagsAssigned: stats.tagsAssigned,
      notesCreated: stats.notesCreated,
      filtersApplied: stats.filtersApplied,
      ...filterCounts,
    },
    update: {
      conversationsOpened: stats.conversationsOpened,
      messagesSent: stats.messagesSent,
      contactsViewed: stats.contactsViewed,
      searchesPerformed: stats.searchesPerformed,
      aiPromptsSubmitted: stats.aiPromptsSubmitted,
      tagsAssigned: stats.tagsAssigned,
      notesCreated: stats.notesCreated,
      filtersApplied: stats.filtersApplied,
      ...filterCounts,
    },
  });
}

// Get session metrics
async function getSessionMetrics(startDate: Date, endDate: Date): Promise<SessionMetrics> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get unique sessions
  const allSessions = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: { gte: startDate, lte: endDate },
      sessionId: { not: null },
    },
    select: {
      sessionId: true,
      timestamp: true,
    },
    distinct: ['sessionId'],
  });

  // Get session durations from session_ended events
  const sessionEndEvents = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: { gte: startDate, lte: endDate },
      eventType: 'session_ended',
    },
    select: {
      properties: true,
    },
  });

  let totalDurationMs = 0;
  sessionEndEvents.forEach((e) => {
    const props = e.properties as { durationMs?: number } | null;
    if (props?.durationMs) totalDurationMs += props.durationMs;
  });

  // Calculate session counts by period
  const todaySessions = allSessions.filter(
    (s) => s.timestamp >= today
  ).length;
  const weekSessions = allSessions.filter(
    (s) => s.timestamp >= weekAgo
  ).length;

  // Group sessions by day
  const sessionsByDay = new Map<string, number>();
  allSessions.forEach((s) => {
    const dateStr = s.timestamp.toISOString().split('T')[0];
    sessionsByDay.set(dateStr, (sessionsByDay.get(dateStr) || 0) + 1);
  });

  return {
    totalSessions: allSessions.length,
    avgSessionDurationMs: sessionEndEvents.length > 0
      ? Math.round(totalDurationMs / sessionEndEvents.length)
      : 0,
    totalDurationMs,
    sessionsToday: todaySessions,
    sessionsThisWeek: weekSessions,
    sessionsThisMonth: allSessions.length,
    sessionsByDay: Array.from(sessionsByDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Get page time metrics
async function getPageTimeMetrics(startDate: Date, endDate: Date): Promise<PageTimeMetrics> {
  const pageTimeEvents = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: { gte: startDate, lte: endDate },
      eventType: 'page_time_tracked',
    },
    select: {
      properties: true,
    },
  });

  let messagesPageMs = 0;
  let contactsPageMs = 0;

  pageTimeEvents.forEach((e) => {
    const props = e.properties as { page?: string; durationMs?: number } | null;
    if (props?.durationMs) {
      if (props.page === 'messages') messagesPageMs += props.durationMs;
      else if (props.page === 'contacts') contactsPageMs += props.durationMs;
    }
  });

  const totalMs = messagesPageMs + contactsPageMs;

  return {
    messagesPageMs,
    contactsPageMs,
    messagesPagePercent: totalMs > 0 ? Math.round((messagesPageMs / totalMs) * 100) : 0,
    contactsPagePercent: totalMs > 0 ? Math.round((contactsPageMs / totalMs) * 100) : 0,
  };
}

// Get actions by page
async function getActionsByPage(startDate: Date, endDate: Date): Promise<ActionsByPage> {
  // Define which events belong to which page
  const messagesEvents = [
    'conversation_opened',
    'conversation_marked_read',
    'conversation_marked_unread',
    'message_sent',
    'message_send_failed',
    'messages_loaded_more',
    'search_opened',
    'search_performed',
    'search_result_clicked',
    'ai_prompt_submitted',
    'ai_response_received',
    'ai_suggestion_clicked',
    'note_created',
    'note_edited',
    'note_deleted',
    'file_attached',
  ];

  const contactsEvents = [
    'contact_selected',
    'contacts_searched',
    'contacts_filtered',
    'contacts_exported',
    'contact_type_changed',
    'tag_assigned',
    'tag_removed',
    'tag_created',
    'tags_filtered',
    'bulk_tag_applied',
    'quick_filter_applied',
    'quick_filter_cleared',
  ];

  const actionDescriptions: Record<string, string> = {
    conversation_opened: 'Opened conversations',
    message_sent: 'Messages sent',
    message_send_failed: 'Failed message sends',
    search_performed: 'Searches performed',
    ai_prompt_submitted: 'AI prompts submitted',
    note_created: 'Notes created',
    contact_selected: 'Contacts viewed',
    contacts_exported: 'Contacts exported',
    tag_assigned: 'Tags assigned',
    tag_removed: 'Tags removed',
    quick_filter_applied: 'Quick filters used',
    tags_filtered: 'Tag filters applied',
  };

  // Get counts for messages page events
  const messagesPageCounts = await prisma.analyticsEvent.groupBy({
    by: ['eventType'],
    where: {
      timestamp: { gte: startDate, lte: endDate },
      eventType: { in: messagesEvents },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Get counts for contacts page events
  const contactsPageCounts = await prisma.analyticsEvent.groupBy({
    by: ['eventType'],
    where: {
      timestamp: { gte: startDate, lte: endDate },
      eventType: { in: contactsEvents },
    },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  return {
    messages: {
      totalActions: messagesPageCounts.reduce((sum, c) => sum + c._count.id, 0),
      topActions: messagesPageCounts.slice(0, 5).map((c) => ({
        action: c.eventType,
        count: c._count.id,
        description: actionDescriptions[c.eventType] || c.eventType,
      })),
    },
    contacts: {
      totalActions: contactsPageCounts.reduce((sum, c) => sum + c._count.id, 0),
      topActions: contactsPageCounts.slice(0, 5).map((c) => ({
        action: c.eventType,
        count: c._count.id,
        description: actionDescriptions[c.eventType] || c.eventType,
      })),
    },
  };
}

// Get error metrics
async function getErrorMetrics(startDate: Date, endDate: Date): Promise<ErrorMetrics> {
  // Get all error events
  const errorEvents = await prisma.analyticsEvent.findMany({
    where: {
      timestamp: { gte: startDate, lte: endDate },
      OR: [
        { eventType: 'message_send_failed' },
        { eventType: { contains: '_error' } },
        { eventType: { contains: '_failed' } },
      ],
    },
    select: {
      eventType: true,
      properties: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'desc' },
  });

  // Group by error type
  const errorsByType = new Map<string, { count: number; lastOccurred: Date; sample?: string }>();

  errorEvents.forEach((e) => {
    const existing = errorsByType.get(e.eventType);
    const props = e.properties as { error?: string } | null;

    if (existing) {
      existing.count++;
      if (e.timestamp > existing.lastOccurred) {
        existing.lastOccurred = e.timestamp;
        if (props?.error) existing.sample = props.error;
      }
    } else {
      errorsByType.set(e.eventType, {
        count: 1,
        lastOccurred: e.timestamp,
        sample: props?.error,
      });
    }
  });

  // Get error trend by day
  const errorTrendMap = new Map<string, number>();
  errorEvents.forEach((e) => {
    const dateStr = e.timestamp.toISOString().split('T')[0];
    errorTrendMap.set(dateStr, (errorTrendMap.get(dateStr) || 0) + 1);
  });

  return {
    totalErrors: errorEvents.length,
    errorsByType: Array.from(errorsByType.entries())
      .map(([errorType, data]) => ({
        errorType,
        count: data.count,
        lastOccurred: data.lastOccurred.toISOString(),
        sample: data.sample,
      }))
      .sort((a, b) => b.count - a.count),
    errorTrend: Array.from(errorTrendMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

// Get core features metrics (Tags, AI, Notes)
async function getCoreFeatureMetrics(startDate: Date, endDate: Date): Promise<CoreFeaturesMetrics> {
  // Tags metrics
  const [tagAssigned, tagRemoved, tagCreated, bulkTagApplied] = await Promise.all([
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'tag_assigned' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'tag_removed' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'tag_created' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'bulk_tag_applied' },
    }),
  ]);

  // Get most used tags
  const tagEvents = await prisma.analyticsEvent.findMany({
    where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'tag_assigned' },
    select: { properties: true },
  });

  const tagUsageMap = new Map<string, number>();
  tagEvents.forEach((e) => {
    const props = e.properties as { tagId?: string } | null;
    if (props?.tagId) {
      tagUsageMap.set(props.tagId, (tagUsageMap.get(props.tagId) || 0) + 1);
    }
  });

  // Tag trend by day
  const tagTrendEvents = await prisma.analyticsEvent.findMany({
    where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'tag_assigned' },
    select: { timestamp: true },
  });
  const tagTrendMap = new Map<string, number>();
  tagTrendEvents.forEach((e) => {
    const dateStr = e.timestamp.toISOString().split('T')[0];
    tagTrendMap.set(dateStr, (tagTrendMap.get(dateStr) || 0) + 1);
  });

  // AI metrics
  const [aiPrompts, aiResponses] = await Promise.all([
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'ai_prompt_submitted' },
    }),
    prisma.analyticsEvent.findMany({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'ai_response_received' },
      select: { properties: true, timestamp: true },
    }),
  ]);

  let successfulResponses = 0;
  let totalResponseTimeMs = 0;
  aiResponses.forEach((e) => {
    const props = e.properties as { success?: boolean; durationMs?: number } | null;
    if (props?.success) successfulResponses++;
    if (props?.durationMs) totalResponseTimeMs += props.durationMs;
  });

  // AI prompt trend by day
  const aiTrendMap = new Map<string, number>();
  const aiTrendEvents = await prisma.analyticsEvent.findMany({
    where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'ai_prompt_submitted' },
    select: { timestamp: true },
  });
  aiTrendEvents.forEach((e) => {
    const dateStr = e.timestamp.toISOString().split('T')[0];
    aiTrendMap.set(dateStr, (aiTrendMap.get(dateStr) || 0) + 1);
  });

  // Notes metrics
  const [notesCreated, notesEdited, notesDeleted, filesAttached] = await Promise.all([
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'note_created' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'note_edited' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'note_deleted' },
    }),
    prisma.analyticsEvent.count({
      where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'file_attached' },
    }),
  ]);

  // Notes trend by day
  const noteTrendEvents = await prisma.analyticsEvent.findMany({
    where: { timestamp: { gte: startDate, lte: endDate }, eventType: 'note_created' },
    select: { timestamp: true },
  });
  const noteTrendMap = new Map<string, number>();
  noteTrendEvents.forEach((e) => {
    const dateStr = e.timestamp.toISOString().split('T')[0];
    noteTrendMap.set(dateStr, (noteTrendMap.get(dateStr) || 0) + 1);
  });

  return {
    tags: {
      totalAssigned: tagAssigned,
      totalRemoved: tagRemoved,
      totalCreated: tagCreated,
      bulkTagOperations: bulkTagApplied,
      mostUsedTags: Array.from(tagUsageMap.entries())
        .map(([tagId, count]) => ({ tagId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
      tagTrend: Array.from(tagTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    ai: {
      totalPrompts: aiPrompts,
      totalResponses: aiResponses.length,
      successRate: aiResponses.length > 0
        ? Math.round((successfulResponses / aiResponses.length) * 100)
        : 0,
      avgResponseTimeMs: aiResponses.length > 0
        ? Math.round(totalResponseTimeMs / aiResponses.length)
        : 0,
      promptTrend: Array.from(aiTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
    notes: {
      totalCreated: notesCreated,
      totalEdited: notesEdited,
      totalDeleted: notesDeleted,
      filesAttached,
      noteTrend: Array.from(noteTrendMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    },
  };
}
