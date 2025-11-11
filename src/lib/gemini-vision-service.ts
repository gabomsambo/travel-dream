import { GoogleGenerativeAI } from '@google/generative-ai';

export interface OCRResult {
  text: string;
  confidence: number;
  words: number;
  lines: number;
  blocks: number;
  processingTime: number;
}

export interface GeminiVisionConfig {
  apiKey: string;
  model: string;
  maxRetries: number;
  retryDelayMs: number;
}

export const DEFAULT_GEMINI_CONFIG: Partial<GeminiVisionConfig> = {
  model: 'gemini-2.0-flash-exp',
  maxRetries: 3,
  retryDelayMs: 1000,
};

export class GeminiVisionService {
  private client: GoogleGenerativeAI;
  private config: GeminiVisionConfig;
  private model: any;

  constructor(config?: Partial<GeminiVisionConfig>) {
    const apiKey = config?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY required. Get one at https://aistudio.google.com/'
      );
    }

    this.config = { ...DEFAULT_GEMINI_CONFIG, ...config, apiKey } as GeminiVisionConfig;
    this.client = new GoogleGenerativeAI(this.config.apiKey);
    this.model = this.client.getGenerativeModel({ model: this.config.model });
  }

  async extractTextFromImage(
    imageBuffer: Buffer,
    fileName: string = 'unknown'
  ): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      console.log(
        `[Gemini Vision] Starting for ${fileName}, size: ${imageBuffer.length} bytes`
      );

      const mimeType = this.detectMimeType(imageBuffer);

      const base64Image = imageBuffer.toString('base64');

      const prompt = `Extract all visible text from this image.
Focus on handwritten notes, typed text, and annotations.
Ignore UI elements, buttons, navigation bars, and decorative graphics.
Return ONLY the raw text content, preserving line breaks and formatting.
Do not add any commentary, explanations, or metadata.`;

      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      };

      let result;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          result = await this.model.generateContent([prompt, imagePart]);
          break;
        } catch (error: any) {
          lastError = error;

          const isRetryable =
            error?.status === 429 ||
            error?.status === 500 ||
            error?.status === 503;

          if (!isRetryable || attempt === this.config.maxRetries - 1) {
            throw error;
          }

          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          console.warn(
            `[Gemini Vision] Retry ${attempt + 1}/${this.config.maxRetries} for ${fileName} after ${delay}ms`
          );
          await this.sleep(delay);
        }
      }

      if (!result) {
        throw lastError || new Error('Failed after all retries');
      }

      const response = result.response;
      const text = response.text().trim();

      const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;
      const lineCount = text.split('\n').filter((l: string) => l.trim().length > 0).length;

      const processingTime = Date.now() - startTime;

      const ocrResult: OCRResult = {
        text,
        confidence: 90,
        words: wordCount,
        lines: lineCount,
        blocks: 1,
        processingTime,
      };

      console.log(
        `[Gemini Vision] Completed ${fileName} in ${processingTime}ms, ` +
        `extracted ${text.length} chars, ${wordCount} words, ${lineCount} lines`
      );

      return ocrResult;

    } catch (error) {
      console.error(`[Gemini Vision] Failed for ${fileName}:`, error);
      throw new Error(
        `Gemini vision processing failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async processImageBuffer(
    imageBuffer: Buffer,
    fileName: string = 'unknown'
  ): Promise<OCRResult> {
    return this.extractTextFromImage(imageBuffer, fileName);
  }

  private detectMimeType(buffer: Buffer): string {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    if (buffer.subarray(0, 4).equals(pngSignature)) {
      return 'image/png';
    }

    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff]);
    if (buffer.subarray(0, 3).equals(jpegSignature)) {
      return 'image/jpeg';
    }

    const webpSignature = Buffer.from([0x52, 0x49, 0x46, 0x46]);
    if (buffer.subarray(0, 4).equals(webpSignature)) {
      return 'image/webp';
    }

    return 'image/png';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const geminiVisionService = new GeminiVisionService();
