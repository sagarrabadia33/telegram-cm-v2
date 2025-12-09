import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/app/lib/prisma';

// Serve media files from the root project's public/media folder
// Also handles outgoing attachments stored in FileUpload table
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = pathSegments.join('/');

    // Security: only allow files from media folder, no directory traversal
    if (filePath.includes('..')) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // TELEGRAM-STYLE: Handle outgoing attachments from FileUpload table
    // Path format: outgoing/upload_xxx
    if (pathSegments[0] === 'outgoing' && pathSegments[1]?.startsWith('upload_')) {
      const storageKey = pathSegments[1];

      const fileUpload = await prisma.fileUpload.findUnique({
        where: { storageKey },
      });

      if (!fileUpload) {
        return new NextResponse('Not Found', { status: 404 });
      }

      // Check if expired
      if (fileUpload.expiresAt && fileUpload.expiresAt < new Date()) {
        return new NextResponse('File has expired', { status: 410 });
      }

      // Get base64 content from metadata
      const metadata = fileUpload.metadata as { base64Content?: string } | null;
      const base64Content = metadata?.base64Content;

      if (!base64Content) {
        return new NextResponse('File content not found', { status: 404 });
      }

      // Return as binary
      const buffer = Buffer.from(base64Content, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': fileUpload.mimeType,
          'Content-Disposition': `inline; filename="${fileUpload.filename}"`,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        },
      });
    }

    // Build the actual file path - media is in root project's public folder
    const mediaBasePath = path.join(process.cwd(), '..', 'public', 'media');
    const fullPath = path.join(mediaBasePath, filePath);

    // Read the file
    const fileBuffer = await readFile(fullPath);

    // Determine content type
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
    };

    const contentType = contentTypes[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Media file not found:', error);
    return new NextResponse('Not Found', { status: 404 });
  }
}
