import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/conversations/[id]/members
 *
 * Returns group/channel members as JSON for @mention autocomplete
 * Optimized for fast autocomplete - lightweight response
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.toLowerCase() || '';

    // Get conversation to verify it exists and is a group/channel
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
      },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      );
    }

    // Verify it's a group or channel
    if (!['group', 'supergroup', 'channel'].includes(conversation.type)) {
      return NextResponse.json(
        { members: [] }, // Return empty for non-groups (graceful degradation)
        { status: 200 }
      );
    }

    // Fetch members with optional search filter
    // If query provided, filter by username, firstName, or lastName
    const members = await prisma.groupMember.findMany({
      where: {
        conversationId: id,
        ...(query && {
          OR: [
            { username: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true,
        externalUserId: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
      },
      orderBy: [
        // Prioritize admins/creators first (like Telegram)
        { role: 'asc' },
        { firstName: 'asc' },
      ],
      take: 15, // Limit for performance
    });

    // Transform to lightweight format for autocomplete
    const formattedMembers = members.map(member => ({
      id: member.id,
      odId: member.externalUserId, // Telegram user ID for mention
      username: member.username,
      firstName: member.firstName,
      lastName: member.lastName,
      // Display name: prefer "FirstName LastName", fallback to username
      displayName: member.firstName
        ? `${member.firstName}${member.lastName ? ' ' + member.lastName : ''}`
        : member.username || 'Unknown',
      // Mention text: prefer @username, fallback to firstName
      mentionText: member.username
        ? `@${member.username}`
        : member.firstName || 'User',
      role: member.role,
      isAdmin: member.role === 'administrator' || member.role === 'creator',
    }));

    return NextResponse.json({
      members: formattedMembers,
      total: formattedMembers.length,
    });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members', members: [] },
      { status: 500 }
    );
  }
}
