import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET /api/conversations/[id]/tags - Get tags for a conversation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;

    // Get direct conversation tags
    const conversationTags = await prisma.conversationTag.findMany({
      where: { conversationId },
      include: {
        tag: true,
      },
    });

    // Get conversation to check if it has a linked contact
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { contactId: true },
    });

    // Get inherited contact tags if conversation has a contact
    let contactTags: typeof conversationTags = [];
    if (conversation?.contactId) {
      const contactTagRecords = await prisma.contactTag.findMany({
        where: { contactId: conversation.contactId },
        include: {
          tag: true,
        },
      });
      contactTags = contactTagRecords.map((ct) => ({
        id: ct.id,
        conversationId: conversationId,
        tagId: ct.tagId,
        createdAt: ct.addedAt,
        tag: ct.tag,
      }));
    }

    // Combine and deduplicate tags
    const allTags = [...conversationTags, ...contactTags];
    const uniqueTags = allTags.reduce((acc, curr) => {
      if (!acc.find((t) => t.tagId === curr.tagId)) {
        acc.push(curr);
      }
      return acc;
    }, [] as typeof allTags);

    return NextResponse.json({
      success: true,
      data: uniqueTags.map((t) => ({
        id: t.tag.id,
        name: t.tag.name,
        color: t.tag.color,
        description: t.tag.description,
        category: t.tag.category,
        // Flag if this is a direct or inherited tag
        isDirect: conversationTags.some((ct) => ct.tagId === t.tagId),
        isInherited: contactTags.some((ct) => ct.tagId === t.tagId),
      })),
    });
  } catch (error) {
    console.error('Error fetching conversation tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

// POST /api/conversations/[id]/tags - Add a tag to a conversation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { tagId } = body;

    if (!tagId) {
      return NextResponse.json(
        { error: 'Tag ID is required' },
        { status: 400 }
      );
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
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

    // Check if already assigned
    const existing = await prisma.conversationTag.findUnique({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Tag is already assigned to this conversation' },
        { status: 409 }
      );
    }

    // Create the tag assignment
    await prisma.conversationTag.create({
      data: {
        conversationId,
        tagId,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Tag added successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error adding tag:', error);
    return NextResponse.json(
      { error: 'Failed to add tag' },
      { status: 500 }
    );
  }
}

// PUT /api/conversations/[id]/tags - Replace all tags for a conversation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const body = await request.json();
    const { tagIds } = body;

    if (!Array.isArray(tagIds)) {
      return NextResponse.json(
        { error: 'tagIds must be an array' },
        { status: 400 }
      );
    }

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify all tags exist
    if (tagIds.length > 0) {
      const existingTags = await prisma.tag.findMany({
        where: { id: { in: tagIds } },
        select: { id: true },
      });

      if (existingTags.length !== tagIds.length) {
        return NextResponse.json(
          { error: 'One or more tags not found' },
          { status: 404 }
        );
      }
    }

    // Use a transaction to replace all tags
    await prisma.$transaction(async (tx) => {
      // Delete all existing conversation tags
      await tx.conversationTag.deleteMany({
        where: { conversationId },
      });

      // Create new tag assignments
      if (tagIds.length > 0) {
        await tx.conversationTag.createMany({
          data: tagIds.map((tagId: string) => ({
            conversationId,
            tagId,
          })),
        });
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Tags updated successfully',
    });
  } catch (error) {
    console.error('Error updating tags:', error);
    return NextResponse.json(
      { error: 'Failed to update tags' },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations/[id]/tags?tagId=xxx - Remove a tag from a conversation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tagId');

    if (!tagId) {
      return NextResponse.json(
        { error: 'Tag ID is required as query parameter' },
        { status: 400 }
      );
    }

    // Try to delete from conversation tags first
    const deleted = await prisma.conversationTag.deleteMany({
      where: {
        conversationId,
        tagId,
      },
    });

    if (deleted.count === 0) {
      // Check if it's an inherited tag from contact
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { contactId: true },
      });

      if (conversation?.contactId) {
        const contactTagDeleted = await prisma.contactTag.deleteMany({
          where: {
            contactId: conversation.contactId,
            tagId,
          },
        });

        if (contactTagDeleted.count > 0) {
          return NextResponse.json({
            success: true,
            message: 'Inherited tag removed from contact',
          });
        }
      }

      return NextResponse.json(
        { error: 'Tag assignment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Tag removed successfully',
    });
  } catch (error) {
    console.error('Error removing tag:', error);
    return NextResponse.json(
      { error: 'Failed to remove tag' },
      { status: 500 }
    );
  }
}
