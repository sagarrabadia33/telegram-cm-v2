'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ListenerStatus } from '@/app/api/sync/listener/route';

interface UseRealtimeUpdatesOptions {
  pollingInterval?: number; // milliseconds, default 2000ms when listener is active
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
 * This polls the listener status API and detects when `lastMessageAt` changes,
 * indicating new messages have been received and saved to the database.
 */
export function useRealtimeUpdates(
  options: UseRealtimeUpdatesOptions = {}
): UseRealtimeUpdatesResult {
  const {
    pollingInterval = 2000, // 2 second polling when listener is active
    enabled = true,
    onNewMessages,
  } = options;

  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Track last message timestamp to detect new messages
  const lastMessageAtRef = useRef<string | null>(null);
  const onNewMessagesRef = useRef(onNewMessages);

  // Keep callback ref updated
  useEffect(() => {
    onNewMessagesRef.current = onNewMessages;
  }, [onNewMessages]);

  const fetchListenerStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/listener');
      if (!response.ok) {
        throw new Error(`Failed to fetch listener status: ${response.status}`);
      }
      const data: ListenerStatus = await response.json();
      setListenerStatus(data);
      setError(null);

      // Check if new messages have arrived
      if (data.lastMessageAt && data.lastMessageAt !== lastMessageAtRef.current) {
        // Only trigger callback if this isn't the first fetch (lastMessageAtRef was set before)
        if (lastMessageAtRef.current !== null) {
          console.log('[RealtimeUpdates] New messages detected, triggering refresh');
          onNewMessagesRef.current?.();
        }
        lastMessageAtRef.current = data.lastMessageAt;
      }

      return data;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial fetch
    fetchListenerStatus();

    // Set up polling - only poll frequently when listener is active
    const poll = async () => {
      const status = await fetchListenerStatus();

      // If listener is active and healthy, poll frequently
      // If listener is not running, poll less frequently (10s)
      const nextInterval = status?.isRunning && status?.isHealthy
        ? pollingInterval
        : 10000;

      return nextInterval;
    };

    let timeoutId: NodeJS.Timeout;

    const schedulePoll = async () => {
      const nextInterval = await poll();
      timeoutId = setTimeout(schedulePoll, nextInterval);
    };

    // Start polling after initial fetch
    timeoutId = setTimeout(schedulePoll, pollingInterval);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [enabled, pollingInterval, fetchListenerStatus]);

  return {
    listenerStatus,
    isListenerActive: listenerStatus?.isRunning && listenerStatus?.isHealthy || false,
    lastMessageAt: listenerStatus?.lastMessageAt || null,
    error,
  };
}
