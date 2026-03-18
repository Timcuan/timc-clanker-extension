import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set up chrome global mock BEFORE any imports of bg-tab
const mockTabs = {
  create: vi.fn(),
  remove: vi.fn(),
  sendMessage: vi.fn(),
  onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
};

// @ts-ignore
globalThis.chrome = { tabs: mockTabs };

describe('bg-tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTabs.remove.mockResolvedValue(undefined);
  });

  it('exports bgTab and resetBgTabState functions', async () => {
    const mod = await import('../bg-tab.js');
    expect(typeof mod.bgTab).toBe('function');
    expect(typeof mod.resetBgTabState).toBe('function');
  });

  it('retryMessageForTest: retries until success', async () => {
    const { retryMessageForTest } = await import('../bg-tab.js');

    let calls = 0;
    const send = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls < 3) throw new Error('not ready');
      return { name: 'Test', symbol: 'TEST', socials: {} };
    });

    const result = await retryMessageForTest<{ name: string }>(send as () => Promise<{ name: string }>, 3, 10);
    expect(result.name).toBe('Test');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('retryMessageForTest: throws after max retries', async () => {
    const { retryMessageForTest } = await import('../bg-tab.js');

    const send = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(retryMessageForTest(send, 3, 10)).rejects.toThrow('Content script unavailable');
    expect(send).toHaveBeenCalledTimes(3);
  });
});
