import { NextRequest, NextResponse } from 'next/server';
import { createAttachment } from '@/lib/db-mutations';
import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: placeId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return NextResponse.json(
        { status: 'error', message: 'No file provided' },
        { status: 400 }
      );
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { status: 'error', message: 'Invalid file type. Only JPEG, PNG, WEBP, HEIC allowed' },
        { status: 400 }
      );
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { status: 'error', message: 'File too large. Max 10MB' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}_${sanitizedName}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'places', placeId);
    const thumbnailsDir = path.join(uploadsDir, 'thumbnails');

    await mkdir(uploadsDir, { recursive: true });
    await mkdir(thumbnailsDir, { recursive: true });

    const filePath = path.join(uploadsDir, filename);
    const thumbnailPath = path.join(thumbnailsDir, filename);

    const image = sharp(buffer);
    const metadata = await image.metadata();

    await writeFile(filePath, buffer);

    await image
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    const uri = `/uploads/places/${placeId}/${filename}`;
    const thumbnailUri = `/uploads/places/${placeId}/thumbnails/${filename}`;

    const attachment = await createAttachment({
      placeId,
      type: 'photo',
      uri,
      filename,
      mimeType: file.type,
      fileSize: file.size,
      width: metadata.width,
      height: metadata.height,
      thumbnailUri,
      caption: caption || undefined,
    });

    return NextResponse.json({
      status: 'success',
      attachment,
      url: uri,
      thumbnailUrl: thumbnailUri,
    });
  } catch (error) {
    console.error('Attachment upload error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
