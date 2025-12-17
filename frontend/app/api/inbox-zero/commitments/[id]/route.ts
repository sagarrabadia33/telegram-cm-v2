import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

// PATCH /api/inbox-zero/commitments/[id] - Update commitment status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, content, dueDate } = await request.json();

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
    }

    if (content !== undefined) {
      updateData.content = content;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    const commitment = await prisma.commitment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(commitment);
  } catch (error) {
    console.error('Error updating commitment:', error);
    return NextResponse.json(
      { error: 'Failed to update commitment' },
      { status: 500 }
    );
  }
}

// DELETE /api/inbox-zero/commitments/[id] - Delete commitment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.commitment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting commitment:', error);
    return NextResponse.json(
      { error: 'Failed to delete commitment' },
      { status: 500 }
    );
  }
}
