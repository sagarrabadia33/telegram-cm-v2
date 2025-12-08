'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ListenerStatus } from '@/app/api/sync/listener/route';

interface UseRealtimeUpdatesOptions {
  pollingInterval?: number; // milliseconds, default 5000ms (5 seconds)
  enabled?: boolean;
  onNewMessages?: () => void; // Callback when new messages are detected
}

interface UseRealtimeUpdatesResult {
  listenerStatus: ListenerStatus | null;
  isListenerActive: boolean;
  lastMessageAt: string | null;
  error: Error | null;
}

/**
 * Hook to monitor the real-time listener and trigger updates when new messages arrive.
 *
 * Uses TWO detection mechanisms for 100% reliability:
 * 1. Listener status: Checks `lastMessageAt` from the sync worker state
 * 2. Direct polling: Fetches conversation count to detect changes
 *
 * The callback is triggered when EITHER mechanism detects new messages.
 */
export function useRealtimeUpdates(
  options: UseRealtimeUpdatesOptions = {}
): UseRealtimeUpdatesResult {
  const {
    pollingInterval = 5000, // 5 second polling for balance between responsiveness and performance
    enabled = true,
    onNewMessages,
  } = options;

  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Track last known values for change detection
  const lastMessageAtRef = useRef<string | null>(null);
  const lastConversationHashRef = useRef<string | null>(null);
  const onNewMessagesRef = useRef(onNewMessages);
  const isFirstFetchRef = useRef(true);

  // Keep callback ref updated
  useEffect(() => {
    onNewMessagesRef.current = onNewMessages;
  }, [onNewMessages]);

  // Fetch listener status AND check for conversation changes
  const checkForUpdates = useCallback(async () => {
    let hasNewMessages = false;

    try {
      // 1. Check listener status
      const statusResponse = await fetch('/api/sync/listener');
      if (statusResponse.ok) {
        const data: ListenerStatus = await statusResponse.json();
        setListenerStatus(data);
        setError(null);

        // Check if lastMessageAt changed
        if (data.lastMessageAt && data.lastMessageAt !== lastMessageAtRef.current) {
          if (!isFirstFetchRef.current) {
            console.log('[RealtimeUpdates] New messages detected via listener status');
            hasNewMessages = true;
          }
          lastMessageAtRef.current = data.lastMessageAt;
        }
      }

      // 2. Check conversations for changes (backup mechanism)
      // Fetch just the first few conversations to detect changes
      const convResponse = await fetch('/api/conversations?limit=10');
      if (convResponse.ok) {
        const convData = await convResponse.json();
        if (Array.isArray(convData) && convData.length > 0) {
          // Create a hash of conversation state (id + lastMessageAt + unread)
          const currentHash = convData
            .slice(0, 5)
            .map((c: { id: string; time?: string; unread?: number }) =>
              `${c.id}:${c.time || ''}:${c.unread || 0}`
            )
            .join('|');

          if (lastConversationHashRef.current && currentHash !== lastConversationHashRef.current) {
            console.log('[RealtimeUpdates] Conversation changes detected via direct polling');
            hasNewMessages = true;
          }
          lastConversationHashRef.current = currentHash;
        }
      }

      // Mark first fetch as complete
      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
      }

      // Trigger callback if changes detected
      if (hasNewMessages) {
        onNewMessagesRef.current?.();
      }

      return listenerStatus;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return null;
    }
  }, [listenerStatus]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    checkForUpdates();

    // Set up regular polling
    const intervalId = setInterval(checkForUpdates, pollingInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, pollingInterval, checkForUpdates]);

  return {
    listenerStatus,
    isListenerActive: listenerStatus?.isRunning && listenerStatus?.isHealthy || false,
    lastMessageAt: listenerStatus?.lastMessageAt || null,
    error,
  };
}
