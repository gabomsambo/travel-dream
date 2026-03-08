/**
 * @jest-environment node
 */

// ── Mock Google Generative AI SDK (BEFORE imports) ─────────────────────
// Store the mock fn in a closure the factory can capture
const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => {
  // Access the variable via closure — works because jest.mock factory
  // is called at runtime (despite being hoisted), and mockGenerateContent
  // is defined as a var-like jest.fn() that IS initialized by then.
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: (...args: unknown[]) => mockGenerateContent(...args),
      }),
    })),
  };
});

// Mock PLACE_KINDS used by normalizePlaces
jest.mock('@/types/database', () => ({
  PLACE_KINDS: [
    'city', 'neighborhood', 'landmark', 'museum', 'gallery', 'viewpoint',
    'park', 'beach', 'natural', 'stay', 'hostel', 'hotel', 'restaurant',
    'cafe', 'bar', 'club', 'market', 'shop', 'experience', 'tour',
    'thermal', 'festival', 'transit', 'tip',
  ],
}));

// ── Import AFTER mock setup ────────────────────────────────────────────
import { GeminiExtractionService } from '@/lib/mass-upload/gemini-extraction-service';

// ── Helpers ────────────────────────────────────────────────────────────
function createGeminiResponse(places: Record<string, unknown>[], imageContext: Record<string, unknown> | null = null) {
  return {
    response: {
      text: () => JSON.stringify({ places, imageContext }),
    },
  };
}

const validPlace = {
  name: 'Test Place',
  kind: 'restaurant',
  city: 'Tokyo',
  country: 'Japan',
  admin: null,
  description: 'A nice place',
  tags: ['food'],
  vibes: ['cozy'],
  confidence: 0.9,
  price_level: '$$',
  best_time: null,
  activities: null,
  cuisine: ['japanese'],
  amenities: null,
  practicalInfo: null,
  recommendedBy: null,
};

describe('GeminiExtractionService', () => {
  let service: GeminiExtractionService;
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff]); // JPEG magic bytes

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new GeminiExtractionService({ apiKey: 'test-api-key' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('normalizes invalid kind to landmark', async () => {
    mockGenerateContent.mockResolvedValue(
      createGeminiResponse([{ ...validPlace, kind: 'invalid_kind' }])
    );

    const result = await service.extractFromImage(pngBuffer, 'test.png');
    expect(result.places[0].kind).toBe('landmark');
  });

  it('clamps confidence outside 0-1 range', async () => {
    mockGenerateContent.mockResolvedValue(
      createGeminiResponse([
        { ...validPlace, confidence: 5.0 },
      ])
    );

    const result = await service.extractFromImage(pngBuffer, 'test.png');
    expect(result.places[0].confidence).toBe(1);
  });

  it('strips markdown code fences from response', async () => {
    const jsonStr = JSON.stringify({
      places: [validPlace],
      imageContext: null,
    });
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '```json\n' + jsonStr + '\n```' },
    });

    const result = await service.extractFromImage(jpegBuffer, 'test.jpg');
    expect(result.places).toHaveLength(1);
    expect(result.places[0].name).toBe('Test Place');
  });

  it('retries on 429 status error', async () => {
    const retryError = new Error('429 Too Many Requests');
    (retryError as unknown as Record<string, unknown>).status = 429;

    mockGenerateContent
      .mockRejectedValueOnce(retryError)
      .mockResolvedValueOnce(createGeminiResponse([validPlace]));

    const promise = service.extractFromImage(pngBuffer, 'test.png');
    await jest.advanceTimersByTimeAsync(2000); // advance past 1s backoff
    const result = await promise;
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(result.places).toHaveLength(1);
  });

  it('does NOT retry on 400 errors', async () => {
    const nonRetryError = new Error('400 Bad Request');
    (nonRetryError as unknown as Record<string, unknown>).status = 400;

    mockGenerateContent.mockRejectedValue(nonRetryError);

    await expect(service.extractFromImage(pngBuffer, 'test.png')).rejects.toThrow('400 Bad Request');
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it('throws after MAX_RETRIES exhausted', async () => {
    jest.useRealTimers(); // Use real timers for this test — backoff sleeps are short with mocked rejections

    const retryError = new Error('503 Service Unavailable');
    (retryError as unknown as Record<string, unknown>).status = 503;

    mockGenerateContent.mockRejectedValue(retryError);

    await expect(service.extractFromImage(pngBuffer, 'test.png')).rejects.toThrow('503 Service Unavailable');
    // MAX_RETRIES = 3, so it should try 3 times total
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  }, 15000);
});
