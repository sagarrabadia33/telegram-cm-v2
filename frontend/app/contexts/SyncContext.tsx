'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

// Types matching the API response
export interface GlobalSyncProgress {
  conversationsProcessed: number;
  conversationsSkipped: number;
  conversationsTotal: number;
  messagesSynced: number;
  currentConversation: string | null;
}

export interface GlobalSyncStatus {
  isRunning: boolean;
  startedAt: string | null;
  progress: GlobalSyncProgress | null;
  lastCompletedAt: string | null;
  lastDuration: number | null;
  errors: Array<{ conversation: string; error: string; timestamp: string }>;
}

export interface SingleSyncStatus {
  isRunning: boolean;
  conversationId: string | null;
  conversationTitle: string | null;
  startedAt: string | null;
  messagesSynced: number | null;
  error: string | null;
}

export interface SyncStatus {
  globalSync: GlobalSyncStatus;
  singleSync: SingleSyncStatus;
  canStartGlobalSync: boolean;
  canStartSingleSync: boolean;
}

export interface ConversationSyncResult {
  success: boolean;
  messagesSynced: number;
  error?: string;
  conversationId?: string;
}

export interface GlobalSyncResult {
  success: boolean;
  messagesSynced: number;
  conversationsProcessed: number;
}

// Callback type for sync completion
export type SyncCompletionCallback = (type: 'global' | 'single', result: GlobalSyncResult | ConversationSyncResult) => void;

interface SyncContextValue {
  // Status
  status: SyncStatus | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  startGlobalSync: () => Promise<{ success: boolean; error?: string }>;
  cancelGlobalSync: () => Promise<{ success: boolean; error?: string }>;
  startConversationSync: (conversationId: string) => Promise<{ success: boolean; error?: string }>;

  // Polling control
  startPolling: () => void;
  stopPolling: () => void;

  // Conversation-specific sync result (for showing "X new messages" after sync)
  lastConversationSyncResult: ConversationSyncResult | null;
  clearLastSyncResult: () => void;

  // Global sync result (for triggering data refresh)
  lastGlobalSyncResult: GlobalSyncResult | null;
  clearLastGlobalSyncResult: () => void;

  // Register callback for sync completion
  onSyncComplete: (callback: SyncCompletionCallback) => () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const POLL_INTERVAL_IDLE = 30000; // 30s when idle
const POLL_INTERVAL_ACTIVE = 1500; // 1.5s when sync is active

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastConversationSyncResult, setLastConversationSyncResult] = useState<ConversationSyncResult | null>(null);
  const [lastGlobalSyncResult, setLastGlobalSyncResult] = useState<GlobalSyncResult | null>(null);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Track previous sync states to detect completion
  const prevGlobalSyncRunningRef = useRef(false);
  const prevSingleSyncRunningRef = useRef(false);
  const prevSingleSyncConversationIdRef = useRef<string | null>(null);

  // Callbacks for sync completion
  const syncCompleteCallbacksRef = useRef<Set<SyncCompletionCallback>>(new Set());

  // Fetch current sync status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/sync/status');
      if (!response.ok) throw new Error('Failed to fetch sync status');
      const data: SyncStatus = await response.json();
      setStatus(data);
      setError(null);

      // Detect global sync completion (was running, now not running)
      if (prevGlobalSyncRunningRef.current && !data.globalSync.isRunning) {
        const result: GlobalSyncResult = {
          success: true,
          messagesSynced: data.globalSync.progress?.messagesSynced || 0,
          conversationsProcessed: data.globalSync.progress?.conversationsProcessed || 0,
        };
        setLastGlobalSyncResult(result);

        // Notify all callbacks
        syncCompleteCallbacksRef.current.forEach(callback => {
          callback('global', result);
        });
      }
      prevGlobalSyncRunningRef.current = data.globalSync.isRunning;

      // Detect single sync completion (was running, now not running)
      if (
        prevSingleSyncRunningRef.current &&
        !data.singleSync.isRunning &&
        prevSingleSyncConversationIdRef.current
      ) {
        const result: ConversationSyncResult = {
          success: !data.singleSync.error,
          messagesSynced: data.singleSync.messagesSynced || 0,
          error: data.singleSync.error || undefined,
          conversationId: prevSingleSyncConversationIdRef.current,
        };
        setLastConversationSyncResult(result);

        // Notify all callbacks
        syncCompleteCallbacksRef.current.forEach(callback => {
          callback('single', result);
        });
      }
      prevSingleSyncRunningRef.current = data.singleSync.isRunning;
      prevSingleSyncConversationIdRef.current = data.singleSync.conversationId;

      return data;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    }
  }, []);

  // Start polling with adaptive interval
  const startPolling = useCallback(() => {
    if (isPollingRef.current) return;
    isPollingRef.current = true;

    const poll = async () => {
      if (!isPollingRef.current) return;

      const data = await fetchStatus();
      const isActive = data?.globalSync.isRunning || data?.singleSync.isRunning;
      const interval = isActive ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE;

      pollingRef.current = setTimeout(poll, interval);
    };

    poll();
  }, [fetchStatus]);

  // Stop polling
  const stopPolling = useCallback(() => {
    isPollingRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Start global sync
  const startGlobalSync = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/global', { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to start sync' };
      }

      // Immediately start fast polling
      startPolling();
      await fetchStatus();

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus, startPolling]);

  // Cancel global sync
  const cancelGlobalSync = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/global', { method: 'DELETE' });
      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to cancel sync' };
      }

      await fetchStatus();
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus]);

  // Start single conversation sync
  const startConversationSync = useCallback(async (conversationId: string) => {
    setIsLoading(true);
    setLastConversationSyncResult(null);

    try {
      const response = await fetch(`/api/sync/conversation/${conversationId}`, { method: 'POST' });
      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || 'Failed to start sync' };
      }

      // Immediately start fast polling
      startPolling();
      await fetchStatus();

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    } finally {
      setIsLoading(false);
    }
  }, [fetchStatus, startPolling]);

  // Clear last sync result
  const clearLastSyncResult = useCallback(() => {
    setLastConversationSyncResult(null);
  }, []);

  // Clear last global sync result
  const clearLastGlobalSyncResult = useCallback(() => {
    setLastGlobalSyncResult(null);
  }, []);

  // Register callback for sync completion
  const onSyncComplete = useCallback((callback: SyncCompletionCallback) => {
    syncCompleteCallbacksRef.current.add(callback);
    // Return unsubscribe function
    return () => {
      syncCompleteCallbacksRef.current.delete(callback);
    };
  }, []);

  // Auto-start polling on mount
  useEffect(() => {
    fetchStatus();
    startPolling();

    return () => {
      stopPolling();
    };
  }, [fetchStatus, startPolling, stopPolling]);

  return (
    <SyncContext.Provider
      value={{
        status,
        isLoading,
        error,
        startGlobalSync,
        cancelGlobalSync,
        startConversationSync,
        startPolling,
        stopPolling,
        lastConversationSyncResult,
        clearLastSyncResult,
        lastGlobalSyncResult,
        clearLastGlobalSyncResult,
        onSyncComplete,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}
