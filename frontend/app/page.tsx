'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ConversationsList from './components/ConversationsList';
import ContactsTable, { Contact } from './components/ContactsTable';
import ContactSlidePanel from './components/ContactSlidePanel';
import ContactModal from './components/ContactModal';
import MessageView from './components/MessageView';
import AIAssistant from './components/AIAssistant';
import SearchModal from './components/SearchModal';
import AISettingsModal from './components/AISettingsModal';
import { PageSkeleton, MessagesListSkeleton } from './components/Skeleton';
import { Conversation, Message, MessagesResponse } from './types';
import { useSync, ConversationSyncResult, GlobalSyncResult } from './contexts/SyncContext';
import { useRealtimeUpdates } from './hooks/useRealtimeUpdates';
import { track, setViewMode as setAnalyticsViewMode } from './lib/analytics/client';

// QuickFilterType - used for server-side filtering in contacts view
type QuickFilterType = 'active7d' | 'active30d' | 'untagged' | 'highVolume' | 'newThisWeek' | 'needFollowUp' | 'noReply';

// ============================================
// Performance: Message Cache for instant switching
// ============================================
const messageCache = new Map<string, { messages: Message[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

function getCachedMessages(conversationId: string): Message[] | null {
  const cached = messageCache.get(conversationId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.messages;
  }
  return null;
}

function setCachedMessages(conversationId: string, messages: Message[]) {
  messageCache.set(conversationId, { messages, timestamp: Date.now() });
}

function updateCachedMessages(conversationId: string, updater: (msgs: Message[]) => Message[]) {
  const cached = messageCache.get(conversationId);
  if (cached) {
    cached.messages = updater(cached.messages);
    cached.timestamp = Date.now();
  }
}

interface Tag {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
  category?: string | null;
  conversationCount: number;
}

type ViewMode = 'messages' | 'contacts';

// Mobile panel states for responsive navigation
type MobilePanel = 'conversations' | 'messages' | 'assistant';

// Custom hook for responsive breakpoints
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}

export default function Home() {
  // View mode: messages or contacts (default to contacts for CRM-first experience)
  const [viewMode, setViewMode] = useState<ViewMode>('contacts');

  // Mobile-specific state
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('conversations');
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)');

  // All conversations (unfiltered) - single source of truth
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesLoadingMore, setMessagesLoadingMore] = useState(false);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [messagesNextCursor, setMessagesNextCursor] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Contacts state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactTypeFilter, setContactTypeFilter] = useState<'all' | 'people' | 'groups' | 'channels'>('all');
  const [contactCounts, setContactCounts] = useState({ all: 0, people: 0, groups: 0, channels: 0 });
  const [unfilteredContactCount, setUnfilteredContactCount] = useState<number | null>(null); // Total contacts for "All" box
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsLoadingMore, setContactsLoadingMore] = useState(false);
  const [contactsHasMore, setContactsHasMore] = useState(false);
  const [contactsNextCursor, setContactsNextCursor] = useState<string | null>(null);
  const [contactsSearch, setContactsSearch] = useState('');
  const [contactsSearching, setContactsSearching] = useState(false); // Subtle search indicator
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false); // New resizable modal for filtered contacts
  // Tag filtering for contacts (Stripe-style filter bar)
  const [contactTagFilters, setContactTagFilters] = useState<string[]>([]);
  // Last active filtering for contacts
  const [contactLastActiveFilters, setContactLastActiveFilters] = useState<('all' | 'today' | 'week' | 'month' | '3months' | 'older')[]>(['all']);
  // Server-side quick filter (active7d, active30d, untagged, etc.)
  const [activeQuickFilter, setActiveQuickFilter] = useState<QuickFilterType | null>(null);
  // DYNAMIC QUICK FILTER COUNTS - from server, always accurate
  const [quickFilterCounts, setQuickFilterCounts] = useState({
    active7d: 0,
    active30d: 0,
    untagged: 0,
    highVolume: 0,
    newThisWeek: 0,
    needFollowUp: 0,
  });

  // All tags with their counts
  const [allTags, setAllTags] = useState<Tag[]>([]);

  // Panel widths
  const [leftPanelWidth, setLeftPanelWidth] = useState(320);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);

  // Search modal state
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // AI Settings modal state
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  const [aiSettingsTagId, setAiSettingsTagId] = useState<string | null>(null);

  // Message to highlight/scroll to from search
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);

  // Sync context for real-time updates
  const { onSyncComplete } = useSync();

  // Special filter ID for untagged conversations
  const UNTAGGED_FILTER_ID = '__untagged__';

  // Client-side filtered conversations - instant filtering
  const filteredConversations = useMemo(() => {
    // Safety check: ensure allConversations is an array
    const conversations = Array.isArray(allConversations) ? allConversations : [];

    if (selectedTagIds.length === 0) {
      return conversations;
    }

    const hasUntaggedFilter = selectedTagIds.includes(UNTAGGED_FILTER_ID);
    const regularTagIds = selectedTagIds.filter(id => id !== UNTAGGED_FILTER_ID);

    return conversations.filter(conv => {
      // Check if conversation matches "untagged" filter
      const isUntagged = !conv.tags || conv.tags.length === 0;
      if (hasUntaggedFilter && isUntagged) {
        return true;
      }

      // Check if conversation matches any of the regular tag filters
      if (regularTagIds.length > 0 && conv.tags?.some(tag => regularTagIds.includes(tag.id))) {
        return true;
      }

      // If only untagged filter is active and this conv has tags, exclude it
      if (hasUntaggedFilter && regularTagIds.length === 0) {
        return isUntagged;
      }

      return false;
    });
  }, [allConversations, selectedTagIds]);

  // Compute tag counts from conversations - always up to date
  // Also includes a special "Untagged" option
  const tagsWithCounts = useMemo(() => {
    const countMap = new Map<string, number>();
    let untaggedCount = 0;

    // Safety check: ensure allConversations is an array
    const conversations = Array.isArray(allConversations) ? allConversations : [];

    // Count conversations for each tag and untagged
    conversations.forEach(conv => {
      if (!conv.tags || conv.tags.length === 0) {
        untaggedCount++;
      } else {
        conv.tags.forEach(tag => {
          countMap.set(tag.id, (countMap.get(tag.id) || 0) + 1);
        });
      }
    });

    // Create "Untagged" option first, then merge with allTags
    const untaggedOption: Tag = {
      id: UNTAGGED_FILTER_ID,
      name: 'Untagged',
      color: null,
      conversationCount: untaggedCount,
    };

    const regularTags = allTags.map(tag => ({
      ...tag,
      conversationCount: countMap.get(tag.id) || 0,
    }));

    return [untaggedOption, ...regularTags];
  }, [allTags, allConversations, UNTAGGED_FILTER_ID]);

  // Fetch all conversations - separate initial load vs refresh
  const fetchConversations = useCallback(async (isInitialLoad = false) => {
    try {
      const response = await fetch('/api/conversations');
      const data = await response.json();
      // Ensure we only set an array (API might return error object on failure)
      if (Array.isArray(data)) {
        setAllConversations(data);
      } else {
        console.error('Conversations API returned non-array:', data);
        // Keep existing data on error, or set empty array on initial load
        if (isInitialLoad) {
          setAllConversations([]);
        }
      }

      // Select the first conversation with messages by default (only on initial load)
      if (isInitialLoad && Array.isArray(data) && data.length > 0) {
        const firstWithMessages = data.find((c: Conversation) => c.totalMessages > 0);
        if (firstWithMessages) {
          setSelectedConversation(firstWithMessages);
        } else {
          setSelectedConversation(data[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch contacts for Contacts view (with pagination, search, and quick filter)
  // WORLD-CLASS UX: Never show skeleton/loading when we already have data displayed
  const fetchContacts = useCallback(async (options?: {
    cursor?: string;
    search?: string;
    append?: boolean;
    type?: string;
    quickFilter?: string | null; // Server-side quick filter
    tagIds?: string[]; // Server-side tag filter (Stripe-style)
    isInitialLoad?: boolean; // Only show skeleton on true initial load (no data yet)
    isSearch?: boolean; // Use subtle searching indicator instead of skeleton
    isFiltering?: boolean; // Show subtle filtering indicator
  }) => {
    const { cursor, search, append = false, type, quickFilter, tagIds, isInitialLoad = false, isSearch = false, isFiltering = false } = options || {};

    // SMOOTH UX: Only show loading skeleton on true initial load (when no contacts displayed)
    // For search/filter changes, keep showing existing data until new data arrives
    if (append) {
      setContactsLoadingMore(true);
    } else if (isInitialLoad) {
      // Only show full loading state when there's truly no data to display
      setContactsLoading(true);
    } else if (isSearch || isFiltering) {
      // Subtle search/filter indicator - just spinner, no skeleton flash
      setContactsSearching(true);
    }
    // For filter changes without search: no loading state at all

    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);
      if (type && type !== 'all') {
        // Map filter to API type
        const typeMap: Record<string, string> = {
          'people': 'people',
          'groups': 'group',
          'channels': 'channel',
        };
        params.set('type', typeMap[type] || type);
      }
      // Server-side quick filter (100x more accurate than client-side!)
      if (quickFilter) {
        params.set('quickFilter', quickFilter);
      }
      // Server-side tag filter (Stripe-style filter bar)
      if (tagIds && tagIds.length > 0) {
        params.set('tagIds', tagIds.join(','));
      }

      const response = await fetch(`/api/contacts?${params.toString()}`);
      const data = await response.json();

      if (data.contacts) {
        if (append) {
          // 100x RELIABLE: Append with deduplication to prevent React key errors
          // This handles edge cases where cursor-based pagination might overlap
          setContacts(prev => {
            const existingIds = new Set(prev.map(c => c.id));
            const newContacts = data.contacts.filter((c: Contact) => !existingIds.has(c.id));
            return [...prev, ...newContacts];
          });
        } else {
          // Replace contacts - smooth swap without flash
          setContacts(data.contacts);
          // Select first contact if none selected
          if (!selectedContact && data.contacts.length > 0) {
            setSelectedContact(data.contacts[0]);
          }
        }
        setContactCounts(data.counts);
        setContactsHasMore(data.pagination?.hasMore || false);
        setContactsNextCursor(data.pagination?.nextCursor || null);
        // Set unfiltered count for "All" box (only on first load, don't overwrite)
        if (data.unfilteredCounts?.all !== undefined) {
          setUnfilteredContactCount(data.unfilteredCounts.all);
        }
        // DYNAMIC: Update quick filter counts from server (always accurate)
        if (data.quickFilterCounts) {
          setQuickFilterCounts(data.quickFilterCounts);
        }
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setContactsLoading(false);
      setContactsLoadingMore(false);
      setContactsSearching(false);
    }
  }, [selectedContact]);

  // Load more contacts (infinite scroll)
  const loadMoreContacts = useCallback(() => {
    if (contactsLoadingMore || !contactsHasMore || !contactsNextCursor) return;
    fetchContacts({
      cursor: contactsNextCursor,
      search: contactsSearch,
      append: true,
      type: contactTypeFilter,
      quickFilter: activeQuickFilter,
      tagIds: contactTagFilters,
    });
  }, [contactsLoadingMore, contactsHasMore, contactsNextCursor, contactsSearch, contactTypeFilter, activeQuickFilter, contactTagFilters, fetchContacts]);

  // Handle contacts search (with debounce via effect)
  // SMOOTH UX: Don't clear contacts - just fetch and swap seamlessly
  const handleContactsSearch = useCallback((search: string) => {
    setContactsSearch(search);
    // Reset cursor for new search, but DON'T clear contacts (avoid skeleton flash)
    setContactsNextCursor(null);
    // Fetch with isSearch flag - shows subtle spinner in search box
    fetchContacts({ search, type: contactTypeFilter, quickFilter: activeQuickFilter, tagIds: contactTagFilters, isSearch: true });
  }, [contactTypeFilter, activeQuickFilter, contactTagFilters, fetchContacts]);

  // Handle quick filter changes (server-side filtering - 100x more accurate!)
  const handleQuickFilterChange = useCallback((filterType: QuickFilterType | null) => {
    setActiveQuickFilter(filterType);
    setContactsNextCursor(null);
    // Track quick filter usage
    if (filterType) {
      track('quick_filter_applied', { filterType, resultCount: 0 }); // Count updated after fetch
    } else {
      track('quick_filter_cleared', {});
    }
    // Fetch filtered contacts from server - shows accurate results!
    fetchContacts({ type: contactTypeFilter, quickFilter: filterType, search: contactsSearch, tagIds: contactTagFilters, isFiltering: true });
  }, [contactTypeFilter, contactsSearch, contactTagFilters, fetchContacts]);

  // Filter contacts by type
  const filteredContacts = useMemo(() => {
    if (contactTypeFilter === 'all') return contacts;
    if (contactTypeFilter === 'people') return contacts.filter(c => c.type === 'private');
    if (contactTypeFilter === 'groups') return contacts.filter(c => c.type === 'group' || c.type === 'supergroup');
    if (contactTypeFilter === 'channels') return contacts.filter(c => c.type === 'channel');
    return contacts;
  }, [contacts, contactTypeFilter]);

  // Fetch all tags (once)
  const fetchTags = useCallback(async () => {
    try {
      const response = await fetch('/api/tags');
      const data = await response.json();
      if (data.success) {
        setAllTags(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchConversations(true); // Initial load - select first conversation
    fetchTags();
    // Track page load
    track('page_loaded', { viewMode: 'messages', loadTimeMs: performance.now() });
    setAnalyticsViewMode('messages');
  }, [fetchConversations, fetchTags]);

  // Fetch contacts when switching to contacts view (initial load)
  useEffect(() => {
    if (viewMode === 'contacts' && contacts.length === 0) {
      // TRUE initial load - show skeleton
      fetchContacts({ type: contactTypeFilter, isInitialLoad: true });
    }
  }, [viewMode, contacts.length, contactTypeFilter, fetchContacts]);

  // Track previous type filter to detect changes
  const prevContactTypeFilterRef = useRef(contactTypeFilter);

  // Refetch contacts when type filter changes (reset pagination)
  // SMOOTH UX: Don't clear contacts - swap seamlessly
  useEffect(() => {
    // Only run when filter actually changes (not on initial mount)
    if (prevContactTypeFilterRef.current !== contactTypeFilter) {
      prevContactTypeFilterRef.current = contactTypeFilter;

      if (viewMode === 'contacts') {
        // Reset search and quick filter when changing type filter
        setContactsSearch('');
        setActiveQuickFilter(null);
        // DON'T clear contacts - avoid skeleton flash
        setContactsNextCursor(null);
        // Fetch will replace contacts when results arrive
        fetchContacts({ type: contactTypeFilter });
      }
    }
  }, [contactTypeFilter, viewMode, fetchContacts]);

  const handleTagFilterChange = (tagIds: string[]) => {
    setSelectedTagIds(tagIds);
    // Track tag filter change
    if (tagIds.length > 0) {
      track('tags_filtered', { tagCount: tagIds.length });
    }
  };

  // Handle contact tag filter changes (Stripe-style filter bar)
  const handleContactTagFilterChange = useCallback((tagIds: string[]) => {
    setContactTagFilters(tagIds);
    setContactsNextCursor(null);
    // Track tag filter change
    if (tagIds.length > 0) {
      track('contact_tags_filtered', { tagCount: tagIds.length });
    }
    // Fetch with server-side tag filter
    fetchContacts({
      type: contactTypeFilter,
      quickFilter: activeQuickFilter,
      search: contactsSearch,
      tagIds,
      isFiltering: true
    });
  }, [contactTypeFilter, activeQuickFilter, contactsSearch, fetchContacts]);

  // Handle last active filter changes
  const handleLastActiveFiltersChange = useCallback((filters: ('all' | 'today' | 'week' | 'month' | '3months' | 'older')[]) => {
    setContactLastActiveFilters(filters);
    // Last active filtering is done client-side in ContactsTable, no need to refetch
    // Just track the change
    track('contact_last_active_filtered', { filters });
  }, []);

  // Handle view mode switch with analytics tracking
  const handleViewModeSwitch = useCallback((newMode: ViewMode) => {
    if (newMode !== viewMode) {
      track('view_switched', { from: viewMode, to: newMode });
      setAnalyticsViewMode(newMode);
    }
    setViewMode(newMode);
  }, [viewMode]);

  // Global keyboard shortcut for search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for refresh-contacts event from ContactModal (after AI refresh)
  useEffect(() => {
    const handleRefreshContacts = () => {
      console.log('[Refresh] Contacts refresh triggered by AI analysis');
      fetchContacts();
    };

    window.addEventListener('refresh-contacts', handleRefreshContacts);
    return () => window.removeEventListener('refresh-contacts', handleRefreshContacts);
  }, [fetchContacts]);

  // Handle search result selection - navigate to conversation and scroll to message
  const handleSearchSelectConversation = useCallback(
    (conversationId: string, messageId?: string) => {
      // Switch to messages view if not already
      handleViewModeSwitch('messages');

      // Track search result click
      track('search_result_clicked', { conversationId, position: 0 }, { conversationId });

      // Set the message to highlight/scroll to
      if (messageId) {
        setHighlightMessageId(messageId);
        // Clear highlight after 3 seconds
        setTimeout(() => setHighlightMessageId(null), 3000);
      }

      // Mark conversation as read (fire and forget)
      fetch(`/api/conversations/${conversationId}/mark-as-read`, {
        method: 'POST',
      }).catch(console.error);

      // Find the conversation in the list
      const conversation = allConversations.find((c) => c.id === conversationId);
      if (conversation) {
        // Optimistic UI update for unread
        if (conversation.unread > 0) {
          setAllConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, unread: 0 } : c
            )
          );
        }
        setSelectedConversation({ ...conversation, unread: 0 });
      } else {
        // Fetch fresh if not in current list (might be filtered out by tags)
        fetch(`/api/conversations/${conversationId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data && data.id) {
              setSelectedConversation({ ...data, unread: 0 });
              // Also add to conversations list if not present
              setAllConversations((prev) => {
                if (!prev.find((c) => c.id === data.id)) {
                  return [{ ...data, unread: 0 }, ...prev];
                }
                return prev;
              });
            }
          })
          .catch(console.error);
      }
    },
    [allConversations]
  );

  // Fetch messages with caching for instant conversation switching
  // 100x RELIABLE: Preserves optimistic messages during refresh to prevent flickering
  const fetchMessages = useCallback(async (conversationId: string, showLoading = true) => {
    // Helper: Merge fresh messages with optimistic ones (temp-* or status: sending/sent without server ID)
    const mergeWithOptimistic = (fresh: Message[], current: Message[]): Message[] => {
      // Find optimistic messages (temp IDs or sending status)
      const optimistic = current.filter(m =>
        m.id.startsWith('temp-') || m.status === 'sending'
      );

      if (optimistic.length === 0) {
        return fresh;
      }

      // Merge: fresh messages + optimistic ones not yet in fresh
      const freshIds = new Set(fresh.map(m => m.id));
      const uniqueOptimistic = optimistic.filter(m => !freshIds.has(m.id));

      // Return fresh + optimistic at the end (they're newest)
      return [...fresh, ...uniqueOptimistic];
    };

    // Check cache first for instant display
    const cachedMessages = getCachedMessages(conversationId);
    if (cachedMessages) {
      // Instantly show cached messages (no loading state!)
      setMessages(cachedMessages);
      // Reset pagination - will be updated from API
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
      // Refresh in background for freshness
      fetch(`/api/conversations/${conversationId}/messages`)
        .then(res => res.json())
        .then((data: MessagesResponse) => {
          const freshMessages = data.messages || [];
          // 100x RELIABLE: Merge with current state to preserve optimistic messages
          setMessages(current => {
            const merged = mergeWithOptimistic(freshMessages, current);
            setCachedMessages(conversationId, merged);
            return merged;
          });
          // Update pagination info
          setMessagesHasMore(data.hasMore);
          setMessagesNextCursor(data.nextCursor);
        })
        .catch(console.error);
      return;
    }

    // No cache - show loading and fetch
    if (showLoading) {
      setMessagesLoading(true);
    }
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      const data: MessagesResponse = await response.json();
      const msgs = data.messages || [];
      // 100x RELIABLE: Merge with current optimistic messages
      setMessages(current => {
        const merged = mergeWithOptimistic(msgs, current);
        setCachedMessages(conversationId, merged);
        return merged;
      });
      // Track pagination
      setMessagesHasMore(data.hasMore);
      setMessagesNextCursor(data.nextCursor);
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      // Don't clear messages on error - keep showing what we have
      setMessagesHasMore(false);
      setMessagesNextCursor(null);
    } finally {
      if (showLoading) {
        setMessagesLoading(false);
      }
    }
  }, []);

  // Load more (older) messages for infinite scroll
  const loadMoreMessages = useCallback(async () => {
    if (!selectedConversation || messagesLoadingMore || !messagesHasMore || !messagesNextCursor) return;

    setMessagesLoadingMore(true);
    try {
      const response = await fetch(
        `/api/conversations/${selectedConversation.id}/messages?cursor=${messagesNextCursor}`
      );
      const data: MessagesResponse = await response.json();
      const olderMessages = data.messages || [];

      // Prepend older messages (they're older, so go at the start)
      setMessages(prev => [...olderMessages, ...prev]);

      // Update pagination
      setMessagesHasMore(data.hasMore);
      setMessagesNextCursor(data.nextCursor);

      // Update cache with all messages
      setCachedMessages(selectedConversation.id, [...olderMessages, ...messages]);
    } catch (error) {
      console.error('Failed to load more messages:', error);
    } finally {
      setMessagesLoadingMore(false);
    }
  }, [selectedConversation, messagesLoadingMore, messagesHasMore, messagesNextCursor, messages]);

  // Real-time listener updates - auto-refresh when new messages arrive
  // Also triggers smart AI re-analysis for conversations with new messages
  const handleNewMessages = useCallback(() => {
    console.log('[Home] Real-time: New messages detected, refreshing data');
    fetchConversations(false);
    if (selectedConversation) {
      fetchMessages(selectedConversation.id, false);
    }

    // SMART TRIGGER: Check for AI re-analysis after new messages arrive
    // Use a small delay to let the DB updates settle, then check for stale analysis
    setTimeout(() => {
      // Fire and forget - don't block UI
      fetch('/api/ai/auto-analyze')
        .then(res => res.json())
        .then(staleness => {
          const urgentIds = staleness.staleness?.urgentIds || [];
          if (urgentIds.length > 0) {
            console.log(`[AI] New messages detected - ${urgentIds.length} conversations need re-analysis`);
            fetch('/api/ai/auto-analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationIds: urgentIds.slice(0, 5),
                forceReanalyze: true,
              }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    }, 3000); // 3 second delay to let messages sync
  }, [fetchConversations, fetchMessages, selectedConversation]);

  // Monitor real-time listener for new messages (polls every 5 seconds)
  // Uses dual detection: listener state changes + direct conversation polling
  const { isListenerActive } = useRealtimeUpdates({
    pollingInterval: 5000,
    onNewMessages: handleNewMessages,
  });

  // SMART AI RE-ANALYSIS: Background staleness check and auto-refresh
  // Runs every 2 minutes to detect and re-analyze stale conversations
  // Also triggered immediately when new messages arrive
  const triggerSmartReanalysis = useCallback(async (immediate = false) => {
    try {
      // Check for stale conversations
      const stalenessResponse = await fetch('/api/ai/auto-analyze');
      if (!stalenessResponse.ok) return;

      const staleness = await stalenessResponse.json();

      // If there are stale or urgent conversations, trigger re-analysis
      const allIds = [
        ...(staleness.staleness?.urgentIds || []),
        ...(staleness.staleness?.conversationIds || []).slice(0, 5), // Limit to 5 stale
      ];

      if (allIds.length > 0) {
        console.log(`[AI] ${immediate ? 'Immediate' : 'Scheduled'} re-analysis for ${allIds.length} conversations`);

        // Trigger re-analysis (fire and forget - don't block UI)
        fetch('/api/ai/auto-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationIds: allIds.slice(0, 10), // Limit batch size
            forceReanalyze: true,
          }),
        }).catch(() => {
          // Silent - don't disrupt UI
        });
      }
    } catch (err) {
      // Silent failure - staleness check is best-effort
      console.debug('[AI] Staleness check failed:', err);
    }
  }, []);

  useEffect(() => {
    // Run initial check after 30 seconds (let app load first)
    const initialTimeout = setTimeout(() => triggerSmartReanalysis(false), 30000);

    // Then run every 2 minutes (reduced from 5 for faster updates)
    const interval = setInterval(() => triggerSmartReanalysis(false), 2 * 60 * 1000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [triggerSmartReanalysis]);

  // Listen for sync completion to refresh data in real-time
  useEffect(() => {
    const unsubscribe = onSyncComplete((type, result) => {
      // Always refresh conversation list after any sync
      fetchConversations(false);

      // For single sync, also refresh messages if it's the currently selected conversation
      // Pass showLoading=false to avoid unmounting MessageView (which would hide the sync result)
      if (type === 'single') {
        const singleResult = result as ConversationSyncResult;
        if (
          singleResult.conversationId &&
          selectedConversation?.id === singleResult.conversationId &&
          singleResult.messagesSynced > 0
        ) {
          fetchMessages(singleResult.conversationId, false);
        }
      }

      // For global sync, refresh the current conversation's messages if any were synced
      if (type === 'global' && selectedConversation) {
        const globalResult = result as GlobalSyncResult;
        if (globalResult.messagesSynced > 0) {
          fetchMessages(selectedConversation.id, false);
        }
      }
    });

    return () => unsubscribe();
  }, [onSyncComplete, fetchConversations, fetchMessages, selectedConversation]);

  // Track the conversation ID separately to avoid refetching on tag changes
  const selectedConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedConversation && selectedConversation.id !== selectedConversationIdRef.current) {
      selectedConversationIdRef.current = selectedConversation.id;
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation, fetchMessages]);

  const handleSelectConversation = useCallback((conversation: Conversation) => {
    setSelectedConversation(conversation);
    // On mobile, navigate to messages view when selecting a conversation
    if (isMobile) {
      setMobilePanel('messages');
    }

    // Track conversation opened
    track('conversation_opened', {
      conversationId: conversation.id,
      type: conversation.type || 'private',
      hasUnread: conversation.unread > 0,
      source: 'conversation_list',
    }, { conversationId: conversation.id });

    // Mark conversation as read (Telegram-style)
    // Only if there are unread messages
    if (conversation.unread > 0) {
      // Optimistic UI update - immediately clear unread badge
      setAllConversations((prev) =>
        prev.map((c) =>
          c.id === conversation.id
            ? { ...c, unread: 0 }
            : c
        )
      );

      // Track mark as read
      track('conversation_marked_read', { conversationId: conversation.id }, { conversationId: conversation.id });

      // Call mark-as-read API (fire and forget for better UX)
      fetch(`/api/conversations/${conversation.id}/mark-as-read`, {
        method: 'POST',
      }).catch((error) => {
        console.error('Failed to mark conversation as read:', error);
        // Optionally revert optimistic update on error
      });
    }
  }, [isMobile]);

  // Handle mark as unread from context menu
  const handleMarkAsUnread = useCallback((conversationId: string) => {
    // Optimistic UI update - set unread to 1
    setAllConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, unread: 1 }
          : c
      )
    );

    // Track mark as unread
    track('conversation_marked_unread', { conversationId }, { conversationId });

    // Call mark-as-unread API
    fetch(`/api/conversations/${conversationId}/mark-as-unread`, {
      method: 'POST',
    }).catch((error) => {
      console.error('Failed to mark conversation as unread:', error);
      // Revert optimistic update on error
      setAllConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, unread: 0 }
            : c
        )
      );
    });
  }, []);

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    // Use new ContactModal when tag filters are active (e.g., Customer Groups)
    // This provides the full conversation view with embedded messaging
    if (contactTagFilters.length > 0) {
      setIsContactModalOpen(true);
    } else {
      setIsContactPanelOpen(true);
    }
    // Track contact selected
    track('contact_selected', { contactId: contact.id, type: contact.type }, { contactId: contact.id });

    // ON-DEMAND AI REFRESH: If analysis is stale, trigger immediate re-analysis
    // Check if this contact has stale AI analysis (new messages since last analysis)
    if (contact.aiSummaryUpdatedAt && contact.lastInteraction) {
      const analysisTime = new Date(contact.aiSummaryUpdatedAt).getTime();
      const lastMsgTime = new Date(contact.lastInteraction).getTime();
      const hoursSinceAnalysis = (Date.now() - analysisTime) / (1000 * 60 * 60);

      // If there are new messages AND analysis is 1+ hour old, trigger refresh
      if (lastMsgTime > analysisTime && hoursSinceAnalysis >= 1) {
        console.log(`[AI] On-demand refresh for ${contact.name} (${hoursSinceAnalysis.toFixed(1)}h stale)`);
        fetch('/api/ai/auto-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationIds: [contact.id],
            forceReanalyze: true,
          }),
        }).catch(() => {
          // Silent - don't disrupt UI
        });
      }
    }
  };

  const handleCloseContactPanel = () => {
    setIsContactPanelOpen(false);
  };

  const handleCloseContactModal = () => {
    setIsContactModalOpen(false);
  };

  // Handle "Open Chat" from contact detail - switch to messages view
  const handleOpenChat = useCallback((contactId: string) => {
    handleViewModeSwitch('messages');
    // Close the contact panel
    setIsContactPanelOpen(false);

    // Find the corresponding conversation
    const conversation = allConversations.find(c => c.id === contactId);
    if (conversation) {
      setSelectedConversation(conversation);
    } else {
      // Fetch conversation if not in current list (might be filtered out by tags)
      fetch(`/api/conversations/${contactId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && data.id) {
            setSelectedConversation(data);
            // Also add to conversations list if not present
            setAllConversations((prev) => {
              if (!prev.find((c) => c.id === data.id)) {
                return [data, ...prev];
              }
              return prev;
            });
          }
        })
        .catch((error) => {
          console.error('Failed to fetch conversation:', error);
        });
    }
  }, [allConversations]);

  // Handle contact tag changes (inline assignment in contacts table)
  const handleContactTagsChange = useCallback(async (
    contactId: string,
    tags: { id: string; name: string; color: string | null }[]
  ) => {
    // Optimistically update the local state
    setContacts((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? { ...c, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) }
          : c
      )
    );

    // Also update selected contact if it's the one being modified
    if (selectedContact?.id === contactId) {
      setSelectedContact((prev) =>
        prev ? { ...prev, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) } : null
      );
    }

    // Persist to the server
    try {
      await fetch(`/api/conversations/${contactId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: tags.map(t => t.id) }),
      });
    } catch (error) {
      console.error('Failed to update contact tags:', error);
      // Could revert optimistic update here if needed
    }
  }, [selectedContact]);

  // Handle bulk tag changes for multiple contacts at once
  const handleBulkContactTagsChange = useCallback((
    contactIds: string[],
    tags: { id: string; name: string; color: string | null }[]
  ) => {
    // Update all selected contacts with the new tags
    contactIds.forEach(contactId => {
      handleContactTagsChange(contactId, tags);
    });
  }, [handleContactTagsChange]);

  // Handle opening AI Settings modal
  const handleOpenAISettings = useCallback(() => {
    // When opening AI settings, pre-select the first AI-enabled tag filter if any
    const firstAiTag = contactTagFilters.length > 0 ? contactTagFilters[0] : null;
    setAiSettingsTagId(firstAiTag);
    setIsAISettingsOpen(true);
  }, [contactTagFilters]);

  // Handle AI analysis from settings modal
  const handleAnalyzeConversations = useCallback(async (tagId: string) => {
    try {
      const response = await fetch('/api/ai/analyze-conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, forceRefresh: true }),
      });
      if (!response.ok) throw new Error('Analysis failed');
      // Refresh contacts to show updated AI data
      fetchContacts();
    } catch (error) {
      console.error('Failed to analyze conversations:', error);
    }
  }, [fetchContacts]);

  // Handle export contacts to CSV
  const handleExportContactsCsv = useCallback(() => {
    const headers = ['Name', 'Type', 'Username', 'Phone', 'Email', 'Messages', 'First Contact', 'Last Interaction', 'Tags', 'Notes'];
    const rows = filteredContacts.map(c => [
      c.name,
      c.type,
      c.username || '',
      c.phone || '',
      c.email || '',
      c.totalMessages.toString(),
      new Date(c.firstContactDate).toLocaleDateString(),
      new Date(c.lastInteraction).toLocaleDateString(),
      c.tags.map(t => t.name).join('; '),
      (c.notes || '').replace(/\n/g, ' '),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Track export
    track('contacts_exported', { count: filteredContacts.length, format: 'csv' });
  }, [filteredContacts]);

  const handleSendMessage = async (text: string) => {
    if (!selectedConversation) return;

    const tempId = `temp-${Date.now()}`;

    // Track message sent
    track('message_sent', {
      conversationId: selectedConversation.id,
      hasAttachment: false,
      contentLength: text.length,
    }, { conversationId: selectedConversation.id });

    // Add optimistic message (Linear-style instant feedback)
    const newMessage: Message = {
      id: tempId,
      text,
      sent: true,
      time: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
      status: 'sending',
      contentType: 'text',
    };
    setMessages((prev) => [...prev, newMessage]);

    // Also update cache for instant persistence
    updateCachedMessages(selectedConversation.id, (msgs) => [...msgs, newMessage]);

    // Update conversation last message optimistically
    setAllConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConversation.id
          ? { ...c, lastMessage: text, lastMessageDirection: 'outbound' as const, time: new Date().toISOString() }
          : c
      )
    );

    try {
      // Call the send API (Linear-style outbox pattern)
      const response = await fetch(`/api/conversations/${selectedConversation.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Update message status to "pending" (queued for delivery)
      // The actual "sent" status will come when the worker processes it
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: data.message?.id || tempId, status: 'sent' } : m
        )
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      // Track send failure
      track('message_send_failed', {
        conversationId: selectedConversation.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, { conversationId: selectedConversation.id });
      // Mark as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed' } : m
        )
      );
    }
  };

  // Handle sending reactions to messages (Telegram-style reactions)
  const handleReact = async (messageId: string, emoji: string, action: 'add' | 'remove') => {
    if (!selectedConversation) return;

    // TELEGRAM RULE: Each user can only have 1 reaction per message (non-premium)
    // Adding a new reaction REPLACES the old one
    // In groups, multiple users can react with different emojis (aggregated: 👍3 ❤️2)

    // Optimistic update - immediately show reaction in UI
    setMessages((prev) =>
      prev.map((m) => {
        if (m.externalMessageId !== messageId) return m;

        const currentReactions = m.reactions || [];
        const existingIdx = currentReactions.findIndex(r => r.emoji === emoji);
        const userPreviousReactionIdx = currentReactions.findIndex(r => r.userReacted);

        if (action === 'add') {
          let updated = [...currentReactions];

          // First, remove user's previous reaction if exists (TELEGRAM RULE: 1 per user)
          if (userPreviousReactionIdx >= 0 && userPreviousReactionIdx !== existingIdx) {
            const prevReaction = updated[userPreviousReactionIdx];
            if (prevReaction.count <= 1) {
              // Remove the old reaction entirely
              updated.splice(userPreviousReactionIdx, 1);
            } else {
              // Decrement count for old reaction
              updated[userPreviousReactionIdx] = {
                ...prevReaction,
                count: prevReaction.count - 1,
                userReacted: false,
              };
            }
          }

          // Recalculate existingIdx after potential removal
          const newExistingIdx = updated.findIndex(r => r.emoji === emoji);

          if (newExistingIdx >= 0) {
            // Increment count for existing reaction of this emoji
            updated[newExistingIdx] = {
              ...updated[newExistingIdx],
              count: updated[newExistingIdx].count + 1,
              userReacted: true,
            };
          } else {
            // Add new reaction
            updated.push({ emoji, count: 1, userReacted: true });
          }

          return { ...m, reactions: updated.length > 0 ? updated : null };
        } else {
          // Remove reaction
          if (existingIdx >= 0) {
            const updated = [...currentReactions];
            if (updated[existingIdx].count <= 1) {
              // Remove entirely if count would be 0
              updated.splice(existingIdx, 1);
            } else {
              // Decrement count
              updated[existingIdx] = {
                ...updated[existingIdx],
                count: updated[existingIdx].count - 1,
                userReacted: false,
              };
            }
            return { ...m, reactions: updated.length > 0 ? updated : null };
          }
          return m;
        }
      })
    );

    try {
      // Call the reactions API (Linear-style outbox pattern)
      const response = await fetch(`/api/conversations/${selectedConversation.id}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji, action }),
      });

      if (!response.ok) {
        throw new Error('Failed to send reaction');
      }

      console.log(`[REACTION] Queued ${action} ${emoji} on message ${messageId}`);
    } catch (error) {
      console.error('Failed to send reaction:', error);
      // Revert optimistic update on failure
      // For simplicity, we don't revert here - the UI will reconcile on next refresh
    }
  };

  // Handle sending messages with attachments (Linear-style outbox pattern)
  const handleSendMessageWithAttachment = async (
    text: string,
    attachment: { type: string; url: string; filename?: string; mimeType: string }
  ) => {
    if (!selectedConversation) return;

    const tempId = `temp-${Date.now()}`;
    const isPhoto = attachment.type === 'photo';
    const displayFilename = attachment.filename || (isPhoto ? 'Photo' : 'File');

    // 100x RELIABLE: Build media URL for instant inline display
    // For outgoing files, we serve them via /api/media/outgoing/{storageKey}
    const mediaUrl = attachment.url.startsWith('upload_')
      ? `/api/media/outgoing/${attachment.url}`
      : attachment.url;

    // Add optimistic message with FULL media data for instant inline display
    const newMessage: Message = {
      id: tempId,
      text: text || '',  // Don't put filename in text - let media display handle it
      sent: true,
      time: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
      status: 'sending',
      contentType: 'media',
      // 100x RELIABLE: Include media array so image/document shows inline immediately
      media: [{
        type: attachment.type,
        url: mediaUrl,
        name: attachment.filename || displayFilename,
        mimeType: attachment.mimeType,
      }],
    };
    setMessages((prev) => [...prev, newMessage]);

    // Also update cache for instant persistence
    updateCachedMessages(selectedConversation.id, (msgs) => [...msgs, newMessage]);

    // Update conversation last message optimistically
    const lastMsgPreview = text || (isPhoto ? '📷 Photo' : `📎 ${displayFilename}`);
    setAllConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConversation.id
          ? { ...c, lastMessage: lastMsgPreview, lastMessageDirection: 'outbound' as const, time: new Date().toISOString() }
          : c
      )
    );

    try {
      // Call the send API with attachment (Linear-style outbox pattern)
      const response = await fetch(`/api/conversations/${selectedConversation.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text || null,
          attachment: {
            type: attachment.type,
            url: attachment.url,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            caption: text || null,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Update message status to queued
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: data.message?.id || tempId, status: 'sent' } : m
        )
      );
    } catch (error) {
      console.error('Failed to send message with attachment:', error);
      // Mark as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: 'failed' } : m
        )
      );
    }
  };

  // Handle tag changes from the message header - immediately update conversation list
  const handleTagsChange = (conversationId: string, tags: { id: string; name: string; color: string | null }[]) => {
    // Update the conversation's tags in allConversations
    setAllConversations((prev) =>
      prev.map((c) =>
        c.id === conversationId
          ? { ...c, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) }
          : c
      )
    );

    // Also update the selected conversation if it's the one being modified
    if (selectedConversation?.id === conversationId) {
      setSelectedConversation((prev) =>
        prev ? { ...prev, tags: tags.map(t => ({ id: t.id, name: t.name, color: t.color })) } : null
      );
    }
  };

  // Show skeleton while initial data loads (much better UX than spinner)
  if (loading) {
    return <PageSkeleton />;
  }

  // Contacts view: full-width table with slide-out panel
  if (viewMode === 'contacts') {
    return (
      <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
        {/* Top Bar with View Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
        }}>
          {/* View Toggle - Linear-style segmented control with fixed width */}
          <div style={{
            display: 'flex',
            gap: '1px',
            padding: '2px',
            background: 'var(--bg-tertiary)',
            borderRadius: '6px',
            width: '180px',
          }}>
            <button
              onClick={() => handleViewModeSwitch('messages')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
            >
              Messages
            </button>
            <button
              onClick={() => handleViewModeSwitch('contacts')}
              style={{
                flex: 1,
                padding: '6px 0',
                fontSize: '12px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                background: 'var(--bg-primary)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              Contacts
            </button>
          </div>
        </div>

        {/* Full-width Contacts Table */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ContactsTable
            contacts={filteredContacts}
            onSelect={handleSelectContact}
            typeFilter={contactTypeFilter}
            onTypeFilterChange={setContactTypeFilter}
            counts={contactCounts}
            unfilteredTotalCount={unfilteredContactCount}
            quickFilterCounts={quickFilterCounts}
            onExportCsv={handleExportContactsCsv}
            allTags={allTags}
            onTagsChange={handleContactTagsChange}
            onBulkTagsChange={handleBulkContactTagsChange}
            isLoading={contactsLoading}
            isFiltering={contactsSearching} // Show subtle filtering indicator
            hasMore={contactsHasMore}
            isLoadingMore={contactsLoadingMore}
            onLoadMore={loadMoreContacts}
            onSearch={handleContactsSearch}
            isSearching={contactsSearching}
            onQuickFilterChange={handleQuickFilterChange}
            activeQuickFilter={activeQuickFilter}
            // Stripe-style tag filtering (server-side)
            activeTagFilters={contactTagFilters}
            onTagFilterChange={handleContactTagFilterChange}
            // Last active filtering (client-side)
            lastActiveFilters={contactLastActiveFilters}
            onLastActiveFiltersChange={handleLastActiveFiltersChange}
            // AI Settings
            onAISettings={handleOpenAISettings}
            hasAiEnabledTag={allTags.some(t => contactTagFilters.includes(t.id))}
          />
        </div>

        {/* AI Settings Modal */}
        <AISettingsModal
          isOpen={isAISettingsOpen}
          onClose={() => setIsAISettingsOpen(false)}
          selectedTagId={aiSettingsTagId}
          allTags={allTags}
          onTagSelect={setAiSettingsTagId}
          onAnalyze={handleAnalyzeConversations}
        />

        {/* Slide-out Contact Panel - used when no tag filters active */}
        <ContactSlidePanel
          contact={selectedContact}
          isOpen={isContactPanelOpen}
          onClose={handleCloseContactPanel}
          onOpenChat={handleOpenChat}
          onTagsChange={handleContactTagsChange}
          allTags={allTags}
        />

        {/* Full Contact Modal - used when tag filters are active (e.g., Customer Groups) */}
        <ContactModal
          contact={selectedContact}
          isOpen={isContactModalOpen}
          onClose={handleCloseContactModal}
          onTagsChange={handleContactTagsChange}
          allTags={allTags}
        />
      </div>
    );
  }

  // Messages view: responsive layout (3-column desktop, single panel mobile)
  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <div
          className="safe-area-bottom"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-around',
            padding: '8px 0',
          }}
        >
          <MobileNavButton
            label="Chats"
            icon={<ChatListIcon />}
            active={mobilePanel === 'conversations'}
            onClick={() => setMobilePanel('conversations')}
          />
          <MobileNavButton
            label="Messages"
            icon={<MessageIcon />}
            active={mobilePanel === 'messages'}
            onClick={() => setMobilePanel('messages')}
            disabled={!selectedConversation}
          />
          <MobileNavButton
            label="AI"
            icon={<AIIcon />}
            active={mobilePanel === 'assistant'}
            onClick={() => setMobilePanel('assistant')}
            disabled={!selectedConversation}
          />
          <MobileNavButton
            label="Contacts"
            icon={<ContactsIcon />}
            active={false}
            onClick={() => handleViewModeSwitch('contacts')}
          />
        </div>
      )}

      {/* Left Panel - Conversations List (hidden on mobile when not active) */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          width: isMobile ? '100%' : `${leftPanelWidth}px`,
          minWidth: isMobile ? undefined : '280px',
          maxWidth: isMobile ? undefined : '400px',
          borderRight: isMobile ? 'none' : '1px solid var(--border-subtle)',
          display: isMobile && mobilePanel !== 'conversations' ? 'none' : 'flex',
          paddingBottom: isMobile ? '60px' : 0, // Space for mobile nav
        }}
      >
        {/* View Toggle - Hidden on mobile (use bottom nav instead) */}
        {!isMobile && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}>
            <div style={{
              display: 'flex',
              gap: '1px',
              padding: '2px',
              background: 'var(--bg-tertiary)',
              borderRadius: '6px',
              width: '180px',
            }}>
              <button
                onClick={() => handleViewModeSwitch('messages')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  background: 'var(--bg-primary)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              >
                Messages
              </button>
              <button
                onClick={() => handleViewModeSwitch('contacts')}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-tertiary)',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                Contacts
              </button>
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ConversationsList
            conversations={filteredConversations}
            allTags={tagsWithCounts}
            selectedId={selectedConversation?.id || null}
            onSelect={handleSelectConversation}
            selectedTagIds={selectedTagIds}
            onTagFilterChange={handleTagFilterChange}
            onOpenSearch={() => setIsSearchOpen(true)}
            onMarkAsUnread={handleMarkAsUnread}
          />
        </div>
      </div>

      {/* Left Resizer - Hidden on mobile */}
      {!isMobile && (
        <Resizer
          onResize={(delta) => {
            setLeftPanelWidth((prev) => Math.min(400, Math.max(280, prev + delta)));
          }}
        />
      )}

      {/* Middle Panel - Messages (full width on mobile) */}
      <div
        className="flex-1"
        style={{
          minWidth: isMobile ? undefined : '400px',
          display: isMobile && mobilePanel !== 'messages' ? 'none' : 'flex',
          flexDirection: 'column',
          paddingBottom: isMobile ? '60px' : 0,
        }}
      >
        {/* Mobile back button */}
        {isMobile && selectedConversation && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <button
              onClick={() => setMobilePanel('conversations')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <BackIcon />
            </button>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {selectedConversation.name}
            </span>
          </div>
        )}
        {messagesLoading ? (
          <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)', flex: 1 }}>
            {/* Header skeleton */}
            <div style={{
              padding: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-tertiary)' }} />
              <div>
                <div style={{ width: 150, height: 16, borderRadius: 4, background: 'var(--bg-tertiary)', marginBottom: 4 }} />
                <div style={{ width: 80, height: 12, borderRadius: 4, background: 'var(--bg-tertiary)' }} />
              </div>
            </div>
            {/* Messages skeleton */}
            <div style={{ flex: 1 }}>
              <MessagesListSkeleton count={6} />
            </div>
          </div>
        ) : (
          <MessageView
            conversation={selectedConversation}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSendWithAttachment={handleSendMessageWithAttachment}
            onTagsChange={handleTagsChange}
            onReact={handleReact}
            highlightMessageId={highlightMessageId}
            hasMore={messagesHasMore}
            isLoadingMore={messagesLoadingMore}
            onLoadMore={loadMoreMessages}
          />
        )}
      </div>

      {/* Right Resizer - Hidden on mobile/tablet */}
      {!isMobile && !isTablet && (
        <Resizer
          onResize={(delta) => {
            setRightPanelWidth((prev) => Math.min(480, Math.max(300, prev - delta)));
          }}
        />
      )}

      {/* Right Panel - AI Assistant (full screen on mobile, hidden on tablet) */}
      <div
        className="flex-shrink-0"
        style={{
          width: isMobile ? '100%' : `${rightPanelWidth}px`,
          minWidth: isMobile ? undefined : '300px',
          maxWidth: isMobile ? undefined : '480px',
          borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
          display: isMobile
            ? (mobilePanel === 'assistant' ? 'block' : 'none')
            : (isTablet ? 'none' : 'block'),
          paddingBottom: isMobile ? '60px' : 0,
        }}
      >
        {/* Mobile back button for AI */}
        {isMobile && (
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <button
              onClick={() => setMobilePanel('messages')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                background: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
              }}
            >
              <BackIcon />
            </button>
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              AI Assistant
            </span>
          </div>
        )}
        <AIAssistant conversation={selectedConversation} />
      </div>

      {/* Search Modal */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectConversation={handleSearchSelectConversation}
      />
    </div>
  );
}

interface ResizerProps {
  onResize: (delta: number) => void;
}

function Resizer({ onResize }: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      startXRef.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: '4px',
        cursor: 'col-resize',
        background: isDragging ? 'var(--accent-primary)' : 'transparent',
        transition: isDragging ? 'none' : 'background 150ms ease',
        position: 'relative',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = 'var(--accent-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {/* Extended hit area */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '-4px',
        right: '-4px',
        bottom: 0,
      }} />
    </div>
  );
}

// Mobile navigation button component
interface MobileNavButtonProps {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function MobileNavButton({ label, icon, active, onClick, disabled }: MobileNavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-btn"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '4px',
        padding: '4px 16px',
        background: 'transparent',
        border: 'none',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        minHeight: 'auto',
        minWidth: 'auto',
      }}
    >
      <span style={{
        color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {icon}
      </span>
      <span style={{
        fontSize: '10px',
        fontWeight: 500,
        color: active ? 'var(--accent-primary)' : 'var(--text-tertiary)',
      }}>
        {label}
      </span>
    </button>
  );
}

// Mobile navigation icons
function ChatListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function AIIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ContactsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}
