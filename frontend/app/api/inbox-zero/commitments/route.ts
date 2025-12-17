import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET /api/inbox-zero/commitments - List commitments
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const direction = searchParams.get('direction'); // 'outbound' | 'inbound'

    const commitments = await prisma.commitment.findMany({
      where: {
        status,
        ...(direction ? { direction } : {}),
      },
      include: {
        conversation: {
          select: {
            id: true,
            title: true,
            contact: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: [
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Categorize by due date
    const now = new Date();
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const categorized = {
      overdue: commitments.filter(c => c.dueDate && c.dueDate < now),
      dueToday: commitments.filter(c => c.dueDate && c.dueDate >= now && c.dueDate <= todayEnd),
      upcoming: commitments.filter(c => !c.dueDate || c.dueDate > todayEnd),
    };

    return NextResponse.json({
      total: commitments.length,
      ...categorized,
      all: commitments.map(c => ({
        id: c.id,
        content: c.content,
        extractedFrom: c.extractedFrom,
        dueDate: c.dueDate,
        direction: c.direction,
        status: c.status,
        conversationId: c.conversationId,
        contactName: c.conversation.contact?.displayName ||
                     c.conversation.contact?.firstName ||
                     c.conversation.title || 'Unknown',
        isManual: c.isManual,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching commitments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commitments' },
      { status: 500 }
    );
  }
}

// POST /api/inbox-zero/commitments - Create manual commitment
export async function POST(request: NextRequest) {
  try {
    const { conversationId, content, dueDate, direction = 'outbound' } = await request.json();

    if (!conversationId || !content) {
      return NextResponse.json(
        { error: 'conversationId and content are required' },
        { status: 400 }
      );
    }

    const commitment = await prisma.commitment.create({
      data: {
        conversationId,
        content,
        dueDate: dueDate ? new Date(dueDate) : null,
        direction,
        isManual: true,
      },
    });

    return NextResponse.json(commitment);
  } catch (error) {
    console.error('Error creating commitment:', error);
    return NextResponse.json(
      { error: 'Failed to create commitment' },
      { status: 500 }
    );
  }
}
