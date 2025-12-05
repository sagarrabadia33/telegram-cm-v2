import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET /api/tags - List all tags with counts
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      include: {
        _count: {
          select: {
            contacts: true,
            conversations: true,
          },
        },
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      data: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
        description: tag.description,
        category: tag.category,
        contactCount: tag._count.contacts,
        conversationCount: tag._count.conversations,
      })),
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tags' },
      { status: 500 }
    );
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, color, description, category } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Tag name is required' },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = await prisma.tag.findUnique({
      where: { name: name.trim() },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A tag with this name already exists' },
        { status: 409 }
      );
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color || null,
        description: description || null,
        category: category || null,
      },
    });

    return NextResponse.json({
      success: true,
      data: tag,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating tag:', error);
    return NextResponse.json(
      { error: 'Failed to create tag' },
      { status: 500 }
    );
  }
}
