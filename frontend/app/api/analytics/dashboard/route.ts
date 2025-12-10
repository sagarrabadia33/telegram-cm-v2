import { NextResponse } from 'next/server';
import { getDashboardMetrics, aggregateDailyMetrics } from '@/app/lib/analytics/server';

export async function GET() {
  try {
    const metrics = await getDashboardMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Analytics dashboard API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}

// POST endpoint to trigger daily aggregation (can be called by cron)
export async function POST() {
  try {
    await aggregateDailyMetrics();
    return NextResponse.json({ success: true, message: 'Daily metrics aggregated' });
  } catch (error) {
    console.error('Analytics aggregation error:', error);
    return NextResponse.json(
      { error: 'Failed to aggregate metrics' },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
