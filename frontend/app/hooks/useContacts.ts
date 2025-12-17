'use client';

import useSWR, { mutate } from 'swr';
import { useCallback, useRef, useEffect } from 'react';
import type { Contact, Tag } from '@/app/components/ContactsTable';

// Types
interface QuickFilterCounts {
  active7d: number;
  active30d: number;
  untagged: number;
  highVolume: number;
  newThisWeek: number;
  needFollowUp?: number;
}

interface ContactsResponse {
  contacts: Contact[];
  counts: { all: number; people: number; groups: number; channels: number };
  quickFilterCounts: QuickFilterCounts;
  activeQuickFilter: string | null;
  activeTagIds: string[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    total: number;
    returned: number;
  };
}

interface UseContactsOptions {
  typeFilter?: 'all' | 'people' | 'groups' | 'channels';
  tagIds?: string[];
  quickFilter?: string;
  search?: string;
  limit?: number;
  enabled?: boolean;
}

// Global fetcher with deduplication
const fetcher = async (url: string): Promise<ContactsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch contacts');
  return res.json();
};

// Build URL from options
function buildContactsUrl(options: UseContactsOptions): string {
  const params = new URLSearchParams();

  if (options.typeFilter && options.typeFilter !== 'all') {
    params.set('type', options.typeFilter === 'people' ? 'private' : options.typeFilter);
  }

  if (options.tagIds && options.tagIds.length > 0) {
    params.set('tagIds', options.tagIds.join(','));
  }

  if (options.quickFilter) {
    params.set('quickFilter', options.quickFilter);
  }

  if (options.search) {
    params.set('search', options.search);
  }

  if (options.limit) {
    params.set('limit', String(options.limit));
  }

  const queryString = params.toString();
  return `/api/contacts${queryString ? `?${queryString}` : ''}`;
}

// Cache key for contacts
function getContactsCacheKey(options: UseContactsOptions): string | null {
  if (options.enabled === false) return null;
  return buildContactsUrl(options);
}

/**
 * useContacts - Lightning-fast contacts loading with SWR
 *
 * Features:
 * - Instant cache hits (stale-while-revalidate)
 * - Automatic background revalidation
 * - Deduplication of requests
 * - Optimistic updates
 * - Prefetching support
 */
export function useContacts(options: UseContactsOptions = {}) {
  const { enabled = true, ...rest } = options;

  const { data, error, isLoading, isValidating, mutate: boundMutate } = useSWR<ContactsResponse>(
    getContactsCacheKey({ enabled, ...rest }),
    fetcher,
    {
      // Instant UX: Show stale data immediately while revalidating
      revalidateOnFocus: false, // Don't refetch on window focus (too aggressive)
      revalidateOnReconnect: true,
      dedupingInterval: 2000, // Dedupe requests within 2 seconds
      keepPreviousData: true, // Keep showing old data while new data loads
      // 100x RELIABLE: Fast refresh for AI analysis updates
      refreshInterval: 3000, // Refresh every 3 seconds for lightning-fast AI updates
      errorRetryCount: 2,
    }
  );

  // Trigger AI analysis for contacts that need it
  const triggerAiAnalysis = useCallback(async (tagId?: string) => {
    try {
      const response = await fetch('/api/ai/auto-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });

      if (response.ok) {
        // Revalidate contacts to show updated AI analysis
        boundMutate();
      }
    } catch (error) {
      console.error('Failed to trigger AI analysis:', error);
    }
  }, [boundMutate]);

  // Auto-trigger AI analysis when tag filter changes and has contacts needing updates
  const lastTagRef = useRef<string | null>(null);
  useEffect(() => {
    const currentTag = options.tagIds?.[0] || null;

    // Only trigger when tag changes, not on every render
    if (currentTag !== lastTagRef.current && currentTag && data?.contacts) {
      lastTagRef.current = currentTag;

      // Check if any contacts need AI update
      const needsUpdate = data.contacts.some(c => c.aiNeedsUpdate && !c.aiAnalyzing);
      if (needsUpdate) {
        // Trigger analysis in background
        triggerAiAnalysis(currentTag);
      }
    }
  }, [options.tagIds, data?.contacts, triggerAiAnalysis]);

  return {
    contacts: data?.contacts || [],
    counts: data?.counts || { all: 0, people: 0, groups: 0, channels: 0 },
    quickFilterCounts: data?.quickFilterCounts,
    pagination: data?.pagination,

    // Loading states
    isLoading, // True only on first load (no cached data)
    isValidating, // True when fetching (even with cached data)
    isRefreshing: isValidating && !isLoading, // Background refresh
    error,

    // Actions
    refresh: boundMutate,
    triggerAiAnalysis,
  };
}

/**
 * Prefetch contacts for a specific tag
 * Call this on hover/focus of tag filter to pre-warm cache
 */
export function prefetchContacts(options: UseContactsOptions) {
  const url = buildContactsUrl(options);
  // Prefetch in background
  mutate(url, fetcher(url), { revalidate: false });
}

// Tags response type
interface TagsResponse {
  tags: Tag[];
}

// Tags fetcher
const tagsFetcher = async (url: string): Promise<TagsResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
};

/**
 * Prefetch all tags for instant filter UI
 */
export function useTags() {
  const { data, error, isLoading } = useSWR<TagsResponse>(
    '/api/tags',
    tagsFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000, // Tags don't change often
      refreshInterval: 60000, // Refresh every minute
    }
  );

  return {
    tags: data?.tags || [],
    isLoading,
    error,
  };
}

/**
 * Global mutate to refresh contacts across components
 */
export function refreshAllContacts() {
  // Invalidate all contacts cache entries
  mutate((key) => typeof key === 'string' && key.startsWith('/api/contacts'));
}
