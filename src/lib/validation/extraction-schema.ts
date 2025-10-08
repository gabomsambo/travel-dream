import { JSONSchemaType } from 'ajv';
import { ExtractedPlace, ExtractionResult, BatchExtractionResult } from '@/types/llm-extraction';
import { PLACE_KINDS } from '@/types/database';

// Schema version for migration support
export const CURRENT_SCHEMA_VERSION = '1.0.0';

// ExtractedPlace JSON Schema with type safety
export const extractedPlaceSchema: JSONSchemaType<ExtractedPlace> = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    location: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          nullable: true,
          maxLength: 100
        },
        state: {
          type: 'string',
          nullable: true,
          maxLength: 100
        },
        country: {
          type: 'string',
          nullable: true,
          maxLength: 100
        },
        address: {
          type: 'string',
          nullable: true,
          maxLength: 500
        }
      },
      required: [],
      additionalProperties: false
    },
    description: {
      type: 'string',
      nullable: true,
      maxLength: 1000
    },
    kind: {
      type: 'string',
      enum: [...PLACE_KINDS] as any[] // AJV requires any[] for const arrays
    },
    confidence: {
      type: 'number',
      minimum: 0.0,
      maximum: 1.0
    },
    metadata: {
      type: 'object',
      properties: {
        price_level: {
          type: 'string',
          nullable: true,
          maxLength: 50
        },
        best_time: {
          type: 'string',
          nullable: true,
          maxLength: 100
        },
        activities: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 100
          },
          nullable: true,
          maxItems: 20
        },
        cuisine: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 50
          },
          nullable: true,
          maxItems: 10
        },
        amenities: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 100
          },
          nullable: true,
          maxItems: 20
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 50
          },
          nullable: true,
          maxItems: 20
        },
        vibes: {
          type: 'array',
          items: {
            type: 'string',
            maxLength: 50
          },
          nullable: true,
          maxItems: 15
        }
      },
      required: [],
      additionalProperties: false
    }
  },
  required: ['name', 'location', 'kind', 'confidence', 'metadata'],
  additionalProperties: false
};

// Schema for array of extracted places
export const extractedPlacesArraySchema: JSONSchemaType<ExtractedPlace[]> = {
  type: 'array',
  items: extractedPlaceSchema,
  minItems: 0,
  maxItems: 50 // Reasonable limit for single OCR extraction
};

// Extraction metadata schema (using any to avoid complex type issues)
export const extractionMetadataSchema = {
  type: 'object',
  properties: {
    model: { type: 'string', minLength: 1 },
    prompt_version: { type: 'string', minLength: 1 },
    processing_time_ms: { type: 'number', minimum: 0 },
    tokens_used: {
      type: 'object',
      properties: {
        input: { type: 'number', minimum: 0 },
        output: { type: 'number', minimum: 0 },
        total: { type: 'number', minimum: 0 }
      },
      required: ['input', 'output', 'total'],
      additionalProperties: false
    },
    cost_usd: { type: 'number', minimum: 0 },
    confidence_avg: { type: 'number', minimum: 0, maximum: 1 },
    confidence_min: { type: 'number', minimum: 0, maximum: 1 },
    confidence_max: { type: 'number', minimum: 0, maximum: 1 },
    places_extracted: { type: 'number', minimum: 0 },
    retries: { type: 'number', minimum: 0 },
    errors: {
      type: 'array',
      items: { type: 'string' },
      nullable: true
    },
    started_at: { type: 'string', format: 'date-time' },
    completed_at: { type: 'string', format: 'date-time' }
  },
  required: [
    'model',
    'prompt_version',
    'processing_time_ms',
    'tokens_used',
    'cost_usd',
    'confidence_avg',
    'confidence_min',
    'confidence_max',
    'places_extracted',
    'retries',
    'started_at',
    'completed_at'
  ],
  additionalProperties: false
};

// Complete extraction result schema
export const extractionResultSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    places: extractedPlacesArraySchema,
    metadata: extractionMetadataSchema,
    sourceId: { type: 'string', pattern: '^src_[a-f0-9-]+$' },
    error: { type: 'string', nullable: true }
  },
  required: ['success', 'places', 'metadata', 'sourceId'],
  additionalProperties: false
};

// Schema versioning support
export const schemaVersions = {
  '1.0.0': {
    extractedPlace: extractedPlaceSchema,
    extractedPlacesArray: extractedPlacesArraySchema,
    extractionResult: extractionResultSchema,
    extractionMetadata: extractionMetadataSchema
  }
};

// Get schema by version (for migration support)
export function getSchemaByVersion(version: string) {
  const versionSchemas = schemaVersions[version as keyof typeof schemaVersions];
  if (!versionSchemas) {
    throw new Error(`Unsupported schema version: ${version}`);
  }
  return versionSchemas;
}

// Validation for LLM provider responses (relaxed for error recovery)
export const llmResponseSchema = {
  type: 'object',
  properties: {
    places: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          kind: { type: 'string' }, // Will be validated separately against PLACE_KINDS
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string', nullable: true },
              state: { type: 'string', nullable: true },
              country: { type: 'string', nullable: true },
              address: { type: 'string', nullable: true }
            },
            required: [],
            additionalProperties: true // Allow extra fields for error recovery
          },
          description: { type: 'string', nullable: true },
          metadata: {
            type: 'object',
            additionalProperties: true, // Allow any metadata fields
            nullable: true
          }
        },
        required: ['name', 'kind', 'confidence'],
        additionalProperties: true // Allow extra fields for recovery
      }
    }
  },
  required: ['places'],
  additionalProperties: true // Allow extra response fields
};

// Confidence score thresholds for quality assessment
export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8,      // Auto-approve for library
  MEDIUM: 0.6,    // Needs review but likely good
  LOW: 0.4,       // Requires manual review
  VERY_LOW: 0.2   // Likely needs manual correction
} as const;

// Validation error types for better error handling
export enum SchemaValidationError {
  INVALID_PLACE_KIND = 'INVALID_PLACE_KIND',
  CONFIDENCE_OUT_OF_RANGE = 'CONFIDENCE_OUT_OF_RANGE',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT = 'INVALID_FORMAT',
  FIELD_TOO_LONG = 'FIELD_TOO_LONG',
  TOO_MANY_ITEMS = 'TOO_MANY_ITEMS'
}

// Helper function to categorize confidence levels
export function categorizeConfidence(confidence: number): string {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'low';
  return 'very_low';
}

// Helper function to determine if place should auto-approve
export function shouldAutoApprove(place: ExtractedPlace): boolean {
  return (
    place.confidence >= CONFIDENCE_THRESHOLDS.HIGH &&
    place.name.length > 2 &&
    !!place.location.city && // Must have city
    PLACE_KINDS.includes(place.kind) // Valid place kind
  );
}