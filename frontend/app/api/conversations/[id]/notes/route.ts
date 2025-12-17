import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * Trigger AI re-analysis for a conversation in the background
 * This is a fire-and-forget function - errors are silently ignored
 */
async function triggerAIReanalysis(conversationId: string): Promise<void> {
  try {
    // Get the conversation to find its AI-enabled tag
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        tags: {
          select: {
            tag: {
              select: { id: true, aiEnabled: true }
            }
          }
        }
      }
    });

    // Find the first AI-enabled tag
    const aiEnabledTag = conversation?.tags.find(t => t.tag.aiEnabled);
    if (!aiEnabledTag) return; // No AI-enabled tag, skip

    // Call the analyze API internally (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    fetch(`${baseUrl}/api/ai/analyze-conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tagId: aiEnabledTag.tag.id,
        conversationIds: [conversationId],
        forceRefresh: true,
      }),
    }).catch(() => {
      // Silently ignore - will be picked up in next batch analysis
    });
  } catch {
    // Silently ignore errors
  }
}

/**
 * Notes Timeline API
 *
 * Provides CRUD operations for conversation notes with timeline support.
 * Notes are stored in the ConversationNote table with types: note, meeting, call, file
 */

export interface NoteEntry {
  id: string;
  type: 'note' | 'meeting' | 'call' | 'file';
  title?: string | null;
  content: string;
  fileName?: string | null;
  fileUrl?: string | null;
  fileMimeType?: string | null;
  fileSize?: number | null;
  eventAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * GET /api/conversations/[id]/notes
 * Retrieves all notes for a conversation (timeline format)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, metadata: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Get all notes for this conversation
    const notes = await prisma.conversationNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });

    // If no notes exist, check for legacy notes in metadata and migrate them
    if (notes.length === 0) {
      const metadata = conversation.metadata as Record<string, unknown> | null;
      const legacyNotes = metadata?.notes as string | null;

      if (legacyNotes && legacyNotes.trim()) {
        // Migrate legacy note to new format
        const migratedNote = await prisma.conversationNote.create({
          data: {
            conversationId,
            type: 'note',
            content: legacyNotes.trim(),
          },
        });

        return NextResponse.json({
          success: true,
          data: {
            notes: [formatNote(migratedNote)],
            migrated: true,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        notes: notes.map(formatNote),
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
 * POST /api/conversations/[id]/notes
 * Creates a new note
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { type = 'note', title, content, fileName, fileUrl, fileMimeType, fileSize, eventAt } = body;

    // Validate required fields - content is required unless there's a file
    const hasContent = content && typeof content === 'string' && content.trim();
    const hasFile = fileUrl && fileName;

    if (!hasContent && !hasFile) {
      return NextResponse.json(
        { error: 'Content or file attachment is required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['note', 'meeting', 'call', 'file'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid note type' },
        { status: 400 }
      );
    }

    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Create the note
    const note = await prisma.conversationNote.create({
      data: {
        conversationId,
        type,
        title: title?.trim() || null,
        content: hasContent ? content.trim() : '', // Allow empty content for file-only notes
        fileName: fileName || null,
        fileUrl: fileUrl || null,
        fileMimeType: fileMimeType || null,
        fileSize: fileSize || null,
        eventAt: eventAt ? new Date(eventAt) : null,
      },
    });

    // SMART TRIGGER: Mark conversation for AI re-analysis when note is added
    // Notes are high-signal user-added context that should update AI recommendations
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        // Clear the last analyzed message ID to force re-analysis
        // This ensures the new note context is included in the next AI analysis
        aiLastAnalyzedMsgId: null,
      },
    });

    // Optionally trigger immediate re-analysis in background (non-blocking)
    // This is fire-and-forget - we don't wait for it
    triggerAIReanalysis(conversationId).catch(() => {
      // Silently ignore errors - analysis will happen on next batch
    });

    return NextResponse.json({
      success: true,
      data: formatNote(note),
    });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Failed to create note' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/conversations/[id]/notes
 * Legacy endpoint for backward compatibility - updates or creates a single note
 * Used by the old auto-save textarea (can be removed after migration)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();

    // Handle legacy single-note format
    if ('notes' in body && typeof body.notes === 'string') {
      const { notes } = body;

      // Get existing conversation
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, metadata: true },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 }
        );
      }

      // Update legacy metadata (for backward compatibility)
      const existingMetadata = (conversation.metadata as Record<string, unknown>) || {};
      const now = new Date().toISOString();

      const updatedMetadata = {
        ...existingMetadata,
        notes: notes.trim(),
        notesUpdatedAt: now,
      };

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { metadata: updatedMetadata },
      });

      return NextResponse.json({
        success: true,
        data: {
          notes: notes.trim(),
          updatedAt: now,
        },
      });
    }

    // Handle new note update format
    const { id: noteId, type, title, content, fileName, fileUrl, fileMimeType, fileSize, eventAt } = body;

    if (!noteId) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      );
    }

    // Find and update the note
    const existingNote = await prisma.conversationNote.findFirst({
      where: { id: noteId, conversationId },
    });

    if (!existingNote) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    const updatedNote = await prisma.conversationNote.update({
      where: { id: noteId },
      data: {
        ...(type && { type }),
        ...(title !== undefined && { title: title?.trim() || null }),
        ...(content && { content: content.trim() }),
        ...(fileName !== undefined && { fileName }),
        ...(fileUrl !== undefined && { fileUrl }),
        ...(fileMimeType !== undefined && { fileMimeType }),
        ...(fileSize !== undefined && { fileSize }),
        ...(eventAt !== undefined && { eventAt: eventAt ? new Date(eventAt) : null }),
      },
    });

    return NextResponse.json({
      success: true,
      data: formatNote(updatedNote),
    });
  } catch (error) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { error: 'Failed to update note' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[id]/notes
 * Deletes a note by ID (passed in request body)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { noteId } = body;

    if (!noteId) {
      return NextResponse.json(
        { error: 'Note ID is required' },
        { status: 400 }
      );
    }

    // Find and delete the note
    const existingNote = await prisma.conversationNote.findFirst({
      where: { id: noteId, conversationId },
    });

    if (!existingNote) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    await prisma.conversationNote.delete({
      where: { id: noteId },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true, noteId },
    });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}

// Helper function to format note for API response
function formatNote(note: {
  id: string;
  type: string;
  title: string | null;
  content: string;
  fileName: string | null;
  fileUrl: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  eventAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NoteEntry {
  return {
    id: note.id,
    type: note.type as NoteEntry['type'],
    title: note.title,
    content: note.content,
    fileName: note.fileName,
    fileUrl: note.fileUrl,
    fileMimeType: note.fileMimeType,
    fileSize: note.fileSize,
    eventAt: note.eventAt?.toISOString() || null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
