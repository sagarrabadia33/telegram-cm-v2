import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/prisma';
import { randomUUID } from 'crypto';

/**
 * POST /api/upload
 *
 * LINEAR-STYLE FILE UPLOAD: Simple, reliable file storage
 *
 * Accepts multipart/form-data with a file field.
 * Stores file metadata in FileUpload table.
 * Returns a storage key that can be used in OutgoingMessage.attachmentUrl
 *
 * For now, stores as base64 in database (simple, works everywhere).
 * Can be upgraded to S3/Cloudflare R2 for production scale.
 *
 * Supported types (Telegram limits):
 * - photo: jpg, png, gif (up to 10MB)
 * - document: any file (up to 50MB)
 * - video: mp4, etc (up to 50MB)
 * - audio: mp3, etc (up to 50MB)
 * - voice: ogg (up to 1MB)
 *
 * Response:
 * {
 *   success: true,
 *   file: {
 *     id: string,
 *     filename: string,
 *     mimeType: string,
 *     size: number,
 *     storageKey: string,
 *     type: 'photo' | 'document' | 'video' | 'audio' | 'voice'
 *   }
 * }
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (Telegram limit)

// Determine Telegram attachment type from MIME
function getAttachmentType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'photo';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType === 'audio/ogg') return 'voice';
  return 'document';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Read file as base64 for storage
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    // Generate unique storage key
    const storageKey = `upload_${randomUUID()}`;

    // Store file metadata and content
    const fileUpload = await prisma.fileUpload.create({
      data: {
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        storageKey,
        storageType: 'database', // Using database storage for simplicity
        metadata: {
          base64Content: base64, // Store in metadata JSON for now
          originalName: file.name,
          uploadedAt: new Date().toISOString(),
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire in 24h
      },
    });

    const attachmentType = getAttachmentType(file.type);

    return NextResponse.json({
      success: true,
      file: {
        id: fileUpload.id,
        filename: fileUpload.filename,
        mimeType: fileUpload.mimeType,
        size: fileUpload.size,
        storageKey: fileUpload.storageKey,
        type: attachmentType,
      },
    });
  } catch (error) {
    console.error('File upload failed:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/upload?key=upload_xxx
 *
 * Retrieve uploaded file content.
 * Used by the Telegram worker to download files before sending.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storageKey = searchParams.get('key');

    if (!storageKey) {
      return NextResponse.json(
        { error: 'Storage key required' },
        { status: 400 }
      );
    }

    const fileUpload = await prisma.fileUpload.findUnique({
      where: { storageKey },
    });

    if (!fileUpload) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (fileUpload.expiresAt && fileUpload.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'File has expired' },
        { status: 410 }
      );
    }

    // Get base64 content from metadata
    const metadata = fileUpload.metadata as { base64Content?: string } | null;
    const base64Content = metadata?.base64Content;

    if (!base64Content) {
      return NextResponse.json(
        { error: 'File content not found' },
        { status: 404 }
      );
    }

    // Return as binary
    const buffer = Buffer.from(base64Content, 'base64');

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': fileUpload.mimeType,
        'Content-Disposition': `attachment; filename="${fileUpload.filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('File retrieval failed:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve file' },
      { status: 500 }
    );
  }
}
