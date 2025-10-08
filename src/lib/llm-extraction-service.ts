import pLimit from 'p-limit';
import { OpenAIProvider } from './llm-providers/openai-provider';
import { AnthropicProvider } from './llm-providers/anthropic-provider';
import { BaseLLMProvider } from './llm-providers/base-provider';
import {
  ExtractedPlace,
  ExtractionContext,
  ExtractionResult,
  BatchExtractionResult,
  LLMProvider,
  LLMProviderConfig,
  LLMError,
  LLMErrorType
} from '@/types/llm-extraction';
import { Source } from '@/types/database';

// Progress tracking for batch operations
export interface ProcessingProgress {
  total: number;
  completed: number;
  failed: number;
  progress: number; // Percentage (0-100)
  currentItem?: string;
  currentSource?: string;
  estimatedTimeRemaining?: number;
}

// Service configuration
export interface LLMExtractionConfig {
  primaryProvider: 'openai' | 'anthropic';
  fallbackProvider?: 'openai' | 'anthropic';
  maxConcurrentExtractions: number;
  enableFallback: boolean;
  timeout: number;
  retryAttempts: number;
  providers: {
    openai?: LLMProviderConfig;
    anthropic?: LLMProviderConfig;
  };
}

// Default service configuration
const DEFAULT_CONFIG: LLMExtractionConfig = {
  primaryProvider: 'openai',
  fallbackProvider: 'anthropic',
  maxConcurrentExtractions: 3,
  enableFallback: true,
  timeout: 30000,
  retryAttempts: 3,
  providers: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-4o-2024-08-06',
      maxTokens: 4000,
      temperature: 0.1,
      timeout: 30000,
      retryAttempts: 3,
      rateLimitPerMinute: 60,
      costLimitPerDay: 10.0
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.1,
      timeout: 30000,
      retryAttempts: 3,
      rateLimitPerMinute: 50,
      costLimitPerDay: 15.0
    }
  }
};

// Processing status for monitoring
export interface ExtractionStatus {
  sourceId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  provider?: string;
  startTime?: number;
  endTime?: number;
  error?: string;
  placesExtracted?: number;
}

// Main LLM extraction service (following OCR service pattern)
export class LLMExtractionService {
  private config: LLMExtractionConfig;
  private providers: Map<string, BaseLLMProvider> = new Map();
  private isInitialized = false;
  private processingQueue: Map<string, ExtractionStatus> = new Map();
  private progressCallback?: (progress: ProcessingProgress) => void;
  private limit: ReturnType<typeof pLimit>;

  constructor(config: Partial<LLMExtractionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.limit = pLimit(this.config.maxConcurrentExtractions);
  }

  // Set progress callback (following OCR service pattern)
  setProgressCallback(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallback = callback;
  }

  // Initialize service and providers (following OCR service pattern)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Initialize providers based on configuration
      if (this.config.providers.openai?.apiKey) {
        const openaiProvider = new OpenAIProvider(this.config.providers.openai);
        await openaiProvider.initialize();
        this.providers.set('openai', openaiProvider);
      }

      if (this.config.providers.anthropic?.apiKey) {
        const anthropicProvider = new AnthropicProvider(this.config.providers.anthropic);
        await anthropicProvider.initialize();
        this.providers.set('anthropic', anthropicProvider);
      }

      // Validate primary provider is available
      if (!this.providers.has(this.config.primaryProvider)) {
        throw new Error(`Primary provider '${this.config.primaryProvider}' is not configured`);
      }

      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize LLM extraction service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Extract places from a single source (following OCR service pattern)
  async extractFromSource(
    sourceId: string,
    text: string,
    context?: ExtractionContext
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      // Update processing status
      this.updateProcessingStatus(sourceId, {
        sourceId,
        status: 'processing',
        progress: 0,
        startTime
      });

      // Get primary provider
      const provider = this.getProvider(this.config.primaryProvider);
      if (!provider) {
        throw new LLMError(
          LLMErrorType.INVALID_REQUEST,
          undefined,
          undefined,
          `Provider '${this.config.primaryProvider}' not available`
        );
      }

      // Extract with primary provider
      let result: ExtractionResult;
      try {
        result = await provider.extractFromSource(sourceId, text, context);

        // Update progress
        this.updateProcessingStatus(sourceId, {
          sourceId,
          status: 'completed',
          progress: 100,
          provider: provider.name,
          endTime: Date.now(),
          placesExtracted: result.places.length
        });

      } catch (error) {
        // Try fallback provider if enabled
        if (this.config.enableFallback && this.config.fallbackProvider) {
          const fallbackProvider = this.getProvider(this.config.fallbackProvider);
          if (fallbackProvider) {
            console.warn(`Primary provider failed, trying fallback: ${error instanceof Error ? error.message : String(error)}`);

            this.updateProcessingStatus(sourceId, {
              sourceId,
              status: 'processing',
              progress: 50,
              provider: fallbackProvider.name
            });

            result = await fallbackProvider.extractFromSource(sourceId, text, context);

            this.updateProcessingStatus(sourceId, {
              sourceId,
              status: 'completed',
              progress: 100,
              provider: fallbackProvider.name,
              endTime: Date.now(),
              placesExtracted: result.places.length
            });
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }

      return result;

    } catch (error) {
      this.updateProcessingStatus(sourceId, {
        sourceId,
        status: 'failed',
        progress: 0,
        endTime: Date.now(),
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  // Batch processing with concurrency control (following OCR service pattern)
  async batchExtract(
    sources: Array<{ id: string; text: string; context?: ExtractionContext }>,
    options: {
      maxConcurrent?: number;
      onProgress?: (progress: ProcessingProgress) => void;
    } = {}
  ): Promise<BatchExtractionResult> {
    await this.initialize();

    const startTime = Date.now();
    const maxConcurrent = options.maxConcurrent || this.config.maxConcurrentExtractions;
    const limit = pLimit(maxConcurrent);
    const results: ExtractionResult[] = [];
    let completed = 0;
    let failed = 0;

    // Initialize processing status for all sources
    sources.forEach(source => {
      this.updateProcessingStatus(source.id, {
        sourceId: source.id,
        status: 'pending',
        progress: 0
      });
    });

    // Process with controlled concurrency
    const promises = sources.map(source =>
      limit(async () => {
        try {
          const result = await this.extractFromSource(source.id, source.text, source.context);
          completed++;

          // Report progress
          const progress: ProcessingProgress = {
            total: sources.length,
            completed,
            failed,
            progress: (completed + failed) / sources.length * 100,
            currentItem: source.id,
            estimatedTimeRemaining: this.estimateTimeRemaining(startTime, completed + failed, sources.length)
          };

          if (options.onProgress) {
            options.onProgress(progress);
          }
          if (this.progressCallback) {
            this.progressCallback(progress);
          }

          return result;
        } catch (error) {
          failed++;

          const failedResult: ExtractionResult = {
            success: false,
            places: [],
            metadata: {
              model: 'unknown',
              prompt_version: '1.0.0',
              processing_time_ms: Date.now() - startTime,
              tokens_used: { input: 0, output: 0, total: 0 },
              cost_usd: 0,
              confidence_avg: 0,
              confidence_min: 0,
              confidence_max: 0,
              places_extracted: 0,
              retries: 0,
              errors: [error instanceof Error ? error.message : String(error)],
              started_at: new Date(startTime).toISOString(),
              completed_at: new Date().toISOString()
            },
            sourceId: source.id,
            error: error instanceof Error ? error.message : String(error)
          };

          return failedResult;
        }
      })
    );

    // Wait for all extractions to complete
    const allResults = await Promise.all(promises);
    results.push(...allResults);

    // Calculate summary statistics
    const successful = results.filter(r => r.success).length;
    const totalPlaces = results.reduce((sum, r) => sum + r.places.length, 0);
    const totalCost = results.reduce((sum, r) => sum + r.metadata.cost_usd, 0);
    const avgProcessingTime = results.reduce((sum, r) => sum + r.metadata.processing_time_ms, 0) / results.length;

    // Final progress update
    const finalProgress: ProcessingProgress = {
      total: sources.length,
      completed: successful,
      failed: sources.length - successful,
      progress: 100
    };

    if (options.onProgress) {
      options.onProgress(finalProgress);
    }
    if (this.progressCallback) {
      this.progressCallback(finalProgress);
    }

    return {
      success: successful > 0,
      results,
      summary: {
        total_sources: sources.length,
        successful,
        failed: sources.length - successful,
        total_places_extracted: totalPlaces,
        total_cost_usd: totalCost,
        avg_processing_time_ms: avgProcessingTime
      },
      errors: results.filter(r => !r.success).map(r => r.error || 'Unknown error')
    };
  }

  // Retry processing for failed sources (following OCR service pattern)
  async retryExtraction(
    sourceId: string,
    text: string,
    context?: ExtractionContext,
    maxRetries: number = 3
  ): Promise<ExtractionResult> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.updateProcessingStatus(sourceId, {
          sourceId,
          status: 'processing',
          progress: (attempt - 1) / maxRetries * 100
        });

        const result = await this.extractFromSource(sourceId, text, context);
        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new LLMError(
      LLMErrorType.SERVER_ERROR,
      undefined,
      undefined,
      `Extraction failed after ${maxRetries} attempts: ${lastError.message}`
    );
  }

  // Get provider by name
  private getProvider(name: string): BaseLLMProvider | undefined {
    return this.providers.get(name);
  }

  // Update processing status
  private updateProcessingStatus(sourceId: string, status: Partial<ExtractionStatus>): void {
    const existing = this.processingQueue.get(sourceId) || { sourceId, status: 'pending', progress: 0 };
    this.processingQueue.set(sourceId, { ...existing, ...status });
  }

  // Estimate time remaining for batch processing
  private estimateTimeRemaining(startTime: number, completed: number, total: number): number {
    if (completed === 0) return 0;

    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / completed;
    const remaining = total - completed;

    return Math.round(remaining * avgTimePerItem);
  }

  // Get processing status for a source
  getProcessingStatus(sourceId: string): ExtractionStatus | undefined {
    return this.processingQueue.get(sourceId);
  }

  // Get all processing statuses
  getAllProcessingStatuses(): ExtractionStatus[] {
    return Array.from(this.processingQueue.values());
  }

  // Health check for all providers
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const health: { [key: string]: boolean } = {};

    for (const [name, provider] of this.providers) {
      try {
        health[name] = await provider.isHealthy();
      } catch (error) {
        health[name] = false;
      }
    }

    return health;
  }

  // Get service statistics
  async getServiceStats(): Promise<any> {
    const providerStats: any = {};

    for (const [name, provider] of this.providers) {
      try {
        providerStats[name] = await (provider as any).getProviderStats?.() || { available: true };
      } catch (error) {
        providerStats[name] = { available: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    const queueStats = {
      total_in_queue: this.processingQueue.size,
      by_status: {
        pending: Array.from(this.processingQueue.values()).filter(s => s.status === 'pending').length,
        processing: Array.from(this.processingQueue.values()).filter(s => s.status === 'processing').length,
        completed: Array.from(this.processingQueue.values()).filter(s => s.status === 'completed').length,
        failed: Array.from(this.processingQueue.values()).filter(s => s.status === 'failed').length
      }
    };

    return {
      service: 'llm-extraction',
      initialized: this.isInitialized,
      config: {
        primary_provider: this.config.primaryProvider,
        fallback_provider: this.config.fallbackProvider,
        max_concurrent: this.config.maxConcurrentExtractions,
        fallback_enabled: this.config.enableFallback
      },
      providers: providerStats,
      queue: queueStats,
      health: await this.healthCheck()
    };
  }

  // Update service configuration
  updateConfig(config: Partial<LLMExtractionConfig>): void {
    this.config = { ...this.config, ...config };

    // Update concurrency limit if changed
    if (config.maxConcurrentExtractions) {
      this.limit = pLimit(config.maxConcurrentExtractions);
    }

    // Re-initialize if needed
    if (this.isInitialized && (config.providers || config.primaryProvider || config.fallbackProvider)) {
      this.isInitialized = false;
    }
  }

  // Clear completed/failed statuses from queue
  clearProcessingHistory(): void {
    const activeStatuses = Array.from(this.processingQueue.entries())
      .filter(([_, status]) => status.status === 'pending' || status.status === 'processing');

    this.processingQueue.clear();
    activeStatuses.forEach(([sourceId, status]) => {
      this.processingQueue.set(sourceId, status);
    });
  }

  // Terminate service and cleanup (following OCR service pattern)
  async terminate(): Promise<void> {
    try {
      // Terminate all providers
      const terminatePromises = Array.from(this.providers.values()).map(provider =>
        provider.terminate()
      );

      await Promise.all(terminatePromises);

      // Clear state
      this.providers.clear();
      this.processingQueue.clear();
      this.isInitialized = false;
      this.progressCallback = undefined;

    } catch (error) {
      console.warn('Error during LLM extraction service termination:', error);
    }
  }

  // Static method for quick one-off extraction (following OCR service pattern)
  static async quickExtract(
    text: string,
    context?: ExtractionContext,
    provider: 'openai' | 'anthropic' = 'openai'
  ): Promise<ExtractedPlace[]> {
    const service = new LLMExtractionService({
      primaryProvider: provider,
      enableFallback: false
    });

    try {
      const result = await service.extractFromSource('quick-extract', text, context);
      return result.places;
    } finally {
      await service.terminate();
    }
  }

  // Validate source before processing
  static validateSource(source: { id: string; text: string }): { isValid: boolean; error?: string } {
    if (!source.id || !source.text) {
      return {
        isValid: false,
        error: 'Source must have id and text'
      };
    }

    if (source.text.trim().length < 10) {
      return {
        isValid: false,
        error: 'Text content too short for meaningful extraction'
      };
    }

    if (source.text.length > 50000) {
      return {
        isValid: false,
        error: 'Text content too long (max 50,000 characters)'
      };
    }

    return { isValid: true };
  }
}

// Export singleton instance for shared use (following OCR service pattern)
export const llmExtractionService = new LLMExtractionService();