import Ajv, { JSONSchemaType, ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import {
  ExtractedPlace,
  LLMError,
  LLMErrorType,
  ExtractionResult
} from '@/types/llm-extraction';
import { PLACE_KINDS } from '@/types/database';
import {
  extractedPlaceSchema,
  extractedPlacesArraySchema,
  llmResponseSchema,
  extractionResultSchema,
  CURRENT_SCHEMA_VERSION,
  SchemaValidationError,
  categorizeConfidence
} from './extraction-schema';

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
  recovered?: boolean; // Indicates if data was recovered from errors
}

export interface ValidationError {
  type: SchemaValidationError;
  field: string;
  message: string;
  value?: any;
  suggestion?: string;
}

// Main validator class with error recovery
export class ExtractionValidator {
  private ajv: Ajv;
  private validatePlace: ValidateFunction<ExtractedPlace>;
  private validatePlaces: ValidateFunction<ExtractedPlace[]>;
  private validateLLMResponseInternal: ValidateFunction<any>;
  private validateExtractionResult: ValidateFunction<any>;

  constructor() {
    // Initialize AJV with TypeScript support and formats
    this.ajv = new Ajv({
      allErrors: true,
      removeAdditional: true,
      useDefaults: true,
      coerceTypes: true,
      strict: false // Allow some flexibility for LLM responses
    });

    // Add format validation (date-time, etc.)
    addFormats(this.ajv);

    // Compile validators
    this.validatePlace = this.ajv.compile(extractedPlaceSchema);
    this.validatePlaces = this.ajv.compile(extractedPlacesArraySchema);
    this.validateLLMResponseInternal = this.ajv.compile(llmResponseSchema);
    this.validateExtractionResult = this.ajv.compile(extractionResultSchema);
  }

  // Main validation method with error recovery
  async validateExtractedPlaces(
    data: unknown,
    context: string = 'validation',
    retryCount: number = 0
  ): Promise<ValidationResult<ExtractedPlace[]>> {
    try {
      // First, try to parse if it's a string
      let parsedData = data;
      if (typeof data === 'string') {
        parsedData = this.attemptJSONParsing(data);
      }

      // Extract places array from various possible structures
      const placesArray = this.extractPlacesFromResponse(parsedData);

      // Validate and recover each place
      const validatedPlaces: ExtractedPlace[] = [];
      const errors: ValidationError[] = [];
      let hasRecoveredData = false;

      for (let i = 0; i < placesArray.length; i++) {
        const place = placesArray[i];
        const placeResult = await this.validateSinglePlace(place, `${context}.place[${i}]`);

        if (placeResult.success && placeResult.data) {
          validatedPlaces.push(placeResult.data);
          if (placeResult.recovered) {
            hasRecoveredData = true;
          }
        } else if (placeResult.errors) {
          errors.push(...placeResult.errors);
        }
      }

      // Return results
      if (validatedPlaces.length > 0) {
        return {
          success: true,
          data: validatedPlaces,
          errors: errors.length > 0 ? errors : undefined,
          recovered: hasRecoveredData
        };
      } else {
        return {
          success: false,
          errors: errors.length > 0 ? errors : [
            {
              type: SchemaValidationError.INVALID_FORMAT,
              field: 'places',
              message: 'No valid places could be extracted'
            }
          ]
        };
      }

    } catch (error) {
      console.error(`Validation error in ${context}:`, error);

      // Retry with alternative parsing if this is the first attempt
      if (retryCount === 0 && typeof data === 'string') {
        return this.validateExtractedPlaces(
          this.attemptAlternativeParsing(data as string),
          context,
          retryCount + 1
        );
      }

      return {
        success: false,
        errors: [{
          type: SchemaValidationError.INVALID_FORMAT,
          field: 'root',
          message: error instanceof Error ? error.message : 'Unknown validation error'
        }]
      };
    }
  }

  // Validate a single extracted place with recovery
  private async validateSinglePlace(
    place: any,
    context: string
  ): Promise<ValidationResult<ExtractedPlace>> {
    try {
      // Attempt recovery first
      const recoveredPlace = this.recoverPlaceData(place);

      // Validate with AJV
      if (this.validatePlace(recoveredPlace)) {
        return {
          success: true,
          data: recoveredPlace,
          recovered: place !== recoveredPlace
        };
      }

      // If validation fails, try to fix common issues
      const errors = this.convertAJVErrors(this.validatePlace.errors || [], context);
      const fixedPlace = this.attemptPlaceFixes(recoveredPlace, errors);

      if (this.validatePlace(fixedPlace)) {
        return {
          success: true,
          data: fixedPlace,
          recovered: true
        };
      }

      return {
        success: false,
        errors: this.convertAJVErrors(this.validatePlace.errors || [], context)
      };

    } catch (error) {
      return {
        success: false,
        errors: [{
          type: SchemaValidationError.INVALID_FORMAT,
          field: context,
          message: error instanceof Error ? error.message : 'Unknown error'
        }]
      };
    }
  }

  // Attempt to parse JSON with various recovery strategies
  private attemptJSONParsing(text: string): any {
    try {
      return JSON.parse(text);
    } catch (error) {
      // Try to extract JSON from text (common LLM issue)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          // Fall through to alternative parsing
        }
      }

      // Try to extract array from text
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch {
          // Fall through to alternative parsing
        }
      }

      throw new LLMError(
        LLMErrorType.VALIDATION_ERROR,
        undefined,
        undefined,
        `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Alternative parsing for severely malformed responses
  private attemptAlternativeParsing(text: string): any {
    // Remove markdown code blocks if present
    text = text.replace(/```json\n?|```\n?/g, '');

    // Try to fix common JSON issues
    text = text
      .replace(/'/g, '"') // Single quotes to double quotes
      .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Unquoted keys
      .replace(/:\s*([^",{\[\]]+)([,}])/g, ':"$1"$2') // Unquoted string values
      .replace(/,\s*[}\]]/g, '}') // Trailing commas
      .trim();

    try {
      return JSON.parse(text);
    } catch {
      // Last resort: try to extract key information manually
      return this.manualTextExtraction(text);
    }
  }

  // Manual text extraction as last resort
  private manualTextExtraction(text: string): any {
    const places: any[] = [];

    // Look for patterns that might indicate place information
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      // Simple pattern matching for place-like information
      const nameMatch = line.match(/name[:\s]*["']?([^"',\n]+)["']?/i);
      const kindMatch = line.match(/(?:type|kind|category)[:\s]*["']?([^"',\n]+)["']?/i);
      const cityMatch = line.match(/city[:\s]*["']?([^"',\n]+)["']?/i);

      if (nameMatch) {
        places.push({
          name: nameMatch[1].trim(),
          kind: kindMatch ? kindMatch[1].trim() : 'restaurant',
          confidence: 0.3, // Low confidence for manual extraction
          location: {
            city: cityMatch ? cityMatch[1].trim() : undefined
          },
          metadata: {}
        });
      }
    }

    return { places };
  }

  // Extract places array from various response structures
  private extractPlacesFromResponse(data: any): any[] {
    if (Array.isArray(data)) {
      return data;
    }

    if (data && typeof data === 'object') {
      // Check common property names
      if (Array.isArray(data.places)) return data.places;
      if (Array.isArray(data.results)) return data.results;
      if (Array.isArray(data.locations)) return data.locations;
      if (Array.isArray(data.destinations)) return data.destinations;

      // If single object that looks like a place, wrap in array
      if (data.name && (data.kind || data.type)) {
        return [data];
      }
    }

    return [];
  }

  // Recover and normalize place data
  private recoverPlaceData(place: any): any {
    if (!place || typeof place !== 'object') {
      throw new Error('Invalid place data');
    }

    // Normalize field names (handle common variations)
    const recovered = {
      name: place.name || place.title || place.placeName || '',
      kind: this.normalizeKind(place.kind || place.type || place.category || 'restaurant'),
      confidence: this.normalizeConfidence(place.confidence || place.score || 0.5),
      location: {
        city: place.location?.city || place.city || undefined,
        state: place.location?.state || place.state || place.region || undefined,
        country: place.location?.country || place.country || undefined,
        address: place.location?.address || place.address || undefined
      },
      description: place.description || place.summary || undefined,
      metadata: {
        price_level: place.metadata?.price_level || place.price || place.priceLevel || undefined,
        best_time: place.metadata?.best_time || place.bestTime || place.timing || undefined,
        activities: this.normalizeArray(place.metadata?.activities || place.activities),
        cuisine: this.normalizeArray(place.metadata?.cuisine || place.cuisine),
        amenities: this.normalizeArray(place.metadata?.amenities || place.amenities),
        tags: this.normalizeArray(place.metadata?.tags || place.tags),
        vibes: this.normalizeArray(place.metadata?.vibes || place.vibes || place.atmosphere)
      }
    };

    // Clean up empty values
    Object.keys(recovered.location).forEach(key => {
      if (!recovered.location[key as keyof typeof recovered.location]) {
        delete recovered.location[key as keyof typeof recovered.location];
      }
    });

    Object.keys(recovered.metadata).forEach(key => {
      if (!recovered.metadata[key as keyof typeof recovered.metadata]) {
        delete recovered.metadata[key as keyof typeof recovered.metadata];
      }
    });

    return recovered;
  }

  // Normalize place kind to valid taxonomy
  private normalizeKind(kind: string): string {
    const normalized = kind.toLowerCase().trim();

    // Direct match
    if (PLACE_KINDS.includes(normalized as any)) {
      return normalized;
    }

    // Common mappings
    const mappings: Record<string, string> = {
      'food': 'restaurant',
      'dining': 'restaurant',
      'eatery': 'restaurant',
      'restaurant': 'restaurant',
      'accommodation': 'hotel',
      'lodging': 'hotel',
      'attraction': 'landmark',
      'sightseeing': 'landmark',
      'activity': 'experience',
      'entertainment': 'experience',
      'shopping': 'shop',
      'store': 'shop',
      'transport': 'transit',
      'transportation': 'transit'
    };

    return mappings[normalized] || 'landmark'; // Default fallback
  }

  // Normalize confidence score
  private normalizeConfidence(confidence: any): number {
    if (typeof confidence === 'number') {
      return Math.max(0, Math.min(1, confidence));
    }

    if (typeof confidence === 'string') {
      const parsed = parseFloat(confidence);
      if (!isNaN(parsed)) {
        return Math.max(0, Math.min(1, parsed));
      }

      // Handle qualitative confidence
      const lower = confidence.toLowerCase();
      if (lower.includes('high')) return 0.8;
      if (lower.includes('medium')) return 0.6;
      if (lower.includes('low')) return 0.4;
    }

    return 0.5; // Default medium confidence
  }

  // Normalize arrays and filter invalid entries
  private normalizeArray(value: any): string[] | undefined {
    if (!value) return undefined;

    if (Array.isArray(value)) {
      const filtered = value
        .filter(item => typeof item === 'string' && item.trim().length > 0)
        .map(item => item.trim().toLowerCase())
        .slice(0, 20); // Limit array size

      return filtered.length > 0 ? filtered : undefined;
    }

    if (typeof value === 'string') {
      const items = value.split(/[,;]/).map(item => item.trim().toLowerCase());
      return items.length > 0 ? items : undefined;
    }

    return undefined;
  }

  // Attempt to fix common validation errors
  private attemptPlaceFixes(place: any, errors: ValidationError[]): any {
    const fixed = { ...place };

    for (const error of errors) {
      switch (error.type) {
        case SchemaValidationError.INVALID_PLACE_KIND:
          fixed.kind = this.normalizeKind(fixed.kind || 'restaurant');
          break;

        case SchemaValidationError.CONFIDENCE_OUT_OF_RANGE:
          fixed.confidence = this.normalizeConfidence(fixed.confidence);
          break;

        case SchemaValidationError.MISSING_REQUIRED_FIELD:
          if (error.field.includes('name') && !fixed.name) {
            fixed.name = 'Unknown Location';
          }
          break;

        case SchemaValidationError.FIELD_TOO_LONG:
          if (error.field.includes('name') && fixed.name?.length > 200) {
            fixed.name = fixed.name.substring(0, 200);
          }
          if (error.field.includes('description') && fixed.description?.length > 1000) {
            fixed.description = fixed.description.substring(0, 1000);
          }
          break;
      }
    }

    return fixed;
  }

  // Convert AJV errors to our ValidationError format
  private convertAJVErrors(ajvErrors: ErrorObject[], context: string): ValidationError[] {
    return ajvErrors.map(error => {
      const field = error.instancePath ? `${context}${error.instancePath}` : context;

      let type: SchemaValidationError;
      let suggestion: string | undefined;

      switch (error.keyword) {
        case 'enum':
          type = SchemaValidationError.INVALID_PLACE_KIND;
          suggestion = `Valid values: ${error.schema.join(', ')}`;
          break;
        case 'minimum':
        case 'maximum':
          type = SchemaValidationError.CONFIDENCE_OUT_OF_RANGE;
          suggestion = `Value must be between 0.0 and 1.0`;
          break;
        case 'required':
          type = SchemaValidationError.MISSING_REQUIRED_FIELD;
          suggestion = `Field ${error.params?.missingProperty} is required`;
          break;
        case 'maxLength':
          type = SchemaValidationError.FIELD_TOO_LONG;
          suggestion = `Maximum length is ${error.schema} characters`;
          break;
        default:
          type = SchemaValidationError.INVALID_FORMAT;
      }

      return {
        type,
        field,
        message: error.message || 'Validation error',
        value: error.data,
        suggestion
      };
    });
  }

  // Error handling wrapper following db-utils pattern
  async withValidationHandling<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      console.error(`Validation error in ${context}:`, error);

      if (error instanceof LLMError) {
        throw error; // Re-throw LLM-specific errors
      }

      if (error instanceof Error) {
        // Handle specific validation errors
        if (error.message.includes('JSON')) {
          throw new LLMError(
            LLMErrorType.VALIDATION_ERROR,
            undefined,
            undefined,
            `JSON parsing failed: ${error.message}`
          );
        }

        if (error.message.includes('schema')) {
          throw new LLMError(
            LLMErrorType.VALIDATION_ERROR,
            undefined,
            undefined,
            `Schema validation failed: ${error.message}`
          );
        }
      }

      throw new LLMError(
        LLMErrorType.VALIDATION_ERROR,
        undefined,
        undefined,
        `Validation operation failed: ${context}`
      );
    }
  }

  // Public convenience method for validating LLM responses
  async validateLLMResponse(response: unknown, context: string = 'llm_response'): Promise<ValidationResult<ExtractedPlace[]>> {
    return this.withValidationHandling(
      () => this.validateExtractedPlaces(response, context),
      context
    );
  }

  // Get validation statistics for monitoring
  getValidationStats(): any {
    return {
      schema_version: CURRENT_SCHEMA_VERSION,
      validators_compiled: {
        place: !!this.validatePlace,
        places: !!this.validatePlaces,
        llm_response: !!this.validateLLMResponseInternal,
        extraction_result: !!this.validateExtractionResult
      }
    };
  }
}