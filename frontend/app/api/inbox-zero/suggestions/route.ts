import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// GET /api/inbox-zero/suggestions - List pending tag suggestions
export async function GET() {
  try {
    const suggestions = await prisma.tagSuggestion.findMany({
      where: {
        status: 'pending',
        confidence: { gte: 0.7 },
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
        tag: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: { confidence: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      suggestions: suggestions.map(s => ({
        id: s.id,
        conversationId: s.conversationId,
        contactName: s.conversation.contact?.displayName ||
                     s.conversation.contact?.firstName ||
                     s.conversation.title || 'Unknown',
        suggestedTag: {
          id: s.tag.id,
          name: s.tag.name,
          color: s.tag.color,
        },
        reason: s.reason,
        confidence: s.confidence,
        signalType: s.signalType,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
