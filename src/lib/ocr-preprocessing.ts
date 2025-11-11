import sharp from 'sharp';
import { promises as fs } from 'fs';

export interface PreprocessingOptions {
  method: 'none' | 'basic' | 'optimized';
  threshold?: number;
  sharpen?: boolean;
  normalizeHistogram?: boolean;
}

export interface PreprocessingResult {
  buffer: Buffer;
  method: string;
  originalSize: number;
  processedSize: number;
  duration: number;
}

export const PREPROCESSING_PRESETS: Record<string, PreprocessingOptions> = {
  none: { method: 'none' },
  basic: { method: 'basic', threshold: 128, normalizeHistogram: false },
  optimized: {
    method: 'optimized',
    threshold: 128,
    sharpen: true,
    normalizeHistogram: true
  }
};

export class OCRPreprocessingService {
  static async quickPreprocess(
    input: string | Buffer,
    preset: keyof typeof PREPROCESSING_PRESETS = 'optimized'
  ): Promise<Buffer> {
    const options = PREPROCESSING_PRESETS[preset];
    const result = await OCRPreprocessingService.preprocessImage(input, options);
    return result.buffer;
  }

  static async preprocessImage(
    input: string | Buffer,
    options: PreprocessingOptions
  ): Promise<PreprocessingResult> {
    const startTime = Date.now();

    let inputSize: number;
    if (Buffer.isBuffer(input)) {
      inputSize = input.length;
    } else {
      const stats = await fs.stat(input);
      inputSize = stats.size;
    }

    let buffer: Buffer;

    switch (options.method) {
      case 'none':
        buffer = await OCRPreprocessingService.preprocessNone(input);
        break;
      case 'basic':
        buffer = await OCRPreprocessingService.preprocessBasic(
          input,
          options.threshold ?? 128
        );
        break;
      case 'optimized':
        buffer = await OCRPreprocessingService.preprocessOptimized(
          input,
          options.threshold ?? 128,
          options.sharpen ?? true,
          options.normalizeHistogram ?? true
        );
        break;
      default:
        throw new Error(`Unknown preprocessing method: ${options.method}`);
    }

    return {
      buffer,
      method: options.method,
      originalSize: inputSize,
      processedSize: buffer.length,
      duration: Date.now() - startTime
    };
  }

  static async preprocessNone(input: string | Buffer): Promise<Buffer> {
    return sharp(input).png().toBuffer();
  }

  static async preprocessBasic(
    input: string | Buffer,
    threshold: number
  ): Promise<Buffer> {
    return sharp(input)
      .grayscale()
      .threshold(threshold)
      .png()
      .toBuffer();
  }

  static async preprocessOptimized(
    input: string | Buffer,
    threshold: number,
    sharpen: boolean,
    normalize: boolean
  ): Promise<Buffer> {
    let pipeline = sharp(input);

    if (normalize) {
      pipeline = pipeline.normalize();
    }

    pipeline = pipeline.grayscale();
    pipeline = pipeline.threshold(threshold);

    if (sharpen) {
      pipeline = pipeline.sharpen({ sigma: 0.7 });
    }

    return pipeline.png().toBuffer();
  }
}

export const { quickPreprocess, preprocessImage } = OCRPreprocessingService;
