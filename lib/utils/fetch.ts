/**
 * Fetch Utilities with Retry Logic
 *
 * Industry Standard: Exponential backoff retry
 * Used by: WhatsApp Web, Telegram Web, Signal
 */

/**
 * Fetch with automatic retry and exponential backoff
 *
 * Retry delays: 1s, 2s, 4s (for maxRetries=3)
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Parsed JSON response
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        // Add cache busting for retries
        cache: attempt > 0 ? 'no-store' : options.cache,
      });

      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Parse and return JSON
      const data = await response.json();
      return data;

    } catch (error) {
      lastError = error as Error;
      const isLastAttempt = attempt === maxRetries - 1;

      // Don't retry on last attempt
      if (isLastAttempt) {
        console.error(`[FetchRetry] Final attempt failed:`, {
          url,
          attempt: attempt + 1,
          error: lastError.message
        });
        throw lastError;
      }

      // Calculate exponential backoff delay
      const delayMs = Math.pow(2, attempt) * 1000;

      console.warn(`[FetchRetry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms...`, {
        url,
        error: lastError.message
      });

      // Wait before next retry
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Fetch multiple URLs in parallel with retry
 *
 * @param urls - Array of URLs to fetch
 * @param options - Fetch options (applied to all requests)
 * @returns Array of responses in same order as urls
 */
export async function fetchAllWithRetry<T>(
  urls: string[],
  options: RequestInit = {}
): Promise<T[]> {
  return Promise.all(
    urls.map(url => fetchWithRetry<T>(url, options))
  );
}
