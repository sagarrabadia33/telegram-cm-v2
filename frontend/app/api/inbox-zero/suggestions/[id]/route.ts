import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// POST /api/inbox-zero/suggestions/[id] - Accept or reject suggestion
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { action } = await request.json(); // 'accept' | 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use "accept" or "reject"' },
        { status: 400 }
      );
    }

    const suggestion = await prisma.tagSuggestion.findUnique({
      where: { id },
      include: { tag: true },
    });

    if (!suggestion) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    if (action === 'accept') {
      // Apply the tag to the conversation
      await prisma.conversationTag.upsert({
        where: {
          conversationId_tagId: {
            conversationId: suggestion.conversationId,
            tagId: suggestion.tagId,
          },
        },
        create: {
          conversationId: suggestion.conversationId,
          tagId: suggestion.tagId,
        },
        update: {}, // No update needed if exists
      });
    }

    // Update suggestion status
    await prisma.tagSuggestion.update({
      where: { id },
      data: {
        status: action === 'accept' ? 'accepted' : 'rejected',
      },
    });

    return NextResponse.json({
      success: true,
      action,
      tagApplied: action === 'accept',
    });
  } catch (error) {
    console.error('Error processing suggestion:', error);
    return NextResponse.json(
      { error: 'Failed to process suggestion' },
      { status: 500 }
    );
  }
}
