import { NextRequest, NextResponse } from 'next/server';

/**
 * On-Demand Media Download Proxy
 *
 * Proxies media download requests to the Telegram sync worker.
 * The worker downloads media directly from Telegram API and streams it back.
 *
 * Query params:
 * - telegram_message_id: Telegram message ID containing the media
 * - telegram_chat_id: Telegram chat/channel/user ID
 *
 * Benefits:
 * - Works for ALL messages (historical + new)
 * - No storage costs - media fetched directly from Telegram
 * - 24-hour browser caching after first load
 */

// Sync worker URL - use Railway internal network in production
const SYNC_WORKER_URL = process.env.SYNC_WORKER_URL ||
  (process.env.RAILWAY_ENVIRONMENT
    ? 'http://telegram-sync-worker.railway.internal:8080'
    : 'http://localhost:8080');

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const telegramMessageId = searchParams.get('telegram_message_id');
    const telegramChatId = searchParams.get('telegram_chat_id');

    if (!telegramMessageId || !telegramChatId) {
      return NextResponse.json(
        { error: 'Missing telegram_message_id or telegram_chat_id' },
        { status: 400 }
      );
    }

    // Forward request to sync worker's download endpoint
    const workerUrl = `${SYNC_WORKER_URL}/download?telegram_message_id=${telegramMessageId}&telegram_chat_id=${telegramChatId}`;

    console.log(`[MEDIA-DOWNLOAD] Proxying to: ${workerUrl}`);

    const response = await fetch(workerUrl, {
      method: 'GET',
      // 30 second timeout for large files
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MEDIA-DOWNLOAD] Worker error: ${response.status} - ${errorText}`);
      return NextResponse.json(
        { error: `Download failed: ${errorText}` },
        { status: response.status }
      );
    }

    // Get content type and filename from worker response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentDisposition = response.headers.get('content-disposition') || '';

    // Stream the response body
    const blob = await response.blob();

    console.log(`[MEDIA-DOWNLOAD] Success: ${telegramChatId}/${telegramMessageId} (${blob.size} bytes)`);

    return new NextResponse(blob, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition || `inline; filename="media_${telegramMessageId}"`,
        'Content-Length': blob.size.toString(),
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
      },
    });

  } catch (error) {
    console.error('[MEDIA-DOWNLOAD] Error:', error);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: 'Download timed out - file may be too large' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to download media' },
      { status: 500 }
    );
  }
}
