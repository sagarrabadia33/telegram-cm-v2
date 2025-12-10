import { NextRequest, NextResponse } from 'next/server';

/**
 * On-Demand Media Download Proxy - 100x RELIABLE
 *
 * Proxies media download requests to the Telegram sync worker.
 * The worker downloads media directly from Telegram API and streams it back.
 *
 * Reliability features:
 * - Retry logic with exponential backoff (3 attempts)
 * - Proper error categorization and logging
 * - Long browser caching (24h) after first successful load
 * - Handles worker not ready state gracefully
 *
 * Query params:
 * - telegram_message_id: Telegram message ID containing the media
 * - telegram_chat_id: Telegram chat/channel/user ID
 */

// Sync worker URL - use Railway internal network in production
// Railway services can communicate via {service-name}.railway.internal
const SYNC_WORKER_URL = process.env.SYNC_WORKER_URL ||
  (process.env.RAILWAY_ENVIRONMENT
    ? 'http://telegram-sync-worker.railway.internal:8080'
    : 'http://localhost:8080');

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const TIMEOUT_MS = 60000; // 60 seconds for large files

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If worker returns 503 (not ready), retry after delay
      if (response.status === 503 && attempt < retries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[MEDIA-DOWNLOAD] Worker not ready (503), retry ${attempt}/${retries} in ${delay}ms`);
        await sleep(delay);
        continue;
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      // Don't retry on abort (timeout)
      if (lastError.name === 'AbortError') {
        throw new Error(`Request timed out after ${TIMEOUT_MS}ms`);
      }

      // Retry on network errors
      if (attempt < retries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[MEDIA-DOWNLOAD] Network error, retry ${attempt}/${retries} in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const telegramMessageId = searchParams.get('telegram_message_id');
    const telegramChatId = searchParams.get('telegram_chat_id');

    // Validate required params
    if (!telegramMessageId || !telegramChatId) {
      console.error('[MEDIA-DOWNLOAD] Missing required params');
      return NextResponse.json(
        { error: 'Missing telegram_message_id or telegram_chat_id' },
        { status: 400 }
      );
    }

    // Validate params are valid numbers
    const msgId = parseInt(telegramMessageId, 10);
    const chatId = parseInt(telegramChatId, 10);

    if (isNaN(msgId) || isNaN(chatId)) {
      console.error(`[MEDIA-DOWNLOAD] Invalid params: msgId=${telegramMessageId}, chatId=${telegramChatId}`);
      return NextResponse.json(
        { error: 'Invalid telegram_message_id or telegram_chat_id format' },
        { status: 400 }
      );
    }

    // Build worker URL
    const workerUrl = `${SYNC_WORKER_URL}/download?telegram_message_id=${msgId}&telegram_chat_id=${chatId}`;
    console.log(`[MEDIA-DOWNLOAD] Request: chat=${chatId}, msg=${msgId}`);

    // Fetch with retry
    const response = await fetchWithRetry(workerUrl, { method: 'GET' });

    if (!response.ok) {
      let errorMessage = `Worker returned ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Response wasn't JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      console.error(`[MEDIA-DOWNLOAD] Worker error: ${response.status} - ${errorMessage}`);

      // Return appropriate status code
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Media not found - message may have been deleted' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Get content type and filename from worker response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition') || '';

    // Stream the response body
    const blob = await response.blob();
    const elapsed = Date.now() - startTime;

    console.log(`[MEDIA-DOWNLOAD] Success: chat=${chatId}, msg=${msgId}, size=${blob.size}, time=${elapsed}ms`);

    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition || `inline; filename="media_${msgId}"`,
        'Content-Length': blob.size.toString(),
        // Cache for 24 hours - media doesn't change
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[MEDIA-DOWNLOAD] Failed after ${elapsed}ms:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Categorize error for user-friendly message
    if (errorMessage.includes('timed out')) {
      return NextResponse.json(
        { error: 'Download timed out - please try again' },
        { status: 504 }
      );
    }

    if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Download service temporarily unavailable - please try again' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to download media - please try again' },
      { status: 500 }
    );
  }
}
