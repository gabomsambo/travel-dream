import {
  OCRPreprocessingService,
  quickPreprocess,
  preprocessImage,
  PREPROCESSING_PRESETS,
  PreprocessingOptions,
  PreprocessingResult,
} from '../ocr-preprocessing';
import * as path from 'path';
import * as fs from 'fs';

const TEST_IMAGE_PATH = path.join(
  process.cwd(),
  'test_photos',
  'IMG_2640.PNG'
);

describe('OCR Preprocessing', () => {
  beforeAll(() => {
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
      throw new Error(
        `Test image not found: ${TEST_IMAGE_PATH}`
      );
    }
  });

  describe('preprocessNone', () => {
    it('returns PNG buffer for valid input', async () => {
      const buffer = await OCRPreprocessingService.preprocessNone(
        TEST_IMAGE_PATH
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('accepts Buffer input', async () => {
      const inputBuffer = fs.readFileSync(TEST_IMAGE_PATH);
      const buffer = await OCRPreprocessingService.preprocessNone(inputBuffer);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('preserves image content', async () => {
      const buffer = await OCRPreprocessingService.preprocessNone(
        TEST_IMAGE_PATH
      );
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });

  describe('preprocessBasic', () => {
    it('applies grayscale and threshold', async () => {
      const buffer = await OCRPreprocessingService.preprocessBasic(
        TEST_IMAGE_PATH,
        128
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('uses default threshold 128', async () => {
      const buffer = await OCRPreprocessingService.preprocessBasic(
        TEST_IMAGE_PATH,
        128
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('output buffer is smaller than unprocessed', async () => {
      const noneBuffer = await OCRPreprocessingService.preprocessNone(
        TEST_IMAGE_PATH
      );
      const basicBuffer = await OCRPreprocessingService.preprocessBasic(
        TEST_IMAGE_PATH,
        128
      );

      expect(basicBuffer.length).toBeLessThanOrEqual(noneBuffer.length);
    });
  });

  describe('preprocessOptimized', () => {
    it('applies full preprocessing pipeline', async () => {
      const buffer = await OCRPreprocessingService.preprocessOptimized(
        TEST_IMAGE_PATH,
        128,
        true,
        true
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('includes histogram normalization', async () => {
      const withNormalize = await OCRPreprocessingService.preprocessOptimized(
        TEST_IMAGE_PATH,
        128,
        false,
        true
      );
      const withoutNormalize = await OCRPreprocessingService.preprocessOptimized(
        TEST_IMAGE_PATH,
        128,
        false,
        false
      );

      expect(withNormalize.length).toBeGreaterThan(0);
      expect(withoutNormalize.length).toBeGreaterThan(0);
    });

    it('optionally applies sharpening', async () => {
      const withSharpen = await OCRPreprocessingService.preprocessOptimized(
        TEST_IMAGE_PATH,
        128,
        true,
        true
      );
      const withoutSharpen = await OCRPreprocessingService.preprocessOptimized(
        TEST_IMAGE_PATH,
        128,
        false,
        true
      );

      expect(withSharpen.length).toBeGreaterThan(0);
      expect(withoutSharpen.length).toBeGreaterThan(0);
    });
  });

  describe('preprocessImage', () => {
    it('processes with none method', async () => {
      const result = await preprocessImage(TEST_IMAGE_PATH, {
        method: 'none',
      });

      expect(result.buffer).toBeDefined();
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.method).toBe('none');
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.processedSize).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('processes with basic method', async () => {
      const result = await preprocessImage(TEST_IMAGE_PATH, {
        method: 'basic',
        threshold: 128,
      });

      expect(result.buffer).toBeDefined();
      expect(result.method).toBe('basic');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('processes with optimized method', async () => {
      const result = await preprocessImage(TEST_IMAGE_PATH, {
        method: 'optimized',
        threshold: 128,
        sharpen: true,
        normalizeHistogram: true,
      });

      expect(result.buffer).toBeDefined();
      expect(result.method).toBe('optimized');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('tracks processing duration', async () => {
      const result = await preprocessImage(TEST_IMAGE_PATH, {
        method: 'optimized',
      });

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(10000);
    });

    it('handles Buffer input', async () => {
      const inputBuffer = fs.readFileSync(TEST_IMAGE_PATH);
      const result = await preprocessImage(inputBuffer, {
        method: 'optimized',
      });

      expect(result.buffer).toBeDefined();
      expect(result.originalSize).toBe(inputBuffer.length);
    });
  });

  describe('quickPreprocess', () => {
    it('uses optimized preset by default', async () => {
      const buffer = await quickPreprocess(TEST_IMAGE_PATH);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('accepts preset parameter', async () => {
      const buffer = await quickPreprocess(TEST_IMAGE_PATH, 'basic');

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('works with none preset', async () => {
      const buffer = await quickPreprocess(TEST_IMAGE_PATH, 'none');

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('PREPROCESSING_PRESETS', () => {
    it('defines none preset', () => {
      expect(PREPROCESSING_PRESETS.none).toEqual({
        method: 'none',
      });
    });

    it('defines basic preset', () => {
      expect(PREPROCESSING_PRESETS.basic).toEqual({
        method: 'basic',
        threshold: 128,
        normalizeHistogram: false,
      });
    });

    it('defines optimized preset', () => {
      expect(PREPROCESSING_PRESETS.optimized).toEqual({
        method: 'optimized',
        threshold: 128,
        sharpen: true,
        normalizeHistogram: true,
      });
    });
  });

  describe('error handling', () => {
    it('throws on invalid file path', async () => {
      await expect(
        OCRPreprocessingService.preprocessNone('/nonexistent/file.png')
      ).rejects.toThrow();
    });

    it('throws on unknown preprocessing method', async () => {
      await expect(
        preprocessImage(TEST_IMAGE_PATH, {
          method: 'invalid' as any,
        })
      ).rejects.toThrow('Unknown preprocessing method');
    });
  });

  describe('output validation', () => {
    it('returns valid PNG buffer', async () => {
      const buffer = await quickPreprocess(TEST_IMAGE_PATH);
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      expect(buffer.subarray(0, 4)).toEqual(pngSignature);
    });
  });
});
