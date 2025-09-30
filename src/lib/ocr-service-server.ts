import { exec } from 'child_process';
import { promisify } from 'util';
import * as sharpImport from 'sharp';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface OCRResult {
  text: string;
  confidence: number;
  words: number;
  lines: number;
  blocks: number;
  processingTime: number;
}

export interface OCRConfig {
  language: string;
  pageSegMode: number;
  preserveInterword: boolean;
}

export const DEFAULT_OCR_CONFIG: OCRConfig = {
  language: 'eng',
  pageSegMode: 6,
  preserveInterword: true,
};

export class OCRServiceServer {
  private config: OCRConfig;
  private isNativeTesseractAvailable: boolean = false;

  constructor(config: OCRConfig = DEFAULT_OCR_CONFIG) {
    this.config = config;
  }

  async checkTesseractAvailability(): Promise<boolean> {
    try {
      await execAsync('tesseract --version');
      this.isNativeTesseractAvailable = true;
      console.log('[OCR] Native tesseract command available');
      return true;
    } catch (error) {
      this.isNativeTesseractAvailable = false;
      console.log('[OCR] Native tesseract not available, will use fallback');
      return false;
    }
  }

  async processImageBuffer(imageBuffer: Buffer, fileName: string = 'unknown'): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      console.log(`[OCR] Starting processing for ${fileName}, buffer size: ${imageBuffer.length} bytes`);

      await this.checkTesseractAvailability();

      const preprocessedBuffer = await this.preprocessImage(imageBuffer);
      console.log(`[OCR] Image preprocessed for ${fileName}, preprocessed size: ${preprocessedBuffer.length} bytes`);

      let ocrResult: OCRResult;

      if (this.isNativeTesseractAvailable) {
        ocrResult = await this.processWithNativeTesseract(preprocessedBuffer, fileName);
      } else {
        throw new Error('Native tesseract not available. Please install tesseract-ocr.');
      }

      const processingTime = Date.now() - startTime;
      ocrResult.processingTime = processingTime;

      console.log(`[OCR] Completed ${fileName} in ${processingTime}ms, extracted ${ocrResult.text.length} characters`);

      return ocrResult;
    } catch (error) {
      console.error(`[OCR] Processing failed for ${fileName}:`, error);
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async processWithNativeTesseract(imageBuffer: Buffer, fileName: string): Promise<OCRResult> {
    const tempDir = os.tmpdir();
    const tempImagePath = path.join(tempDir, `ocr_${Date.now()}_${fileName}.png`);
    const tempOutputBase = path.join(tempDir, `ocr_${Date.now()}_output`);
    const tempOutputFile = `${tempOutputBase}.txt`;

    try {
      await fs.writeFile(tempImagePath, imageBuffer);

      const cmd = `tesseract "${tempImagePath}" "${tempOutputBase}" -l ${this.config.language} --psm ${this.config.pageSegMode}`;
      console.log(`[OCR] Running: ${cmd}`);

      await execAsync(cmd);

      const text = await fs.readFile(tempOutputFile, 'utf-8');

      const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
      const lineCount = text.split('\n').filter(l => l.trim().length > 0).length;

      return {
        text: text.trim(),
        confidence: 85,
        words: wordCount,
        lines: lineCount,
        blocks: Math.ceil(lineCount / 5),
        processingTime: 0,
      };
    } finally {
      try {
        await fs.unlink(tempImagePath);
      } catch {}
      try {
        await fs.unlink(tempOutputFile);
      } catch {}
    }
  }

  private async preprocessImage(imageBuffer: Buffer): Promise<Buffer> {
    try {
      const sharp = sharpImport.default || sharpImport;
      const processedBuffer = await sharp(imageBuffer)
        .greyscale()
        .normalise()
        .sharpen()
        .threshold(128)
        .toFormat('png')
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error('[OCR] Image preprocessing failed:', error);
      throw new Error(`Image preprocessing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async batchProcessImages(
    imageBuffers: Array<{ buffer: Buffer; fileName: string }>,
    maxConcurrent: number = 3
  ): Promise<Array<{ fileName: string; result?: OCRResult; error?: string }>> {
    const results: Array<{ fileName: string; result?: OCRResult; error?: string }> = [];

    for (let i = 0; i < imageBuffers.length; i += maxConcurrent) {
      const batch = imageBuffers.slice(i, i + maxConcurrent);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ buffer, fileName }) => {
          try {
            const result = await this.processImageBuffer(buffer, fileName);
            return { fileName, result };
          } catch (error) {
            return { fileName, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            fileName: 'unknown',
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      if (i + maxConcurrent < imageBuffers.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async retryProcessing(
    imageBuffer: Buffer,
    fileName: string,
    maxRetries: number = 3
  ): Promise<OCRResult> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[OCR] Retry attempt ${attempt}/${maxRetries} for ${fileName}`);
        return await this.processImageBuffer(imageBuffer, fileName);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`OCR failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  static async quickProcess(imageBuffer: Buffer, fileName: string = 'unknown'): Promise<OCRResult> {
    const service = new OCRServiceServer();
    return await service.processImageBuffer(imageBuffer, fileName);
  }

  static validateImageBuffer(buffer: Buffer): { isValid: boolean; error?: string } {
    const maxSize = 10 * 1024 * 1024;

    if (buffer.length === 0) {
      return {
        isValid: false,
        error: 'Empty image buffer',
      };
    }

    if (buffer.length > maxSize) {
      return {
        isValid: false,
        error: `Buffer size ${buffer.length} exceeds maximum ${maxSize} bytes`,
      };
    }

    return { isValid: true };
  }
}

export const ocrServiceServer = new OCRServiceServer();