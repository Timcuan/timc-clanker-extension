# Clanker Extension — Smart Source System & macOS White Redesign

**Date:** 2026-03-18
**Status:** Approved (rev 3 — SDK intelligence integrated)
**Branch:** `claude/strange-newton`

---

## 1. Problem Statement

Current extension has three ambiguity issues:

1. **Image auto-fetch is wrong** — generic parser grabs the first `>80×80px` image on any page (banners, ads, random thumbnails). No user confirmation before silently uploading to Pinata.
2. **No structured image input** — only a plain URL text field. No drag-and-drop, no file pick.
3. **No metadata import** — cannot copy token info from an existing deployed contract.

Additionally the current dark glassmorphism UI/UX needs a full revamp to a professional-grade macOS white theme.

---

## 2. Goals

- Replace ambiguous auto-scrape with **three explicit, user-controlled sources**
- **Image confirmation** before any Pinata upload — zero silent uploads
- **Contract address fetch** — all 5 supported chains, Clanker API + on-chain RPC parallel strategy
- **Drag & drop image** — with auto-open-as-tab to avoid popup-close problem
- **macOS white UI/UX** with Tailwind v4 + Ark UI (Preact-native)
- **Zero breaking changes** to existing deploy flow (FormView, ConfirmView, BatchView, SuccessView)
- **Element Picker mode removed** — replaced entirely by the new three-source SourceView

---

## 3. Architecture

### 3.1 View State Machine

```
source          ← NEW entry point (replaces 'loading' → auto-scrape → 'form')
  ↓
preview         ← NEW confirm metadata + image before form
  ↓
form            ← existing (pre-filled, advanced config only)
  ↓
confirm → pending → success
              ↘ history / batch
```

Auto-scrape active tab on popup open is **removed entirely**.
Element Picker mode (`pickMode`, `enterPickMode`, `exitPickMode`) is **removed entirely** — replaced by SourceView.

### 3.2 Three Source Paths

All three paths converge into `PreviewView`:

| Source | Input | Backend Message |
|--------|-------|-----------------|
| Link / Thread | Paste URL | `FETCH_URL` → `url-fetcher.ts` |
| Drop Image | Drag file / paste clipboard | `UPLOAD_IMAGE_BLOB` (existing ✅) |
| Contract Address | Paste `0x...` + chain selector | `FETCH_TOKEN` → `token-fetcher.ts` |

### 3.3 AppState Changes

```ts
// src/popup/App.tsx — AppState additions
export type AppView = 'source' | 'preview' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';
//                     ↑ NEW    ↑ NEW       (existing views unchanged)

// New fields added to AppState:
interface AppState {
  // ...existing fields...
  sourceMode?: 'url' | 'image' | 'contract';  // which source was used
  fetchState: FetchState;                       // granular progress for UI
  // pickMode removed
  // activeTabId removed
}
```

### 3.4 PreviewView → FormView State Handoff

`PreviewView` receives `scraped: ScrapedData` and emits:
- `onConfirm(scraped: ScrapedData, imageIpfsUrl: string | undefined)` → `App.tsx` calls `buildInitialFormState(config, scraped)`, sets `form.imageUrl = imageIpfsUrl ?? ''`, transitions to `'form'`
- `onQuickDeploy(scraped: ScrapedData, imageIpfsUrl: string | undefined)` → same state build, transitions directly to `'confirm'`
- `onBack()` → transitions to `'source'`

Inline edits in `PreviewView` mutate a local `draft: ScrapedData` copy (not global AppState) until confirmed.

---

## 4. Three Sources — Detail

### 4.1 Source 1: Link / Thread URL

**Smart routing (service worker):**

```
SPA_DOMAINS = ['twitter.com', 'x.com', 'warpcast.com',
               'farcaster.xyz', 'gmgn.ai', 'zora.co',
               'supercast.xyz', 'hey.xyz']

fetchFromUrl(url: string): Promise<ScrapedData>
  1. Validate: must be http:// or https:// — reject all other schemes
  2. if domain ∈ SPA_DOMAINS → bgTab(url)   [skip HTML parse — known SPA]
  3. else:
     a. htmlFetch(url, timeout=3s) → parse og:image/title/description
     b. if result empty → bgTab(url) as fallback
  4. validateImageUrl(result.imageUrl):
       HEAD request, timeout=2s
       if status 2xx AND Content-Type: image/* → keep URL
       if CORS block (status 4xx/network error) → mark as 'unverified', KEEP URL
       (do NOT discard — user sees unverified image in PreviewView and can skip)
  5. Cache result: chrome.storage.session, TTL 5 minutes (key: sha1(url))
  6. Return ScrapedData
```

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
       try chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE' }, timeout=8s)
       if success → break
       if attempt < 2 → await delay(300ms)
     if all 3 fail → throw 'Content script unavailable'

  4. Empty result handling (Twitter login-wall, auth-required pages):
     if ScrapedData.name === '' AND ScrapedData.imageUrl === undefined:
       throw 'Page requires login or returned no content'
     (UI shows: "Could not read page content — try pasting the URL manually")

  5. Return ScrapedData

finally: (always runs, even on error)
  chrome.tabs.remove(tab.id)
  isBgTabBusy = false

Total max wall time: ~20s. UI receives FetchState updates ('fetching-tab') during wait.
```

Note: Existing content script parsers (`parseTwitter`, `parseFarcaster`) handle SPA wait-for-element internally via `waitForElement()`. They work correctly in hidden tabs — no user interaction required; they poll the DOM.

### 4.2 Source 2: Drop Image

**Problem:** Chrome extension popup closes on outside click — standard drag & drop fails.

**Solution: Open as Tab** when user clicks the drop zone:

```ts
// src/popup/window-utils.ts — new export
export function openAsTab(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html')  // WXT outputs popup.html ✅
  });
}
```

Popup already outputs to `popup.html` (confirmed in `.output/chrome-mv3/manifest.json`). Tab mode detected via `new URLSearchParams(location.search).has('tab')` — append `?tab=1` to the URL.

Tab mode layout: same UI, width 520px, centered max-width 480px, larger drop zone.

**Drop handler (via Ark UI `FileUpload`):**
- File drop `image/*`, max 5MB → `FileReader.readAsArrayBuffer()` → `UPLOAD_IMAGE_BLOB` ✅
- URL drop (drag image from browser) → extract `text/uri-list` → `UPLOAD_IMAGE` ✅
- Clipboard paste `Ctrl/Cmd+V` → `ClipboardEvent.clipboardData` → same blob pipeline

**`processImageBlob` dedup policy:** No SHA-1 cache for blob uploads (intentional). File drops are one-off user gestures — re-upload cost is low and caching `ArrayBuffer` content SHA-1 adds complexity without meaningful benefit. Documented non-requirement.

### 4.3 Source 3: Contract Address — All 5 Chains

**Supported chains (from actual `CHAIN_CONFIG`):**

| Chain | ID | RPC (already in CHAIN_CONFIG) |
|-------|----|-------------------------------|
| Base | 8453 | `https://mainnet.base.org` + fallbacks |
| Ethereum | 1 | `https://ethereum-rpc.publicnode.com` + fallbacks |
| Arbitrum | 42161 | `https://arb1.arbitrum.io/rpc` + fallbacks |
| Unichain | 130 | `https://mainnet.unichain.org` |
| Monad | 143 | User-configured RPC (Options → Deploy Defaults) |

No new RPC additions needed — `CHAIN_CONFIG` already has `rpcs` arrays with `getBestRpc()` health-check logic.

**Parallel fetch strategy (both run simultaneously, results merged):**

```ts
// src/lib/token-fetcher.ts
async function fetchToken(address: `0x${string}`, chainId: number): Promise<ScrapedData> {
  if (!isAddress(address)) throw new Error('Invalid contract address');

  const [clankerRes, rpcRes] = await Promise.allSettled([
    withTimeout(fetchClankerApi(address), 1500),
    withTimeout(fetchOnchainRpc(address, chainId), 5000),
  ]);

  const clanker = clankerRes.status === 'fulfilled' ? clankerRes.value : null;
  const rpc     = rpcRes.status    === 'fulfilled' ? rpcRes.value    : null;

  if (!clanker && !rpc) throw new Error('Token not found on any source');

  return {
    name:           rpc?.name        || clanker?.name   || '',
    symbol:         rpc?.symbol      || clanker?.symbol || '',
    description:    clanker?.description,
    imageUrl:       clanker?.imageUrl,
    socials:        clanker?.socials || {},
    detectedChainId: clanker?.detectedChainId ?? chainId,
    source:         'generic' as const,  // keep existing union — no new values needed
  };
}
```

**Clanker API — real endpoint and schema:**

```
GET https://www.clanker.world/api/tokens?contract_address={address}

Response fields (confirmed from live API):
  name             → ScrapedData.name
  symbol           → ScrapedData.symbol
  img_url          → ScrapedData.imageUrl  (may be IPFS URL or HTTP)
  chain_id         → ScrapedData.detectedChainId
  social_context   → { platform, messageId, interface }
  cast_hash        → ScrapedData.messageId
  requestor_fid    → ScrapedData.userId
  contract_address → for verification
  warnings         → log if present

HTTP 429 → log warning; RPC result still available from parallel fetch.
```

**On-chain RPC (via existing `getPublicClient(chainId)`):**
```ts
const client = await getPublicClient(chainId);

// multicall for efficiency
const [name, symbol] = await client.multicall({
  contracts: [
    { address, abi: erc20Abi, functionName: 'name' },
    { address, abi: erc20Abi, functionName: 'symbol' },
  ],
  allowFailure: true,
});

// Optionally try tokenURI for richer metadata
try {
  const uri = await client.readContract({ address, abi: erc721Abi, functionName: 'tokenURI', args: [0n] });
  // Handle: data:application/json;base64,... | ipfs://... | https://...
  const meta = await resolveTokenUri(uri);
  // meta.image → imageUrl, meta.description → description
} catch { /* not ERC721, skip */ }
```

`ScrapedData.source` type **not changed** — uses existing `'generic'` value. No union widening needed.

---

## 5. PreviewView — Metadata Confirmation

```
┌─────────────────────────────────┐
│  ← Back              Preview    │
├─────────────────────────────────┤
│  Source: twitter.com/...        │  ← readonly, shows which source
├─────────────────────────────────┤
│  ┌──────────┐  Token Name       │  ← large thumbnail
│  │          │  $SYMBOL          │
│  │  [img]   │  Base             │
│  └──────────┘                   │
│                                 │
│  Image status badge:            │
│  ● unverified | ● uploading... │
│  ● ipfs done | ● no image      │
│                                 │
│  [ ✓ Pakai Ini ] [ ✗ Skip ]   │  ← shown only when image detected
│  [ 🔗 Paste URL lain ]         │  ← fallback URL input, inline
├─────────────────────────────────┤
│  NAME    [Token Name      ]     │  ← all fields editable inline
│  SYMBOL  [SYMBOL          ]     │    mutates local draft copy
│  DESC    [Description...  ]     │
│  TWITTER [@handle         ]     │
│  WEBSITE [website.com     ]     │
├─────────────────────────────────┤
│  [ ⚡ Quick Deploy ]            │  → confirm view (skip form)
│  [ Edit Advanced Config → ]     │  → form view
└─────────────────────────────────┘
```

**Image confirmation states:**

| State | Behavior |
|-------|----------|
| Image found (verified) | Thumbnail + "Pakai Ini / Skip" |
| Image found (unverified — CORS) | Thumbnail with ⚠ badge + "Pakai Ini / Skip" |
| "Pakai Ini" clicked | Upload to Pinata → spinner → `ipfs://...` |
| "Skip" clicked | Placeholder 🪙, inline URL input shown |
| No image detected | URL input shown immediately |
| Drop image source | Preview immediately, "Upload & Pakai" button |

**Critical:** `UPLOAD_IMAGE` / `UPLOAD_IMAGE_BLOB` only called after explicit user confirmation. Zero silent uploads.

---

## 6. Backend Alignment

### 6.1 New Message Types

```ts
// src/lib/messages.ts — additions

// New BgMessage union members:
| { type: 'FETCH_URL';   url: string }
| { type: 'FETCH_TOKEN'; address: `0x${string}`; chainId: number }

// New FetchState type:
export type FetchState =
  | 'idle'
  | 'fetching-fast'    // SW HTML parse in progress
  | 'fetching-tab'     // background tab loading/scraping
  | 'fetching-api'     // Clanker API call in progress
  | 'fetching-rpc'     // on-chain RPC multicall in progress
  | 'uploading-image'  // Pinata upload in progress
  | 'done'
  | 'error'

// BgResponse<T> — new entries:
type BgResponse<T extends BgMessage['type']> =
  // ... existing entries ...
  T extends 'FETCH_URL'   ? ScrapedData :
  T extends 'FETCH_TOKEN' ? ScrapedData :
  // ... rest unchanged ...
  { ok: true };
```

### 6.2 Three-Level Caching

| Layer | Store | Scope | TTL |
|-------|-------|-------|-----|
| In-memory `Map` | SW process lifetime | Per SW activation | Instant repeat hits |
| `chrome.storage.session` | Browser session only | Cross-popup | URL: 5min, Token: 10min |
| `chrome.storage.local` | Permanent | Persistent | Image uploads (SHA-1 keyed) |

Note: `chrome.storage.session` clears on browser restart — TTL claims reflect maximum within a session, not across sessions. No persistent URL cache is intended.

### 6.3 Tailwind v4 + Preact — Merged `wxt.config.ts`

```ts
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  extensionApi: 'chrome',
  manifest: { /* unchanged */ },
  vite: () => ({
    plugins: [tailwindcss()],       // ← ADD (must be first)
    build: {
      target: 'es2022',             // ← KEEP existing
    },
    resolve: {
      alias: {                      // ← KEEP existing Preact compat aliases
        'react':          'preact/compat',
        'react-dom':      'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
});
```

Ark UI uses these aliases to resolve React imports — without them build fails.

### 6.4 Security & Validation

| Input | Validation |
|-------|-----------|
| URL | `new URL(url)` — reject if protocol not `http:` or `https:` |
| Contract address | `viem.isAddress(addr)` before any call |
| Image URL (fetched) | HEAD request; CORS failure = 'unverified', kept for user to decide |
| File drop | `file.type.startsWith('image/')` + `file.size <= 5MB` |
| Tab URL | Same as validated input — no redirect possible |

### 6.5 New Files

```
src/lib/
  url-fetcher.ts      ← fast path HTML + bg-tab orchestration, caching
  token-fetcher.ts    ← parallel Clanker API + on-chain RPC, merge + validation
  bg-tab.ts           ← background tab lifecycle manager (mutex, retry, cleanup)
```

### 6.6 Modified Files

| File | Change |
|------|--------|
| `src/lib/messages.ts` | +`FETCH_URL`, +`FETCH_TOKEN` to `BgMessage`; +`BgResponse<>` entries; +`FetchState` type |
| `entrypoints/background.ts` | +case `FETCH_URL`, +case `FETCH_TOKEN` |
| `entrypoints/content.ts` | Verify responds to `chrome.tabs.sendMessage` from background (already compatible) |
| `src/lib/image-pipeline.ts` | +`validateImageUrl(url): Promise<'verified'|'unverified'>` |
| `src/popup/App.tsx` | +views `'source'`/`'preview'`; remove auto-scrape init; remove pickMode/activeTabId |
| `src/popup/popup.css` | Full macOS white redesign (Tailwind v4 `@theme` tokens) |
| `src/popup/window-utils.ts` | +`openAsTab()` |
| `wxt.config.ts` | Add `@tailwindcss/vite` plugin (preserve existing aliases + target) |

**No changes to:** `FormView.tsx` core logic, `ConfirmView.tsx`, `SuccessView.tsx`, `BatchView.tsx`, `HistoryView.tsx`, `image-pipeline.ts` upload logic, `storage.ts`, `chains.ts`.

### 6.7 New Frontend Files

```
src/popup/views/
  SourceView.tsx      ← 3-panel source selector (URL / Drop / Contract)
  PreviewView.tsx     ← metadata review + image confirmation + inline edit
```

---

## 7. macOS White Theme + Tailwind v4 + Ark UI

### 7.1 Dependencies

```bash
pnpm add @ark-ui/preact
pnpm add -D @tailwindcss/vite
```

### 7.2 Color System (`popup.css` — `@theme` block)

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
}
```

### 7.3 Shadow Scale

```css
/* Not in @theme — custom properties */
:root {
  --shadow-sm:    0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
  --shadow-md:    0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-lg:    0 8px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05);
  --shadow-float: 0 20px 60px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
}
```

### 7.4 Component Patterns

**Buttons:**
- Primary: `bg-accent text-white shadow-sm rounded-md` hover: `bg-accent-hover shadow-md`
- Secondary: `bg-surface border border-border` hover: `bg-surface-3`
- Ghost: transparent, `text-text-2` hover: `bg-surface-3`

**Inputs (Apple style — background-based, no explicit border):**
```css
.field input { background: rgba(0,0,0,0.06); border: none; border-radius: 8px; }
.field input:focus { background: white; box-shadow: 0 0 0 3px var(--color-accent-ring); }
```

**Cards:** `bg-surface border border-border rounded-xl shadow-sm`

**Vibrancy (floating elements):**
```css
background: rgba(255,255,255,0.85);
backdrop-filter: blur(20px) saturate(180%);
```

**Toggles:** Ark UI `Switch` — styled to match iOS/macOS toggle (accent-on, gray-off)

### 7.5 Ark UI Components Used

| Component | Used For |
|-----------|----------|
| `Switch` | vault / devbuy / airdrop / ghost mode toggles |
| `Slider` | Market cap range slider |
| `Select` | Chain selector, pool preset, fee type, paired token |
| `Collapsible` | Form section headers (Basic Info, Fee, etc.) |
| `Toast` | Error / success / upload notifications |
| `Tooltip` | Help hints on complex fields |
| `FileUpload` | Drag & drop image zone in SourceView |

**ConfirmView stays as a full view** (no Dialog migration) — view state machine is source of truth.

### 7.6 Popup Dimensions

| Mode | Width | Height |
|------|-------|--------|
| Normal popup | 400px | max 600px (unchanged) |
| Tab mode (`?tab=1`) | 520px | 100vh, content max 480px |

---

## 8. Frontend–Backend Contract (Complete)

| Action | Frontend sends | Backend returns |
|--------|---------------|-----------------|
| Fetch from URL | `FETCH_URL { url }` | `ScrapedData` |
| Fetch from contract | `FETCH_TOKEN { address, chainId }` | `ScrapedData` |
| Confirm image (URL) | `UPLOAD_IMAGE { url }` | `{ ipfsUrl: string }` |
| Confirm image (file) | `UPLOAD_IMAGE_BLOB { data, filename }` | `{ ipfsUrl: string }` |
| Deploy | `DEPLOY { form, scraped }` | `{ txHash, tokenAddress }` |
| Batch deploy | Port API (existing) | `SwEvent` stream |

`ScrapedData` type — **no changes**. `source` field uses existing `'generic'` for contract fetches.

---

## 9. Clanker API — Confirmed Schema

Live API response from `GET https://www.clanker.world/api/tokens`:

```
name, symbol, img_url → imageUrl mapping
chain_id              → detectedChainId
contract_address      → for verification
cast_hash             → messageId
requestor_fid         → userId
social_context        → { interface, platform, messageId }
warnings              → log if non-empty
starting_market_cap   → informational
fees                  → informational
```

**Single token lookup — endpoint to confirm during implementation:**

`GET https://www.clanker.world/api/tokens?contract_address={address}`

⚠️ During implementation, verify that `?contract_address=` actually filters — live testing
showed the endpoint may return the latest tokens list instead. If so, use:
`GET https://www.clanker.world/api/tokens?address={address}` (returns single object, not array).
The implementation must handle both response shapes: single object OR array — take `[0]` if array.

---

## 10. Clanker SDK v4 — Implementation Constraints

Verified directly from `ClankerSDK 2026/src/config/clankerTokenV4.ts` and `src/utils/clankers.ts`.
These constraints are authoritative for form validation.

### 10.1 Vault

- `percentage` max: **90** (not 30 — some older docs are wrong)
- `lockup` range: 0–1095 days
- Update form validation: `vault.vaultSupplyPct` max 90, not 30

### 10.2 Sniper Fees — Correct Defaults

```ts
sniperFees: {
  startingFee:     666_777,   // 66.67%
  endingFee:       41_673,    // 4.17%
  secondsToDecay:  15,
}
```

FormView defaults must match. `bps` unit here is `/ 1_000_000` (not `/ 10_000`).

### 10.3 Dynamic Fee — Extended Parameters

Beyond `baseBps`/`maxBps`, the SDK exposes advanced parameters. These are **not** surfaced
in the current `DeployFormState` and stay out of scope for this release (expert-use only):

```ts
// Advanced (future scope — not exposed in FormView):
referenceTickFilterPeriod  // smoothing period
resetPeriod
resetTickFilter
feeControlNumerator
decayFilterBps
```

### 10.4 Fee Recipients — `FeeIn` Enum

Each reward recipient has a `feeIn: 'Both' | 'Paired' | 'Clanker'` field.
The current `rewards` array in `DeployFormState` stores `token: string` — map:
`'Both' → 'Both'`, `'ETH'|'WETH'|'Paired' → 'Paired'`, `'CLNK'|'Clanker' → 'Clanker'`.
No form changes needed — existing UI is compatible.

### 10.5 Presale Extension

SDK supports a `presale` extension. Out of scope for this release.

### 10.6 Factory Contract Addresses (v4)

These are already in `src/lib/chains.ts` via `CHAIN_CONFIG`. For reference:

| Chain | ID | Factory |
|-------|----|---------|
| Base | 8453 | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| Arbitrum | 42161 | `0xEb9D2A726Edffc887a574dC7f46b3a3638E8E44f` |
| Ethereum | 1 | `0x6C8599779B03B00AAaE63C6378830919Abb75473` |
| Unichain | 130 | `0xE85A59c628F7d27878ACeB4bf3b35733630083a9` |
| Monad | 143 | `0xF9a0C289Eab6B571c6247094a853810987E5B26D` |

### 10.7 SDK Chain List

Full list from `clankers.ts`: `[8453, 10143, 84532, 42161, 130, 143, 1]`
— includes `monadTestnet (10143)` and `baseSepolia (84532)` which are NOT in `CHAIN_CONFIG`.
Do not add testnet chains to the UI for this release.

---

## 11. Out of Scope

- OAuth / authenticated Twitter scraping
- Batch URL import
- Video / GIF support for token image
- Changes to vault, devbuy, airdrop, rewards, fee logic (except vault max 90% fix)
- Options page redesign
- Element Picker mode (removed, not replaced in future scope)
- New chain additions beyond the 5 in `CHAIN_CONFIG`
- Dynamic fee advanced params (referenceTickFilterPeriod etc.) — future expert mode
- Presale extension

---

## 12. Success Criteria

- [ ] Zero silent Pinata uploads — every upload requires explicit user action
- [ ] Drag & drop works without popup closing (tab mode)
- [ ] Contract fetch: name + symbol for any ERC20 on all 5 supported chains
- [ ] Contract fetch: full metadata (image, desc) for Clanker tokens via API
- [ ] URL fetch works for Twitter, Farcaster, GMGN, and generic og:meta sites
- [ ] Background tab always cleaned up — no zombie tabs on success or error
- [ ] Empty/login-wall pages show user-facing error, not silent empty form
- [ ] Build size within 10% of current (1.52 MB)
- [ ] All existing 70 tests still pass
- [ ] macOS white theme renders cleanly in Chrome popup (400px) and tab (520px)
- [ ] Ark UI accessible primitives (keyboard nav, ARIA) work correctly
