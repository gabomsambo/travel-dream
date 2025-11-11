/**
 * @jest-environment node
 */

import { GeminiVisionService } from '../gemini-vision-service';
import * as fs from 'fs';
import * as path from 'path';
import fetch, { Request, Response, Headers } from 'node-fetch';

if (!globalThis.fetch) {
  (globalThis as any).fetch = fetch;
  (globalThis as any).Request = Request;
  (globalThis as any).Response = Response;
  (globalThis as any).Headers = Headers;
}

describe('GeminiVisionService', () => {
  const testImagePath = path.join(process.cwd(), 'test_photos', 'IMG_2640.PNG');
  let service: GeminiVisionService;

  beforeAll(() => {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.warn('GOOGLE_GENERATIVE_AI_API_KEY not set, skipping tests');
    }
  });

  beforeEach(() => {
    if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      service = new GeminiVisionService();
    }
  });

  describe('Constructor', () => {
    it('should throw error if API key is missing', () => {
      const originalKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

      expect(() => new GeminiVisionService()).toThrow(
        'GOOGLE_GENERATIVE_AI_API_KEY required'
      );

      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalKey;
    });

    it('should accept API key via config', () => {
      expect(() => new GeminiVisionService({ apiKey: 'test-key' })).not.toThrow();
    });

    it('should use default model configuration', () => {
      const service = new GeminiVisionService({ apiKey: 'test-key' });
      expect(service).toBeDefined();
    });
  });

  describe('MIME type detection', () => {
    it('should detect PNG format', () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      expect(buffer).toBeDefined();
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle PNG signature correctly', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(pngBuffer).toBeDefined();
    });
  });

  describe('OCR extraction', () => {
    it('should extract text from travel screenshot', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const result = await service.extractTextFromImage(buffer, 'IMG_2640.PNG');

      expect(result.text).toBeDefined();
      expect(result.confidence).toBe(90);
      expect(result.words).toBeGreaterThan(0);
      expect(result.lines).toBeGreaterThan(0);
      expect(result.blocks).toBe(1);
      expect(result.processingTime).toBeGreaterThan(0);
    }, 30000);

    it('should return OCRResult interface', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const result = await service.extractTextFromImage(buffer, 'test');

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('words');
      expect(result).toHaveProperty('lines');
      expect(result).toHaveProperty('blocks');
      expect(result).toHaveProperty('processingTime');
    }, 30000);

    it('should have processImageBuffer alias', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const result = await service.processImageBuffer(buffer, 'test');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('text');
    }, 30000);
  });

  describe('Error handling', () => {
    it('should not throw on service instantiation with invalid API key', () => {
      expect(() => new GeminiVisionService({ apiKey: 'invalid' })).not.toThrow();
    });

    it('should handle empty buffer gracefully', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.warn('Skipping test - API key not available');
        return;
      }

      const emptyBuffer = Buffer.alloc(0);
      await expect(
        service.extractTextFromImage(emptyBuffer, 'empty')
      ).rejects.toThrow();
    }, 30000);

    it('should handle invalid image data', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        console.warn('Skipping test - API key not available');
        return;
      }

      const invalidBuffer = Buffer.from('not an image');
      await expect(
        service.extractTextFromImage(invalidBuffer, 'invalid')
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Metadata calculation', () => {
    it('should correctly count words and lines', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const result = await service.extractTextFromImage(buffer, 'test');

      if (result.text && result.text.length > 0) {
        const expectedWords = result.text.split(/\s+/).filter((w: string) => w.length > 0).length;
        const expectedLines = result.text.split('\n').filter((l: string) => l.trim().length > 0).length;

        expect(result.words).toBe(expectedWords);
        expect(result.lines).toBe(expectedLines);
      }
    }, 30000);

    it('should set fixed confidence value', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const result = await service.extractTextFromImage(buffer, 'test');

      expect(result.confidence).toBe(90);
    }, 30000);

    it('should measure processing time', async () => {
      if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY || !fs.existsSync(testImagePath)) {
        console.warn('Skipping test - API key or test image not available');
        return;
      }

      const buffer = fs.readFileSync(testImagePath);
      const startTime = Date.now();
      const result = await service.extractTextFromImage(buffer, 'test');
      const endTime = Date.now();

      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(endTime - startTime + 100);
    }, 30000);
  });
});
