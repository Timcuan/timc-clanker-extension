import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock bg-tab and image-pipeline BEFORE importing url-fetcher
vi.mock('../bg-tab.js', () => ({
  bgTab: vi.fn(),
  resetBgTabState: vi.fn(),
}));

vi.mock('../image-pipeline.js', () => ({
  validateImageUrl: vi.fn().mockResolvedValue('verified'),
  processImageUrl: vi.fn(),
  processImageBlob: vi.fn(),
}));

// Mock chrome.storage.session
const sessionStore: Record<string, any> = {};
// @ts-ignore
globalThis.chrome = {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionStore[key] })),
      set: vi.fn(async (obj: Record<string, any>) => { Object.assign(sessionStore, obj); }),
    },
  },
};

// Mock fetch for HTML fetching
globalThis.fetch = vi.fn() as any;

// Mock crypto.subtle for sha1hex (available in node vitest)
// globalThis.crypto is available natively in Node 18+

import { bgTab } from '../bg-tab.js';
import { validateImageUrl } from '../image-pipeline.js';

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
  // Reset session mock behavior
  (chrome.storage.session.get as any).mockImplementation(async (key: string) => ({ [key]: sessionStore[key] }));
  (chrome.storage.session.set as any).mockImplementation(async (obj: Record<string, any>) => { Object.assign(sessionStore, obj); });
});

describe('fetchFromUrl', () => {
  it('rejects non-http schemes', async () => {
    const { fetchFromUrl } = await import('../url-fetcher.js');
    await expect(fetchFromUrl('ftp://example.com/file')).rejects.toThrow('Only http/https URLs are supported');
  });

  it('rejects malformed URLs', async () => {
    const { fetchFromUrl } = await import('../url-fetcher.js');
    await expect(fetchFromUrl('not-a-url')).rejects.toThrow();
  });

  it('routes twitter.com (SPA) directly to bgTab, skipping fetch', async () => {
    const scraped = { name: 'TestToken', symbol: 'TT', socials: {}, imageUrl: 'https://img.com/a.png' };
    (bgTab as any).mockResolvedValueOnce(scraped);

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://twitter.com/user/status/123');

    expect(bgTab).toHaveBeenCalledWith('https://twitter.com/user/status/123');
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.name).toBe('TestToken');
  });

  it('routes x.com (SPA) directly to bgTab', async () => {
    const scraped = { name: 'XToken', symbol: 'XT', socials: {} };
    (bgTab as any).mockResolvedValueOnce(scraped);

    const { fetchFromUrl } = await import('../url-fetcher.js');
    await fetchFromUrl('https://x.com/user/status/456');
    expect(bgTab).toHaveBeenCalledWith('https://x.com/user/status/456');
  });

  it('parses og:title from HTML for non-SPA domains', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><head>
        <meta property="og:title" content="My Token">
        <meta property="og:image" content="https://example.com/img.png">
        <meta property="og:description" content="A great token">
      </head></html>`,
    });

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://example.com/token-page');
    expect(result.name).toBe('My Token');
    expect(result.imageUrl).toBe('https://example.com/img.png');
    expect(bgTab).not.toHaveBeenCalled();
  });

  it('falls back to bgTab when fast HTML parse returns empty name', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: async () => '<html></html>' });
    (bgTab as any).mockResolvedValueOnce({ name: 'Fallback', symbol: 'FB', socials: {} });

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://some-spa-not-in-list.com/page');
    expect(bgTab).toHaveBeenCalled();
    expect(result.name).toBe('Fallback');
  });

  it('caches result — second identical call does not re-fetch', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:title" content="CachedToken">`,
    });

    const { fetchFromUrl } = await import('../url-fetcher.js');
    await fetchFromUrl('https://example.com/cached-page');
    await fetchFromUrl('https://example.com/cached-page');

    // fetch called once (HTML parse); second call hits session cache
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
