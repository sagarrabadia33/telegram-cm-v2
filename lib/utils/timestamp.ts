/**
 * Timestamp Utility Functions
 *
 * Industry-standard timestamp parsing and formatting
 * Handles mixed formats from database (ISO strings + Unix timestamps)
 *
 * Used by: Telegram Desktop, WhatsApp Web, Signal
 */

/**
 * Parse any timestamp format to Date object
 *
 * Handles:
 * - ISO 8601 strings: "2025-11-18T10:34:37+00:00"
 * - Unix timestamps (ms): 1763487164000
 * - Unix timestamp strings: "1763487164000"
 *
 * @param timestamp - Any timestamp value
 * @returns Date object or null if invalid
 */
export function parseTimestamp(timestamp: string | number | null | undefined): Date | null {
  if (!timestamp) return null;

  try {
    // Try as number (Unix timestamp in milliseconds)
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    }

    // Try as string
    const str = timestamp.toString().trim();

    // Check if it's a numeric string (Unix timestamp)
    if (/^\d+$/.test(str)) {
      const num = parseInt(str, 10);

      // Validate range (year 2000-2100)
      // 946684800000 = 2000-01-01
      // 4102444800000 = 2100-01-01
      if (num > 946684800000 && num < 4102444800000) {
        const date = new Date(num);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    // Try as ISO string or other valid date string
    const date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date;
    }

    return null;
  } catch (error) {
    console.error('[Timestamp] Failed to parse:', timestamp, error);
    return null;
  }
}

/**
 * Format timestamp for message display
 * Shows: "2:34 PM" or "Invalid"
 */
export function formatMessageTime(timestamp: string | number): string {
  const date = parseTimestamp(timestamp);
  if (!date) return "Invalid";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Format timestamp for conversation list
 * Shows: "2:34 PM" (today), "Mon" (this week), "Nov 18" (older)
 */
export function formatConversationTime(timestamp: string | number | null): string {
  if (!timestamp) return "";

  const date = parseTimestamp(timestamp);
  if (!date) return "";

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);

  // Today - show time
  if (diffInSeconds < 86400 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  }

  // This week - show day name
  if (diffInSeconds < 604800) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  // Older - show date
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

/**
 * Format date for message separator
 * Shows: "Today", "Yesterday", or "November 18"
 */
export function formatMessageDate(timestamp: string | number): string {
  const date = parseTimestamp(timestamp);
  if (!date) return "Unknown Date";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return "Today";
  } else if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
  }
}

/**
 * Format "last seen" timestamp
 * Shows: "last seen 5 minutes ago", "last seen Nov 18"
 */
export function formatLastSeen(timestamp: string | number | null): string {
  if (!timestamp) return "";

  const date = parseTimestamp(timestamp);
  if (!date) return "";

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSeconds < 60) {
    return "last seen just now";
  } else if (diffInMinutes < 60) {
    return `last seen ${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffInHours < 24) {
    return `last seen ${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffInDays < 7) {
    return `last seen ${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  } else {
    return `last seen ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
}

/**
 * Validate that messages are in chronological order
 *
 * Industry Standard: WhatsApp, Signal validate sort order
 *
 * @returns true if messages are sorted correctly, false otherwise
 */
export function validateMessageOrder<T extends { sentAt: string | number; id: string }>(
  messages: T[]
): boolean {
  if (messages.length <= 1) return true;

  for (let i = 1; i < messages.length; i++) {
    const prev = parseTimestamp(messages[i - 1].sentAt);
    const curr = parseTimestamp(messages[i].sentAt);

    if (!prev || !curr) {
      console.warn('[MessageOrder] Invalid timestamp:', {
        messageId: messages[i].id,
        sentAt: messages[i].sentAt
      });
      return false;
    }

    if (prev.getTime() > curr.getTime()) {
      console.error('[MessageOrder] Messages out of order:', {
        prevIndex: i - 1,
        currIndex: i,
        prevId: messages[i - 1].id,
        currId: messages[i].id,
        prevTime: prev.toISOString(),
        currTime: curr.toISOString(),
        difference: `${((prev.getTime() - curr.getTime()) / 1000).toFixed(0)}s`
      });
      return false;
    }
  }

  console.log(`✅ Message order validated: ${messages.length} messages in correct order`);
  return true;
}
