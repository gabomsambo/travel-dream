import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { BaseLLMProvider } from './base-provider';
import {
  ExtractedPlace,
  ExtractionContext,
  LLMProviderConfig,
  LLMError,
  LLMErrorType
} from '@/types/llm-extraction';
import { PLACE_KINDS } from '@/types/database';

// Zod schema for OpenAI structured outputs
// NOTE: OpenAI structured outputs requires .nullable() instead of .optional()
const ExtractedPlaceZodSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.object({
    city: z.string().max(100).nullable().default(null),
    state: z.string().max(100).nullable().default(null),
    country: z.string().max(100).nullable().default(null),
    address: z.string().max(500).nullable().default(null)
  }),
  description: z.string().max(1000).nullable().default(null),
  kind: z.enum(PLACE_KINDS as any),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    price_level: z.string().max(50).nullable().default(null),
    best_time: z.string().max(100).nullable().default(null),
    activities: z.array(z.string().max(100)).max(20).nullable().default(null),
    cuisine: z.array(z.string().max(50)).max(10).nullable().default(null),
    amenities: z.array(z.string().max(100)).max(20).nullable().default(null),
    tags: z.array(z.string().max(50)).max(20).nullable().default(null),
    vibes: z.array(z.string().max(50)).max(15).nullable().default(null)
  })
});

const ExtractedPlacesArrayZodSchema = z.object({
  places: z.array(ExtractedPlaceZodSchema).max(50)
});

type ExtractedPlacesResponse = z.infer<typeof ExtractedPlacesArrayZodSchema>;

// Default configuration for OpenAI provider
const DEFAULT_OPENAI_CONFIG: Partial<LLMProviderConfig> = {
  model: 'gpt-4o-2024-08-06',
  maxTokens: 4000,
  temperature: 0.1, // Low temperature for consistent extraction
  timeout: 30000,
  retryAttempts: 3,
  rateLimitPerMinute: 60,
  costLimitPerDay: 10.0
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

Always return a JSON object with a "places" array, even if empty. Extract generously - better to capture rich context than sparse data.`;

export class OpenAIProvider extends BaseLLMProvider {
  private client: OpenAI;
  private promptVersion = '2.0.0';

  constructor(config: LLMProviderConfig) {
    super({ ...DEFAULT_OPENAI_CONFIG, ...config });
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout
    });
  }

  get name(): string {
    return 'openai';
  }

  get model(): string {
    return this.config.model;
  }

  // Main extraction method using structured outputs
  async extractPlaces(text: string, context?: ExtractionContext): Promise<ExtractedPlace[]> {
    try {
      await this.initialize();

      const prompt = this.buildPrompt(text, context);
      const response = await this.callLLM(prompt, context);

      // Response is already validated by OpenAI structured outputs
      return response.places as ExtractedPlace[] || [];

    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }

      // Convert OpenAI errors to LLMError
      if (error instanceof OpenAI.APIError) {
        throw this.handleOpenAIError(error);
      }

      throw new LLMError(
        LLMErrorType.SERVER_ERROR,
        undefined,
        undefined,
        `OpenAI extraction failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Core LLM call with structured outputs (100% JSON compliance)
  protected async callLLM(prompt: string, context?: ExtractionContext): Promise<ExtractedPlacesResponse> {
    try {
      // Use OpenAI's structured outputs for guaranteed JSON schema compliance
      const completion = await this.client.beta.chat.completions.parse({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: zodResponseFormat(ExtractedPlacesArrayZodSchema, 'travel_extraction'),
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      const message = completion.choices[0]?.message;
      if (!message?.parsed) {
        throw new LLMError(
          LLMErrorType.VALIDATION_ERROR,
          undefined,
          undefined,
          'OpenAI returned no parsed content'
        );
      }

      // Track token usage for cost calculation
      if (completion.usage) {
        this.lastTokenUsage = {
          input: completion.usage.prompt_tokens,
          output: completion.usage.completion_tokens,
          total: completion.usage.total_tokens
        };
      }

      return message.parsed;

    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        throw this.handleOpenAIError(error);
      }
      throw error;
    }
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

    prompt += '\n\nEXTRACT places following the schema exactly. Focus on actionable travel recommendations with appropriate confidence scores.';

    return prompt;
  }

  // Token estimation for cost calculation
  estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for English
    // Add overhead for system prompt and response structure
    const textTokens = Math.ceil(text.length / 4);
    const systemPromptTokens = Math.ceil(SYSTEM_PROMPT.length / 4);
    const responseOverhead = 200; // Estimated JSON structure overhead

    return textTokens + systemPromptTokens + responseOverhead;
  }

  // Enhanced cost calculation using actual token usage
  getCost(inputTokens: number, outputTokens: number): number {
    const costs = {
      'gpt-4o-2024-08-06': { input: 0.0025, output: 0.01 },
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4-turbo': { input: 0.01, output: 0.03 }
    };

    const modelCosts = costs[this.config.model as keyof typeof costs] || costs['gpt-4o-2024-08-06'];
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

  // Handle OpenAI-specific errors
  private handleOpenAIError(error: any): LLMError {
    switch (error.status) {
      case 429:
        const retryAfter = error.headers?.['retry-after']
          ? parseInt(error.headers['retry-after'])
          : undefined;
        return new LLMError(
          LLMErrorType.RATE_LIMIT,
          429,
          retryAfter,
          'OpenAI rate limit exceeded'
        );

      case 401:
        return new LLMError(
          LLMErrorType.AUTHENTICATION,
          401,
          undefined,
          'Invalid OpenAI API key'
        );

      case 400:
        return new LLMError(
          LLMErrorType.INVALID_REQUEST,
          400,
          undefined,
          `OpenAI request error: ${error.message}`
        );

      case 402:
        return new LLMError(
          LLMErrorType.QUOTA_EXCEEDED,
          402,
          undefined,
          'OpenAI quota exceeded'
        );

      case 500:
      case 502:
      case 503:
        return new LLMError(
          LLMErrorType.SERVER_ERROR,
          error.status,
          undefined,
          'OpenAI server error'
        );

      default:
        return new LLMError(
          LLMErrorType.NETWORK,
          error.status,
          undefined,
          `OpenAI API error: ${error.message}`
        );
    }
  }

  // Health check with minimal token usage
  async isHealthy(): Promise<boolean> {
    try {
      // Use a very simple test to minimize cost
      const testCompletion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{
          role: 'user',
          content: 'Hello'
        }],
        max_tokens: 1
      });

      return !!testCompletion.choices[0]?.message?.content;
    } catch (error) {
      console.error('OpenAI health check failed:', error);
      return false;
    }
  }

  // Validate configuration
  protected validateConfig(): void {
    super.validateConfig();

    if (!this.config.apiKey.startsWith('sk-')) {
      throw new Error('Invalid OpenAI API key format');
    }

    const supportedModels = [
      'gpt-4o-2024-08-06',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4o'
    ];

    if (!supportedModels.includes(this.config.model)) {
      throw new Error(`Unsupported OpenAI model: ${this.config.model}. Supported: ${supportedModels.join(', ')}`);
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
      provider: 'openai',
      model: this.config.model,
      prompt_version: this.promptVersion,
      structured_outputs: true,
      cost_stats: baseStats,
      health: await this.healthCheck()
    };
  }

  // Batch processing optimization for OpenAI
  async batchExtract(
    sources: Array<{ id: string; text: string; context?: ExtractionContext }>,
    maxConcurrent: number = 5 // OpenAI allows higher concurrency
  ) {
    // Use higher concurrency for OpenAI but still respect rate limits
    return super.batchExtract(sources, Math.min(maxConcurrent, 5));
  }

  // Fine-tuning support (future enhancement)
  async createFineTuningJob(trainingData: any[]): Promise<string> {
    throw new Error('Fine-tuning not yet implemented for travel extraction');
  }
}