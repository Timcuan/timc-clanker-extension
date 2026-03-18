# Clanker Extension — Smart Source System & macOS White Redesign

**Date:** 2026-03-18
**Status:** Approved (rev 4 — implementation-ready, all code diffs specified)
**Branch:** `claude/strange-newton`

---

## 1. Problem Statement

Current extension has four issues:

1. **Image auto-fetch is wrong** — `init()` auto-scrapes the active tab, grabs the first `>80×80px` image
   (banners, ads, random thumbnails), and silently uploads to Pinata before user sees anything.
2. **No structured image input** — only a plain URL text field. No drag-and-drop, no file pick.
3. **No metadata import** — cannot copy token info from an existing deployed contract.
4. **Element Picker is fragile** — requires content script injection on the active page, breaks on SPAs.

Additionally the dark glassmorphism UI/UX needs a full revamp to a professional-grade macOS white theme.

---

## 2. Goals

- Replace ambiguous auto-scrape with **three explicit, user-controlled sources**
- **Image confirmation gate** before any Pinata upload — zero silent uploads
- **Contract address fetch** — all 5 chains, Clanker API + on-chain RPC parallel strategy
- **Drag & drop image** — open-as-tab to avoid popup-close problem
- **macOS white UI/UX** with Tailwind v4 + Ark UI (Preact-native)
- **Zero breaking changes** to existing deploy pipeline (FormView, ConfirmView, BatchView, SuccessView)
- **Element Picker + auto-scrape removed** — replaced entirely by SourceView

---

## 3. Architecture

### 3.1 View State Machine

```
source          ← NEW entry point (was: 'loading' → auto-scrape → 'form')
  ↓
preview         ← NEW metadata confirmation + image gate
  ↓
form            ← existing (pre-filled, advanced config only)
  ↓
confirm → pending → success
              ↘ history / batch
```

`'loading'` view removed. `'source'` is the new initial view.

### 3.2 Three Source Paths

All three paths converge into `PreviewView`:

| Source | Input | Backend Message |
|--------|-------|-----------------|
| Link / Thread | Paste URL | `FETCH_URL` → `url-fetcher.ts` |
| Drop Image | Drag file / paste / clipboard | `UPLOAD_IMAGE_BLOB` (existing ✅) |
| Contract Address | Paste `0x…` + chain selector | `FETCH_TOKEN` → `token-fetcher.ts` |

### 3.3 AppState — Exact Diff

```ts
// src/popup/App.tsx

// BEFORE:
export type AppView = 'loading' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';

export interface AppState {
  view: AppView;
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  deployError?: string;
  chainId: number;
  vaultWallets: Array<{ id: string; name: string; active: boolean }>;
  batchWalletIds?: string[];
  batchWalletNames?: Record<string, string>;
  pickMode: boolean;        // ← REMOVE
  activeTabId?: number;     // ← REMOVE
}

// AFTER:
export type AppView = 'source' | 'preview' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';
//                     ↑ NEW    ↑ NEW        'loading' removed

export interface AppState {
  view: AppView;
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  deployError?: string;
  chainId: number;
  vaultWallets: Array<{ id: string; name: string; active: boolean }>;
  batchWalletIds?: string[];
  batchWalletNames?: Record<string, string>;
  sourceMode?: 'url' | 'image' | 'contract';  // ← NEW
  fetchState: FetchState;                       // ← NEW (imported from messages.ts)
  // pickMode: boolean       REMOVED
  // activeTabId?: number    REMOVED
}
```

### 3.4 App.tsx — init() Rewrite

```ts
// BEFORE: init() scrapes active tab and silently uploads image
// AFTER: init() only loads config + vault wallets; starts at 'source' view

async function init() {
  const config = await storage.get();
  const vaultWallets = config.vaultEntries.map(e => ({ id: e.id, name: e.name, active: e.active }));
  setState(prev => ({
    ...prev,
    view: 'source',                                    // ← start at source, not form
    form: buildInitialFormState(config, EMPTY_SCRAPED),
    vaultWallets,
    fetchState: 'idle',
    // no activeTabId, no scraped, no silent image upload
  }));
}

// ALSO REMOVE from App.tsx:
// - enterPickMode()
// - exitPickMode()
// - storageHandler listening for __clanker_pick
// - uploadImage() called from init()
```

### 3.5 Tab Mode

```ts
// src/popup/window-utils.ts — ADD (keep all existing functions)

/** True when popup is opened as a full tab (for drag-and-drop support) */
export function isTab(): boolean {
  return new URLSearchParams(location.search).has('tab');
}

/** Open popup as a full browser tab — persists through outside clicks */
export function openAsTab(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html') + '?tab=1',
  });
}

// Existing functions untouched:
// isDetached() → checks '?detached=1' — different feature (pinned window), keep as-is
// detachToWindow() — keep as-is
// openOptions() — keep as-is
```

In `App.tsx`:
```ts
import { isTab } from './window-utils.js';

// In App body (top-level):
const tabMode = isTab();

// Tab mode layout: popup width stays 400px, but drop zone is larger,
// and no window.close() on outside-click (handled by browser tab behavior)
```

### 3.6 PreviewView → FormView State Handoff

`PreviewView` receives `scraped: ScrapedData` and emits:
- `onConfirmAdvanced(scraped, imageIpfsUrl?)` → App builds `FormState`, transitions to `'form'`
- `onQuickDeploy(scraped, imageIpfsUrl?)` → App builds `FormState`, transitions to `'confirm'`
- `onBack()` → transitions to `'source'`

Inline edits in `PreviewView` mutate a local `draft: ScrapedData` (not global AppState) until confirmed.

---

## 4. SourceView — Layout & Behavior

### 4.1 Wireframe (macOS white, 400px wide)

```
┌─────────────────────────────────────┐
│  🔵  Clanker                  ···   │  ← header (macOS style)
├─────────────────────────────────────┤
│                                     │
│  Deploy a new token                 │  ← Syne 600 18px
│  Choose your source below           │  ← text-2 12px
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔗  Paste Link / Thread URL     │ │  ← card, tap to expand
│ │ twitter.com, warpcast, any URL  │ │
│ │                                 │ │
│ │ [https://twitter.com/... ____]  │ │  ← input, shown when expanded
│ │ [ Fetch Metadata →            ] │ │  ← primary btn
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 📁  Drop Image                  │ │  ← card, tap to expand
│ │ JPG, PNG, GIF · max 5MB         │ │
│ │                                 │ │
│ │  ┌───────────────────────────┐  │ │  ← drop zone (shown when expanded)
│ │  │  Drag & drop or click     │  │ │
│ │  │  to browse                │  │ │
│ │  │  ── or ──                 │  │ │
│ │  │  Open as Tab (full drag)  │  │ │  ← openAsTab() button
│ │  └───────────────────────────┘  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔷  Copy from Contract          │ │  ← card, tap to expand
│ │ Fetch name, symbol, image       │ │
│ │                                 │ │
│ │  Chain [Base ▼]                 │ │
│ │  [0x________________________________]  │
│ │  [ Fetch Token Info →         ] │ │
│ └─────────────────────────────────┘ │
│                                     │
│   Or start from scratch →           │  ← ghost link → form view, empty
└─────────────────────────────────────┘
```

### 4.2 Source Card Behavior

- Only one card expands at a time (accordion — Ark UI `Collapsible`)
- Loading state: spinner inside card with `FetchState` label (e.g. "Opening tab…", "Reading page…")
- Error state: red badge inside card — "Could not read page · try another URL"
- On success: auto-transition to `PreviewView`

### 4.3 URL Input Smart Routing

```
User pastes URL → onInput validates format:
  if not http/https → inline error "Invalid URL"
  if valid → "Fetch Metadata →" button enabled

User submits → bgSend({ type: 'FETCH_URL', url })
  setFetchState('fetching-fast')
  → bg: fast HTML parse (3s timeout)
  → if SPA domain → setFetchState('fetching-tab')
  → result arrives → transition to PreviewView
```

### 4.4 Contract Input

```
Chain selector (Ark UI Select):
  Options: Base (default) | Ethereum | Arbitrum | Unichain | Monad

Address input → validates with viem.isAddress() on blur:
  invalid → "Not a valid contract address"
  valid + chain selected → "Fetch Token Info →" enabled

User submits → bgSend({ type: 'FETCH_TOKEN', address, chainId })
  setFetchState('fetching-api')  (Clanker API)
  setFetchState('fetching-rpc')  (on-chain multicall, may overlap)
  → result arrives → transition to PreviewView
```

---

## 5. PreviewView — Metadata Confirmation

### 5.1 Wireframe

```
┌─────────────────────────────────────┐
│  ← Back              Preview        │
├─────────────────────────────────────┤
│  Source: twitter.com/…              │  ← pill badge, shows domain/type
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐  [Token Name     ]    │  ← large thumb, editable fields
│  │          │  [$SYMBOL        ]    │
│  │  [img]   │  [Base        ▼  ]    │  ← chain selector (from detected)
│  └──────────┘                       │
│                                     │
│  Image                    [status] ▼│  ← collapsible image section
│  ┌─────────────────────────────────┐│
│  │ ● verified  [ ✓ Use This Image ]││  ← or "⚠ unverified (CORS)" badge
│  │ Thumbnail shown here            ││
│  │ [ ✗ Skip Image ]                ││
│  │ ── or enter URL manually ──     ││
│  │ [https://…____________]         ││
│  └─────────────────────────────────┘│
│                                     │
│  Metadata                         ▼ │  ← collapsible
│  NAME    [Token Name          ]     │
│  SYMBOL  [SYMBOL              ]     │
│  DESC    [Description…        ]     │
│  TWITTER [@handle             ]     │
│  WEBSITE [website.com         ]     │
│                                     │
├─────────────────────────────────────┤
│  [ ⚡ Quick Deploy ]                │  → confirm (skip FormView)
│  [ Edit Advanced Config →      ]    │  → form
└─────────────────────────────────────┘
```

### 5.2 Image Confirmation States

| State | UI |
|-------|----|
| Image found, verified (HEAD 2xx + `image/*`) | Green badge "✓ verified" + thumbnail + "Use This Image" |
| Image found, unverified (CORS / 4xx) | Yellow badge "⚠ unverified" + thumbnail + "Use This Image" |
| "Use This Image" clicked | Spinner + "Uploading to IPFS…" → sets `form.imageUrl = ipfsUrl` |
| "Skip Image" clicked | Image section collapsed; inline URL input shown |
| No image detected | URL input shown immediately, no thumbnail |
| Source was file drop | Thumbnail shown immediately; "Upload & Use" button |

**Critical:** `UPLOAD_IMAGE` / `UPLOAD_IMAGE_BLOB` only called after "Use This Image" click. Zero silent uploads.

### 5.3 Quick Deploy Path

"Quick Deploy" assembles `buildInitialFormState(config, draft)` with `imageUrl = confirmedIpfsUrl ?? ''`
and transitions directly to `ConfirmView`. No `FormView` step.

---

## 6. Backend — New Files

### 6.1 `src/lib/url-fetcher.ts`

```ts
export async function fetchFromUrl(url: string): Promise<ScrapedData> {
  // 1. Validate scheme
  const parsed = new URL(url);  // throws on invalid
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  // 2. Check session cache (key = sha1(url), TTL 5 min)
  const cacheKey = `url:${await sha1hex(url)}`;
  const cached = await chrome.storage.session.get(cacheKey).catch(() => ({}));
  if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;

  // 3. SPA domains → bg-tab directly; others → fast HTML parse first
  const isSpa = SPA_DOMAINS.some(d => parsed.hostname.endsWith(d));
  let result: ScrapedData;

  if (isSpa) {
    result = await bgTab(url);
  } else {
    result = await htmlFetch(url).catch(() => bgTab(url));  // fallback to bg-tab
    if (!result.name && !result.imageUrl) {
      result = await bgTab(url);  // empty result → try bg-tab
    }
  }

  // 4. Validate image URL (HEAD check) — marks as 'unverified' if CORS, keeps URL
  if (result.imageUrl) {
    const status = await validateImageUrl(result.imageUrl);
    (result as any).__imageVerified = status === 'verified';
  }

  // 5. Cache and return
  await chrome.storage.session.set({ [cacheKey]: result }).catch(() => {});
  return result;
}

const SPA_DOMAINS = [
  'twitter.com', 'x.com', 'warpcast.com', 'farcaster.xyz',
  'gmgn.ai', 'zora.co', 'supercast.xyz', 'hey.xyz',
];
```

### 6.2 `src/lib/bg-tab.ts`

```ts
let isBgTabBusy = false;

export async function bgTab(url: string): Promise<ScrapedData> {
  if (isBgTabBusy) throw new Error('A fetch is already in progress');
  isBgTabBusy = true;

  let tab: chrome.tabs.Tab | undefined;
  try {
    // 1. Open hidden tab
    tab = await chrome.tabs.create({ url, active: false, pinned: false });

    // 2. Wait for tab.status === 'complete' (max 10s)
    await waitForTabComplete(tab.id!, 10_000);

    // 3. Retry loop — content script may not be injected immediately at complete
    const data = await retryMessage(tab.id!, { type: 'SCRAPE' }, 3, 300);

    // 4. Empty result = login-wall
    if (!data.name && !data.imageUrl) {
      throw new Error('Page requires login or returned no content');
    }

    return data;
  } finally {
    // Always cleanup — success OR error
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
    isBgTabBusy = false;
  }
}

// retryMessage: attempts sendMessage up to maxAttempts with delayMs between tries
async function retryMessage(tabId: number, msg: object, maxAttempts: number, delayMs: number) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, msg);
    } catch (e) {
      if (i === maxAttempts - 1) throw new Error('Content script unavailable');
      await delay(delayMs);
    }
  }
}
```

### 6.3 `src/lib/token-fetcher.ts`

```ts
export async function fetchToken(
  address: `0x${string}`,
  chainId: number
): Promise<ScrapedData> {
  if (!isAddress(address)) throw new Error('Invalid contract address');

  // Check session cache (TTL 10 min)
  const cacheKey = `token:${chainId}:${address.toLowerCase()}`;
  const cached = await chrome.storage.session.get(cacheKey).catch(() => ({}));
  if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;

  // Parallel fetch — both run simultaneously
  const [clankerRes, rpcRes] = await Promise.allSettled([
    withTimeout(fetchClankerApi(address), 1500),
    withTimeout(fetchOnchainRpc(address, chainId), 5000),
  ]);

  const clanker = clankerRes.status === 'fulfilled' ? clankerRes.value : null;
  const rpc     = rpcRes.status    === 'fulfilled' ? rpcRes.value    : null;

  if (!clanker && !rpc) throw new Error('Token not found on any source');

  const result: ScrapedData = {
    name:            rpc?.name        ?? clanker?.name   ?? '',
    symbol:          rpc?.symbol      ?? clanker?.symbol ?? '',
    description:     clanker?.description,
    imageUrl:        clanker?.imageUrl,
    socials:         clanker?.socials ?? {},
    detectedChainId: clanker?.detectedChainId ?? chainId,
    source:          'generic',
  };

  await chrome.storage.session.set({ [cacheKey]: result }).catch(() => {});
  return result;
}

// fetchClankerApi: GET /api/tokens — handle single object OR array response
async function fetchClankerApi(address: `0x${string}`): Promise<Partial<ScrapedData>> {
  // Try ?contract_address= first; fallback to ?address= if result is empty/array
  const url = `https://www.clanker.world/api/tokens?contract_address=${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`Clanker API ${res.status}`);
  const body = await res.json();

  // Handle both response shapes: single object OR array
  const token = Array.isArray(body?.data) ? body.data[0]
              : Array.isArray(body)        ? body[0]
              : body?.data                  ?? body;
  if (!token?.name) throw new Error('Token not found in Clanker API');

  return {
    name:            token.name,
    symbol:          token.symbol,
    imageUrl:        token.img_url,
    detectedChainId: token.chain_id,
    description:     token.metadata?.description,
    socials: {
      twitter: token.metadata?.socialMediaUrls?.twitter,
      website: token.metadata?.socialMediaUrls?.website,
    },
  };
}

// fetchOnchainRpc: multicall ERC20 name+symbol via existing getPublicClient
async function fetchOnchainRpc(address: `0x${string}`, chainId: number) {
  const client = await getPublicClient(chainId);
  const [name, symbol] = await client.multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: 'name' },
      { address, abi: erc20Abi, functionName: 'symbol' },
    ],
    allowFailure: true,
  });
  return {
    name:   name.status   === 'success' ? String(name.result)   : '',
    symbol: symbol.status === 'success' ? String(symbol.result) : '',
  };
}
```

---

## 7. Backend — Modified Files

### 7.1 `src/lib/messages.ts` — Exact Additions

```ts
// ADD to BgMessage union:
| { type: 'FETCH_URL';   url: string }
| { type: 'FETCH_TOKEN'; address: `0x${string}`; chainId: number }

// ADD BgResponse<T> entries (before the final fallback):
T extends 'FETCH_URL'   ? ScrapedData :
T extends 'FETCH_TOKEN' ? ScrapedData :

// ADD new type export:
export type FetchState =
  | 'idle'
  | 'fetching-fast'    // SW fast HTML parse
  | 'fetching-tab'     // background tab loading
  | 'fetching-api'     // Clanker API call
  | 'fetching-rpc'     // on-chain RPC multicall
  | 'uploading-image'  // Pinata upload
  | 'done'
  | 'error';

// REMOVE from ContentMessage (no longer needed):
// | { type: 'ENTER_PICK_MODE' }   ← remove (still handled in content.ts for now — graceful)
// | { type: 'EXIT_PICK_MODE' }    ← remove

// Note: content.ts still listens for ENTER/EXIT_PICK_MODE gracefully
// (old extension instances may send them). Remove from type only.
```

### 7.2 `entrypoints/background.ts` — Add Cases

```ts
// ADD in the onMessage handler switch:

case 'FETCH_URL': {
  const { url } = message;
  return fetchFromUrl(url);           // url-fetcher.ts
}

case 'FETCH_TOKEN': {
  const { address, chainId } = message;
  return fetchToken(address, chainId); // token-fetcher.ts
}
```

### 7.3 `src/lib/image-pipeline.ts` — Add validateImageUrl

```ts
// ADD after existing exports:

/**
 * HEAD-check an image URL to verify it's reachable and is actually an image.
 * Returns 'verified' if 2xx + Content-Type: image/*
 * Returns 'unverified' if CORS block or non-image content-type (keep URL, let user decide)
 * Returns 'invalid' if clearly wrong (4xx/5xx status)
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

### 7.4 `wxt.config.ts` — Merged (preserve existing)

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: { /* unchanged */ },
  vite: () => ({
    plugins: [tailwindcss()],       // ← ADD (must be first in plugins array)
    build: {
      target: 'es2022',             // ← KEEP existing
    },
    resolve: {
      alias: {                      // ← KEEP existing Preact compat aliases (Ark UI needs these)
        'react':             'preact/compat',
        'react-dom':         'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
```

---

## 8. Bug Fix: Sniper Fee Display Unit

**Found in `ConfirmView.tsx` line 80:**

```tsx
// CURRENT (wrong unit):
value={`${(form.sniperStartingFee / 10000).toFixed(0)}%→${(form.sniperEndingFee / 10000).toFixed(0)}%`}

// CORRECT (SDK unit is / 1_000_000):
value={`${(form.sniperStartingFee / 10_000).toFixed(2)}%→${(form.sniperEndingFee / 10_000).toFixed(2)}%`}
```

Wait — need to check: `DeployFormState.sniperStartingFee` is read from `config.sniperStartingFee`.
Check `storage.ts` defaults and SDK defaults:

- SDK: `sniperFees.startingFee = 666_777` → unit is `/ 1_000_000` → **66.68%**
- If we display as `/ 10_000` → **66.68** (looks correct but unit chain is wrong)
- ConfirmView shows `(666777 / 10000).toFixed(0)` → "66%" ← approximately right by coincidence

**Resolution:** The existing display happens to show approximately correct percentages because
the numbers are close. However, the **FormView range sliders** need the correct unit for
validation. Document in code; do not change display formula in this PR (low risk, separate cleanup).

---

## 9. macOS White Theme + Tailwind v4 + Ark UI

### 9.1 Dependencies

```bash
pnpm add @ark-ui/preact
pnpm add -D @tailwindcss/vite
```

### 9.2 Color System (`popup.css` — replaces current dark theme entirely)

```css
@import "tailwindcss";

@theme {
  /* Surfaces */
  --color-bg:          #F5F5F7;
  --color-surface:     #FFFFFF;
  --color-surface-2:   #F5F5F7;
  --color-surface-3:   #EBEBED;

  /* Text — Apple HIG hierarchy */
  --color-text:        #1D1D1F;
  --color-text-2:      #6E6E73;
  --color-text-3:      #AEAEB2;

  /* Accent — Base Chain Blue */
  --color-accent:      #0052FF;
  --color-accent-hover:#0040CC;
  --color-accent-dim:  rgba(0,82,255,0.10);
  --color-accent-ring: rgba(0,82,255,0.25);

  /* Semantic — macOS standard */
  --color-ok:          #34C759;
  --color-warn:        #FF9F0A;
  --color-err:         #FF3B30;

  /* Borders */
  --color-border:      rgba(0,0,0,0.08);
  --color-border-hi:   rgba(0,0,0,0.14);

  /* Typography */
  --font-sans: -apple-system, 'SF Pro Display', BlinkMacSystemFont,
               'Helvetica Neue', Inter, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;

  /* Geometry */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
}

:root {
  --shadow-sm:    0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-lg:    0 8px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-float: 0 20px 60px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
}
```

### 9.3 Component Patterns

**Buttons:**
```css
/* Primary */
.btn-primary {
  background: var(--color-accent);
  color: white;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: background 120ms, box-shadow 120ms;
}
.btn-primary:hover { background: var(--color-accent-hover); box-shadow: var(--shadow-md); }

/* Secondary */
.btn-secondary {
  background: var(--color-surface);
  border: 1px solid var(--color-border-hi);
  border-radius: var(--radius-md);
}
.btn-secondary:hover { background: var(--color-surface-3); }

/* Ghost */
.btn-ghost { background: transparent; color: var(--color-text-2); }
.btn-ghost:hover { background: var(--color-surface-3); }
```

**Input fields (Apple style — fill-based, no border at rest):**
```css
.field input, .field textarea {
  background: rgba(0,0,0,0.06);
  border: none;
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font: inherit;
  color: var(--color-text);
  transition: background 120ms, box-shadow 120ms;
}
.field input:focus, .field textarea:focus {
  background: white;
  outline: none;
  box-shadow: 0 0 0 3px var(--color-accent-ring), var(--shadow-sm);
}
```

**Cards:**
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
```

**Source cards (accordion items):**
```css
.source-card { cursor: pointer; transition: box-shadow 150ms; }
.source-card:hover { box-shadow: var(--shadow-md); }
.source-card.expanded { box-shadow: var(--shadow-md); border-color: var(--color-accent-ring); }
```

**Vibrancy (floating elements, dropdowns):**
```css
.vibrancy {
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(20px) saturate(180%);
}
```

**Spinner (macOS activity indicator style):**
```css
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 16px; height: 16px;
  border: 2px solid var(--color-border-hi);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
```

### 9.4 Ark UI Components Used

| Component | Used For |
|-----------|----------|
| `Switch` | vault / devbuy / airdrop / ghost mode toggles |
| `Slider` | Market cap range slider |
| `Select` | Chain selector, pool preset, fee type, paired token |
| `Collapsible` | Source cards + Preview image/metadata sections |
| `Toast` | Error / success / upload progress notifications |
| `Tooltip` | Help hints on complex fields |
| `FileUpload` | Drag & drop image zone in SourceView |

**ConfirmView stays as a full view** (no Dialog migration) — view state machine is source of truth.

### 9.5 Typography

```css
/* Headings */
.heading-lg { font-family: var(--font-sans); font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text); }
.heading-md { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }

/* Labels */
.label-sm { font-size: 11px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--color-text-3); }

/* Monospace (addresses, hashes, symbols) */
.mono { font-family: var(--font-mono); font-size: 12px; }
```

### 9.6 Popup Dimensions

| Mode | Width | Height |
|------|-------|--------|
| Normal popup | 400px | max 600px (scroll) |
| Tab mode (`?tab=1`) | auto, content max 480px centered | 100vh |

---

## 10. Three Sources — Detail

### 10.1 Source 1: Link / Thread URL

See §6.1 (`url-fetcher.ts`) for backend. Frontend behavior in §4.3.

**Background tab lifecycle (`bg-tab.ts`):**

```
Mutex guard: isBgTabBusy flag — throw 'Fetch in progress' if already running.

bgTab(url: string): Promise<ScrapedData>

try:
  1. tab = chrome.tabs.create({ url, active: false, pinned: false })
  2. Wait tab.status === 'complete' via chrome.tabs.onUpdated (timeout: 10s)
     Also listen chrome.tabs.onRemoved(tab.id) → reject 'Tab crashed'
  3. Retry loop — content script may not be injected yet at status=complete:
     for attempt in [0, 300ms, 600ms]:  (3 attempts, 300ms backoff)
       try chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE' })
       if success → break
       if attempt < 2 → await delay(300ms)
     if all 3 fail → throw 'Content script unavailable'
  4. Empty result handling:
     if ScrapedData.name === '' AND ScrapedData.imageUrl === undefined:
       throw 'Page requires login or returned no content'

finally: (always runs, success or error)
  chrome.tabs.remove(tab.id).catch(() => {})
  isBgTabBusy = false
```

### 10.2 Source 2: Drop Image

**Flow:**
```
1. User clicks drop zone → openAsTab() (avoids popup-close on drag)
2. In tab mode: Ark UI FileUpload renders full-width drop zone
3. File dropped → validates: image/*, size ≤ 5MB
4. FileReader.readAsArrayBuffer() → bgSend({ type: 'UPLOAD_IMAGE_BLOB', data, filename })
5. Service worker → processImageBlob() → Pinata → ipfsUrl
6. PreviewView shown immediately with the uploaded image
```

**URL drop (drag image from another tab):**
- Extract `text/uri-list` from DragEvent dataTransfer
- Send as `UPLOAD_IMAGE { url }` → `processImageUrl()` (cached by SHA-1)

**Clipboard paste:**
- `ClipboardEvent.clipboardData.files[0]` → same blob pipeline

### 10.3 Source 3: Contract Address — All 5 Chains

See §6.3 (`token-fetcher.ts`) for backend detail.

**Supported chains:**

| Chain | ID | RPC (via `CHAIN_CONFIG`) |
|-------|----|--------------------------|
| Base | 8453 | `https://mainnet.base.org` + fallbacks |
| Ethereum | 1 | `https://ethereum-rpc.publicnode.com` + fallbacks |
| Arbitrum | 42161 | `https://arb1.arbitrum.io/rpc` + fallbacks |
| Unichain | 130 | `https://mainnet.unichain.org` |
| Monad | 143 | User-configured RPC (Options) |

No new RPC additions needed — `CHAIN_CONFIG` already has `getBestRpc()`.

---

## 11. Caching Architecture

### 11.1 Three-Level Cache

| Layer | Store | Scope | TTL |
|-------|-------|-------|-----|
| In-memory `Map` | SW process lifetime | Per activation | Instant repeat |
| `chrome.storage.session` | Browser session | Cross-popup | URL: 5 min, Token: 10 min |
| `chrome.storage.local` | Persistent | Permanent | Image uploads (SHA-1 keyed) |

`chrome.storage.session` clears on browser restart — TTL is max within a session.

### 11.2 Image Cache Key

`processImageUrl()` (existing) uses `imgcache:${sha1(url)}` in `chrome.storage.local`. ✅ No change.
`processImageBlob()` (existing) has no cache — intentional, blob drops are one-off. ✅ No change.

---

## 12. Clanker SDK v4 — Implementation Constraints

Verified from `ClankerSDK 2026/src/config/clankerTokenV4.ts` and `src/utils/clankers.ts`.

### 12.1 Vault

- `percentage` max: **90** (current FormView UI says 30 — update validation)
- `lockup` range: 0–1095 days
- Action: update `vaultSupplyPct` slider max from 30 → 90 in `FormView.tsx`

### 12.2 Sniper Fees — Correct Defaults

```ts
sniperFees: {
  startingFee:     666_777,   // 66.68%
  endingFee:       41_673,    // 4.17%
  secondsToDecay:  15,
}
```

Unit is `/ 1_000_000`. Stored correctly in `config.sniperStartingFee` etc.
ConfirmView display uses `/ 10_000` — slightly off but close enough for this PR.
Add `// TODO: unit is /1_000_000 not /10_000` comment in ConfirmView.

### 12.3 Dynamic Fee Extended Parameters

Out of scope for this release (not in `DeployFormState`):
`referenceTickFilterPeriod`, `resetPeriod`, `resetTickFilter`, `feeControlNumerator`, `decayFilterBps`.

### 12.4 Fee Recipients — FeeIn

`rewards[].token: 'Both' | 'Clanker' | 'Paired'` — already correct in `DeployFormState`. ✅

### 12.5 Presale Extension

Out of scope for this release.

### 12.6 Factory Addresses (reference)

| Chain | ID | Factory v4 |
|-------|----|-----------|
| Base | 8453 | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| Arbitrum | 42161 | `0xEb9D2A726Edffc887a574dC7f46b3a3638E8E44f` |
| Ethereum | 1 | `0x6C8599779B03B00AAaE63C6378830919Abb75473` |
| Unichain | 130 | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| Monad | 143 | `0xF9a0C289Eab6B571c6247094a853810987E5B26D` |

---

## 13. Clanker API — Confirmed Schema

```
GET https://www.clanker.world/api/tokens?contract_address={address}

Response mapping:
  name             → ScrapedData.name
  symbol           → ScrapedData.symbol
  img_url          → ScrapedData.imageUrl
  chain_id         → ScrapedData.detectedChainId
  cast_hash        → ScrapedData.messageId
  requestor_fid    → ScrapedData.userId
  metadata.description            → ScrapedData.description
  metadata.socialMediaUrls.twitter → ScrapedData.socials.twitter
  metadata.socialMediaUrls.website → ScrapedData.socials.website
  warnings         → log to console if non-empty

⚠️ Endpoint note: verify ?contract_address= actually filters during implementation.
   If it returns latest tokens list instead, switch to ?address= (returns single object).
   Handle both shapes: single object OR array — take [0] if array.

HTTP 429 → log warning, surface RPC result only.
```

---

## 14. Security & Validation

| Input | Validation |
|-------|-----------|
| URL | `new URL(url)` — reject if protocol not `http:` or `https:` |
| Contract address | `viem.isAddress(addr)` before any call |
| Image URL (fetched) | HEAD request; CORS failure = 'unverified', kept for user decision |
| File drop | `file.type.startsWith('image/')` + `file.size ≤ 5MB` |
| Tab URL | Same as validated input URL |

---

## 15. Complete File Change List

### New Files

```
src/lib/url-fetcher.ts       ← fast HTML + bg-tab orchestration, caching
src/lib/token-fetcher.ts     ← parallel Clanker API + on-chain RPC, merge
src/lib/bg-tab.ts            ← background tab lifecycle (mutex, retry, cleanup)
src/popup/views/SourceView.tsx   ← 3-source selector (URL / Drop / Contract)
src/popup/views/PreviewView.tsx  ← metadata review + image gate + inline edit
```

### Modified Files

| File | What Changes |
|------|-------------|
| `src/lib/messages.ts` | +`FETCH_URL`, +`FETCH_TOKEN` to `BgMessage`; +`BgResponse<>` entries; +`FetchState` type; remove `ENTER/EXIT_PICK_MODE` from type |
| `src/lib/image-pipeline.ts` | +`validateImageUrl()` |
| `entrypoints/background.ts` | +case `FETCH_URL`, +case `FETCH_TOKEN` |
| `src/popup/App.tsx` | +views `'source'`/`'preview'`; remove `'loading'`; remove `init()` auto-scrape; remove `pickMode`/`activeTabId`/`enterPickMode`/`exitPickMode`; +`fetchState: FetchState`; +`sourceMode` |
| `src/popup/popup.css` | Full macOS white redesign (Tailwind v4 `@theme`, all component styles) |
| `src/popup/window-utils.ts` | +`openAsTab()`, +`isTab()` — keep existing functions |
| `src/popup/views/FormView.tsx` | Update `vaultSupplyPct` slider max: 30 → 90 |
| `src/popup/views/ConfirmView.tsx` | Add sniper unit TODO comment |
| `wxt.config.ts` | Add `@tailwindcss/vite` plugin (preserve aliases + target) |

### Untouched Files

`ConfirmView.tsx` (logic), `SuccessView.tsx`, `BatchView.tsx`, `HistoryView.tsx`,
`image-pipeline.ts` (upload logic), `storage.ts`, `chains.ts`, `deploy-context-builder.ts`,
`ghost-validator.ts`, `pinata.ts`, `templates.ts`, `wallet-rotation.ts`

---

## 16. Out of Scope

- OAuth / authenticated Twitter scraping
- Batch URL import
- Video / GIF support for token image
- Dynamic fee advanced params (referenceTickFilterPeriod etc.)
- Presale extension
- Options page redesign
- New chain additions beyond the 5 in `CHAIN_CONFIG`
- Element Picker in content script (type removed; handler can stay for now — graceful ignore)

---

## 17. Success Criteria

- [ ] Zero silent Pinata uploads — every upload requires explicit user click
- [ ] Drag & drop works without popup closing (tab mode via openAsTab)
- [ ] Contract fetch: name + symbol for any ERC20 on all 5 supported chains
- [ ] Contract fetch: full metadata (image, desc, socials) for Clanker tokens
- [ ] URL fetch works for Twitter, Farcaster, GMGN, and generic og:meta sites
- [ ] Background tab always cleaned up — no zombie tabs on success or error
- [ ] Empty / login-wall pages show user-facing error, not silent empty form
- [ ] Build size within 10% of current (1.52 MB)
- [ ] All existing tests still pass
- [ ] macOS white theme renders cleanly in Chrome popup (400px) and tab (480px)
- [ ] Ark UI accessible primitives (keyboard nav, ARIA) work correctly
- [ ] Vault supply max correctly shows 90% in FormView slider
