import { PlaceKind } from './database';

// LLM extraction result for a single place
export interface ExtractedPlace {
  name: string;
  location: {
    city?: string;
    state?: string;
    country?: string;
    address?: string;
  };
  description?: string;
  kind: PlaceKind; // matches places.kind taxonomy
  confidence: number; // 0.0-1.0
  metadata: {
    price_level?: string;
    best_time?: string;
    activities?: string[];
    cuisine?: string[]; // for restaurants
    amenities?: string[]; // for hotels
    tags?: string[]; // general categorization tags
    vibes?: string[]; // atmosphere descriptors
  };
}

// Context for extraction to improve accuracy
export interface ExtractionContext {
  sourceType?: 'screenshot' | 'url' | 'note';
  platform?: string; // instagram, tiktok, blog, etc.
  language?: string; // BCP-47 language code
  userHints?: {
    expectedPlaceTypes?: PlaceKind[];
    location?: string; // user's current location context
    travelPurpose?: string; // business, leisure, etc.
  };
}

// Provider interface for LLM integrations
export interface LLMProvider {
  name: string;
  model: string;

  // Core extraction method
  extractPlaces(text: string, context?: ExtractionContext): Promise<ExtractedPlace[]>;

  // Cost and token management
  estimateTokens(text: string): number;
  getCost(inputTokens: number, outputTokens: number): number;

  // Validation and health checks
  validateResponse(response: unknown): Promise<ExtractedPlace[]>;
  isHealthy(): Promise<boolean>;

  // Configuration
  getConfig(): LLMProviderConfig;
  updateConfig(config: Partial<LLMProviderConfig>): void;
}

// Configuration for LLM providers
export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number; // milliseconds
  retryAttempts: number;
  rateLimitPerMinute: number;
  costLimitPerDay: number; // USD
}

// Processing metadata for tracking and analysis
export interface ExtractionMetadata {
  // Processing details
  model: string;
  prompt_version: string;
  processing_time_ms: number;

  // Token usage and cost
  tokens_used: {
    input: number;
    output: number;
    total: number;
  };
  cost_usd: number;

  // Quality metrics
  confidence_avg: number;
  confidence_min: number;
  confidence_max: number;
  places_extracted: number;

  // Error handling
  retries: number;
  errors?: string[];

  // Timestamps
  started_at: string;
  completed_at: string;
}

// Complete extraction result with metadata
export interface ExtractionResult {
  success: boolean;
  places: ExtractedPlace[];
  metadata: ExtractionMetadata;
  sourceId: string;
  error?: string;
}

// Batch processing result
export interface BatchExtractionResult {
  success: boolean;
  results: ExtractionResult[];
  summary: {
    total_sources: number;
    successful: number;
    failed: number;
    total_places_extracted: number;
    total_cost_usd: number;
    avg_processing_time_ms: number;
  };
  errors?: string[];
}

// Provider-specific error types
export enum LLMErrorType {
  RATE_LIMIT = 'RATE_LIMIT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  AUTHENTICATION = 'AUTHENTICATION',
  TIMEOUT = 'TIMEOUT',
  NETWORK = 'NETWORK',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BUDGET_EXCEEDED = 'BUDGET_EXCEEDED'
}

export class LLMError extends Error {
  constructor(
    public type: LLMErrorType,
    public statusCode?: number,
    public retryAfter?: number,
    message?: string
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

// Queue management types
export interface ProcessingJob {
  id: string;
  sourceId: string;
  priority: number; // higher = more priority
  context?: ExtractionContext;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  scheduledAt?: string;
  provider?: string;
}

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retry';
  progress: number; // 0-100
  result?: ExtractionResult;
  error?: string;
  updatedAt: string;
}

// Cost tracking and budget management
export interface CostTracker {
  provider: string;
  model: string;
  date: string; // YYYY-MM-DD
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  budget_limit_usd: number;
  budget_remaining_usd: number;
}

// Statistics and monitoring
export interface ExtractionStats {
  period: 'hour' | 'day' | 'week' | 'month';
  timestamp: string;

  // Volume metrics
  sources_processed: number;
  places_extracted: number;

  // Quality metrics
  avg_confidence: number;
  accuracy_rate?: number; // if feedback available

  // Performance metrics
  avg_processing_time_ms: number;
  success_rate: number;

  // Cost metrics
  total_cost_usd: number;
  cost_per_source: number;

  // Provider breakdown
  provider_stats: Record<string, {
    requests: number;
    success_rate: number;
    avg_cost: number;
    avg_processing_time_ms: number;
  }>;
}

// Source metadata extensions for LLM processing
export interface SourceLLMMetadata {
  llm_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  llm_provider?: string;
  llm_model?: string;
  llm_processing_time_ms?: number;
  llm_cost_usd?: number;
  llm_confidence_avg?: number;
  llm_places_extracted?: number;
  llm_error?: string;
  llm_processed_at?: string;
  llm_retry_count?: number;
}