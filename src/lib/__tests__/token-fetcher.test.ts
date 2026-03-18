import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem's isAddress
vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    isAddress: vi.fn((addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr)),
  };
});

// Mock getPublicClient from chains.ts
vi.mock('../chains.js', () => ({
  getPublicClient: vi.fn(),
  CHAIN_CONFIG: {
    8453: { name: 'Base', explorer: 'https://basescan.org' },
  },
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

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

const VALID_ADDR = '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`;

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(sessionStore).forEach(k => delete sessionStore[k]);
  (chrome.storage.session.get as any).mockImplementation(async (key: string) => ({ [key]: sessionStore[key] }));
  (chrome.storage.session.set as any).mockImplementation(async (obj: Record<string, any>) => { Object.assign(sessionStore, obj); });
});

describe('fetchToken', () => {
  it('throws for invalid address', async () => {
    const { fetchToken } = await import('../token-fetcher.js');
    await expect(fetchToken('0xinvalid' as any, 8453)).rejects.toThrow('Invalid contract address');
  });

  it('merges Clanker API + RPC results (RPC name wins over API)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'ApiName', symbol: 'API', img_url: 'https://img.com/tok.png', chain_id: 8453 }),
    });
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'success', result: 'OnchainName' },
        { status: 'success', result: 'OCN' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    // RPC name takes priority over API name
    expect(result.name).toBe('OnchainName');
    expect(result.symbol).toBe('OCN');
    // imageUrl comes from Clanker API (not available on-chain)
    expect(result.imageUrl).toBe('https://img.com/tok.png');
  });

  it('uses API name when RPC returns empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'ApiOnly', symbol: 'AO', img_url: null, chain_id: 8453 }),
    });
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'failure' },
        { status: 'failure' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    expect(result.name).toBe('ApiOnly');
    expect(result.symbol).toBe('AO');
  });

  it('handles array response from Clanker API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ name: 'ArrayToken', symbol: 'ARR', img_url: undefined, chain_id: 8453 }] }),
    });
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'failure' }, { status: 'failure' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    expect(result.name).toBe('ArrayToken');
  });

  it('succeeds with only RPC when API fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'success', result: 'RPCName' },
        { status: 'success', result: 'RPC' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    expect(result.name).toBe('RPCName');
  });

  it('throws when both API and RPC fail', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockRejectedValueOnce(new Error('rpc down'));

    const { fetchToken } = await import('../token-fetcher.js');
    await expect(fetchToken(VALID_ADDR, 8453)).rejects.toThrow('Token not found on any source');
  });

  it('caches result on second call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'CacheMe', symbol: 'CM', chain_id: 8453 }),
    });
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValue({
      multicall: vi.fn().mockResolvedValue([
        { status: 'success', result: 'CacheMe' },
        { status: 'success', result: 'CM' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    await fetchToken(VALID_ADDR, 8453);
    await fetchToken(VALID_ADDR, 8453);

    // Only 1 fetch call — second was cache hit
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
