import { GoogleGenerativeAI } from '@google/generative-ai';
import { PLACE_KINDS } from '@/types/database';
import type { GeminiExtractedPlace, GeminiExtractionResult, ImageContext } from '@/types/extraction-pipeline';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = [429, 500, 503];

// ─── Prompt (verbatim from scripts/test-extraction-pipeline.ts) ──────────────

const GEMINI_PROMPT = `You are an expert at analyzing Instagram and social media screenshots to extract travel destination information.

You can SEE this image. Use BOTH the visible text AND visual context (photos, logos, UI elements, maps, icons) to extract place data.

## YOUR TASK
Identify every distinct travel destination, restaurant, hotel, attraction, or place mentioned in this screenshot. Return structured JSON.

## VISUAL CONTEXT CLUES (use these!)
- Instagram location pins/stickers → place name + city
- Google Maps screenshots → place name from the pin, area from the map
- Instagram "saved" collections or lists → each item is a separate place
- Story highlights with location tags → extract the tagged location
- Review screenshots (Google, TripAdvisor) → place name + rating + city from header
- Travel blog screenshots → extract each recommended place
- "Top 10" or numbered lists → each number is a separate place
- Photo content: beach photo = likely "beach" kind, food photo = likely "restaurant" kind
- Instagram account names like @hotelname → the hotel itself is a place
- Map views → infer city/country from visible map area even if not explicitly written

## MULTI-PLACE DETECTION
Many screenshots contain MULTIPLE places. Split them:
- Bulleted or numbered lists → one place per item
- Comma-separated lists (e.g., "Restaurants: La Mar, Central, Maido") → separate places
- Instagram carousels showing different locations → each is distinct
- City guides with sections → each section item is a place
- "Day 1: X, Day 2: Y" itineraries → each day's places are separate
- If a screenshot shows a CITY overview, extract the city itself AND any specific places mentioned within it

## PLACE KIND TAXONOMY (use exactly one per place):
city, neighborhood, landmark, museum, gallery, viewpoint, park, beach, natural, stay, hostel, hotel, restaurant, cafe, bar, club, market, shop, experience, tour, thermal, festival, transit, tip

Kind selection guidance:
- "stay" = generic accommodation (Airbnb, villa, rental)
- "hotel" = named hotel brand/property
- "experience" = cooking class, wine tasting, guided activity
- "tip" = general travel advice, not a specific place
- "natural" = waterfall, volcano, canyon, lake, mountain
- "landmark" = famous monument, bridge, building, temple, church
- "transit" = airport, train station, ferry terminal

## RESPONSE FORMAT
Return ONLY valid JSON (no markdown fences, no commentary). Use this exact structure:

{
  "places": [
    {
      "name": "Place Name",
      "kind": "restaurant",
      "city": "City Name",
      "country": "Country Name",
      "admin": "State/Province/Region",
      "description": "2-3 sentences about what makes this place special, the atmosphere, why someone saved this screenshot.",
      "tags": ["tag1", "tag2"],
      "vibes": ["romantic", "hidden-gem"],
      "confidence": 0.85,
      "price_level": "$$",
      "best_time": "summer evenings",
      "activities": ["sunset viewing", "wine tasting"],
      "cuisine": ["seafood", "Mediterranean"],
      "amenities": ["outdoor terrace", "reservations required"],
      "practicalInfo": "Cash only. Enter from the side street.",
      "recommendedBy": "@instagramhandle or 'Travel Blog Name'"
    }
  ],
  "imageContext": {
    "platform": "instagram",
    "contentType": "story|post|reel|saved|screenshot|list|map|review",
    "language": "en",
    "hasMap": false,
    "hasPhoto": true,
    "textDensity": "low|medium|high"
  }
}

## FIELD GUIDELINES

**name**: The actual place name. Not a description. "Santorini" not "Beautiful Greek Island".
**city**: The city the place is in. For a city-level place, city = the city itself.
**country**: Full country name preferred ("Japan" not "JP"). Infer from visual context if not written.
**admin**: State, province, or region ("Bali" for places in Bali, "Andalusia" for southern Spain).
**description**: Synthesize from what you see. What is this place? Why did someone save it? What's the vibe? Use null only if you truly have zero context.
**tags**: Objective categories: ["architecture", "food", "nightlife", "nature", "history", "shopping", "wellness", "adventure", "culture", "photography", "UNESCO"]
**vibes**: Subjective atmosphere: ["romantic", "trendy", "budget", "luxurious", "authentic", "touristy", "hidden-gem", "family-friendly", "instagrammable", "cozy", "lively", "peaceful", "artsy"]
**confidence**: How certain are you this is a real, identifiable place?
  - 0.9-1.0: Clear name + location, rich context
  - 0.7-0.8: Clear name, location inferable
  - 0.5-0.6: Name visible but location uncertain
  - 0.3-0.4: Partial info, may be wrong
  - 0.1-0.2: Guessing
**price_level**: "$" (budget) / "$$" (moderate) / "$$$" (upscale) / "$$$$" (luxury). null if unknown.
**cuisine**: Only for restaurants/cafes/bars. e.g., ["Japanese", "ramen", "izakaya"]
**amenities**: Practical facilities. e.g., ["wifi", "pet-friendly", "pool", "rooftop", "parking"]
**practicalInfo**: Tips like "Book 2 months ahead", "Closed Mondays", "Bring cash"
**recommendedBy**: If you can identify who shared/recommended this (Instagram handle, blog name, friend's name)

## CRITICAL RULES
1. Extract EVERY place you can identify. When in doubt, include it with lower confidence.
2. Do NOT extract non-places: hashtags, general tips without a specific location, or UI text.
3. Do NOT invent details. Use null for fields you cannot determine.
4. If the image has NO identifiable places (e.g., a selfie, a meme, generic text), return {"places": [], "imageContext": {...}}.
5. For city-level entries (e.g., a post about "Tokyo"), kind = "city" and extract any specific sub-places as separate entries too.
6. Always try to determine the country even if not explicitly written -- use visual context, language, cuisine type, architecture style.`;

// ─── Service Class ───────────────────────────────────────────────────────────

export class GeminiExtractionService {
  private client: GoogleGenerativeAI;
  private model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>;

  constructor(config?: { apiKey?: string; model?: string }) {
    const apiKey = config?.apiKey || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY required. Get one at https://aistudio.google.com/'
      );
    }

    const modelName = config?.model || process.env.GEMINI_EXTRACTION_MODEL || DEFAULT_MODEL;
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: modelName });
  }

  async extractFromImage(
    imageBuffer: Buffer,
    fileName: string = 'unknown'
  ): Promise<GeminiExtractionResult> {
    const startTime = Date.now();
    const mimeType = this.detectMimeType(imageBuffer);
    const base64Image = imageBuffer.toString('base64');

    const imagePart = {
      inlineData: { data: base64Image, mimeType },
    };

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await this.model.generateContent({
          contents: [{ role: 'user', parts: [{ text: GEMINI_PROMPT }, imagePart] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        });

        let rawText = result.response.text().trim();
        rawText = this.stripMarkdownFences(rawText);

        const parsed = JSON.parse(rawText);
        const places = this.normalizePlaces(Array.isArray(parsed.places) ? parsed.places : []);
        const imageContext: ImageContext | null = parsed.imageContext || null;

        return {
          places,
          imageContext,
          rawResponse: rawText,
          extractionTimeMs: Date.now() - startTime,
        };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const status = (error as { status?: number })?.status;
        const isRetryable = RETRYABLE_STATUSES.includes(status ?? 0);

        if (!isRetryable || attempt === MAX_RETRIES - 1) throw lastError;

        const delay = 1000 * Math.pow(2, attempt);
        console.warn(
          `[GeminiExtraction] Retry ${attempt + 1}/${MAX_RETRIES} for ${fileName} after ${delay}ms`
        );
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Failed after all retries');
  }

  private detectMimeType(buffer: Buffer): string {
    if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
    if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
    if (buffer.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46]))) return 'image/webp';
    return 'image/png';
  }

  private stripMarkdownFences(text: string): string {
    return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  }

  private normalizePlaces(raw: GeminiExtractedPlace[]): GeminiExtractedPlace[] {
    const kindSet = new Set<string>(PLACE_KINDS);
    return raw.map(p => ({
      name: typeof p.name === 'string' ? p.name.trim() : '',
      kind: (kindSet.has(p.kind) ? p.kind : 'landmark') as typeof p.kind,
      city: typeof p.city === 'string' ? p.city.trim() : null,
      country: typeof p.country === 'string' ? p.country.trim() : null,
      admin: typeof p.admin === 'string' ? p.admin.trim() : null,
      description: typeof p.description === 'string' ? p.description.trim() : null,
      tags: Array.isArray(p.tags) ? p.tags : null,
      vibes: Array.isArray(p.vibes) ? p.vibes : null,
      confidence: Math.max(0, Math.min(1, typeof p.confidence === 'number' ? p.confidence : 0.5)),
      price_level: typeof p.price_level === 'string' ? p.price_level : null,
      best_time: typeof p.best_time === 'string' ? p.best_time.trim() : null,
      activities: Array.isArray(p.activities) ? p.activities : null,
      cuisine: Array.isArray(p.cuisine) ? p.cuisine : null,
      amenities: Array.isArray(p.amenities) ? p.amenities : null,
      practicalInfo: typeof p.practicalInfo === 'string' ? p.practicalInfo.trim() : null,
      recommendedBy: typeof p.recommendedBy === 'string' ? p.recommendedBy.trim() : null,
    }));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

let _geminiExtractionInstance: GeminiExtractionService | null = null;
export function getGeminiExtractionService() {
  if (!_geminiExtractionInstance) _geminiExtractionInstance = new GeminiExtractionService();
  return _geminiExtractionInstance;
}
