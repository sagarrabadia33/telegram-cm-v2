'use client';

import {
  AnalyticsEventPayload,
  AnalyticsBatch,
  EventType,
  EventProperties,
  EVENT_CATEGORIES,
} from './types';

// Check if we're in production environment
const isProduction = (): boolean => {
  if (typeof window === 'undefined') return false;

  // Check if running on production domain
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.');

  // Only track in production (non-localhost environments)
  return !isLocalhost;
};

// Generate a unique session ID for this page load
const generateSessionId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Detect device type from viewport
const getDeviceType = (): string => {
  if (typeof window === 'undefined') return 'unknown';
  const width = window.innerWidth;
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
};

// Analytics client singleton
class AnalyticsClient {
  private sessionId: string;
  private deviceType: string;
  private eventBuffer: AnalyticsEventPayload[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private isEnabled: boolean = true;
  private isProductionEnv: boolean = false;
  private currentViewMode: 'messages' | 'contacts' = 'messages';

  // Session tracking
  private sessionStartTime: number;
  private pageStartTime: number;
  private lastPageSwitchTime: number;

  // Config
  private readonly BATCH_SIZE = 10;
  private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds
  private readonly API_ENDPOINT = '/api/analytics/event';
  private readonly PAGE_TIME_INTERVAL_MS = 60000; // Track page time every 60 seconds

  constructor() {
    this.sessionId = generateSessionId();
    this.deviceType = getDeviceType();
    this.sessionStartTime = Date.now();
    this.pageStartTime = Date.now();
    this.lastPageSwitchTime = Date.now();

    // Check if we're in production - only track in production
    this.isProductionEnv = isProduction();

    if (!this.isProductionEnv) {
      console.debug('[Analytics] Disabled - not in production environment');
      return; // Don't set up tracking in non-production
    }

    // Set up periodic flush (production only)
    if (typeof window !== 'undefined') {
      this.startFlushTimer();
      this.startPageTimeTracking();

      // Track session start
      this.track('session_started', {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      });

      // Flush on page unload and track session end
      window.addEventListener('beforeunload', () => {
        this.trackPageTime();
        this.trackSessionEnd();
        this.flush(true);
      });

      // Flush on visibility change (tab switch)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          this.trackPageTime();
          this.flush(true);
        } else if (document.visibilityState === 'visible') {
          // Reset page time on return
          this.lastPageSwitchTime = Date.now();
        }
      });
    }
  }

  // Start tracking page time periodically
  private startPageTimeTracking(): void {
    setInterval(() => {
      this.trackPageTime();
    }, this.PAGE_TIME_INTERVAL_MS);
  }

  // Track time spent on current page
  private trackPageTime(): void {
    const now = Date.now();
    const timeOnPage = now - this.lastPageSwitchTime;

    if (timeOnPage > 1000) { // Only track if > 1 second
      this.track('page_time_tracked', {
        page: this.currentViewMode,
        durationMs: timeOnPage,
      });
    }

    this.lastPageSwitchTime = now;
  }

  // Track session end
  private trackSessionEnd(): void {
    const sessionDuration = Date.now() - this.sessionStartTime;
    this.track('session_ended', {
      durationMs: sessionDuration,
    });
  }

  // Enable/disable tracking
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  // Update current view mode for context
  setViewMode(viewMode: 'messages' | 'contacts'): void {
    // Track time on previous page before switching
    if (viewMode !== this.currentViewMode) {
      this.trackPageTime();
    }
    this.currentViewMode = viewMode;
  }

  // Track an event
  track<T extends EventType>(
    eventType: T,
    properties?: T extends keyof EventProperties ? EventProperties[T] : Record<string, unknown>,
    options?: {
      conversationId?: string;
      contactId?: string;
      tagId?: string;
      durationMs?: number;
    }
  ): void {
    // Only track in production environment
    if (!this.isEnabled || !this.isProductionEnv) return;

    const event: AnalyticsEventPayload = {
      eventType,
      eventCategory: EVENT_CATEGORIES[eventType],
      properties,
      viewMode: this.currentViewMode,
      ...options,
    };

    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.BATCH_SIZE) {
      this.flush();
    }
  }

  // Start the flush timer
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
  }

  // Flush events to server
  async flush(useBeacon: boolean = false): Promise<void> {
    if (this.eventBuffer.length === 0) return;

    const eventsToSend = [...this.eventBuffer];
    this.eventBuffer = [];

    const batch: AnalyticsBatch = {
      sessionId: this.sessionId,
      deviceType: this.deviceType,
      events: eventsToSend,
    };

    try {
      if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        // Use sendBeacon for reliable delivery on page unload
        const blob = new Blob([JSON.stringify(batch)], { type: 'application/json' });
        navigator.sendBeacon(this.API_ENDPOINT, blob);
      } else {
        // Use fetch for normal requests
        await fetch(this.API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          keepalive: true, // Allow request to complete after page unload
        });
      }
    } catch (error) {
      // Silent fail - analytics should never break the app
      console.debug('Analytics flush failed:', error);
      // Re-add events to buffer for retry (limit to prevent memory issues)
      if (this.eventBuffer.length < this.BATCH_SIZE * 3) {
        this.eventBuffer.unshift(...eventsToSend);
      }
    }
  }

  // Get session ID (for debugging)
  getSessionId(): string {
    return this.sessionId;
  }
}

// Export singleton instance
export const analytics = typeof window !== 'undefined' ? new AnalyticsClient() : null;

// Convenience function for tracking
export function track<T extends EventType>(
  eventType: T,
  properties?: T extends keyof EventProperties ? EventProperties[T] : Record<string, unknown>,
  options?: {
    conversationId?: string;
    contactId?: string;
    tagId?: string;
    durationMs?: number;
  }
): void {
  analytics?.track(eventType, properties, options);
}

// Convenience function for setting view mode
export function setViewMode(viewMode: 'messages' | 'contacts'): void {
  analytics?.setViewMode(viewMode);
}
