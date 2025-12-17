import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';

/**
 * GET /api/tone-profile
 *
 * Retrieves tone profile(s) for generating draft replies.
 *
 * Query params:
 * - tagId: Get profile for a specific tag (optional)
 *          If not provided, returns the global profile
 * - fallback: If true (default), falls back to global profile when tag-specific not found
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tagId');
    const fallback = searchParams.get('fallback') !== 'false'; // Default true

    let profile = null;

    // Try to get tag-specific profile first
    if (tagId) {
      profile = await prisma.toneProfile.findUnique({
        where: { tagId },
        include: {
          tag: {
            select: {
              id: true,
              name: true,
              color: true,
            },
          },
        },
      });
    }

    // If no tag-specific profile found (or no tagId provided), get global profile
    if (!profile && (fallback || !tagId)) {
      profile = await prisma.toneProfile.findFirst({
        where: { tagId: null },
      });
    }

    if (!profile) {
      return NextResponse.json({
        exists: false,
        profile: null,
        message: 'No tone profile found. Use POST /api/tone-profile/build to create one.',
      });
    }

    return NextResponse.json({
      exists: true,
      profile: {
        id: profile.id,
        tagId: profile.tagId,
        tag: 'tag' in profile ? profile.tag : null,
        greetingPatterns: profile.greetingPatterns,
        signOffPatterns: profile.signOffPatterns,
        emojiFrequency: profile.emojiFrequency,
        formalityLevel: profile.formalityLevel,
        averageLength: profile.averageLength,
        commonPhrases: profile.commonPhrases,
        sampleCount: profile.sampleCount,
        sampleMessages: profile.sampleMessages,
        builtAt: profile.builtAt,
        isGlobal: profile.tagId === null,
      },
    });
  } catch (error) {
    console.error('Error fetching tone profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tone profile' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tone-profile
 *
 * Deletes a tone profile.
 *
 * Query params:
 * - tagId: Delete profile for a specific tag (optional)
 *          If not provided, deletes the global profile
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tagId = searchParams.get('tagId');

    if (tagId) {
      await prisma.toneProfile.delete({
        where: { tagId },
      });
    } else {
      // Delete global profile
      const globalProfile = await prisma.toneProfile.findFirst({
        where: { tagId: null },
      });

      if (globalProfile) {
        await prisma.toneProfile.delete({
          where: { id: globalProfile.id },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${tagId ? 'tag-specific' : 'global'} tone profile`,
    });
  } catch (error) {
    console.error('Error deleting tone profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete tone profile' },
      { status: 500 }
    );
  }
}
