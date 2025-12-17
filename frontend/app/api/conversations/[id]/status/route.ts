import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// PATCH /api/conversations/[id]/status - Update manual status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, clearManualOverride } = await request.json();

    // Validate conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, aiStatus: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // If clearing manual override, remove manualStatus and let AI status take over
    if (clearManualOverride) {
      await prisma.conversation.update({
        where: { id },
        data: {
          manualStatus: null,
          manualStatusSetAt: null,
          // Clear any AI recommendation since user accepted AI status
          aiStatusRecommendation: null,
          aiStatusRecommendationReason: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Manual override cleared, AI status will be used',
        effectiveStatus: conversation.aiStatus,
      });
    }

    // Update manual status
    await prisma.conversation.update({
      where: { id },
      data: {
        manualStatus: status,
        manualStatusSetAt: new Date(),
        // Clear AI recommendation if user manually set status to the recommended value
        ...(status ? {
          aiStatusRecommendation: null,
          aiStatusRecommendationReason: null,
        } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Status updated',
      effectiveStatus: status,
    });
  } catch (error) {
    console.error('Error updating status:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

// GET /api/conversations/[id]/status - Get current status info
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        aiStatus: true,
        aiStatusReason: true,
        aiStatusUpdatedAt: true,
        manualStatus: true,
        manualStatusSetAt: true,
        aiStatusRecommendation: true,
        aiStatusRecommendationReason: true,
        tags: {
          include: {
            tag: {
              select: {
                id: true,
                name: true,
                aiStatusOptions: true,
                aiStatusLabels: true,
                aiStatusColors: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get tag-specific status options
    const tagWithConfig = conversation.tags.find(t =>
      t.tag.aiStatusOptions && (t.tag.aiStatusOptions as string[]).length > 0
    )?.tag;

    const statusOptions = tagWithConfig?.aiStatusOptions as string[] | null;
    const statusLabels = tagWithConfig?.aiStatusLabels as Record<string, string> | null;
    const statusColors = tagWithConfig?.aiStatusColors as Record<string, string> | null;

    // Determine effective status (manual override wins)
    const effectiveStatus = conversation.manualStatus || conversation.aiStatus;

    return NextResponse.json({
      effectiveStatus,
      aiStatus: conversation.aiStatus,
      aiStatusReason: conversation.aiStatusReason,
      aiStatusUpdatedAt: conversation.aiStatusUpdatedAt?.toISOString() || null,
      manualStatus: conversation.manualStatus,
      manualStatusSetAt: conversation.manualStatusSetAt?.toISOString() || null,
      hasManualOverride: !!conversation.manualStatus,
      // AI recommendation (when manual status differs from what AI recommends)
      aiStatusRecommendation: conversation.aiStatusRecommendation,
      aiStatusRecommendationReason: conversation.aiStatusRecommendationReason,
      // Tag-specific configuration
      statusOptions: statusOptions || ['needs_owner', 'team_handling', 'resolved', 'at_risk', 'monitoring'],
      statusLabels: statusLabels || {
        needs_owner: 'Needs Owner',
        team_handling: 'Team Handling',
        resolved: 'Resolved',
        at_risk: 'At Risk',
        monitoring: 'Monitoring',
      },
      statusColors: statusColors || {
        needs_owner: 'red',
        team_handling: 'blue',
        resolved: 'green',
        at_risk: 'orange',
        monitoring: 'gray',
      },
    });
  } catch (error) {
    console.error('Error getting status:', error);
    return NextResponse.json(
      { error: 'Failed to get status' },
      { status: 500 }
    );
  }
}
