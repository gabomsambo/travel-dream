import { NextRequest, NextResponse } from 'next/server';
import { updateCollection } from '@/lib/db-mutations';
import { getCollectionById } from '@/lib/db-queries';
import sharp from 'sharp';
import { writeFile, mkdir, unlink, rm } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

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
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const filename = `cover.${ext}`;
    const thumbnailFilename = 'cover_thumb.jpg';

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'collections', collectionId);
    await mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, filename);
    const thumbnailPath = path.join(uploadsDir, thumbnailFilename);

    // Remove old cover files if they exist
    const files = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp', 'cover.heic', 'cover_thumb.jpg'];
    for (const f of files) {
      const oldPath = path.join(uploadsDir, f);
      if (existsSync(oldPath)) {
        try {
          await unlink(oldPath);
        } catch {
          // Ignore errors
        }
      }
    }

    const image = sharp(buffer);

    // Save original
    await writeFile(filePath, buffer);

    // Generate thumbnail
    await image
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toFile(thumbnailPath);

    const coverImageUrl = `/uploads/collections/${collectionId}/${filename}`;
    const thumbnailUrl = `/uploads/collections/${collectionId}/${thumbnailFilename}`;

    // Update collection with new cover
    await updateCollection(collectionId, { coverImageUrl });

    return NextResponse.json({
      status: 'success',
      coverImageUrl,
      thumbnailUrl,
      message: 'Cover image uploaded successfully',
    });
  } catch (error) {
    console.error('Cover upload error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collectionId } = await params;

    const collection = await getCollectionById(collectionId);
    if (!collection) {
      return NextResponse.json(
        { status: 'error', message: 'Collection not found' },
        { status: 404 }
      );
    }

    // Remove cover files
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'collections', collectionId);
    if (existsSync(uploadsDir)) {
      try {
        await rm(uploadsDir, { recursive: true });
      } catch {
        // Ignore errors
      }
    }

    // Set coverImageUrl to null
    await updateCollection(collectionId, { coverImageUrl: null });

    return NextResponse.json({
      status: 'success',
      message: 'Cover image removed successfully',
    });
  } catch (error) {
    console.error('Cover delete error:', error);
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Delete failed',
      },
      { status: 500 }
    );
  }
}
