import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * POST /api/contacts/bulk-tag
 * Add a tag to multiple conversations at once
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationIds, tagId } = body as {
      conversationIds: string[];
      tagId: string;
    };

    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return NextResponse.json(
        { error: 'conversationIds must be a non-empty array' },
        { status: 400 }
      );
    }

    if (!tagId) {
      return NextResponse.json(
        { error: 'tagId is required' },
        { status: 400 }
      );
    }

    // Verify tag exists
    const tag = await prisma.tag.findUnique({
      where: { id: tagId },
    });

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag not found' },
        { status: 404 }
      );
    }

    // Get existing tag assignments for these conversations
    const existingAssignments = await prisma.conversationTag.findMany({
      where: {
        conversationId: { in: conversationIds },
        tagId,
      },
      select: { conversationId: true },
    });

    const existingConversationIds = new Set(
      existingAssignments.map((a) => a.conversationId)
    );

    // Filter out conversations that already have this tag
    const newConversationIds = conversationIds.filter(
      (id) => !existingConversationIds.has(id)
    );

    if (newConversationIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All conversations already have this tag',
        added: 0,
        skipped: conversationIds.length,
      });
    }

    // Create tag assignments for conversations that don't have the tag
    const result = await prisma.conversationTag.createMany({
      data: newConversationIds.map((conversationId) => ({
        conversationId,
        tagId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({
      success: true,
      message: `Tag added to ${result.count} conversations`,
      added: result.count,
      skipped: existingConversationIds.size,
    });
  } catch (error) {
    console.error('Error in bulk tag:', error);
    return NextResponse.json(
      {
        error: 'Failed to add tag to conversations',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
