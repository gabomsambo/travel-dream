import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import {
  ExtractedPlace,
  ExtractionContext,
  LLMProvider,
  LLMProviderConfig,
  LLMError,
  LLMErrorType,
  ExtractionMetadata,
  ExtractionResult,
  CostTracker
} from '@/types/llm-extraction';
import { ExtractionValidator } from '@/lib/validation/validator';

// Provider health status
export interface ProviderHealth {
  healthy: boolean;
  latency?: number;
  lastCheck: string;
  errors: string[];
  rateLimitRemaining?: number;
}

// Rate limiting configuration
export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerDay: number;
  costPerDay: number; // USD
  burstLimit?: number;
}

// Default rate limits (conservative for production)
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  requestsPerMinute: 60,
  tokensPerDay: 100000,
  costPerDay: 10.0,
  burstLimit: 10
};

// Token cost mapping for common models
export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  // OpenAI GPT-4 (per 1K tokens)
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },

  // Anthropic Claude (per 1K tokens)
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },

  // Default fallback
  'default': { input: 0.001, output: 0.002 }
};

// Progress tracking for batch operations
export interface ProcessingProgress {
  total: number;
  completed: number;
  failed: number;
  currentItem?: string;
  progress: number; // 0-100
  estimatedTimeRemaining?: number;
}

// Base abstract provider class
export abstract class BaseLLMProvider implements LLMProvider {
  protected config: LLMProviderConfig;
  protected rateLimit: Ratelimit | null;
  protected redis: Redis | null;
  protected validator: ExtractionValidator;
  protected isInitialized = false;
  protected health: ProviderHealth;
  protected costTracker: Map<string, CostTracker> = new Map();
  protected progressCallback?: (progress: ProcessingProgress) => void;
  protected rateLimitEnabled = false;

  // Abstract methods that must be implemented by subclasses
  abstract get name(): string;
  abstract get model(): string;
  abstract extractPlaces(text: string, context?: ExtractionContext): Promise<ExtractedPlace[]>;
  abstract estimateTokens(text: string): number;
  protected abstract callLLM(prompt: string, context?: ExtractionContext): Promise<any>;
  protected abstract buildPrompt(text: string, context?: ExtractionContext): string;

  constructor(config: LLMProviderConfig) {
    this.config = { ...config };
    this.validator = new ExtractionValidator();
    this.health = {
      healthy: false,
      lastCheck: new Date().toISOString(),
      errors: []
    };

    // Initialize Redis and rate limiting (optional)
    try {
      const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
      const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

      if (redisUrl && redisToken && redisUrl.startsWith('https')) {
        this.redis = Redis.fromEnv();
        this.rateLimit = new Ratelimit({
          redis: this.redis,
          limiter: Ratelimit.slidingWindow(
            config.rateLimitPerMinute || DEFAULT_RATE_LIMITS.requestsPerMinute,
            '60 s'
          ),
          analytics: true,
          prefix: `llm-provider`
        });
        this.rateLimitEnabled = true;
        console.log(`[${this.name}] Rate limiting enabled with Upstash Redis`);
      } else {
        this.redis = null;
        this.rateLimit = null;
        this.rateLimitEnabled = false;
        console.warn(`[${this.name}] Redis not configured - rate limiting disabled`);
      }
    } catch (error) {
      this.redis = null;
      this.rateLimit = null;
      this.rateLimitEnabled = false;
      console.warn(`[${this.name}] Failed to initialize Redis:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Initialize provider (following OCR service pattern)
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Validate configuration
      this.validateConfig();

      // Test provider connectivity
      await this.healthCheck();

      // Initialize cost tracking for today
      await this.initializeCostTracking();

      this.isInitialized = true;
    } catch (error) {
      throw new LLMError(
        LLMErrorType.INVALID_REQUEST,
        undefined,
        undefined,
        `Failed to initialize ${this.name} provider: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Set progress callback (following OCR service pattern)
  setProgressCallback(callback: (progress: ProcessingProgress) => void): void {
    this.progressCallback = callback;
  }

  // Main extraction method with rate limiting and error handling
  async extractFromSource(sourceId: string, text: string, context?: ExtractionContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    let retries = 0;

    try {
      await this.initialize();

      // Check rate limits
      await this.checkRateLimits(sourceId);

      // Check budget limits
      await this.checkBudget();

      // Extract places with retry logic
      const result = await this.retryExtraction(text, context, this.config.retryAttempts || 3);

      // Track costs
      const metadata = await this.buildMetadata(startTime, result.places, retries);
      await this.updateCostTracking(metadata);

      return {
        success: true,
        places: result.places,
        metadata,
        sourceId,
        error: undefined
      };

    } catch (error) {
      const metadata = await this.buildMetadata(startTime, [], retries, error);

      return {
        success: false,
        places: [],
        metadata,
        sourceId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Batch processing with concurrency control (following OCR service pattern)
  async batchExtract(
    sources: Array<{ id: string; text: string; context?: ExtractionContext }>,
    maxConcurrent: number = 3
  ): Promise<ExtractionResult[]> {
    await this.initialize();

    const results: ExtractionResult[] = [];
    let completed = 0;

    // Process in batches to prevent overwhelming the API
    for (let i = 0; i < sources.length; i += maxConcurrent) {
      const batch = sources.slice(i, i + maxConcurrent);

      // Update progress
      if (this.progressCallback) {
        this.progressCallback({
          total: sources.length,
          completed,
          failed: results.filter(r => !r.success).length,
          progress: (completed / sources.length) * 100,
          currentItem: `Batch ${Math.floor(i / maxConcurrent) + 1}`
        });
      }

      const batchResults = await Promise.allSettled(
        batch.map(async (source) => {
          try {
            return await this.extractFromSource(source.id, source.text, source.context);
          } catch (error) {
            return {
              success: false,
              places: [],
              metadata: await this.buildMetadata(Date.now(), [], 0, error),
              sourceId: source.id,
              error: error instanceof Error ? error.message : String(error)
            } as ExtractionResult;
          }
        })
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            places: [],
            metadata: await this.buildMetadata(Date.now(), [], 0, result.reason),
            sourceId: 'unknown',
            error: result.reason?.message || 'Unknown error'
          } as ExtractionResult);
        }
      }

      completed += batch.length;

      // Small delay between batches to respect rate limits
      if (i + maxConcurrent < sources.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Final progress update
    if (this.progressCallback) {
      this.progressCallback({
        total: sources.length,
        completed,
        failed: results.filter(r => !r.success).length,
        progress: 100
      });
    }

    return results;
  }

  // Retry logic with exponential backoff (following OCR service pattern)
  protected async retryExtraction(
    text: string,
    context?: ExtractionContext,
    maxRetries: number = 3
  ): Promise<{ places: ExtractedPlace[] }> {
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.callLLMWithTimeout(text, context);
        const validationResult = await this.validator.validateExtractedPlaces(response, `provider-attempt-${attempt}`);

        if (validationResult.success && validationResult.data) {
          return { places: validationResult.data };
        } else {
          throw new LLMError(
            LLMErrorType.VALIDATION_ERROR,
            undefined,
            undefined,
            `Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`
          );
        }

      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Check if we should continue retrying based on error type
          if (error instanceof LLMError && error.type === LLMErrorType.QUOTA_EXCEEDED) {
            throw error; // Don't retry quota errors
          }
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

  // LLM call with timeout handling
  protected async callLLMWithTimeout(text: string, context?: ExtractionContext): Promise<any> {
    const timeout = this.config.timeout || 30000; // 30 second default

    return Promise.race([
      this.callLLM(text, context),
      new Promise((_, reject) =>
        setTimeout(() => reject(new LLMError(LLMErrorType.TIMEOUT, undefined, undefined, 'Request timeout')), timeout)
      )
    ]);
  }

  // Cost calculation methods
  getCost(inputTokens: number, outputTokens: number): number {
    const costs = TOKEN_COSTS[this.model] || TOKEN_COSTS.default;
    return ((inputTokens / 1000) * costs.input) + ((outputTokens / 1000) * costs.output);
  }

  // Rate limiting check
  protected async checkRateLimits(identifier: string): Promise<void> {
    // Skip rate limiting if not enabled
    if (!this.rateLimitEnabled || !this.rateLimit) {
      return;
    }

    const { success, remaining, reset } = await this.rateLimit.limit(identifier);

    if (!success) {
      throw new LLMError(
        LLMErrorType.RATE_LIMIT,
        429,
        Math.round((reset - Date.now()) / 1000),
        `Rate limit exceeded. Reset in ${Math.round((reset - Date.now()) / 1000)} seconds`
      );
    }

    this.health.rateLimitRemaining = remaining;
  }

  // Budget checking
  protected async checkBudget(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const dailyTracker = this.costTracker.get(today);

    if (dailyTracker && dailyTracker.total_cost_usd >= this.config.costLimitPerDay) {
      throw new LLMError(
        LLMErrorType.BUDGET_EXCEEDED,
        undefined,
        undefined,
        `Daily budget limit of $${this.config.costLimitPerDay} exceeded`
      );
    }
  }

  // Health check implementation
  async isHealthy(): Promise<boolean> {
    try {
      const startTime = Date.now();

      // Simple health check with minimal token usage
      const testText = "Test restaurant in Paris";
      await this.callLLMWithTimeout(testText);

      const latency = Date.now() - startTime;

      this.health = {
        healthy: true,
        latency,
        lastCheck: new Date().toISOString(),
        errors: [],
        rateLimitRemaining: this.health.rateLimitRemaining
      };

      return true;
    } catch (error) {
      this.health = {
        healthy: false,
        lastCheck: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : String(error)],
        rateLimitRemaining: this.health.rateLimitRemaining
      };

      return false;
    }
  }

  async healthCheck(): Promise<ProviderHealth> {
    await this.isHealthy();
    return this.health;
  }

  // Configuration management (following interface requirement)
  getConfig(): LLMProviderConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<LLMProviderConfig>): void {
    this.config = { ...this.config, ...config };
    // Re-initialize if necessary
    if (this.isInitialized) {
      this.isInitialized = false;
    }
  }

  // Validation and response processing
  validateResponse(response: unknown): ExtractedPlace[] {
    const result = this.validator.validateLLMResponse(response, this.name);
    if (result.success && result.data) {
      return result.data;
    }
    throw new LLMError(
      LLMErrorType.VALIDATION_ERROR,
      undefined,
      undefined,
      `Response validation failed: ${result.errors?.map(e => e.message).join(', ')}`
    );
  }

  // Helper methods
  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }
    if (!this.config.model) {
      throw new Error('Model is required');
    }
  }

  protected async initializeCostTracking(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    if (!this.costTracker.has(today)) {
      this.costTracker.set(today, {
        provider: this.name,
        model: this.model,
        date: today,
        total_requests: 0,
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
        budget_limit_usd: this.config.costLimitPerDay,
        budget_remaining_usd: this.config.costLimitPerDay
      });
    }
  }

  protected async updateCostTracking(metadata: ExtractionMetadata): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const tracker = this.costTracker.get(today)!;

    tracker.total_requests += 1;
    tracker.total_input_tokens += metadata.tokens_used.input;
    tracker.total_output_tokens += metadata.tokens_used.output;
    tracker.total_cost_usd += metadata.cost_usd;
    tracker.budget_remaining_usd = Math.max(0, tracker.budget_limit_usd - tracker.total_cost_usd);

    // Store in Redis for persistence across instances (if enabled)
    if (this.redis) {
      await this.redis.set(
        `cost-tracker:${this.name}:${today}`,
        JSON.stringify(tracker),
        { ex: 86400 } // Expire after 24 hours
      );
    }
  }

  protected async buildMetadata(
    startTime: number,
    places: ExtractedPlace[],
    retries: number,
    error?: any
  ): Promise<ExtractionMetadata> {
    const processingTime = Date.now() - startTime;
    const inputTokens = 100; // Estimate - should be overridden by subclasses
    const outputTokens = places.length * 50; // Estimate
    const cost = this.getCost(inputTokens, outputTokens);

    const confidences = places.map(p => p.confidence);

    return {
      model: this.model,
      prompt_version: '1.0.0', // Should be versioned
      processing_time_ms: processingTime,
      tokens_used: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens
      },
      cost_usd: cost,
      confidence_avg: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      confidence_min: confidences.length > 0 ? Math.min(...confidences) : 0,
      confidence_max: confidences.length > 0 ? Math.max(...confidences) : 0,
      places_extracted: places.length,
      retries,
      errors: error ? [error instanceof Error ? error.message : String(error)] : undefined,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString()
    };
  }

  // Get cost tracking statistics
  async getCostStats(days: number = 7): Promise<CostTracker[]> {
    const stats: CostTracker[] = [];

    // Return empty if Redis not available
    if (!this.redis) {
      return stats;
    }

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const cached = await this.redis.get(`cost-tracker:${this.name}:${dateStr}`);
      if (cached) {
        stats.push(JSON.parse(cached as string));
      }
    }

    return stats;
  }

  // Cleanup method (following OCR service pattern)
  async terminate(): Promise<void> {
    // Clear any ongoing operations
    this.isInitialized = false;
    this.progressCallback = undefined;

    // Store final cost tracking (if Redis enabled)
    if (this.redis) {
      const today = new Date().toISOString().split('T')[0];
      const tracker = this.costTracker.get(today);
      if (tracker) {
        await this.redis.set(
          `cost-tracker:${this.name}:${today}`,
          JSON.stringify(tracker),
          { ex: 86400 }
        );
      }
    }
  }
}