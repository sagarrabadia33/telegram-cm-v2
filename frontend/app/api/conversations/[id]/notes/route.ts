import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/conversations/[id]/notes
 * Retrieves the notes for a conversation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        metadata: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Extract notes from metadata
    const metadata = conversation.metadata as Record<string, unknown> | null;
    const notes = metadata?.notes as string | null;

    return NextResponse.json({
      success: true,
      data: {
        notes: notes || '',
        updatedAt: metadata?.notesUpdatedAt || null,
      },
    });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/conversations/[id]/notes
 * Updates the notes for a conversation
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { notes } = body;

    if (typeof notes !== 'string') {
      return NextResponse.json(
        { error: 'Notes must be a string' },
        { status: 400 }
      );
    }

    // Get existing conversation
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        metadata: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Merge new notes with existing metadata
    const existingMetadata = (conversation.metadata as Record<string, unknown>) || {};
    const now = new Date().toISOString();

    const updatedMetadata = {
      ...existingMetadata,
      notes: notes.trim(),
      notesUpdatedAt: now,
    };

    // Update the conversation
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        metadata: updatedMetadata,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        notes: notes.trim(),
        updatedAt: now,
      },
    });
  } catch (error) {
    console.error('Error updating notes:', error);
    return NextResponse.json(
      { error: 'Failed to update notes' },
      { status: 500 }
    );
  }
}
