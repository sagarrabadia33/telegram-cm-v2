'use client';

import { useCallback, useEffect, useRef } from 'react';
import { track, setViewMode } from '@/app/lib/analytics/client';
import { EventType, EventProperties } from '@/app/lib/analytics/types';

type ViewMode = 'messages' | 'contacts';

interface UseAnalyticsOptions {
  viewMode?: ViewMode;
}

export function useAnalytics(options?: UseAnalyticsOptions) {
  const startTimeRef = useRef<number>(Date.now());

  // Set view mode on mount and when it changes
  useEffect(() => {
    if (options?.viewMode) {
      setViewMode(options.viewMode);
    }
  }, [options?.viewMode]);

  // Track page load on mount
  useEffect(() => {
    const loadTime = Date.now() - startTimeRef.current;
    track('page_loaded', {
      viewMode: options?.viewMode || 'unknown',
      loadTimeMs: loadTime,
    });
  }, [options?.viewMode]);

  // Generic track function with type safety
  const trackEvent = useCallback(
    <T extends EventType>(
      eventType: T,
      properties?: T extends keyof EventProperties ? EventProperties[T] : Record<string, unknown>,
      eventOptions?: {
        conversationId?: string;
        contactId?: string;
        tagId?: string;
        durationMs?: number;
      }
    ) => {
      track(eventType, properties, eventOptions);
    },
    []
  );

  // Convenience methods for common events
  const trackViewSwitch = useCallback((from: string, to: ViewMode) => {
    track('view_switched', { from, to });
    setViewMode(to);
  }, []);

  const trackConversationOpened = useCallback(
    (conversationId: string, type: string, hasUnread: boolean, source?: string) => {
      track(
        'conversation_opened',
        { conversationId, type, hasUnread, source },
        { conversationId }
      );
    },
    []
  );

  const trackMessageSent = useCallback(
    (conversationId: string, hasAttachment: boolean, contentLength: number) => {
      track(
        'message_sent',
        { conversationId, hasAttachment, contentLength },
        { conversationId }
      );
    },
    []
  );

  const trackContactSelected = useCallback((contactId: string, type: string) => {
    track('contact_selected', { contactId, type }, { contactId });
  }, []);

  const trackSearch = useCallback(
    (query: string, resultCount: number, durationMs?: number) => {
      track('search_performed', { query, resultCount, durationMs }, { durationMs });
    },
    []
  );

  const trackQuickFilter = useCallback((filterType: string, resultCount: number) => {
    track('quick_filter_applied', { filterType, resultCount });
  }, []);

  const trackTagAssigned = useCallback(
    (
      tagId: string,
      targetType: 'conversation' | 'contact',
      targetId: string,
      isNew?: boolean
    ) => {
      track(
        'tag_assigned',
        { tagId, targetType, targetId, isNew },
        {
          tagId,
          conversationId: targetType === 'conversation' ? targetId : undefined,
          contactId: targetType === 'contact' ? targetId : undefined,
        }
      );
    },
    []
  );

  const trackAIPrompt = useCallback(
    (promptLength: number, conversationId?: string) => {
      track('ai_prompt_submitted', { promptLength }, { conversationId });
    },
    []
  );

  const trackNoteCreated = useCallback(
    (conversationId: string, noteType: string) => {
      track('note_created', { conversationId, noteType }, { conversationId });
    },
    []
  );

  return {
    trackEvent,
    trackViewSwitch,
    trackConversationOpened,
    trackMessageSent,
    trackContactSelected,
    trackSearch,
    trackQuickFilter,
    trackTagAssigned,
    trackAIPrompt,
    trackNoteCreated,
  };
}

export default useAnalytics;
