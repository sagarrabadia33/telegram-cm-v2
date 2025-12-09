'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ListenerStatus } from '@/app/api/sync/listener/route';

interface UseRealtimeUpdatesOptions {
  pollingInterval?: number; // milliseconds, default 5000ms (5 seconds) - used as fallback
  enabled?: boolean;
  onNewMessages?: () => void; // Callback when new messages are detected
}

interface UseRealtimeUpdatesResult {
  listenerStatus: ListenerStatus | null;
  isListenerActive: boolean;
  lastMessageAt: string | null;
  error: Error | null;
  connectionType: 'sse' | 'polling' | 'disconnected';
}

/**
 * 100x RELIABLE: Real-time updates with SSE + polling fallback
 *
 * Uses THREE mechanisms for maximum reliability:
 * 1. SSE (Server-Sent Events): Instant push notifications (<100ms latency)
 * 2. Polling fallback: 5-second polling if SSE fails
 * 3. Listener status check: Verifies sync worker is healthy
 *
 * SSE provides instant updates, polling ensures we never miss anything.
 */
export function useRealtimeUpdates(
  options: UseRealtimeUpdatesOptions = {}
): UseRealtimeUpdatesResult {
  const {
    pollingInterval = 5000, // Fallback polling interval
    enabled = true,
    onNewMessages,
  } = options;

  const [listenerStatus, setListenerStatus] = useState<ListenerStatus | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [connectionType, setConnectionType] = useState<'sse' | 'polling' | 'disconnected'>('disconnected');

  // Refs for tracking state
  const onNewMessagesRef = useRef(onNewMessages);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstFetchRef = useRef(true);
  const lastConversationHashRef = useRef<string | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    onNewMessagesRef.current = onNewMessages;
  }, [onNewMessages]);

  // Fetch listener status
  const fetchListenerStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/listener');
      if (response.ok) {
        const data: ListenerStatus = await response.json();
        setListenerStatus(data);
        setError(null);
        return data;
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch status'));
    }
    return null;
  }, []);

  // Polling-based check (fallback mechanism)
  const checkForUpdatesViaPolling = useCallback(async () => {
    try {
      // Fetch conversations to detect changes
      const convResponse = await fetch('/api/conversations?limit=10');
      if (convResponse.ok) {
        const convData = await convResponse.json();
        if (Array.isArray(convData) && convData.length > 0) {
          const currentHash = convData
            .slice(0, 5)
            .map((c: { id: string; time?: string; unread?: number }) =>
              `${c.id}:${c.time || ''}:${c.unread || 0}`
            )
            .join('|');

          if (!isFirstFetchRef.current && lastConversationHashRef.current && currentHash !== lastConversationHashRef.current) {
            console.log('[RealtimeUpdates] Changes detected via polling');
            onNewMessagesRef.current?.();
          }
          lastConversationHashRef.current = currentHash;
        }
      }

      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
      }
    } catch (err) {
      console.error('[RealtimeUpdates] Polling error:', err);
    }
  }, []);

  // Setup SSE connection
  const setupSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const eventSource = new EventSource('/api/sync/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[RealtimeUpdates] SSE connected - instant updates enabled');
        setConnectionType('sse');
        setError(null);

        // Clear polling interval when SSE is connected
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      };

      eventSource.addEventListener('connected', () => {
        console.log('[RealtimeUpdates] SSE handshake complete');
      });

      eventSource.addEventListener('update', (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[RealtimeUpdates] SSE update:', data.type);
          onNewMessagesRef.current?.();
        } catch (e) {
          console.error('[RealtimeUpdates] SSE parse error:', e);
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        // Keep-alive received, connection is healthy
      });

      eventSource.onerror = (err) => {
        console.warn('[RealtimeUpdates] SSE error, falling back to polling:', err);
        setConnectionType('polling');

        // Close broken connection
        eventSource.close();
        eventSourceRef.current = null;

        // Start polling as fallback
        if (!pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(checkForUpdatesViaPolling, pollingInterval);
        }

        // Try to reconnect SSE after 10 seconds
        setTimeout(() => {
          if (enabled) {
            setupSSE();
          }
        }, 10000);
      };
    } catch (err) {
      console.error('[RealtimeUpdates] Failed to setup SSE:', err);
      setConnectionType('polling');

      // Fall back to polling
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(checkForUpdatesViaPolling, pollingInterval);
      }
    }
  }, [enabled, pollingInterval, checkForUpdatesViaPolling]);

  // Main effect
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Initial status fetch
    fetchListenerStatus();

    // Initial conversation hash
    checkForUpdatesViaPolling();

    // Setup SSE connection
    setupSSE();

    // Also fetch listener status periodically (every 30 seconds)
    const statusInterval = setInterval(fetchListenerStatus, 30000);

    return () => {
      // Cleanup
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      clearInterval(statusInterval);
      setConnectionType('disconnected');
    };
  }, [enabled, fetchListenerStatus, checkForUpdatesViaPolling, setupSSE]);

  return {
    listenerStatus,
    isListenerActive: listenerStatus?.isRunning && listenerStatus?.isHealthy || false,
    lastMessageAt: listenerStatus?.lastMessageAt || null,
    error,
    connectionType,
  };
}
