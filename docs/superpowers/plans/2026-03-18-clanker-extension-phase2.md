# Clanker Extension — Phase 2: Content Scripts & Scrapers

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Phase 1 complete (scaffold, lib, background SW built and passing tests).

**Goal:** Implement all content scripts — page scrapers for Twitter/X, Farcaster, GMGN, and generic sites — plus the wallet bridge relay for Mode A injected wallets.

**Architecture:** Content scripts are injected by WXT into matching pages. Scrapers parse page DOM/OG meta and return `ScrapedData`. The wallet bridge relays `window.ethereum` calls from the popup to Rabby/MetaMask in the active tab.

**Tech Stack:** TypeScript, WXT content script API, DOM APIs (no external deps in content scripts)

**Spec:** `docs/superpowers/specs/2026-03-17-timc-clanker-extension-design.md` — "Scraping Strategy" section

---

## Task 1: Shared Content Script Utilities

**Files:**
- Create: `src/lib/dom-helpers.ts` (waitForElement, OG meta helpers — used in parsers)
- Create: `src/lib/__tests__/dom-helpers.test.ts`

- [ ] **Step 1: Write failing tests for dom-helpers.ts**

`src/lib/__tests__/dom-helpers.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getOgMeta, extractHandle, extractTweetId, extractCastHash } from '../dom-helpers.js';

// jsdom environment needed for DOM tests — add to vitest config
describe('getOgMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('returns og:title content', () => {
    document.head.innerHTML = '<meta property="og:title" content="Test Title" />';
    expect(getOgMeta('og:title')).toBe('Test Title');
  });

  it('returns null when meta not present', () => {
    expect(getOgMeta('og:title')).toBeNull();
  });
});

describe('extractHandle', () => {
  it('extracts handle from "Name (@handle)" format', () => {
    expect(extractHandle('Vitalik Buterin (@VitalikButerin)')).toBe('VitalikButerin');
  });
  it('returns null if no handle', () => {
    expect(extractHandle('Just a name')).toBeNull();
  });
});

describe('extractTweetId', () => {
  it('extracts tweet ID from /status/ URL', () => {
    expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890');
  });
  it('returns null for profile URLs', () => {
    expect(extractTweetId('https://x.com/user')).toBeNull();
  });
});

describe('extractCastHash', () => {
  it('extracts 0x-prefixed hash from warpcast URL', () => {
    expect(extractCastHash('https://warpcast.com/user/0xabc123')).toBe('0xabc123');
  });
  it('returns null for profile URLs', () => {
    expect(extractCastHash('https://warpcast.com/user')).toBeNull();
  });
});
```

- [ ] **Step 2: Update vitest.config.ts to add jsdom for dom tests (merge, don't overwrite)**

Edit `vitest.config.ts` — add `environmentMatchGlobs` while keeping `environment: 'node'` and `include`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    environmentMatchGlobs: [
      // DOM tests need jsdom — add any additional DOM test files here
      ['src/lib/__tests__/dom-helpers.test.ts', 'jsdom'],
    ],
  },
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
rtk vitest run src/lib/__tests__/dom-helpers.test.ts
```

- [ ] **Step 4: Create src/lib/dom-helpers.ts**

```typescript
export function getOgMeta(property: string): string | null {
  return document.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null;
}

export function getMetaName(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

export function extractHandle(ogTitle: string): string | null {
  const match = ogTitle.match(/@([A-Za-z0-9_]+)\)/);
  return match?.[1] ?? null;
}

export function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

export function extractCastHash(url: string): string | null {
  const match = url.match(/\/(0x[a-fA-F0-9]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise(resolve => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}
```

- [ ] **Step 5: Run dom-helpers tests — expect PASS**

```bash
rtk vitest run src/lib/__tests__/dom-helpers.test.ts
```

Expected: 7 tests pass

- [ ] **Step 6: Commit dom helpers**

```bash
git add src/lib/dom-helpers.ts src/lib/__tests__/dom-helpers.test.ts vitest.config.ts && git commit -m "feat: DOM helpers — OG meta, handle/tweet/cast extraction, waitForElement"
```

---

## Task 2: Twitter/X Parser

**Files:**
- Create: `src/content/parsers/twitter.ts`

- [ ] **Step 1: Create src/content/parsers/twitter.ts**

```typescript
import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, extractHandle, extractTweetId } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseTwitter(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // "Name (@handle)" → extract both
  const handle = extractHandle(ogTitle);
  const name = ogTitle.replace(/\s*\(@[^)]+\)/, '').trim() || ogTitle;
  const symbol = handle ? generateSymbol(handle) : generateSymbol(name);

  // messageId from URL if on a tweet page
  const messageId = extractTweetId(location.href) ?? undefined;

  // Twitter user ID — look for twitter:creator:id or similar meta
  const userId = document.querySelector('meta[name="twitter:creator:id"]')?.getAttribute('content')
    ?? document.querySelector('meta[property="al:ios:url"]')?.getAttribute('content')?.match(/user_id=(\d+)/)?.[1]
    ?? undefined;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter: location.href },
    source: 'twitter',
    pageUrl: location.href,
    messageId,
    userId,
  };
}
```

---

## Task 3: Farcaster Parser

**Files:**
- Create: `src/content/parsers/farcaster.ts`

- [ ] **Step 1: Create src/content/parsers/farcaster.ts**

```typescript
import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, extractCastHash } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseFarcaster(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // Extract handle from URL pathname: /username or /username/0xhash
  const pathParts = location.pathname.split('/').filter(Boolean);
  const handle = pathParts[0] ?? '';
  const name = ogTitle.split('(@')[0].trim() || handle;
  const symbol = generateSymbol(handle || name);

  // messageId: cast hash from URL if on a cast page
  const messageId = extractCastHash(location.href) ?? undefined;

  // FID: look in meta tags — not always available
  const userId = document.querySelector('meta[name="fc:frame:author_fid"]')?.getAttribute('content') ?? undefined;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter: undefined, telegram: undefined, website: location.href },
    source: 'farcaster',
    pageUrl: location.href,
    messageId,
    userId,
  };
}
```

---

## Task 4: GMGN Parser

**Files:**
- Create: `src/content/parsers/gmgn.ts`

- [ ] **Step 1: Create src/content/parsers/gmgn.ts**

```typescript
import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, waitForElement } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

const GMGN_CHAIN_MAP: Record<string, number | null> = {
  base:  8453,
  eth:   1,
  arb:   42161,
  sol:   null,
  bsc:   null,
  trx:   null,
  monad: 143,
};

export async function parseGMGN(): Promise<ScrapedData> {
  // 1. Extract chain + address from URL: /chain/token/address
  const pathParts = location.pathname.split('/').filter(Boolean);
  const chain = pathParts[0] ?? '';
  const tokenAddress = pathParts[2] ?? undefined;
  const chainId = GMGN_CHAIN_MAP[chain] ?? null;

  // 2. Wait for DOM to load (CSR — React SPA)
  await waitForElement('h1, [class*="token-name"], [data-testid]', 5000);

  // 3. Try OG meta first
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // 4. DOM fallback for name
  const name = ogTitle || document.querySelector('h1')?.textContent?.trim() || '';

  // 5. Symbol: find "$TICKER" pattern in page text
  const symbolMatch = document.body.innerText.match(/\$([A-Z0-9]{1,8})\b/);
  const symbol = symbolMatch?.[1] ?? generateSymbol(name);

  // 6. Social links
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(a => (a as HTMLAnchorElement).href);
  const twitter = links.find(h => h.includes('twitter.com') || h.includes('x.com'));
  const telegram = links.find(h => h.includes('t.me/'));
  const website = links.find(h =>
    !h.includes('gmgn.ai') && h.startsWith('https://') &&
    !h.includes('twitter.com') && !h.includes('x.com') && !h.includes('t.me/')
  );

  // 7. messageId: use token address for clanker platform
  const messageId = tokenAddress;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter, telegram, website },
    detectedChainId: chainId,
    source: 'gmgn',
    pageUrl: location.href,
    messageId,
  };
}
```

**Note:** GMGN uses dynamically generated CSS class names. The selectors `h1`, `a[href*="twitter"]`, and `$TICKER` text pattern are structural and should be resilient. Verify actual DOM structure with DevTools on a live GMGN token page before the first real deploy.

---

## Task 5: Generic Parser

**Files:**
- Create: `src/content/parsers/generic.ts`

- [ ] **Step 1: Create src/content/parsers/generic.ts**

```typescript
import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseGeneric(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? document.title ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // Symbol: first word of title
  const firstWord = ogTitle.trim().split(/\s+/)[0] ?? '';
  const symbol = generateSymbol(firstWord);

  return {
    name: ogTitle,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { website: location.href },
    source: 'generic',
    pageUrl: location.href,
    messageId: location.href, // page URL as fallback messageId
  };
}
```

---

## Task 6: Main Scraper + Wallet Bridge Content Scripts

**Files:**
- Create: `src/content/scraper.ts` (main content script — parser dispatcher + SCRAPE handler)
- Create: `src/content/wallet-bridge.ts` (Mode A wallet relay)

- [ ] **Step 1: Create src/content/scraper.ts**

```typescript
import { parseTwitter } from './parsers/twitter.js';
import { parseFarcaster } from './parsers/farcaster.js';
import { parseGMGN } from './parsers/gmgn.js';
import { parseGeneric } from './parsers/generic.js';
import type { ScrapedData } from '../lib/messages.js';

const PARSERS: Record<string, () => Promise<ScrapedData>> = {
  'twitter.com':  parseTwitter,
  'x.com':        parseTwitter,
  'warpcast.com': parseFarcaster,
  'gmgn.ai':      parseGMGN,
};

function getParser(): () => Promise<ScrapedData> {
  return PARSERS[location.hostname] ?? parseGeneric;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    // Register tab with service worker for Mode A wallet bridge
    chrome.runtime.sendMessage({ type: 'REGISTER_TAB' }).catch(() => {
      // SW may not be awake yet — ignore
    });

    // Listen for SCRAPE requests from popup (direct sendMessage, NOT through SW)
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'SCRAPE') return false;

      const parser = getParser();
      parser()
        .then(data => sendResponse(data))
        .catch(e => sendResponse({ name: '', symbol: '', socials: {}, source: 'generic' } as ScrapedData));

      return true; // async response
    });
  },
});
```

- [ ] **Step 2: Create src/content/wallet-bridge.ts**

Mode A only — relays `window.ethereum` EIP-1193 requests from service worker to the injected wallet in the page.

```typescript
export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'WALLET_PING') {
        const ready = typeof window.ethereum !== 'undefined';
        sendResponse({ ready });
        return false;
      }

      if (msg.type === 'WALLET_REQUEST') {
        if (!window.ethereum) {
          sendResponse({ error: 'No injected wallet found — install Rabby or MetaMask' });
          return false;
        }
        window.ethereum.request(msg.request)
          .then(result => sendResponse({ result }))
          .catch(e => sendResponse({ error: (e as Error).message }));
        return true;
      }

      return false;
    });
  },
});
```

**Note:** WXT merges content scripts by `matches`. Since both `scraper.ts` and `wallet-bridge.ts` match `<all_urls>`, WXT will bundle them together. Alternatively, use a single content script file and handle both concerns there. Check WXT docs for content script merging behavior — if WXT doesn't merge, rename wallet-bridge to a separate entrypoint or inline the wallet relay code into scraper.ts.

- [ ] **Step 3: Verify build compiles**

```bash
rtk pnpm run build
```

Fix any import errors. WXT content script `defineContentScript` is a global — no import needed.

- [ ] **Step 4: Commit content scripts**

```bash
git add src/content/ src/lib/dom-helpers.ts src/lib/__tests__/dom-helpers.test.ts && git commit -m "feat: content scripts — Twitter, Farcaster, GMGN, generic scrapers + wallet bridge"
```

---

## Task 7: Run All Tests

- [ ] **Step 1: Run full test suite**

```bash
rtk vitest run
```

Expected: all tests pass (including dom-helpers tests)

- [ ] **Step 2: Manual smoke test** (optional but recommended)

1. Load extension in Chrome: `chrome://extensions` → "Load unpacked" → select `.output/chrome-mv3/`
2. Navigate to `https://twitter.com/VitalikButerin`
3. Open extension popup
4. Verify name/symbol/image pre-populated
5. Navigate to `https://gmgn.ai/base/token/<any-token-address>`
6. Verify chain auto-detected as Base

---

## Phase 2 Exit Criteria

- [ ] All vitest tests pass
- [ ] Extension builds without errors
- [ ] Scrapers return correct `ScrapedData` shape for Twitter, Farcaster, GMGN, generic
- [ ] `detectedChainId` populated from GMGN URL
- [ ] `messageId` extracted from tweet/cast URLs
- [ ] Wallet bridge responds to WALLET_PING
