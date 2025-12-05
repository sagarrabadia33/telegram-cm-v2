import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Serve media files from the root project's public/media folder
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
