import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { BaseLLMProvider } from './base-provider';
import {
  ExtractedPlace,
  ExtractionContext,
  LLMProviderConfig,
  LLMError,
  LLMErrorType
} from '@/types/llm-extraction';
import { PLACE_KINDS } from '@/types/database';

// Zod schema for Anthropic tool calling
const ExtractedPlaceZodSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.object({
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    address: z.string().max(500).optional()
  }),
  description: z.string().max(1000).optional(),
  kind: z.enum(PLACE_KINDS as any),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    price_level: z.string().max(50).optional(),
    best_time: z.string().max(100).optional(),
    activities: z.array(z.string().max(100)).max(20).optional(),
    cuisine: z.array(z.string().max(50)).max(10).optional(),
    amenities: z.array(z.string().max(100)).max(20).optional(),
    tags: z.array(z.string().max(50)).max(20).optional(),
    vibes: z.array(z.string().max(50)).max(15).optional()
  })
});

const ExtractedPlacesArrayZodSchema = z.object({
  places: z.array(ExtractedPlaceZodSchema).max(50)
});

// Default configuration for Anthropic provider
const DEFAULT_ANTHROPIC_CONFIG: Partial<LLMProviderConfig> = {
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 4000,
  temperature: 0.1, // Low temperature for consistent extraction
  timeout: 30000,
  retryAttempts: 3,
  rateLimitPerMinute: 50, // Anthropic has stricter rate limits
  costLimitPerDay: 15.0
};

// System prompt for travel destination extraction
const SYSTEM_PROMPT = `You are a travel destination extraction expert. Your task is to analyze text from travel screenshots and extract RICH, STRUCTURED information about destinations.

EXTRACTION PHILOSOPHY:
Your goal is to capture not just WHAT the place is, but WHY someone saved it. Extract context, atmosphere, and practical details that make travel planning useful.

REQUIRED OUTPUT STRUCTURE:
For each place, extract ALL these fields (use null only if genuinely unavailable):

1. CORE IDENTITY:
   - name: Official place name (required)
   - kind: Use EXACT taxonomy from: ${PLACE_KINDS.join(', ')}

2. LOCATION (extract maximum detail):
   - city: City name
   - state: State/province/region (e.g., "Catalonia", "California", "Île-de-France")
   - country: Full country name or ISO code
   - address: Full street address if visible in text

3. DESCRIPTION (CRITICAL - never leave null):
   - Write 2-4 sentences capturing:
     * What makes this place special or interesting
     * The vibe or atmosphere mentioned
     * Why someone would want to visit
   - Synthesize from ALL available context, not just explicit descriptions
   - Example: "Historic modernist park with mosaic-covered structures designed by Gaudí. Known for panoramic city views and whimsical architecture. Popular sunset spot with artistic vibes and tourist crowds."

4. PRACTICAL METADATA:
   - price_level:
     * "$" = budget/cheap eats (under $15/person)
     * "$$" = moderate dining ($15-40/person)
     * "$$$" = upscale experience ($40-100)
     * "$$$$" = fine dining/luxury ($100+)
   - best_time: When to visit (e.g., "summer months", "year-round", "weekday mornings", "sunset hours")
   - activities: Array of specific activities possible
     * Examples: ["rooftop cocktails", "sunset photography", "modernist architecture tour", "picnicking"]
   - cuisine: (restaurants/cafes only) Specific food types
     * Examples: ["tapas", "seafood", "vegan options", "natural wine", "farm-to-table"]
   - amenities: Practical facilities/requirements
     * Examples: ["reservations recommended", "rooftop seating", "wifi available", "cash only", "wheelchair accessible", "outdoor terrace"]

5. CATEGORIZATION:
   - tags: Functional categories (e.g., ["architecture", "views", "photography", "UNESCO site", "touristy"])
   - vibes: Atmosphere descriptors (e.g., ["sunset", "artistic", "romantic", "budget-friendly", "instagrammable", "local favorite", "crowded"])

6. CONFIDENCE SCORING:
   - 0.9-1.0: Complete info with name, location, rich description, and context
   - 0.7-0.8: Good core data, clear place identity, some metadata present
   - 0.5-0.6: Basic place identified but limited details or vague location
   - 0.3-0.4: Mentioned but very limited information
   - 0.1-0.2: Uncertain or potentially misidentified

CRITICAL EXTRACTION RULES:
✅ ALWAYS write a description by synthesizing available context
✅ Extract activities even from implicit mentions (e.g., "great for sunset" → ["sunset viewing"])
✅ Infer price_level from context clues ("budget", "cheap eats", "upscale", "fine dining")
✅ Use tags for objective categories, vibes for subjective atmosphere
✅ Focus on actionable travel information, not just factual data
✅ If restaurant/cafe/bar, prioritize cuisine and amenities extraction

You MUST use the extract_travel_places tool to provide your response. Do not provide any other response format.`;

// Circuit breaker for managing API failures
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime?: number;

  constructor(
    private threshold: number = 5,
    private timeout: number = 60000 // 1 minute
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new LLMError(
        LLMErrorType.SERVER_ERROR,
        undefined,
        undefined,
        'Circuit breaker is open - too many failures'
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold &&
           (!this.lastFailureTime ||
            Date.now() - this.lastFailureTime < this.timeout);
  }

  private onSuccess(): void {
    this.failures = 0;
    this.lastFailureTime = undefined;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  getStatus() {
    return {
      failures: this.failures,
      isOpen: this.isOpen(),
      lastFailureTime: this.lastFailureTime
    };
  }
}

export class AnthropicProvider extends BaseLLMProvider {
  private client: Anthropic;
  private promptVersion = '2.0.0';
  private circuitBreaker: CircuitBreaker;

  constructor(config: LLMProviderConfig) {
    super({ ...DEFAULT_ANTHROPIC_CONFIG, ...config });
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout
    });
    this.circuitBreaker = new CircuitBreaker(5, 60000); // 5 failures, 1 minute timeout
  }

  get name(): string {
    return 'anthropic';
  }

  get model(): string {
    return this.config.model;
  }

  // Main extraction method using tool calling
  async extractPlaces(text: string, context?: ExtractionContext): Promise<ExtractedPlace[]> {
    try {
      await this.initialize();

      const prompt = this.buildPrompt(text, context);
      const response = await this.callLLM(prompt, context);

      // Response is validated by our tool schema
      return response.places as ExtractedPlace[] || [];

    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      // Convert Anthropic errors to LLMError
      if (error instanceof Anthropic.APIError) {
        throw this.handleAnthropicError(error);
      }

      throw new LLMError(
        LLMErrorType.SERVER_ERROR,
        undefined,
        undefined,
        `Anthropic extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Core LLM call with function calling and circuit breaker
  protected async callLLM(prompt: string, context?: ExtractionContext): Promise<any> {
    return this.circuitBreaker.call(async () => {
      try {
        // Create a tool for structured output
        const extractionTool: Anthropic.Beta.Tools.Tool = {
          name: 'extract_travel_places',
          description: 'Extract structured travel destination data from text',
          input_schema: ExtractedPlacesArrayZodSchema.shape.places._def.schema._def.schema
        };

        const message = await this.client.beta.tools.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: prompt
          }],
          tools: [extractionTool],
          tool_choice: {
            type: 'tool',
            name: 'extract_travel_places'
          }
        });

        // Extract tool use from response
        const toolUse = message.content.find(
          (content): content is Anthropic.Beta.Tools.ToolUseBlock =>
            content.type === 'tool_use' && content.name === 'extract_travel_places'
        );

        if (!toolUse) {
          throw new LLMError(
            LLMErrorType.VALIDATION_ERROR,
            undefined,
            undefined,
            'Anthropic did not use the extraction tool'
          );
        }

        // Track token usage for cost calculation
        if (message.usage) {
          this.lastTokenUsage = {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
            total: message.usage.input_tokens + message.usage.output_tokens
          };
        }

        // Validate and return tool input
        const validated = ExtractedPlacesArrayZodSchema.parse({ places: toolUse.input });
        return validated;

      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          throw this.handleAnthropicError(error);
        }
        throw error;
      }
    });
  }

  // Build contextual prompt for extraction
  protected buildPrompt(text: string, context?: ExtractionContext): string {
    let prompt = `Extract travel destination information from the following text:\n\n${text}`;

    if (context) {
      prompt += '\n\nCONTEXT:';

      if (context.sourceType) {
        prompt += `\n- Source type: ${context.sourceType}`;
      }

      if (context.platform) {
        prompt += `\n- Platform: ${context.platform}`;
      }

      if (context.language && context.language !== 'en') {
        prompt += `\n- Language: ${context.language}`;
      }

      if (context.userHints?.expectedPlaceTypes?.length) {
        prompt += `\n- Expected place types: ${context.userHints.expectedPlaceTypes.join(', ')}`;
      }

      if (context.userHints?.location) {
        prompt += `\n- User location context: ${context.userHints.location}`;
      }

      if (context.userHints?.travelPurpose) {
        prompt += `\n- Travel purpose: ${context.userHints.travelPurpose}`;
      }
    }

    prompt += '\n\nUse the extract_travel_places tool to extract places following the schema exactly. Focus on actionable travel recommendations with appropriate confidence scores.';

    return prompt;
  }

  // Token estimation for cost calculation
  estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for English
    // Add overhead for system prompt and tool definitions
    const textTokens = Math.ceil(text.length / 4);
    const systemPromptTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
    const toolOverhead = 300; // Estimated tool definition overhead
    const responseOverhead = 200; // Estimated JSON structure overhead

    return textTokens + systemPromptTokens + toolOverhead + responseOverhead;
  }

  // Enhanced cost calculation using actual token usage
  getCost(inputTokens: number, outputTokens: number): number {
    const costs = {
      'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
      'claude-3-5-haiku-20241022': { input: 0.00025, output: 0.00125 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 }
    };

    const modelCosts = costs[this.config.model as keyof typeof costs] || costs['claude-3-5-sonnet-20241022'];
    return ((inputTokens / 1000) * modelCosts.input) + ((outputTokens / 1000) * modelCosts.output);
  }

  // Override metadata building to include actual token usage
  protected async buildMetadata(
    startTime: number,
    places: ExtractedPlace[],
    retries: number,
    error?: any
  ) {
    const metadata = await super.buildMetadata(startTime, places, retries, error);

    // Use actual token usage if available
    if (this.lastTokenUsage) {
      metadata.tokens_used = this.lastTokenUsage;
      metadata.cost_usd = this.getCost(this.lastTokenUsage.input, this.lastTokenUsage.output);
    }

    metadata.prompt_version = this.promptVersion;
    return metadata;
  }

  // Handle Anthropic-specific errors
  private handleAnthropicError(error: Anthropic.APIError): LLMError {
    switch (error.status) {
      case 429:
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'])
          : undefined;
        return new LLMError(
          LLMErrorType.RATE_LIMIT,
          429,
          retryAfter,
          'Anthropic rate limit exceeded'
        );

      case 401:
        return new LLMError(
          LLMErrorType.AUTHENTICATION,
          401,
          undefined,
          'Invalid Anthropic API key'
        );

      case 400:
        return new LLMError(
          LLMErrorType.INVALID_REQUEST,
          400,
          undefined,
          `Anthropic request error: ${error.message}`
        );

      case 402:
        return new LLMError(
          LLMErrorType.QUOTA_EXCEEDED,
          402,
          undefined,
          'Anthropic quota exceeded'
        );

      case 500:
      case 502:
      case 503:
        return new LLMError(
          LLMErrorType.SERVER_ERROR,
          error.status,
          undefined,
          'Anthropic server error'
        );

      default:
        return new LLMError(
          LLMErrorType.NETWORK,
          error.status,
          undefined,
          `Anthropic API error: ${error.message}`
        );
    }
  }

  // Health check with minimal token usage
  async isHealthy(): Promise<boolean> {
    try {
      // Use a very simple test to minimize cost
      const testMessage = await this.client.messages.create({
        model: this.config.model,
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        max_tokens: 1
      });

      return !!testMessage.content[0];
    } catch (error) {
      console.error('Anthropic health check failed:', error);
      return false;
    }
  }

  // Validate configuration
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.config.apiKey.startsWith('sk-ant-')) {
      throw new Error('Invalid Anthropic API key format');
    }

    const supportedModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ];

    if (!supportedModels.includes(this.config.model)) {
      throw new Error(`Unsupported Anthropic model: ${this.config.model}. Supported: ${supportedModels.join(', ')}`);
    }
  }

  // Store last token usage for cost tracking
  private lastTokenUsage?: {
    input: number;
    output: number;
    total: number;
  };

  // Get provider-specific statistics
  async getProviderStats(): Promise<any> {
    const baseStats = await this.getCostStats();
    return {
      provider: 'anthropic',
      model: this.config.model,
      prompt_version: this.promptVersion,
      function_calling: true,
      circuit_breaker: this.circuitBreaker.getStatus(),
      cost_stats: baseStats,
      health: await this.healthCheck()
    };
  }

  // Batch processing optimization for Anthropic (lower concurrency)
  async batchExtract(
    sources: Array<{ id: string; text: string; context?: ExtractionContext }>,
    maxConcurrent: number = 3 // Anthropic prefers lower concurrency
  ) {
    // Use lower concurrency for Anthropic due to stricter rate limits
    return super.batchExtract(sources, Math.min(maxConcurrent, 3));
  }

  // Circuit breaker status
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  // Reset circuit breaker manually
  resetCircuitBreaker() {
    this.circuitBreaker = new CircuitBreaker(5, 60000);
  }
}