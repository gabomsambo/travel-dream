import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';

// Memory optimization for batch processing
process.env.MALLOC_ARENA_MAX = '2';

// Configure Sharp concurrency for optimal performance
sharp.concurrency(4);

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessedImageResult {
  originalPath: string;
  thumbnailPath?: string;
  dimensions: ImageDimensions;
  fileSize: number;
  mimeType: string;
  format: string;
}

export interface StorageConfig {
  maxFileSize: number;
  thumbnailSize: { width: number; height: number };
  allowedFormats: string[];
  quality: number;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  thumbnailSize: { width: 300, height: 300 },
  allowedFormats: ['jpeg', 'jpg', 'png', 'webp', 'heic', 'heif', 'avif', 'tiff'],
  quality: 80,
};

export class FileStorageService {
  private config: StorageConfig;
  private uploadsDir: string;
  private thumbnailsDir: string;

  constructor(config: StorageConfig = DEFAULT_STORAGE_CONFIG) {
    this.config = config;
    this.uploadsDir = path.join(process.cwd(), 'public/uploads/screenshots');
    this.thumbnailsDir = path.join(process.cwd(), 'public/uploads/thumbnails');
  }

  async ensureDirectories(): Promise<void> {
    try {
      await fs.mkdir(this.uploadsDir, { recursive: true });
      await fs.mkdir(this.thumbnailsDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create upload directories: ${error}`);
    }
  }

  validateFile(file: File): { isValid: boolean; error?: string } {
    if (file.size > this.config.maxFileSize) {
      return {
        isValid: false,
        error: `File size ${file.size} exceeds maximum ${this.config.maxFileSize} bytes`,
      };
    }

    const extension = this.getFileExtension(file.name).toLowerCase();
    if (!this.config.allowedFormats.includes(extension)) {
      return {
        isValid: false,
        error: `File format ${extension} not supported. Allowed: ${this.config.allowedFormats.join(', ')}`,
      };
    }

    return { isValid: true };
  }

  async storeFile(file: File, sourceId: string): Promise<ProcessedImageResult> {
    await this.ensureDirectories();

    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const extension = this.getFileExtension(file.name);
    const originalPath = path.join(this.uploadsDir, `${sourceId}.${extension}`);
    const publicPath = `/uploads/screenshots/${sourceId}.${extension}`;

    try {
      // Store original file
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(originalPath, buffer);

      // Process image with Sharp
      const sharpImage = sharp(buffer);
      const metadata = await sharpImage.metadata();

      // Generate thumbnail
      const thumbnailPath = await this.generateThumbnail(
        buffer,
        sourceId,
        metadata.format || extension
      );

      return {
        originalPath: publicPath,
        thumbnailPath,
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0,
        },
        fileSize: file.size,
        mimeType: file.type,
        format: metadata.format || extension,
      };
    } catch (error) {
      // Clean up on error
      try {
        await fs.unlink(originalPath);
      } catch {}

      throw new Error(`Image processing failed: ${error}`);
    }
  }

  private async generateThumbnail(
    buffer: Buffer,
    sourceId: string,
    format: string
  ): Promise<string> {
    const thumbnailFileName = `${sourceId}_thumb.jpg`;
    const thumbnailPath = path.join(this.thumbnailsDir, thumbnailFileName);
    const publicThumbnailPath = `/uploads/thumbnails/${thumbnailFileName}`;

    try {
      await sharp(buffer)
        .resize(this.config.thumbnailSize.width, this.config.thumbnailSize.height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: this.config.quality })
        .toFile(thumbnailPath);

      return publicThumbnailPath;
    } catch (error) {
      // Handle HEIC conversion fallback
      if (format === 'heic' || format === 'heif') {
        const heicResult = await this.handleHeicConversion(buffer, sourceId);
        return heicResult || undefined;
      }

      console.warn(`Thumbnail generation failed for ${sourceId}:`, error);
      return undefined;
    }
  }

  private async handleHeicConversion(
    buffer: Buffer,
    sourceId: string
  ): Promise<string | undefined> {
    try {
      // Attempt HEIC conversion with fallback
      const thumbnailFileName = `${sourceId}_thumb.jpg`;
      const thumbnailPath = path.join(this.thumbnailsDir, thumbnailFileName);
      const publicThumbnailPath = `/uploads/thumbnails/${thumbnailFileName}`;

      // Try with different Sharp options for HEIC
      await sharp(buffer, { failOnError: false })
        .resize(this.config.thumbnailSize.width, this.config.thumbnailSize.height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: this.config.quality })
        .toFile(thumbnailPath);

      return publicThumbnailPath;
    } catch (error) {
      console.warn(`HEIC conversion failed for ${sourceId}:`, error);
      return undefined;
    }
  }

  async deleteFile(originalPath: string, thumbnailPath?: string): Promise<void> {
    const operations = [];

    if (originalPath) {
      const fullOriginalPath = path.join(process.cwd(), 'public', originalPath);
      operations.push(fs.unlink(fullOriginalPath).catch(() => {}));
    }

    if (thumbnailPath) {
      const fullThumbnailPath = path.join(process.cwd(), 'public', thumbnailPath);
      operations.push(fs.unlink(fullThumbnailPath).catch(() => {}));
    }

    await Promise.allSettled(operations);
  }

  async getImageDimensions(filePath: string): Promise<ImageDimensions> {
    try {
      const fullPath = path.join(process.cwd(), 'public', filePath);
      const metadata = await sharp(fullPath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      throw new Error(`Failed to get image dimensions: ${error}`);
    }
  }

  private getFileExtension(filename: string): string {
    return path.extname(filename).slice(1).toLowerCase();
  }

  async batchProcess(
    files: File[],
    generateSourceId: () => string
  ): Promise<Array<{ sourceId: string; result?: ProcessedImageResult; error?: string }>> {
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const sourceId = generateSourceId();
        try {
          const result = await this.storeFile(file, sourceId);
          return { sourceId, result };
        } catch (error) {
          return { sourceId, error: error instanceof Error ? error.message : String(error) };
        }
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          sourceId: `failed_${index}`,
          error: result.reason?.message || 'Unknown error',
        };
      }
    });
  }
}

export const fileStorageService = new FileStorageService();