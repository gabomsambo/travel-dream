import type { AuthUser } from '@/lib/auth-helpers';

// ── Mock User Factory ──────────────────────────────────────────────────
export function createMockUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user_test-1',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    ...overrides,
  };
}

// ── Mock Source Factory ────────────────────────────────────────────────
export function createMockSource(overrides: Record<string, unknown> = {}) {
  return {
    id: 'src_test-1',
    userId: 'user_test-1',
    type: 'screenshot',
    uri: 'https://blob.vercel-storage.com/test-image.jpg',
    hash: { sha1: 'blob_test-hash' },
    ocrText: null,
    lang: 'en',
    meta: {
      uploadInfo: {
        sessionId: 'session_test-1',
        originalName: 'photo.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      },
    },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    processingStatus: 'queued',
    processingAttempts: 0,
    processingError: null,
    processingStartedAt: null,
    ...overrides,
  };
}

// ── Mock Session Factory ───────────────────────────────────────────────
export function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session_test-1',
    userId: 'user_test-1',
    startedAt: '2026-03-01T00:00:00.000Z',
    fileCount: 10,
    completedCount: 5,
    failedCount: 0,
    status: 'active',
    meta: {
      uploadedFiles: ['src_test-1', 'src_test-2'],
      processingQueue: [],
      errors: [],
    },
    ...overrides,
  };
}

// ── Mock Extraction Result Factory ─────────────────────────────────────
export function createMockExtractionResult(overrides: Record<string, unknown> = {}) {
  return {
    places: [
      {
        name: 'Test Restaurant',
        kind: 'restaurant',
        city: 'Tokyo',
        country: 'Japan',
        admin: null,
        description: 'A great restaurant',
        tags: ['food', 'japanese'],
        vibes: ['cozy'],
        confidence: 0.85,
        price_level: '$$',
        best_time: null,
        activities: null,
        cuisine: ['japanese'],
        amenities: null,
        practicalInfo: null,
        recommendedBy: null,
      },
    ],
    imageContext: {
      platform: 'instagram',
      contentType: 'screenshot',
      language: 'en',
      hasMap: false,
      hasPhoto: true,
      textDensity: 'medium',
    },
    rawResponse: '{"places":[]}',
    extractionTimeMs: 1500,
    ...overrides,
  };
}

// ── Mock Pipeline Place Factory ────────────────────────────────────────
export function createMockPipelinePlace(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Restaurant',
    kind: 'restaurant',
    city: 'Tokyo',
    country: 'Japan',
    admin: 'Tokyo',
    description: 'A great restaurant',
    tags: ['food'],
    vibes: ['cozy'],
    confidence: 0.85,
    price_level: '$$',
    best_time: null,
    activities: null,
    cuisine: ['japanese'],
    amenities: null,
    practicalInfo: null,
    recommendedBy: null,
    coords: { lat: 35.6762, lon: 139.6503 },
    address: '1-1-1 Shibuya, Tokyo',
    googlePlaceId: 'ChIJ_test_place_id',
    ...overrides,
  };
}

