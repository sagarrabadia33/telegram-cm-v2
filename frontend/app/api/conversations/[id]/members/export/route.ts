import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/conversations/[id]/members/export
 *
 * Exports group/channel members as a CSV file
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get conversation to verify it exists and is a group/channel
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
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
        { error: 'Only groups and channels have members' },
        { status: 400 }
      );
    }

    // Fetch all members
    const members = await prisma.groupMember.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    if (members.length === 0) {
      return NextResponse.json(
        { error: 'No members found for this group' },
        { status: 404 }
      );
    }

    // Generate CSV content
    const headers = ['Full Name', 'Username', 'First Name', 'Last Name', 'Role', 'Telegram ID', 'Joined At'];
    const rows = members.map(member => {
      const fullName = [member.firstName, member.lastName].filter(Boolean).join(' ') || member.username || '';
      return [
        fullName,
        member.username ? `@${member.username}` : '',
        member.firstName || '',
        member.lastName || '',
        member.role || 'member',
        member.externalUserId,
        member.joinedAt ? member.joinedAt.toISOString().split('T')[0] : '',
      ];
    });

    // Escape CSV values
    const escapeCSV = (value: string) => {
      if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(escapeCSV).join(',')),
    ].join('\n');

    // Create filename
    const safeName = (conversation.title || 'group')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const filename = `${safeName}_members_${new Date().toISOString().split('T')[0]}.csv`;

    // Return as downloadable CSV
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Failed to export members:', error);
    return NextResponse.json(
      { error: 'Failed to export members' },
      { status: 500 }
    );
  }
}
