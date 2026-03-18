import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally BEFORE imports
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

// @ts-ignore — mock chrome.storage for existing processImageUrl/processImageBlob functions
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};

beforeEach(() => vi.clearAllMocks());

describe('validateImageUrl', () => {
  it('returns "verified" for 200 + image/png content-type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'image/png' : null },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    const result = await validateImageUrl('https://example.com/img.png');
    expect(result).toBe('verified');
  });

  it('returns "verified" for image/jpeg', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'image/jpeg; charset=utf-8' },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    expect(await validateImageUrl('https://example.com/img.jpg')).toBe('verified');
  });

  it('returns "unverified" for 200 + text/html content-type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    expect(await validateImageUrl('https://example.com/page')).toBe('unverified');
  });

  it('returns "invalid" for 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    expect(await validateImageUrl('https://example.com/missing.png')).toBe('invalid');
  });

  it('returns "unverified" on network error (CORS)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { validateImageUrl } = await import('../image-pipeline.js');
    expect(await validateImageUrl('https://example.com/cors.png')).toBe('unverified');
  });
});
