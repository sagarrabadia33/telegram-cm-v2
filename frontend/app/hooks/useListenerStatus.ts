'use client';

import { useState, useEffect, useCallback } from 'react';
import { ListenerStatus } from '@/app/api/sync/listener/route';

interface UseListenerStatusOptions {
  pollingInterval?: number; // milliseconds, default 5000
  enabled?: boolean; // whether to poll, default true
}

interface UseListenerStatusResult {
  status: ListenerStatus | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to poll listener status from the database.
 * Provides real-time visibility into whether the Telegram listener is running.
 */
export function useListenerStatus(
  options: UseListenerStatusOptions = {}
): UseListenerStatusResult {
  const { pollingInterval = 5000, enabled = true } = options;

  const [status, setStatus] = useState<ListenerStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/listener');
      if (!response.ok) {
        throw new Error(`Failed to fetch listener status: ${response.status}`);
      }
      const data: ListenerStatus = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // Initial fetch
    fetchStatus();

    // Set up polling
    const intervalId = setInterval(fetchStatus, pollingInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchStatus, pollingInterval, enabled]);

  return {
    status,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}

export type { ListenerStatus };
