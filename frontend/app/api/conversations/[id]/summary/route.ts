import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { shouldExcludeFromSummary } from '@/app/lib/ai-summary';

/**
 * POST /api/conversations/[id]/summary
 *
 * Triggers tag-aware AI analysis for consistency with Contact Modal.
 * Uses the analyze-conversations API internally to ensure same analysis everywhere.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Get conversation with AI-enabled tag
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        title: true,
        tags: {
          select: {
            tag: {
              select: {
                id: true,
                name: true,
                aiEnabled: true,
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

    // Check if conversation should be excluded
    if (shouldExcludeFromSummary(conversation.title)) {
      return NextResponse.json(
        { error: `Conversation "${conversation.title}" is excluded from analysis` },
        { status: 400 }
      );
    }

    // Find AI-enabled tag for this conversation
    const aiEnabledTag = conversation.tags.find(t => t.tag.aiEnabled);

    if (!aiEnabledTag) {
      return NextResponse.json(
        { error: 'No AI-enabled tag found for this conversation. Please add a tag (Partner, Customer, Prospect, etc.) first.' },
        { status: 400 }
      );
    }

    // Clear last analyzed message ID to force re-analysis
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { aiLastAnalyzedMsgId: null },
    });

    // Call the analyze-conversations API internally for tag-aware analysis
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const analyzeResponse = await fetch(`${baseUrl}/api/ai/analyze-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId: aiEnabledTag.tag.id,
        conversationIds: [conversationId],
        forceRefresh: true,
      }),
    });

    if (!analyzeResponse.ok) {
      const errorData = await analyzeResponse.json();
      throw new Error(errorData.error || 'Analysis failed');
    }

    // Fetch the updated conversation with all AI fields
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        // Intelligent analysis fields (tag-aware)
        aiSummary: true,
        aiStatus: true,
        aiAction: true,
        aiUrgencyLevel: true,
        aiSuggestedAction: true,
        aiStatusReason: true,
        aiHealthScore: true,
        aiChurnRisk: true,
        aiSentiment: true,
        aiAnalyzedTagName: true,
        aiSummaryUpdatedAt: true,
        // Legacy summary fields
        summary: true,
        sentiment: true,
        intentLevel: true,
        keyPoints: true,
        lastTopic: true,
        summaryGeneratedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Analysis regenerated successfully',
      data: {
        // Intelligent analysis (primary)
        aiSummary: updatedConversation?.aiSummary,
        aiStatus: updatedConversation?.aiStatus,
        aiAction: updatedConversation?.aiAction,
        aiUrgencyLevel: updatedConversation?.aiUrgencyLevel,
        aiSuggestedAction: updatedConversation?.aiSuggestedAction,
        aiStatusReason: updatedConversation?.aiStatusReason,
        aiHealthScore: updatedConversation?.aiHealthScore,
        aiChurnRisk: updatedConversation?.aiChurnRisk,
        aiSentiment: updatedConversation?.aiSentiment,
        aiAnalyzedTagName: updatedConversation?.aiAnalyzedTagName,
        aiSummaryUpdatedAt: updatedConversation?.aiSummaryUpdatedAt?.toISOString(),
        // Legacy fields for backward compatibility
        summary: updatedConversation?.aiSummary || updatedConversation?.summary,
        sentiment: updatedConversation?.aiSentiment || updatedConversation?.sentiment,
        intentLevel: updatedConversation?.intentLevel,
        keyPoints: updatedConversation?.keyPoints || [],
        lastTopic: updatedConversation?.lastTopic,
        summaryGeneratedAt: updatedConversation?.aiSummaryUpdatedAt?.toISOString() || updatedConversation?.summaryGeneratedAt?.toISOString(),
        fromCache: false,
      },
    });
  } catch (error) {
    console.error('Error generating analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate analysis',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/conversations/[id]/summary
 *
 * Returns both intelligent analysis (tag-aware) and legacy summary fields.
 * Prioritizes intelligent analysis fields when available.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Get existing summary and intelligent analysis
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        // Intelligent analysis fields (tag-aware) - PRIMARY
        aiSummary: true,
        aiStatus: true,
        aiAction: true,
        aiUrgencyLevel: true,
        aiSuggestedAction: true,
        aiStatusReason: true,
        aiHealthScore: true,
        aiChurnRisk: true,
        aiSentiment: true,
        aiAnalyzedTagName: true,
        aiSummaryUpdatedAt: true,
        // Legacy summary fields - FALLBACK
        summary: true,
        sentiment: true,
        intentLevel: true,
        keyPoints: true,
        lastTopic: true,
        summaryGeneratedAt: true,
        // Tags for context
        tags: {
          select: {
            tag: {
              select: {
                name: true,
                aiEnabled: true,
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

    // Check if we have any analysis (either intelligent or legacy)
    const hasIntelligentAnalysis = conversation.aiSummary || conversation.aiStatus;
    const hasLegacySummary = conversation.summary;

    if (!hasIntelligentAnalysis && !hasLegacySummary) {
      // Return success with null data instead of 404 to prevent console errors
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No analysis available for this conversation',
      });
    }

    // Calculate new messages since last analysis
    const lastAnalyzedAt = conversation.aiSummaryUpdatedAt || conversation.summaryGeneratedAt;
    let newMessageCount = 0;
    if (lastAnalyzedAt) {
      newMessageCount = await prisma.message.count({
        where: {
          conversationId,
          sentAt: {
            gt: lastAnalyzedAt,
          },
        },
      });
    }

    // Get AI-enabled tag info
    const aiEnabledTag = conversation.tags.find(t => t.tag.aiEnabled);

    return NextResponse.json({
      success: true,
      data: {
        // Intelligent analysis (primary) - shown in UI
        aiSummary: conversation.aiSummary,
        aiStatus: conversation.aiStatus,
        aiAction: conversation.aiAction,
        aiUrgencyLevel: conversation.aiUrgencyLevel,
        aiSuggestedAction: conversation.aiSuggestedAction,
        aiStatusReason: conversation.aiStatusReason,
        aiHealthScore: conversation.aiHealthScore,
        aiChurnRisk: conversation.aiChurnRisk,
        aiSentiment: conversation.aiSentiment,
        aiAnalyzedTagName: conversation.aiAnalyzedTagName || aiEnabledTag?.tag.name,
        aiSummaryUpdatedAt: conversation.aiSummaryUpdatedAt?.toISOString(),
        hasAITag: !!aiEnabledTag,
        // Legacy fields for backward compatibility
        summary: conversation.aiSummary || conversation.summary,
        sentiment: conversation.aiSentiment || conversation.sentiment,
        intentLevel: conversation.intentLevel,
        keyPoints: conversation.keyPoints || [],
        lastTopic: conversation.lastTopic,
        summaryGeneratedAt: conversation.aiSummaryUpdatedAt?.toISOString() || conversation.summaryGeneratedAt?.toISOString(),
        newMessagesSinceGenerated: newMessageCount,
      },
    });
  } catch (error) {
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary' },
      { status: 500 }
    );
  }
}
