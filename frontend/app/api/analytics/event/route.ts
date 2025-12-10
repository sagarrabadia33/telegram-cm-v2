import { NextRequest, NextResponse } from 'next/server';
import { logEventBatch } from '@/app/lib/analytics/server';
import { AnalyticsBatch } from '@/app/lib/analytics/types';

export async function POST(request: NextRequest) {
  try {
    const batch: AnalyticsBatch = await request.json();

    // Validate batch structure
    if (!batch.sessionId || !Array.isArray(batch.events)) {
      return NextResponse.json(
        { error: 'Invalid batch format' },
        { status: 400 }
      );
    }

    // Log events asynchronously (don't wait for completion)
    logEventBatch(batch).catch((error) => {
      console.error('Failed to log analytics events:', error);
    });

    // Return immediately for fast response
    return NextResponse.json({ success: true, eventsReceived: batch.events.length });
  } catch (error) {
    console.error('Analytics event API error:', error);
    return NextResponse.json(
      { error: 'Failed to process analytics events' },
      { status: 500 }
    );
  }
}

// Support for sendBeacon (which uses POST but might not have proper headers)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
