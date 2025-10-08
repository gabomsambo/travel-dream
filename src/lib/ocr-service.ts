import { createWorker, type Worker, type LoggerMessage } from 'tesseract.js';

export interface OCRResult {
  text: string;
  confidence: number;
  words: number;
  lines: number;
  blocks: number;
  processingTime: number;
}

export interface OCRProgress {
  status: string;
  progress: number;
  message?: string;
}

export interface OCRConfig {
  language: string;
  engineMode: number;
  pageSegMode: number;
  preserveInterword: boolean;
  tessJsOptions: {
    tessedit_char_whitelist?: string;
    tessedit_pageseg_mode?: number;
    preserve_interword_spaces?: string;
  };
}

export const DEFAULT_OCR_CONFIG: OCRConfig = {
  language: 'eng',
  engineMode: 1, // Neural nets LSTM engine only
  pageSegMode: 6, // Uniform block of text (good for screenshots)
  preserveInterword: true,
  tessJsOptions: {
    tessedit_pageseg_mode: 6, // Assume a single uniform block of text
    preserve_interword_spaces: '1',
  },
};

export class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;
  private config: OCRConfig;
  private progressCallback?: (progress: OCRProgress) => void;

  constructor(config: OCRConfig = DEFAULT_OCR_CONFIG) {
    this.config = config;
  }

  setProgressCallback(callback: (progress: OCRProgress) => void): void {
    this.progressCallback = callback;
  }

  private loggerCallback = (msg: LoggerMessage): void => {
    if (this.progressCallback) {
      this.progressCallback({
        status: msg.status,
        progress: msg.progress,
        message: msg.status,
      });
    }
  };

  async initWorker(): Promise<void> {
    if (this.isInitialized && this.worker) {
      return;
    }

    try {
      // Create worker with Node.js configuration for server-side processing
      this.worker = await createWorker(this.config.language, 1, {
        logger: this.loggerCallback,
        // Configure for server-side usage
        corePath: require.resolve('tesseract.js-core/tesseract-core.wasm.js'),
        workerPath: require.resolve('tesseract.js/dist/worker.min.js'),
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      });

      // Set additional Tesseract options for screenshot optimization
      await this.worker.setParameters(this.config.tessJsOptions as any);

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize OCR worker: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async processImage(imageFile: File): Promise<OCRResult> {
    const startTime = Date.now();

    try {
      await this.initWorker();

      if (!this.worker) {
        throw new Error('OCR worker not initialized');
      }

      // Preprocess image for better OCR accuracy
      const preprocessedImage = await this.preprocessScreenshot(imageFile);

      // Perform OCR recognition
      const result = await this.worker.recognize(preprocessedImage);

      const processingTime = Date.now() - startTime;

      return {
        text: result.data.text,
        confidence: result.data.confidence,
        words: (result.data as any).words ? (result.data as any).words.length : 0,
        lines: (result.data as any).lines ? (result.data as any).lines.length : 0,
        blocks: (result.data as any).blocks ? (result.data as any).blocks.length : 0,
        processingTime,
      };
    } catch (error) {
      throw new Error(`OCR processing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async batchProcessImages(
    files: File[],
    maxConcurrent: number = 3
  ): Promise<Array<{ file: File; result?: OCRResult; error?: string }>> {
    await this.initWorker();

    const results: Array<{ file: File; result?: OCRResult; error?: string }> = [];

    // Process files in batches to prevent overwhelming the browser
    for (let i = 0; i < files.length; i += maxConcurrent) {
      const batch = files.slice(i, i + maxConcurrent);

      const batchResults = await Promise.allSettled(
        batch.map(async (file) => {
          try {
            const result = await this.processImage(file);
            return { file, result };
          } catch (error) {
            return { file, error: error instanceof Error ? error.message : String(error) };
          }
        })
      );

      batchResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            file: batch[0], // Fallback
            error: result.reason?.message || 'Unknown error',
          });
        }
      });

      // Small delay between batches to prevent browser lockup
      if (i + maxConcurrent < files.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  async retryProcessing(
    imageFile: File,
    maxRetries: number = 3
  ): Promise<OCRResult> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.progressCallback) {
          this.progressCallback({
            status: 'retrying',
            progress: 0,
            message: `Attempt ${attempt} of ${maxRetries}`,
          });
        }

        return await this.processImage(imageFile);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Reinitialize worker on failure
          await this.terminate();
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw new Error(`OCR failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  private async preprocessScreenshot(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          canvas.width = img.width;
          canvas.height = img.height;

          // Draw original image
          ctx.drawImage(img, 0, 0);

          // Get image data for preprocessing
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Screenshot optimization: enhance contrast for better OCR
          this.enhanceContrast(data);

          // Apply preprocessing for screenshots
          this.optimizeForScreenshots(data);

          // Put processed data back
          ctx.putImageData(imageData, 0, 0);

          // Return as data URL
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  private enhanceContrast(data: Uint8ClampedArray): void {
    const factor = 1.2; // Contrast enhancement factor

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast enhancement to RGB channels
      data[i] = Math.min(255, Math.max(0, ((data[i] - 128) * factor) + 128)); // Red
      data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - 128) * factor) + 128)); // Green
      data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - 128) * factor) + 128)); // Blue
      // Alpha channel remains unchanged
    }
  }

  private optimizeForScreenshots(data: Uint8ClampedArray): void {
    // Convert to grayscale and apply threshold for better text recognition
    for (let i = 0; i < data.length; i += 4) {
      // Calculate grayscale value
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);

      // Apply threshold to make text more distinct
      const threshold = 128;
      const binaryValue = gray > threshold ? 255 : 0;

      // Set RGB to binary value
      data[i] = binaryValue;     // Red
      data[i + 1] = binaryValue; // Green
      data[i + 2] = binaryValue; // Blue
      // Alpha remains unchanged
    }
  }

  async getWorkerStatus(): Promise<{ initialized: boolean; ready: boolean }> {
    return {
      initialized: this.isInitialized,
      ready: this.worker !== null,
    };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (error) {
        console.warn('Error terminating OCR worker:', error);
      }
      this.worker = null;
      this.isInitialized = false;
    }
  }

  // Static method for quick one-off OCR processing
  static async quickProcess(imageFile: File): Promise<OCRResult> {
    const service = new OCRService();
    try {
      return await service.processImage(imageFile);
    } finally {
      await service.terminate();
    }
  }

  // Validate image file before processing
  static validateImageFile(file: File): { isValid: boolean; error?: string } {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: `Unsupported file type: ${file.type}. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `File size ${file.size} exceeds maximum ${maxSize} bytes`,
      };
    }

    return { isValid: true };
  }
}

// Export singleton instance for shared use
export const ocrService = new OCRService();