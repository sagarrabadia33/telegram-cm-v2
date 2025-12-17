// Analytics Event Types and Categories

export type EventCategory =
  | 'navigation'
  | 'messaging'
  | 'contacts'
  | 'search'
  | 'ai'
  | 'tags'
  | 'notes'
  | 'filters';

// All event types organized by category
export type NavigationEvent =
  | 'page_loaded'
  | 'view_switched'
  | 'panel_resized'
  | 'session_started'
  | 'session_ended'
  | 'page_time_tracked';

export type MessagingEvent =
  | 'conversation_opened'
  | 'conversation_marked_read'
  | 'conversation_marked_unread'
  | 'message_sent'
  | 'message_send_failed'
  | 'messages_loaded_more';

export type ContactEvent =
  | 'contact_selected'
  | 'contacts_searched'
  | 'contacts_filtered'
  | 'contacts_exported'
  | 'contact_type_changed';

export type SearchEvent =
  | 'search_opened'
  | 'search_performed'
  | 'search_result_clicked'
  | 'search_closed';

export type AIEvent =
  | 'ai_suggestion_clicked'
  | 'ai_prompt_submitted'
  | 'ai_response_received';

export type TagEvent =
  | 'tag_assigned'
  | 'tag_removed'
  | 'tag_created'
  | 'tags_filtered'
  | 'bulk_tag_applied';

export type NoteEvent =
  | 'note_created'
  | 'note_edited'
  | 'note_deleted'
  | 'file_attached';

export type FilterEvent =
  | 'quick_filter_applied'
  | 'quick_filter_cleared'
  | 'contact_tags_filtered'
  | 'contact_last_active_filtered';

export type EventType =
  | NavigationEvent
  | MessagingEvent
  | ContactEvent
  | SearchEvent
  | AIEvent
  | TagEvent
  | NoteEvent
  | FilterEvent;

// Event properties for each event type
export interface EventProperties {
  // Navigation
  page_loaded: { viewMode: string; loadTimeMs?: number };
  view_switched: { from: string; to: string };
  panel_resized: { panel: string; oldWidth: number; newWidth: number };
  session_started: { userAgent?: string };
  session_ended: { durationMs: number };
  page_time_tracked: { page: 'home' | 'messages' | 'contacts'; durationMs: number };

  // Messaging
  conversation_opened: {
    conversationId: string;
    type: string;
    hasUnread: boolean;
    source?: string;
  };
  conversation_marked_read: { conversationId: string };
  conversation_marked_unread: { conversationId: string };
  message_sent: {
    conversationId: string;
    hasAttachment: boolean;
    contentLength: number;
  };
  message_send_failed: { conversationId: string; error: string };
  messages_loaded_more: { conversationId: string; count: number };

  // Contacts
  contact_selected: { contactId: string; type: string };
  contacts_searched: { query: string; resultCount: number; durationMs?: number };
  contacts_filtered: { filterType: string; resultCount: number };
  contacts_exported: { count: number; format: string };
  contact_type_changed: { from: string; to: string };

  // Search
  search_opened: Record<string, never>;
  search_performed: { query: string; resultCount: number; durationMs?: number };
  search_result_clicked: { conversationId: string; position: number };
  search_closed: { hadResults: boolean };

  // AI
  ai_suggestion_clicked: { suggestionType: string };
  ai_prompt_submitted: { promptLength: number };
  ai_response_received: { durationMs: number; success: boolean };

  // Tags
  tag_assigned: {
    tagId: string;
    targetType: 'conversation' | 'contact';
    targetId: string;
    isNew?: boolean;
  };
  tag_removed: {
    tagId: string;
    targetType: 'conversation' | 'contact';
    targetId: string;
  };
  tag_created: { tagName: string };
  tags_filtered: { tagCount: number };
  bulk_tag_applied: { tagId: string; contactCount: number };

  // Notes
  note_created: { conversationId: string; noteType: string };
  note_edited: { noteId: string };
  note_deleted: { noteId: string };
  file_attached: { fileType: string; fileSizeBytes: number };

  // Filters
  quick_filter_applied: { filterType: string; resultCount: number };
  quick_filter_cleared: Record<string, never>;
  contact_tags_filtered: { tagCount: number };
  contact_last_active_filtered: { filters: string[] };
}

// Map event types to categories
export const EVENT_CATEGORIES: Record<EventType, EventCategory> = {
  // Navigation
  page_loaded: 'navigation',
  view_switched: 'navigation',
  panel_resized: 'navigation',
  session_started: 'navigation',
  session_ended: 'navigation',
  page_time_tracked: 'navigation',

  // Messaging
  conversation_opened: 'messaging',
  conversation_marked_read: 'messaging',
  conversation_marked_unread: 'messaging',
  message_sent: 'messaging',
  message_send_failed: 'messaging',
  messages_loaded_more: 'messaging',

  // Contacts
  contact_selected: 'contacts',
  contacts_searched: 'contacts',
  contacts_filtered: 'contacts',
  contacts_exported: 'contacts',
  contact_type_changed: 'contacts',

  // Search
  search_opened: 'search',
  search_performed: 'search',
  search_result_clicked: 'search',
  search_closed: 'search',

  // AI
  ai_suggestion_clicked: 'ai',
  ai_prompt_submitted: 'ai',
  ai_response_received: 'ai',

  // Tags
  tag_assigned: 'tags',
  tag_removed: 'tags',
  tag_created: 'tags',
  tags_filtered: 'tags',
  bulk_tag_applied: 'tags',

  // Notes
  note_created: 'notes',
  note_edited: 'notes',
  note_deleted: 'notes',
  file_attached: 'notes',

  // Filters
  quick_filter_applied: 'filters',
  quick_filter_cleared: 'filters',
  contact_tags_filtered: 'filters',
  contact_last_active_filtered: 'filters',
};

// Analytics event payload sent to server
export interface AnalyticsEventPayload<T extends EventType = EventType> {
  eventType: T;
  eventCategory?: EventCategory;
  properties?: T extends keyof EventProperties ? EventProperties[T] : Record<string, unknown>;
  conversationId?: string;
  contactId?: string;
  tagId?: string;
  viewMode?: string;
  durationMs?: number;
}

// Batched events for efficient API calls
export interface AnalyticsBatch {
  sessionId: string;
  deviceType: string;
  events: AnalyticsEventPayload[];
}

// Dashboard data types
export interface DashboardMetrics {
  today: DailyStats;
  week: DailyStats;
  month: DailyStats;
  trends: TrendData[];
  featureUsage: FeatureUsageData[];
  filterUsage: FilterUsageData[];
  recentEvents: RecentEvent[];
  // Enhanced metrics
  sessions: SessionMetrics;
  pageTime: PageTimeMetrics;
  actionsByPage: ActionsByPage;
  errors: ErrorMetrics;
  coreFeatures: CoreFeaturesMetrics;
}

export interface DailyStats {
  conversationsOpened: number;
  messagesSent: number;
  contactsViewed: number;
  searchesPerformed: number;
  aiPromptsSubmitted: number;
  tagsAssigned: number;
  notesCreated: number;
  filtersApplied: number;
}

export interface TrendData {
  date: string;
  conversationsOpened: number;
  messagesSent: number;
  searchesPerformed: number;
}

export interface FeatureUsageData {
  feature: string;
  count: number;
}

export interface FilterUsageData {
  filter: string;
  count: number;
}

export interface RecentEvent {
  id: string;
  eventType: EventType;
  eventCategory: EventCategory;
  properties: Record<string, unknown>;
  timestamp: string;
}

// New enhanced metrics types

export interface SessionMetrics {
  totalSessions: number;
  avgSessionDurationMs: number;
  totalDurationMs: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  sessionsThisMonth: number;
  sessionsByDay: { date: string; count: number }[];
}

export interface PageTimeMetrics {
  messagesPageMs: number;
  contactsPageMs: number;
  messagesPagePercent: number;
  contactsPagePercent: number;
}

export interface ActionsByPage {
  messages: PageActions;
  contacts: PageActions;
}

export interface PageActions {
  totalActions: number;
  topActions: { action: string; count: number; description: string }[];
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByType: { errorType: string; count: number; lastOccurred: string; sample?: string }[];
  errorTrend: { date: string; count: number }[];
}

export interface CoreFeaturesMetrics {
  tags: {
    totalAssigned: number;
    totalRemoved: number;
    totalCreated: number;
    bulkTagOperations: number;
    mostUsedTags: { tagId: string; count: number }[];
    tagTrend: { date: string; count: number }[];
  };
  ai: {
    totalPrompts: number;
    totalResponses: number;
    successRate: number;
    avgResponseTimeMs: number;
    promptTrend: { date: string; count: number }[];
  };
  notes: {
    totalCreated: number;
    totalEdited: number;
    totalDeleted: number;
    filesAttached: number;
    noteTrend: { date: string; count: number }[];
  };
}

// AI Suggestions
export interface AISuggestion {
  id: string;
  type: 'feature' | 'fix' | 'improvement' | 'insight';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  basedOn: string; // What data this is based on
}
