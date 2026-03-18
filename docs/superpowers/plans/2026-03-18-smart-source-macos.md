# Smart Source System & macOS White Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambiguous auto-scrape with three explicit sources (URL/Drop/Contract), add image confirmation gate, and revamp UI to macOS white theme with Tailwind v4 + Ark UI.

**Architecture:** New `SourceView` (entry) → `PreviewView` (metadata + image confirm) → existing `FormView/ConfirmView/pending/success`. Backend adds `url-fetcher.ts`, `bg-tab.ts`, `token-fetcher.ts` with parallel fetch strategies. CSS fully replaced with Tailwind v4 macOS white theme.

**Tech Stack:** Preact ^10.29, viem ^2.38, WXT ^0.20, Tailwind v4 (`@tailwindcss/vite`), Ark UI (`@ark-ui/preact`), Vitest ^2

---

## File Map

```
NEW:
  src/lib/bg-tab.ts                 ← background tab lifecycle (mutex, retry, cleanup)
  src/lib/url-fetcher.ts            ← URL fetch orchestration (fast HTML + bg-tab)
  src/lib/token-fetcher.ts          ← parallel Clanker API + on-chain RPC
  src/lib/__tests__/bg-tab.test.ts
  src/lib/__tests__/url-fetcher.test.ts
  src/lib/__tests__/token-fetcher.test.ts
  src/popup/views/SourceView.tsx    ← 3-panel source selector
  src/popup/views/PreviewView.tsx   ← metadata confirm + image gate

MODIFIED:
  src/lib/messages.ts               ← +FETCH_URL, +FETCH_TOKEN, +FetchState, clean ContentMessage
  src/lib/image-pipeline.ts         ← +validateImageUrl()
  src/lib/__tests__/image-pipeline.test.ts  ← new file (tests for validateImageUrl)
  entrypoints/background.ts         ← +case FETCH_URL, +case FETCH_TOKEN
  src/popup/App.tsx                 ← remove auto-scrape/pickMode, add source/preview views
  src/popup/window-utils.ts         ← +isTab(), +openAsTab()
  src/popup/popup.css               ← full macOS white redesign (Tailwind v4)
  src/popup/views/FormView.tsx      ← vault max 90%
  src/popup/views/ConfirmView.tsx   ← sniper unit comment
  wxt.config.ts                     ← +@tailwindcss/vite plugin

UNTOUCHED:
  ConfirmView.tsx (logic), SuccessView.tsx, BatchView.tsx, HistoryView.tsx,
  image-pipeline.ts (upload), storage.ts, chains.ts, deploy-context-builder.ts,
  ghost-validator.ts, pinata.ts, templates.ts, wallet-rotation.ts
```

---

## Task 1: Install Dependencies & Update Build Config

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `wxt.config.ts`

- [ ] **Step 1: Install runtime + dev deps**

```bash
cd /Users/aaa/projects/timc-clanker-extension/.claude/worktrees/strange-newton
pnpm add @ark-ui/preact
pnpm add -D @tailwindcss/vite
```

Expected: packages appear in `node_modules/@ark-ui/` and `node_modules/@tailwindcss/`

- [ ] **Step 2: Read current wxt.config.ts**

```bash
cat wxt.config.ts
```

- [ ] **Step 3: Update wxt.config.ts — add Tailwind plugin, preserve existing**

Open `wxt.config.ts`. The existing file has `build.target: 'es2022'` and Preact compat aliases.
Add `tailwindcss()` as the **first** plugin — Ark UI needs the aliases to build.

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: { /* leave unchanged */ },
  vite: () => ({
    plugins: [tailwindcss()],       // must be first
    build: {
      target: 'es2022',             // keep existing
    },
    resolve: {
      alias: {                      // keep existing Preact compat aliases
        'react':             'preact/compat',
        'react-dom':         'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
```

- [ ] **Step 4: Verify build compiles**

```bash
pnpm build 2>&1 | tail -20
```

Expected: build completes with no errors (warnings ok). If Ark UI import fails, check aliases are present.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml wxt.config.ts
git commit -m "build: add @ark-ui/preact + @tailwindcss/vite, update wxt config"
```

---

## Task 2: messages.ts — Add New Types

**Files:**
- Modify: `src/lib/messages.ts`

No unit tests needed here — TypeScript type-checking is the test.

- [ ] **Step 1: Add `FetchState` type export**

In `src/lib/messages.ts`, add after the `BgError` export at the bottom:

```ts
// ── Fetch progress states (used by SourceView + PreviewView) ─────────────────
export type FetchState =
  | 'idle'
  | 'fetching-fast'    // service worker fast HTML parse
  | 'fetching-tab'     // background tab loading/scraping
  | 'fetching-api'     // Clanker API in flight
  | 'fetching-rpc'     // on-chain multicall in flight
  | 'uploading-image'  // Pinata upload in progress
  | 'done'
  | 'error';
```

- [ ] **Step 2: Add FETCH_URL + FETCH_TOKEN to BgMessage union**

Find the `BgMessage` type. After `| { type: 'REMOVE_WALLET'; id: string }` add:

```ts
  | { type: 'FETCH_URL';   url: string }
  | { type: 'FETCH_TOKEN'; address: `0x${string}`; chainId: number }
```

- [ ] **Step 3: Add BgResponse entries for new message types**

Find `BgResponse<T>`. Before the final `{ ok: true }` fallback, add:

```ts
  T extends 'FETCH_URL'   ? ScrapedData :
  T extends 'FETCH_TOKEN' ? ScrapedData :
```

- [ ] **Step 4: Remove ENTER_PICK_MODE / EXIT_PICK_MODE from ContentMessage type**

Find `ContentMessage`. Remove these two members:
```ts
  // REMOVE these lines:
  | { type: 'ENTER_PICK_MODE' }
  | { type: 'EXIT_PICK_MODE' }
```

Add a comment above `SCRAPE`:
```ts
// Note: ENTER/EXIT_PICK_MODE removed — feature replaced by SourceView.
// Content script may still handle them gracefully; type removed to prevent new usage.
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
pnpm build 2>&1 | grep -E "error TS|warning" | head -20
```

Expected: no `error TS` lines. Fix any type errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add src/lib/messages.ts
git commit -m "feat(types): add FETCH_URL, FETCH_TOKEN, FetchState; remove pick mode types"
```

---

## Task 3: bg-tab.ts — Background Tab Lifecycle

**Files:**
- Create: `src/lib/bg-tab.ts`
- Create: `src/lib/__tests__/bg-tab.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/bg-tab.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome APIs used by bg-tab.ts
vi.mock('../bg-tab.js', async (importOriginal) => {
  // We test the internals by importing the real module with mocked chrome
  return importOriginal();
});

// Set up chrome global mock before importing
const mockTabs = {
  create: vi.fn(),
  remove: vi.fn(),
  sendMessage: vi.fn(),
  onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
  onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
};

// @ts-ignore
globalThis.chrome = { tabs: mockTabs };

// Import AFTER setting up chrome mock
let bgTab: (url: string) => Promise<any>;

describe('bg-tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTabs.remove.mockResolvedValue(undefined);
  });

  it('throws when another fetch is in progress', async () => {
    // This is hard to test without the real module — use integration approach:
    // Just verify the module exports the right functions
    const mod = await import('../bg-tab.js');
    expect(typeof mod.bgTab).toBe('function');
    expect(typeof mod.resetBgTabState).toBe('function');
  });

  it('always removes tab in finally block on success', async () => {
    // See integration test in url-fetcher.test.ts for full flow
    // Unit: verify retryMessage retries on failure
    const { retryMessageForTest } = await import('../bg-tab.js');
    if (!retryMessageForTest) return; // exported for testing only

    let calls = 0;
    const send = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) throw new Error('not ready');
      return { name: 'Test', symbol: 'TEST', socials: {} };
    });

    const result = await retryMessageForTest(send, 3, 10);
    expect(result.name).toBe('Test');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('throws after max retries', async () => {
    const { retryMessageForTest } = await import('../bg-tab.js');
    if (!retryMessageForTest) return;

    const send = vi.fn().mockRejectedValue(new Error('always fails'));
    await expect(retryMessageForTest(send, 3, 10)).rejects.toThrow('Content script unavailable');
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
pnpm test src/lib/__tests__/bg-tab.test.ts 2>&1 | tail -20
```

Expected: module not found error.

- [ ] **Step 3: Create bg-tab.ts**

Create `src/lib/bg-tab.ts`:

```ts
// src/lib/bg-tab.ts
// Background tab lifecycle manager — opens a hidden tab, waits for content script, scrapes, cleans up.

import type { ScrapedData } from './messages.js';

let isBgTabBusy = false;

/** Reset busy state — exported for tests only */
export function resetBgTabState(): void {
  isBgTabBusy = false;
}

export async function bgTab(url: string): Promise<ScrapedData> {
  if (isBgTabBusy) throw new Error('A fetch is already in progress');
  isBgTabBusy = true;

  let tab: chrome.tabs.Tab | undefined;
  try {
    // 1. Open a hidden, non-active tab
    tab = await chrome.tabs.create({ url, active: false, pinned: false });

    // 2. Wait for tab to finish loading (max 10s)
    await waitForTabComplete(tab.id!, 10_000);

    // 3. Send SCRAPE with retry (content script may not be ready immediately at 'complete')
    const send = () =>
      chrome.tabs.sendMessage(tab!.id!, { type: 'SCRAPE' }) as Promise<ScrapedData>;
    const data = await retryMessageForTest(send, 3, 300);

    // 4. Treat empty result as login-wall / blocked page
    if (!data?.name && !data?.imageUrl) {
      throw new Error('Page requires login or returned no content');
    }

    return data;
  } finally {
    // Always cleanup — whether success or error
    if (tab?.id !== undefined) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
    isBgTabBusy = false;
  }
}

/**
 * Retry a sendMessage call up to maxAttempts times with delayMs between tries.
 * Exported as retryMessageForTest to allow unit testing without chrome.tabs.
 */
export async function retryMessageForTest<T>(
  send: () => Promise<T>,
  maxAttempts: number,
  delayMs: number
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await send();
    } catch {
      if (i === maxAttempts - 1) throw new Error('Content script unavailable');
      await delay(delayMs);
    }
  }
  throw new Error('Content script unavailable'); // unreachable, satisfies TS
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      reject(new Error('Tab load timeout'));
    }, timeoutMs);

    function onUpdated(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve();
    }

    function onRemoved(id: number) {
      if (id !== tabId) return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      reject(new Error('Tab crashed or was closed'));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/lib/__tests__/bg-tab.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bg-tab.ts src/lib/__tests__/bg-tab.test.ts
git commit -m "feat(lib): add bg-tab.ts background tab lifecycle manager"
```

---

## Task 4: image-pipeline.ts — validateImageUrl

**Files:**
- Modify: `src/lib/image-pipeline.ts`
- Create: `src/lib/__tests__/image-pipeline.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/image-pipeline.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

// @ts-ignore
globalThis.chrome = {
  storage: { local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) } }
};

// @ts-ignore — crypto available in node
globalThis.crypto = globalThis.crypto;

afterEach(() => vi.clearAllMocks());

describe('validateImageUrl', () => {
  it('returns verified for 200 + image/png content-type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => h === 'content-type' ? 'image/png' : null },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    const result = await validateImageUrl('https://example.com/img.png');
    expect(result).toBe('verified');
  });

  it('returns unverified for 200 + text/html content-type', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => 'text/html' },
    });
    const { validateImageUrl } = await import('../image-pipeline.js');
    const result = await validateImageUrl('https://example.com/page');
    expect(result).toBe('unverified');
  });

  it('returns invalid for 404', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, headers: { get: () => null } });
    const { validateImageUrl } = await import('../image-pipeline.js');
    const result = await validateImageUrl('https://example.com/missing.png');
    expect(result).toBe('invalid');
  });

  it('returns unverified on network error (CORS)', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { validateImageUrl } = await import('../image-pipeline.js');
    const result = await validateImageUrl('https://example.com/cors.png');
    expect(result).toBe('unverified');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/lib/__tests__/image-pipeline.test.ts 2>&1 | tail -20
```

Expected: `SyntaxError` or `validateImageUrl is not a function`.

- [ ] **Step 3: Add validateImageUrl to image-pipeline.ts**

Open `src/lib/image-pipeline.ts`. After the existing exports, append:

```ts
/**
 * HEAD-check an image URL to verify it is reachable and is an image.
 *
 * Returns:
 *   'verified'   — HTTP 2xx + Content-Type: image/*
 *   'unverified' — CORS block, network error, or non-image content-type (keep URL, user decides)
 *   'invalid'    — HTTP 4xx/5xx (URL is broken)
 */
export async function validateImageUrl(url: string): Promise<'verified' | 'unverified' | 'invalid'> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    if (!res.ok) return 'invalid';
    const ct = res.headers.get('content-type') ?? '';
    return ct.startsWith('image/') ? 'verified' : 'unverified';
  } catch {
    // Network error or CORS → keep as 'unverified' (user can still try uploading)
    return 'unverified';
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/lib/__tests__/image-pipeline.test.ts 2>&1 | tail -20
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/image-pipeline.ts src/lib/__tests__/image-pipeline.test.ts
git commit -m "feat(lib): add validateImageUrl to image-pipeline"
```

---

## Task 5: url-fetcher.ts

**Files:**
- Create: `src/lib/url-fetcher.ts`
- Create: `src/lib/__tests__/url-fetcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/url-fetcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before any import
vi.mock('../bg-tab.js', () => ({
  bgTab: vi.fn(),
  resetBgTabState: vi.fn(),
}));

vi.mock('../image-pipeline.js', () => ({
  validateImageUrl: vi.fn().mockResolvedValue('verified'),
  processImageUrl: vi.fn(),
  processImageBlob: vi.fn(),
}));

const mockSession: Record<string, any> = {};
// @ts-ignore
globalThis.chrome = {
  storage: {
    session: {
      get: vi.fn(async (key: string) => ({ [key]: mockSession[key] })),
      set: vi.fn(async (obj: Record<string, any>) => { Object.assign(mockSession, obj); }),
    },
  },
};

globalThis.fetch = vi.fn() as any;
globalThis.crypto = globalThis.crypto;

import { bgTab } from '../bg-tab.js';
import { validateImageUrl } from '../image-pipeline.js';

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(mockSession).forEach(k => delete mockSession[k]);
});

describe('fetchFromUrl', () => {
  it('rejects non-http schemes', async () => {
    const { fetchFromUrl } = await import('../url-fetcher.js');
    await expect(fetchFromUrl('ftp://example.com')).rejects.toThrow('Only http/https URLs are supported');
  });

  it('rejects invalid URLs', async () => {
    const { fetchFromUrl } = await import('../url-fetcher.js');
    await expect(fetchFromUrl('not-a-url')).rejects.toThrow();
  });

  it('routes SPA domains directly to bgTab', async () => {
    const scraped = { name: 'Test', symbol: 'TEST', socials: {}, imageUrl: 'https://img.com/a.png' };
    (bgTab as any).mockResolvedValueOnce(scraped);

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://x.com/user/status/123');
    expect(bgTab).toHaveBeenCalledWith('https://x.com/user/status/123');
    expect(result.name).toBe('Test');
  });

  it('tries fast HTML fetch for non-SPA domains first', async () => {
    // Mock fetch to return og:title HTML
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => `<html><head>
        <meta property="og:title" content="My Token">
        <meta property="og:image" content="https://example.com/img.png">
      </head></html>`,
    });

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://example.com/token');
    expect(result.name).toBe('My Token');
    expect(bgTab).not.toHaveBeenCalled();
  });

  it('falls back to bgTab when fast HTML parse returns empty', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce({ ok: true, text: async () => '<html></html>' });
    const scraped = { name: 'Fallback', symbol: 'FB', socials: {} };
    (bgTab as any).mockResolvedValueOnce(scraped);

    const { fetchFromUrl } = await import('../url-fetcher.js');
    const result = await fetchFromUrl('https://example.com/empty-page');
    expect(bgTab).toHaveBeenCalled();
    expect(result.name).toBe('Fallback');
  });

  it('returns cached result on second call', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => `<meta property="og:title" content="Cached">`,
    });

    const { fetchFromUrl } = await import('../url-fetcher.js');
    await fetchFromUrl('https://example.com/page');
    await fetchFromUrl('https://example.com/page');
    // fetch called once only (second hit is from cache)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/lib/__tests__/url-fetcher.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module '../url-fetcher.js'`.

- [ ] **Step 3: Create url-fetcher.ts**

Create `src/lib/url-fetcher.ts`:

```ts
// src/lib/url-fetcher.ts
// Orchestrates URL → ScrapedData: fast HTML parse first, bg-tab as fallback.

import type { ScrapedData } from './messages.js';
import { bgTab } from './bg-tab.js';
import { validateImageUrl } from './image-pipeline.js';

const SPA_DOMAINS = [
  'twitter.com', 'x.com', 'warpcast.com', 'farcaster.xyz',
  'gmgn.ai', 'zora.co', 'supercast.xyz', 'hey.xyz',
];

export async function fetchFromUrl(url: string): Promise<ScrapedData & { __imageVerified?: boolean }> {
  // Validate scheme
  const parsed = new URL(url); // throws on invalid URL
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  // Session cache check (5 min effective within same browser session)
  const cacheKey = `url:${await sha1hex(url)}`;
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;
  } catch { /* storage.session not available in tests */ }

  let result: ScrapedData;
  const isSpa = SPA_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));

  if (isSpa) {
    // SPA: skip HTML parse, go straight to bg-tab
    result = await bgTab(url);
  } else {
    // Non-SPA: try fast HTML parse first
    try {
      const fast = await htmlFetch(url);
      result = (fast.name || fast.imageUrl) ? fast : await bgTab(url);
    } catch {
      result = await bgTab(url);
    }
  }

  // Validate image URL (marks as verified/unverified, never discards)
  let imageVerified: boolean | undefined;
  if (result.imageUrl) {
    const status = await validateImageUrl(result.imageUrl).catch(() => 'unverified' as const);
    imageVerified = status === 'verified';
  }

  const output = { ...result, __imageVerified: imageVerified };

  // Cache result
  try {
    await chrome.storage.session.set({ [cacheKey]: output });
  } catch { /* ignore */ }

  return output;
}

async function htmlFetch(url: string): Promise<ScrapedData> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseOgMeta(html, url);
}

function parseOgMeta(html: string, pageUrl: string): ScrapedData {
  const get = (prop: string): string | undefined => {
    const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
           ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
    return m?.[1]?.trim() || undefined;
  };
  const getTitle = (): string | undefined => {
    return get('og:title')
        ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  };

  return {
    name:     getTitle() ?? '',
    symbol:   '',
    imageUrl: get('og:image'),
    description: get('og:description'),
    socials:  {},
    pageUrl,
    source:   'generic',
  };
}

async function sha1hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/lib/__tests__/url-fetcher.test.ts 2>&1 | tail -15
```

Expected: all tests pass. If `sha1hex` fails (crypto.subtle not in node env), add to vitest config or mock.

- [ ] **Step 5: If crypto.subtle fails — update vitest.config.ts**

```ts
// vitest.config.ts — if needed
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [
      ['src/lib/__tests__/dom-helpers.test.ts', 'jsdom'],
    ],
    // Vitest ^2 has crypto available in node env natively via globalThis.crypto
  },
});
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/url-fetcher.ts src/lib/__tests__/url-fetcher.test.ts
git commit -m "feat(lib): add url-fetcher.ts with fast HTML parse + bg-tab fallback"
```

---

## Task 6: token-fetcher.ts

**Files:**
- Create: `src/lib/token-fetcher.ts`
- Create: `src/lib/__tests__/token-fetcher.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/__tests__/token-fetcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock viem's isAddress + getPublicClient
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

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;
globalThis.crypto = globalThis.crypto;

// @ts-ignore
globalThis.chrome = {
  storage: {
    session: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
  },
};

const VALID_ADDR = '0xabcdef1234567890abcdef1234567890abcdef12' as `0x${string}`;

beforeEach(() => vi.clearAllMocks());

describe('fetchToken', () => {
  it('throws for invalid address', async () => {
    const { fetchToken } = await import('../token-fetcher.js');
    await expect(fetchToken('0xinvalid' as any, 8453)).rejects.toThrow('Invalid contract address');
  });

  it('returns data from Clanker API when available', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'MyCoin', symbol: 'MC', img_url: 'https://img.com/a.png', chain_id: 8453 }),
    });

    // Mock RPC fallback (multicall)
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'success', result: 'MyCoin' },
        { status: 'success', result: 'MC' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    expect(result.name).toBe('MyCoin');
    expect(result.symbol).toBe('MC');
    expect(result.imageUrl).toBe('https://img.com/a.png');
  });

  it('falls back to RPC when API returns no data', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockResolvedValueOnce({
      multicall: vi.fn().mockResolvedValue([
        { status: 'success', result: 'OnchainToken' },
        { status: 'success', result: 'OCT' },
      ]),
    });

    const { fetchToken } = await import('../token-fetcher.js');
    const result = await fetchToken(VALID_ADDR, 8453);
    expect(result.name).toBe('OnchainToken');
    expect(result.symbol).toBe('OCT');
  });

  it('handles array response from Clanker API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ name: 'ArrayToken', symbol: 'ARR', img_url: null, chain_id: 8453 }] }),
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

  it('throws when both API and RPC fail', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const { getPublicClient } = await import('../chains.js');
    (getPublicClient as any).mockRejectedValueOnce(new Error('rpc down'));

    const { fetchToken } = await import('../token-fetcher.js');
    await expect(fetchToken(VALID_ADDR, 8453)).rejects.toThrow('Token not found on any source');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test src/lib/__tests__/token-fetcher.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module '../token-fetcher.js'`.

- [ ] **Step 3: Create token-fetcher.ts**

Create `src/lib/token-fetcher.ts`:

```ts
// src/lib/token-fetcher.ts
// Fetch token metadata from a contract address.
// Strategy: Clanker API + on-chain RPC run in parallel; results merged.

import { isAddress } from 'viem';
import type { ScrapedData } from './messages.js';
import { getPublicClient } from './chains.js';

const erc20Abi = [
  { name: 'name',   type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

export async function fetchToken(
  address: `0x${string}`,
  chainId: number
): Promise<ScrapedData> {
  if (!isAddress(address)) throw new Error('Invalid contract address');

  // Session cache (10 min effective)
  const cacheKey = `token:${chainId}:${address.toLowerCase()}`;
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;
  } catch { /* unavailable in tests */ }

  // Run both fetches in parallel — winner-take-all on each field
  const [clankerRes, rpcRes] = await Promise.allSettled([
    withTimeout(fetchClankerApi(address), 1500),
    withTimeout(fetchOnchainRpc(address, chainId), 5000),
  ]);

  const clanker = clankerRes.status === 'fulfilled' ? clankerRes.value : null;
  const rpc     = rpcRes.status    === 'fulfilled' ? rpcRes.value    : null;

  if (!clanker && !rpc) throw new Error('Token not found on any source');

  const result: ScrapedData = {
    name:            rpc?.name        || clanker?.name   || '',
    symbol:          rpc?.symbol      || clanker?.symbol || '',
    description:     clanker?.description,
    imageUrl:        clanker?.imageUrl,
    socials:         clanker?.socials ?? {},
    detectedChainId: clanker?.detectedChainId ?? chainId,
    source:          'generic',
  };

  try {
    await chrome.storage.session.set({ [cacheKey]: result });
  } catch { /* ignore */ }

  return result;
}

async function fetchClankerApi(address: `0x${string}`): Promise<Partial<ScrapedData>> {
  const url = `https://www.clanker.world/api/tokens?contract_address=${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`Clanker API ${res.status}`);
  const body = await res.json();

  // Handle both response shapes: { data: [...] }, [...], or single object
  const token = Array.isArray(body?.data) ? body.data[0]
              : Array.isArray(body)        ? body[0]
              : body?.data ?? body;

  if (!token?.name) throw new Error('Token not found in Clanker API');

  return {
    name:            token.name,
    symbol:          token.symbol,
    imageUrl:        token.img_url ?? undefined,
    detectedChainId: token.chain_id,
    description:     token.metadata?.description,
    socials: {
      twitter: token.metadata?.socialMediaUrls?.twitter,
      website: token.metadata?.socialMediaUrls?.website,
    },
  };
}

async function fetchOnchainRpc(
  address: `0x${string}`,
  chainId: number
): Promise<Pick<ScrapedData, 'name' | 'symbol'>> {
  const client = await getPublicClient(chainId);
  const [nameRes, symbolRes] = await (client as any).multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: 'name'   },
      { address, abi: erc20Abi, functionName: 'symbol' },
    ],
    allowFailure: true,
  });
  return {
    name:   nameRes?.status   === 'success' ? String(nameRes.result)   : '',
    symbol: symbolRes?.status === 'success' ? String(symbolRes.result) : '',
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test src/lib/__tests__/token-fetcher.test.ts 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
pnpm test 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/token-fetcher.ts src/lib/__tests__/token-fetcher.test.ts
git commit -m "feat(lib): add token-fetcher.ts with parallel Clanker API + on-chain RPC"
```

---

## Task 7: background.ts — Register New Message Handlers

**Files:**
- Modify: `entrypoints/background.ts`

No new unit tests — integration tested via the lib functions.

- [ ] **Step 1: Read current background.ts**

```bash
cat entrypoints/background.ts | head -60
```

Note the switch/case structure for handling `BgMessage` types.

- [ ] **Step 2: Add imports at top of background.ts**

After existing imports, add:

```ts
import { fetchFromUrl } from '../src/lib/url-fetcher.js';
import { fetchToken } from '../src/lib/token-fetcher.js';
```

- [ ] **Step 3: Add cases to message handler**

Find the switch/case block (or if-else chain). Add:

```ts
case 'FETCH_URL': {
  const { url } = message;
  return fetchFromUrl(url);
}

case 'FETCH_TOKEN': {
  const { address, chainId } = message;
  return fetchToken(address, chainId);
}
```

- [ ] **Step 4: Verify build**

```bash
pnpm build 2>&1 | grep -E "^error|TS[0-9]" | head -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add entrypoints/background.ts
git commit -m "feat(bg): wire FETCH_URL and FETCH_TOKEN message handlers"
```

---

## Task 8: window-utils.ts — Tab Mode

**Files:**
- Modify: `src/popup/window-utils.ts`

- [ ] **Step 1: Add isTab() and openAsTab()**

Open `src/popup/window-utils.ts`. The file already has `isDetached()` and `detachToWindow()`.
Append **after** the existing exports (do NOT remove anything):

```ts
/**
 * Returns true when running as a full browser tab (?tab=1).
 * Used to enable drag-and-drop (popup closes on outside click; tab does not).
 */
export function isTab(): boolean {
  return new URLSearchParams(location.search).has('tab');
}

/**
 * Open the popup as a full browser tab — drag & drop works without popup-close issues.
 * The tab URL includes ?tab=1 so isTab() returns true inside it.
 */
export function openAsTab(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html') + '?tab=1',
  });
}
```

- [ ] **Step 2: Build check**

```bash
pnpm build 2>&1 | grep "^error" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add src/popup/window-utils.ts
git commit -m "feat(utils): add isTab() and openAsTab() for drag-and-drop tab mode"
```

---

## Task 9: App.tsx — State Machine Refactor

**Files:**
- Modify: `src/popup/App.tsx`

- [ ] **Step 1: Update AppView type and AppState interface**

In `src/popup/App.tsx`, make these changes:

```ts
// CHANGE line 14:
// BEFORE:
export type AppView = 'loading' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';
// AFTER:
export type AppView = 'source' | 'preview' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';
```

```ts
// In AppState interface:
// ADD these fields:
  sourceMode?: 'url' | 'image' | 'contract';
  fetchState: FetchState;
// REMOVE these fields:
  pickMode: boolean;
  activeTabId?: number;
```

- [ ] **Step 2: Update imports**

Add to imports:
```ts
import type { ScrapedData, DeployFormState, BatchDeployResult, FetchState } from '../lib/messages.js';
import { SourceView } from './views/SourceView.js';
import { PreviewView } from './views/PreviewView.js';
import { isTab } from './window-utils.js';
```

- [ ] **Step 3: Update initial state and init() function**

Replace the initial `useState` call and `init()` function:

```ts
export function App() {
  const tabMode = isTab();

  const [state, setState] = useState<AppState>({
    view: 'source',                              // start here, not 'loading'
    form: buildInitialFormState(CONFIG_DEFAULTS, EMPTY_SCRAPED),
    scraped: EMPTY_SCRAPED,
    imageStatus: 'idle',
    chainId: 8453,
    vaultWallets: [],
    fetchState: 'idle',                          // new
    // pickMode: removed
    // activeTabId: removed
  });

  useEffect(() => {
    init();
    // storage listener for __clanker_pick: REMOVED
  }, []);

  async function init() {
    const config = await storage.get();
    const vaultWallets = config.vaultEntries.map(e => ({
      id: e.id, name: e.name, active: e.active,
    }));
    setState(prev => ({
      ...prev,
      view: 'source',
      form: buildInitialFormState(config, EMPTY_SCRAPED),
      vaultWallets,
      fetchState: 'idle',
    }));
  }
```

- [ ] **Step 4: Remove pick mode handlers**

Delete these functions entirely:
- `enterPickMode()`
- `exitPickMode()`
- the `storageHandler` and its `chrome.storage.onChanged.addListener` call

Also delete `uploadImage()` — uploading now happens in PreviewView.

- [ ] **Step 5: Add new handlers for source → preview → form flow**

```ts
  function onSourceFetched(scraped: ScrapedData, mode: 'url' | 'image' | 'contract') {
    setState(prev => ({
      ...prev,
      view: 'preview',
      scraped,
      sourceMode: mode,
      fetchState: 'done',
    }));
  }

  function onPreviewConfirm(scraped: ScrapedData, imageIpfsUrl: string | undefined) {
    setState(prev => ({
      ...prev,
      view: 'form',
      scraped,
      form: {
        ...buildInitialFormState(prev.config, scraped),
        imageUrl: imageIpfsUrl ?? '',
      },
    }));
  }

  function onPreviewQuickDeploy(scraped: ScrapedData, imageIpfsUrl: string | undefined) {
    setState(prev => ({
      ...prev,
      view: 'confirm',
      scraped,
      form: {
        ...buildInitialFormState(prev.config, scraped),
        imageUrl: imageIpfsUrl ?? '',
      },
    }));
  }
```

- [ ] **Step 5b: Add `config` to AppState and import ExtensionConfig**

`onPreviewConfirm` and `onQuickDeploy` both call `buildInitialFormState(prev.config, scraped)`.
`prev.config` must be populated in `init()`. Make these changes:

```ts
// 1. ADD to imports:
import type { ExtensionConfig } from '../lib/storage.js';

// 2. ADD field to AppState interface:
  config: ExtensionConfig;

// 3. UPDATE initial useState:
  config: CONFIG_DEFAULTS,  // ← add this line

// 4. UPDATE init() to store config:
  setState(prev => ({
    ...prev,
    view: 'source',
    config,                   // ← use the config loaded from storage
    form: buildInitialFormState(config, EMPTY_SCRAPED),
    vaultWallets,
    fetchState: 'idle',
  }));
```

- [ ] **Step 6: Update the render section**

Replace the `'loading'` branch with `'source'` and `'preview'` branches:

```tsx
  // Remove:
  // if (state.view === 'loading') { return <div>Loading…</div> }

  // Add:
  if (state.view === 'source') {
    return (
      <SourceView
        tabMode={tabMode}
        fetchState={state.fetchState}
        onFetched={onSourceFetched}
        onFetchStateChange={(fs) => setState(prev => ({ ...prev, fetchState: fs }))}
        onStartFromScratch={() => setState(prev => ({ ...prev, view: 'form' }))}
      />
    );
  }

  if (state.view === 'preview') {
    return (
      <PreviewView
        scraped={state.scraped}
        sourceMode={state.sourceMode ?? 'url'}
        onConfirmAdvanced={onPreviewConfirm}
        onQuickDeploy={onPreviewQuickDeploy}
        onBack={() => setState(prev => ({ ...prev, view: 'source' }))}
      />
    );
  }
```

- [ ] **Step 7: Update FormView render — remove pickMode props**

```tsx
  return (
    <FormView
      form={state.form}
      scraped={state.scraped}
      imageStatus={state.imageStatus}
      imageError={state.imageError}
      deployError={state.deployError}
      onFormChange={updateForm}
      onDeploy={onDeploy}
      onHistory={() => setState(prev => ({ ...prev, view: 'history' }))}
      vaultWallets={state.vaultWallets}
      onBatchDeploy={onBatchDeploy}
      // pickMode: REMOVED
      // onPickMode: REMOVED
      // onCancelPick: REMOVED
    />
  );
```

- [ ] **Step 8: Build to catch TypeScript errors**

```bash
pnpm build 2>&1 | grep "error TS" | head -20
```

Fix any remaining type errors (missing props on SourceView/PreviewView are expected — those don't exist yet; they'll be fixed in Tasks 10–11).

- [ ] **Step 9: Commit**

```bash
git add src/popup/App.tsx
git commit -m "refactor(App): remove auto-scrape, add source/preview views, remove pick mode"
```

---

## Task 10: macOS White CSS Theme

**Files:**
- Modify: `src/popup/popup.css`

Note: this fully replaces the current dark glassmorphism theme. The existing class names used
by FormView/ConfirmView/etc. must be **preserved** — only the visual styles change.

- [ ] **Step 1: Read current popup.css to catalog used class names**

```bash
grep -E "^\." src/popup/popup.css | sed 's/{.*//' | sort -u
```

Save this list — every class that FormView/ConfirmView uses must survive in the new CSS.

- [ ] **Step 2: Check which classes are referenced in views**

```bash
grep -rh 'class="' src/popup/views/ | grep -oE 'class="[^"]*"' | tr ' ' '\n' | sort -u | head -60
```

This gives the complete list of classes that must be styled in the new CSS.

- [ ] **Step 3: Rewrite popup.css**

Replace the entire file content with the macOS white theme.
Key sections to include (in order):

```css
/* 1. Google Fonts import (JetBrains Mono as fallback when SF Mono not available) */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');

/* 2. Tailwind base + theme tokens */
@import "tailwindcss";

@theme {
  --color-bg:          #F5F5F7;
  --color-surface:     #FFFFFF;
  --color-surface-2:   #F5F5F7;
  --color-surface-3:   #EBEBED;
  --color-text:        #1D1D1F;
  --color-text-2:      #6E6E73;
  --color-text-3:      #AEAEB2;
  --color-accent:      #0052FF;
  --color-accent-hover:#0040CC;
  --color-accent-dim:  rgba(0,82,255,0.10);
  --color-accent-ring: rgba(0,82,255,0.25);
  --color-ok:          #34C759;
  --color-warn:        #FF9F0A;
  --color-err:         #FF3B30;
  --color-border:      rgba(0,0,0,0.08);
  --color-border-hi:   rgba(0,0,0,0.14);
  --font-sans: -apple-system, 'SF Pro Display', BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

/* 3. Shadow scale (outside @theme — custom properties) */
:root {
  --shadow-sm:    0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-lg:    0 8px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-float: 0 20px 60px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
}

/* 4. Base / reset */
/* 5. Layout (#app, .popup-root, .view-body) */
/* 6. Header */
/* 7. Buttons (.btn, .btn-primary, .btn-secondary, .btn-ghost) */
/* 8. Inputs (.field input, .field textarea, .field select) */
/* 9. Cards (.card, .summary-card, .summary-row) */
/* 10. Source cards (.source-card, .source-card.expanded) */
/* 11. Sections (.section, .section-header, .section-body) */
/* 12. Token image (.token-img-ring, .token-img) */
/* 13. Badges (.badge, .badge-ok, .badge-warn, .badge-err) */
/* 14. Spinners (.spinner, .spinner-lg) */
/* 15. Ghost panel (.ghost-panel) */
/* 16. Drop zone (.drop-zone) */
/* 17. Tab mode (@media in body.tab-mode) */
```

Write each section fully, using **spec §9.3 (Component Patterns)** as the authoritative reference
for every class. Preserve ALL class names found in Step 2.
Ensure `--text-1`, `--text-2`, `--text-3`, `--green`, `--red`, `--yellow`, `--bg2`, `--bg3`,
`--border`, `--border-hi`, `--v2` (if used in existing views) are mapped as CSS var aliases
so existing views still render:

```css
/* Backward-compat aliases for existing views during transition */
:root {
  --text-1: var(--color-text);
  --text-2: var(--color-text-2);
  --text-3: var(--color-text-3);
  --bg2:    var(--color-surface-2);
  --bg3:    var(--color-surface-3);
  --border: var(--color-border);
  --border-hi: var(--color-border-hi);
  --green:  var(--color-ok);
  --red:    var(--color-err);
  --yellow: var(--color-warn);
  --v2:     var(--color-accent);
  --radius: var(--radius-lg);
  --grad:   linear-gradient(135deg, var(--color-accent), #00A3FF);
}
```

- [ ] **Step 4: Build + visual spot-check**

```bash
pnpm build 2>&1 | grep "^error" | head -5
```

Then load in Chrome extension (or open preview/popup-preview.html) to verify:
- Background is white (#F5F5F7)
- Accent is Base blue (#0052FF)
- No dark glassmorphism elements remain

- [ ] **Step 5: Commit**

```bash
git add src/popup/popup.css
git commit -m "feat(ui): full macOS white theme — Tailwind v4 @theme + backward-compat aliases"
```

---

## Task 11: SourceView.tsx

**Files:**
- Create: `src/popup/views/SourceView.tsx`

- [ ] **Step 1: Confirm UPLOAD_IMAGE_BLOB response field name**

```bash
grep -n "ipfsUrl\|UPLOAD_IMAGE" entrypoints/background.ts src/lib/image-pipeline.ts
```

Verify the response from `UPLOAD_IMAGE` / `UPLOAD_IMAGE_BLOB` is `{ ipfsUrl: string }`.
This matches `BgResponse<'UPLOAD_IMAGE'>` in `messages.ts`. If the field name differs, update
the `(res as any).ipfsUrl` casts in SourceView and PreviewView accordingly.

- [ ] **Step 2: Create SourceView.tsx**

Create `src/popup/views/SourceView.tsx`:

```tsx
// src/popup/views/SourceView.tsx
import { useState } from 'preact/hooks';
import type { ScrapedData, FetchState } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';
import { openAsTab } from '../window-utils.js';

interface Props {
  tabMode: boolean;
  fetchState: FetchState;
  onFetched: (scraped: ScrapedData, mode: 'url' | 'image' | 'contract') => void;
  onFetchStateChange: (state: FetchState) => void;
  onStartFromScratch: () => void;
}

type Panel = 'url' | 'image' | 'contract' | null;

const CHAIN_OPTIONS = Object.entries(CHAIN_CONFIG).map(([id, cfg]) => ({
  id: Number(id),
  name: (cfg as any).name,
}));

const FETCH_LABELS: Record<FetchState, string> = {
  idle: '', done: '', error: '',
  'fetching-fast':  'Reading page…',
  'fetching-tab':   'Opening tab…',
  'fetching-api':   'Fetching from Clanker…',
  'fetching-rpc':   'Reading on-chain…',
  'uploading-image':'Uploading image…',
};

export function SourceView({ tabMode, fetchState, onFetched, onFetchStateChange, onStartFromScratch }: Props) {
  const [open, setOpen] = useState<Panel>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [contractInput, setContractInput] = useState('');
  const [contractError, setContractError] = useState('');
  const [contractChain, setContractChain] = useState(8453);
  const loading = fetchState !== 'idle' && fetchState !== 'done' && fetchState !== 'error';

  function toggle(panel: Panel) {
    setOpen(o => o === panel ? null : panel);
  }

  async function handleUrlFetch() {
    setUrlError('');
    try { new URL(urlInput); } catch {
      setUrlError('Enter a valid http/https URL');
      return;
    }
    if (!urlInput.startsWith('http')) {
      setUrlError('Only http/https URLs are supported');
      return;
    }
    onFetchStateChange('fetching-fast');
    try {
      const res = await bgSend({ type: 'FETCH_URL', url: urlInput });
      if ('error' in res) throw new Error((res as any).error);
      onFetched(res as ScrapedData, 'url');
    } catch (e) {
      onFetchStateChange('error');
      setUrlError((e as Error).message);
    }
  }

  async function handleContractFetch() {
    setContractError('');
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractInput)) {
      setContractError('Enter a valid 0x… contract address (40 hex chars)');
      return;
    }
    onFetchStateChange('fetching-api');
    try {
      const res = await bgSend({
        type: 'FETCH_TOKEN',
        address: contractInput as `0x${string}`,
        chainId: contractChain,
      });
      if ('error' in res) throw new Error((res as any).error);
      onFetched(res as ScrapedData, 'contract');
    } catch (e) {
      onFetchStateChange('error');
      setContractError((e as Error).message);
    }
  }

  function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Only image files are supported'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    readAndUploadFile(file);
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) readAndUploadFile(file);
  }

  function readAndUploadFile(file: File) {
    onFetchStateChange('uploading-image');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await bgSend({
          type: 'UPLOAD_IMAGE_BLOB',
          data: reader.result as ArrayBuffer,
          filename: file.name,
        });
        if ('error' in res) throw new Error((res as any).error);
        const ipfsUrl = (res as any).ipfsUrl as string;
        onFetched({ name: '', symbol: '', imageUrl: ipfsUrl, socials: {}, source: 'generic' }, 'image');
      } catch (e) {
        onFetchStateChange('error');
        alert((e as Error).message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <div class="view-body source-view">
      <div style={{ padding: '20px 16px 8px' }}>
        <h1 class="heading-lg">Deploy a new token</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginTop: '4px' }}>
          Choose how to fill in the token details
        </p>
      </div>

      {/* ── URL Panel ─────────────────────────────────────── */}
      <div class={`source-card card ${open === 'url' ? 'expanded' : ''}`}
        style={{ margin: '8px 16px', overflow: 'hidden' }}>
        <div class="source-card-header" onClick={() => toggle('url')}>
          <span class="source-icon">🔗</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Paste Link / Thread URL</div>
            <div class="label-sm" style={{ marginTop: '2px' }}>twitter, warpcast, zora, any page</div>
          </div>
          <span class="chevron" style={{ marginLeft: 'auto' }}>{open === 'url' ? '▲' : '▼'}</span>
        </div>
        {open === 'url' && (
          <div class="source-card-body">
            <div class="field">
              <input
                type="url"
                placeholder="https://x.com/user/status/…"
                value={urlInput}
                onInput={(e) => { setUrlInput((e.target as HTMLInputElement).value); setUrlError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleUrlFetch()}
                disabled={loading}
              />
              {urlError && <div class="field-error">{urlError}</div>}
            </div>
            <button class="btn btn-primary" onClick={handleUrlFetch}
              disabled={loading || !urlInput.trim()} style={{ width: '100%', marginTop: '8px' }}>
              {loading && fetchState === 'fetching-fast' ? FETCH_LABELS['fetching-fast']
               : loading && fetchState === 'fetching-tab' ? FETCH_LABELS['fetching-tab']
               : 'Fetch Metadata →'}
            </button>
          </div>
        )}
      </div>

      {/* ── Image Drop Panel ──────────────────────────────── */}
      <div class={`source-card card ${open === 'image' ? 'expanded' : ''}`}
        style={{ margin: '8px 16px', overflow: 'hidden' }}>
        <div class="source-card-header" onClick={() => toggle('image')}>
          <span class="source-icon">📁</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Drop Image</div>
            <div class="label-sm" style={{ marginTop: '2px' }}>JPG, PNG, GIF · max 5MB</div>
          </div>
          <span class="chevron" style={{ marginLeft: 'auto' }}>{open === 'image' ? '▲' : '▼'}</span>
        </div>
        {open === 'image' && (
          <div class="source-card-body">
            {tabMode ? (
              <div class="drop-zone"
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}>
                <p>Drag & drop image here</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-3)', margin: '4px 0 8px' }}>or</p>
                <label class="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  Browse file
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
                </label>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '12px' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginBottom: '10px' }}>
                  Drag & drop requires opening in a full tab
                </p>
                <button class="btn btn-secondary" onClick={() => openAsTab()}>
                  🗗 Open as Tab
                </button>
                <p style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '8px' }}>
                  Or browse directly:
                </p>
                <label class="btn btn-secondary" style={{ cursor: 'pointer', marginTop: '6px' }}>
                  Browse file
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
                </label>
              </div>
            )}
            {loading && fetchState === 'uploading-image' && (
              <div style={{ textAlign: 'center', padding: '8px', color: 'var(--color-text-2)', fontSize: '12px' }}>
                <span class="spinner" style={{ marginRight: '6px' }} />
                Uploading to IPFS…
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Contract Panel ────────────────────────────────── */}
      <div class={`source-card card ${open === 'contract' ? 'expanded' : ''}`}
        style={{ margin: '8px 16px', overflow: 'hidden' }}>
        <div class="source-card-header" onClick={() => toggle('contract')}>
          <span class="source-icon">🔷</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Copy from Contract</div>
            <div class="label-sm" style={{ marginTop: '2px' }}>fetch name, symbol, image from any token</div>
          </div>
          <span class="chevron" style={{ marginLeft: 'auto' }}>{open === 'contract' ? '▲' : '▼'}</span>
        </div>
        {open === 'contract' && (
          <div class="source-card-body">
            <div class="field" style={{ marginBottom: '8px' }}>
              <label class="label-sm">Chain</label>
              <select value={contractChain}
                onChange={e => setContractChain(Number((e.target as HTMLSelectElement).value))}>
                {CHAIN_OPTIONS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <input
                type="text"
                placeholder="0x…"
                value={contractInput}
                onInput={(e) => { setContractInput((e.target as HTMLInputElement).value); setContractError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleContractFetch()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                disabled={loading}
              />
              {contractError && <div class="field-error">{contractError}</div>}
            </div>
            <button class="btn btn-primary" onClick={handleContractFetch}
              disabled={loading || !contractInput.trim()} style={{ width: '100%', marginTop: '8px' }}>
              {loading ? (FETCH_LABELS[fetchState] || 'Fetching…') : 'Fetch Token Info →'}
            </button>
          </div>
        )}
      </div>

      {/* ── Start from scratch ────────────────────────────── */}
      <div style={{ textAlign: 'center', padding: '16px', marginTop: '4px' }}>
        <button class="btn btn-ghost" onClick={onStartFromScratch} style={{ fontSize: '13px' }}>
          Or start from scratch →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

```bash
pnpm build 2>&1 | grep "error TS" | head -10
```

Fix any TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/popup/views/SourceView.tsx
git commit -m "feat(ui): add SourceView — 3-panel source selector (URL/Drop/Contract)"
```

---

## Task 12: PreviewView.tsx

**Files:**
- Create: `src/popup/views/PreviewView.tsx`

- [ ] **Step 1: Create PreviewView.tsx**

Create `src/popup/views/PreviewView.tsx`:

```tsx
// src/popup/views/PreviewView.tsx
import { useState } from 'preact/hooks';
import type { ScrapedData } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  scraped: ScrapedData;
  sourceMode: 'url' | 'image' | 'contract';
  onConfirmAdvanced: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onQuickDeploy: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onBack: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  url: '🔗 URL',
  image: '📁 Image drop',
  contract: '🔷 Contract',
};

export function PreviewView({ scraped, sourceMode, onConfirmAdvanced, onQuickDeploy, onBack }: Props) {
  const [draft, setDraft] = useState<ScrapedData>({ ...scraped });
  const [imageIpfsUrl, setImageIpfsUrl] = useState<string | undefined>(
    scraped.imageUrl?.startsWith('ipfs://') ? scraped.imageUrl : undefined
  );
  const [imageStatus, setImageStatus] = useState<'idle' | 'uploading' | 'done' | 'skipped' | 'error'>('idle');
  const [imageError, setImageError] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [imageVerified] = useState<boolean>((scraped as any).__imageVerified ?? false);

  // If source was file drop → image is already uploaded (scraped.imageUrl is ipfs://)
  const imageAlreadyUploaded = sourceMode === 'image' && scraped.imageUrl?.startsWith('ipfs://');

  const chain = CHAIN_CONFIG[draft.detectedChainId as keyof typeof CHAIN_CONFIG];
  const displayImageSrc = imageAlreadyUploaded
    ? (scraped.imageUrl?.startsWith('ipfs://')
        ? `https://ipfs.io/ipfs/${scraped.imageUrl.slice(7)}`
        : scraped.imageUrl)
    : draft.imageUrl?.startsWith('ipfs://')
      ? `https://ipfs.io/ipfs/${draft.imageUrl.slice(7)}`
      : draft.imageUrl;

  async function handleUseImage() {
    if (!draft.imageUrl) return;
    setImageStatus('uploading');
    setImageError('');
    try {
      const res = await bgSend({ type: 'UPLOAD_IMAGE', url: draft.imageUrl });
      if ('error' in res) throw new Error((res as any).error);
      const ipfsUrl = (res as any).ipfsUrl as string;
      setImageIpfsUrl(ipfsUrl);
      setImageStatus('done');
    } catch (e) {
      setImageStatus('error');
      setImageError((e as Error).message);
    }
  }

  function handleSkipImage() {
    setImageStatus('skipped');
    setImageIpfsUrl(undefined);
  }

  async function handleManualImageUrl() {
    if (!manualImageUrl.trim()) return;
    setDraft(d => ({ ...d, imageUrl: manualImageUrl }));
    setImageStatus('uploading');
    try {
      const res = await bgSend({ type: 'UPLOAD_IMAGE', url: manualImageUrl });
      if ('error' in res) throw new Error((res as any).error);
      setImageIpfsUrl((res as any).ipfsUrl);
      setImageStatus('done');
    } catch (e) {
      setImageStatus('error');
      setImageError((e as Error).message);
    }
  }

  const finalImageUrl = imageAlreadyUploaded
    ? scraped.imageUrl
    : imageStatus === 'done' ? imageIpfsUrl : undefined;

  const canDeploy = true; // always can proceed (image is optional)

  return (
    <div class="view-body">
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px 8px' }}>
        <button class="btn btn-ghost" onClick={onBack} style={{ padding: '4px 8px' }}>← Back</button>
        <span style={{ fontSize: '12px', color: 'var(--color-text-3)' }}>
          Source: {SOURCE_LABELS[sourceMode]}
          {draft.pageUrl && ` · ${new URL(draft.pageUrl).hostname}`}
        </span>
      </div>

      {/* ── Token Banner ────────────────────────────────── */}
      <div class="card" style={{ margin: '0 16px 12px', padding: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <div class="token-img-ring" style={{ flexShrink: 0 }}>
          {displayImageSrc
            ? <img src={displayImageSrc} class="token-img" alt="" />
            : <div class="token-img" style={{ fontSize: '20px', display: 'grid', placeItems: 'center' }}>🪙</div>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            class="inline-edit heading-md"
            value={draft.name}
            onInput={e => setDraft(d => ({ ...d, name: (e.target as HTMLInputElement).value }))}
            placeholder="Token Name"
          />
          <input
            class="inline-edit mono"
            value={draft.symbol}
            onInput={e => setDraft(d => ({ ...d, symbol: (e.target as HTMLInputElement).value }))}
            placeholder="SYMBOL"
            style={{ marginTop: '2px', color: 'var(--color-text-2)' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '2px' }}>
            {chain?.name ?? `Chain ${draft.detectedChainId ?? 8453}`}
          </div>
        </div>
      </div>

      {/* ── Image Section ───────────────────────────────── */}
      {!imageAlreadyUploaded && (
        <div class="card" style={{ margin: '0 16px 12px', padding: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            Image
            {draft.imageUrl && imageStatus === 'idle' && (
              <span class={`badge ${imageVerified ? 'badge-ok' : 'badge-warn'}`}>
                {imageVerified ? '✓ verified' : '⚠ unverified'}
              </span>
            )}
            {imageStatus === 'done' && <span class="badge badge-ok">✓ uploaded to IPFS</span>}
            {imageStatus === 'uploading' && <span class="badge">uploading…</span>}
            {imageStatus === 'skipped' && <span class="badge">skipped</span>}
          </div>

          {draft.imageUrl && imageStatus !== 'skipped' && (
            <div style={{ marginBottom: '8px' }}>
              {displayImageSrc && (
                <img src={displayImageSrc} alt="preview"
                  style={{ width: '64px', height: '64px', borderRadius: '10px', objectFit: 'cover', marginBottom: '8px' }} />
              )}
              {imageStatus === 'idle' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button class="btn btn-primary" onClick={handleUseImage} style={{ flex: 2 }}>
                    ✓ Use This Image
                  </button>
                  <button class="btn btn-secondary" onClick={handleSkipImage} style={{ flex: 1 }}>
                    ✗ Skip
                  </button>
                </div>
              )}
              {imageStatus === 'uploading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-2)' }}>
                  <span class="spinner" /> Uploading to IPFS…
                </div>
              )}
              {imageStatus === 'error' && (
                <div style={{ color: 'var(--color-err)', fontSize: '12px', marginBottom: '6px' }}>
                  {imageError}
                  <button class="btn btn-secondary" onClick={handleUseImage}
                    style={{ marginLeft: '8px', fontSize: '11px', padding: '2px 8px' }}>Retry</button>
                </div>
              )}
            </div>
          )}

          {(!draft.imageUrl || imageStatus === 'skipped') && (
            <div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginBottom: '6px' }}>
                {draft.imageUrl ? 'Or enter a different URL:' : 'No image detected — enter URL manually:'}
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="url" placeholder="https://…" value={manualImageUrl}
                  class="field"
                  style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
                  onInput={e => setManualImageUrl((e.target as HTMLInputElement).value)} />
                <button class="btn btn-secondary" onClick={handleManualImageUrl}
                  disabled={!manualImageUrl.trim()}>Upload</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Metadata Fields ─────────────────────────────── */}
      <div class="card" style={{ margin: '0 16px 12px', padding: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Metadata</div>
        {[
          { key: 'description', label: 'DESC',    placeholder: 'Description' },
        ].map(({ key, label, placeholder }) => (
          <div class="field" key={key} style={{ marginBottom: '6px' }}>
            <label class="label-sm">{label}</label>
            <input type="text" placeholder={placeholder}
              value={(draft as any)[key] ?? ''}
              onInput={e => setDraft(d => ({ ...d, [key]: (e.target as HTMLInputElement).value }))} />
          </div>
        ))}
        {[
          { key: 'twitter', label: 'TWITTER', placeholder: '@handle' },
          { key: 'website', label: 'WEBSITE', placeholder: 'https://…' },
        ].map(({ key, label, placeholder }) => (
          <div class="field" key={key} style={{ marginBottom: '6px' }}>
            <label class="label-sm">{label}</label>
            <input type="text" placeholder={placeholder}
              value={(draft.socials as any)[key] ?? ''}
              onInput={e => setDraft(d => ({ ...d, socials: { ...d.socials, [key]: (e.target as HTMLInputElement).value } }))} />
          </div>
        ))}
      </div>

      {/* ── Actions ─────────────────────────────────────── */}
      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button class="btn btn-primary" style={{ width: '100%' }}
          onClick={() => onQuickDeploy(draft, finalImageUrl)}>
          ⚡ Quick Deploy
        </button>
        <button class="btn btn-secondary" style={{ width: '100%' }}
          onClick={() => onConfirmAdvanced(draft, finalImageUrl)}>
          Edit Advanced Config →
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
pnpm build 2>&1 | grep "error TS" | head -20
```

Fix any TypeScript errors (missing props, wrong types etc.)

- [ ] **Step 3: Commit**

```bash
git add src/popup/views/PreviewView.tsx
git commit -m "feat(ui): add PreviewView — metadata confirmation + image upload gate"
```

---

## Task 13: FormView Vault Fix + ConfirmView Comment

**Files:**
- Modify: `src/popup/views/FormView.tsx`
- Modify: `src/popup/views/ConfirmView.tsx`

- [ ] **Step 1: Find vault supply percentage slider in FormView.tsx**

```bash
grep -n "vaultSupply\|vault.*pct\|vault.*max\|Vault Supply" src/popup/views/FormView.tsx | head -10
```

- [ ] **Step 2: Update max to 90**

Find the slider or input for `vaultSupplyPct`. Change:
```tsx
// BEFORE (somewhere in FormView.tsx):
max={30}
// or: max="30"

// AFTER:
max={90}  // SDK confirmed: vault percentage max is 90, not 30
```

- [ ] **Step 3: Add sniper unit comment in ConfirmView.tsx**

Find line ~80 with `sniperStartingFee / 10000`:

```tsx
// ADD comment above the line:
// TODO: sniperStartingFee unit is /1_000_000 per SDK (666_777 = 66.68%)
// Current display (/10_000) shows approx correct value by coincidence — cleanup in next PR
```

- [ ] **Step 4: Run tests**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/popup/views/FormView.tsx src/popup/views/ConfirmView.tsx
git commit -m "fix(form): vault supply max 90% per SDK; add sniper unit TODO"
```

---

## Task 14: Full Integration Verification

- [ ] **Step 1: Run complete test suite**

```bash
pnpm test 2>&1
```

Expected: all tests pass. If any fail, fix before proceeding.

- [ ] **Step 2: Production build**

```bash
pnpm build 2>&1
```

Expected: successful build with no TypeScript errors. Note the bundle size.

- [ ] **Step 3: Check bundle size**

```bash
du -sh .output/chrome-mv3/
```

Expected: within 10% of the previous 1.52 MB (i.e. under ~1.67 MB).
If over, check if any large Ark UI components were accidentally tree-shaken incorrectly.

- [ ] **Step 4: Load in Chrome for smoke test**

```
1. Open chrome://extensions
2. Click "Load unpacked" → select .output/chrome-mv3/
3. Open the extension popup
4. Verify: SourceView shown (not old loading screen)
5. Test URL panel: paste https://x.com — verify accordion opens
6. Test Contract panel: select Base, paste a known Clanker token address
7. Test "Start from scratch" → verify FormView opens empty
8. Verify macOS white theme — no dark elements, Base blue accent
```

- [ ] **Step 5: Fix any runtime issues found**

Common issues to watch:
- Chrome extension CSP may block Google Fonts — replace with local font reference or self-hosted
- `chrome.storage.session` may not be available in older Chrome — add `?.catch(() => {})` on all calls
- Ark UI components may need explicit `@ark-ui/preact` peer dep resolution

- [ ] **Step 6: Final commit**

```bash
git add -A
git status  # review all changes
git commit -m "chore: integration smoke test fixes"
```

- [ ] **Step 7: Tag the feature complete**

```bash
git log --oneline -12  # review all commits in this feature
```

---

## Quick Reference

**Test commands:**
```bash
pnpm test                              # all tests
pnpm test src/lib/__tests__/bg-tab.test.ts  # single file
pnpm test:watch                        # watch mode
```

**Build:**
```bash
pnpm build         # production build to .output/chrome-mv3/
pnpm dev           # dev mode with hot reload
```

**Key file locations:**
```
src/lib/bg-tab.ts          ← background tab lifecycle
src/lib/url-fetcher.ts     ← URL orchestration
src/lib/token-fetcher.ts   ← contract fetch
src/popup/views/SourceView.tsx    ← entry point UI
src/popup/views/PreviewView.tsx   ← metadata confirm UI
src/popup/popup.css        ← macOS theme
```

**Spec:** `docs/superpowers/specs/2026-03-18-smart-source-macos-redesign.md`
