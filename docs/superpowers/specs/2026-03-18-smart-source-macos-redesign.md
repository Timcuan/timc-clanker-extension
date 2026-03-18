# Clanker Extension — Smart Source System & macOS White Redesign

**Date:** 2026-03-18
**Status:** Approved
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
- **Contract address fetch** — all chains, Clanker API + on-chain RPC parallel strategy
- **Drag & drop image** — with auto-open-as-tab to avoid popup-close problem
- **macOS white UI/UX** with Tailwind v4 + Ark UI (Preact-native)
- **Zero breaking changes** to existing deploy flow (FormView, ConfirmView, BatchView, SuccessView)

---

## 3. Architecture

### 3.1 View State Machine

```
source          ← NEW entry point (replaces auto-scrape on popup open)
  ↓
preview         ← NEW confirm metadata + image before form
  ↓
form            ← existing (pre-filled, advanced config only)
  ↓
confirm → pending → success
              ↘ history / batch
```

Auto-scrape active tab on popup open is **removed entirely**.

### 3.2 Three Source Paths

All three paths converge into `PreviewView`:

| Source | Input | Backend |
|--------|-------|---------|
| Link / Thread | Paste URL | `FETCH_URL` → url-fetcher |
| Drop Image | Drag file / paste clipboard | `UPLOAD_IMAGE_BLOB` (existing) |
| Contract Address | Paste `0x...` + chain | `FETCH_TOKEN` → token-fetcher |

---

## 4. Three Sources — Detail

### 4.1 Source 1: Link / Thread URL

**Smart routing (service worker):**

```
SPA_DOMAINS = ['twitter.com', 'x.com', 'warpcast.com',
               'farcaster.xyz', 'gmgn.ai', 'zora.co',
               'supercast.xyz', 'hey.xyz']

fetchFromUrl(url):
  1. Validate: must be http:// or https:// only
  2. if domain ∈ SPA_DOMAINS → bgTab(url)
  3. else → htmlFetch(url, timeout=3s) → parse og:image/title/description
     if result empty → bgTab(url) as fallback
  4. validateImageUrl(result.imageUrl, timeout=2s)
     HEAD request → check Content-Type: image/*
     if invalid → result.imageUrl = undefined
  5. Cache result: chrome.storage.session, TTL 5 minutes
```

**Background tab lifecycle (`bg-tab.ts`):**

```
Guard: mutex isBgTabBusy — reject if already running

1. chrome.tabs.create({ url, active: false, pinned: false })
2. Wait tab.status === 'complete' via tabs.onUpdated (timeout: 10s)
   Also listen tabs.onRemoved → reject 'Tab crashed'
3. chrome.tabs.sendMessage(tabId, { type: 'SCRAPE' }) (timeout: 8s)
   Existing content script parsers handle SPA wait-for-element internally ✅
4. Return ScrapedData

finally: (always runs, even on error)
  chrome.tabs.remove(tabId)
  isBgTabBusy = false
```

Total max timeout: 18s. UI receives granular `FetchState` progress updates.

### 4.2 Source 2: Drop Image

**Problem:** Chrome extension popup closes on outside click — standard drag & drop fails.

**Solution: Auto-open as Tab** on drop zone click:

```ts
export function openAsTab(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup.html') + '?mode=tab'
  });
}
```

Tab mode: detect `?mode=tab` in URLSearchParams → render wider layout (520px), larger drop zone, tab does not close on outside click.

**Drop handler accepts:**
- File drop (`image/*`, max 5MB) → `FileReader` → `ArrayBuffer` → `UPLOAD_IMAGE_BLOB` ✅ existing
- URL drop (dragging image from browser) → `UPLOAD_IMAGE` ✅ existing
- Clipboard paste (`Ctrl/Cmd+V`) → same blob pipeline

Uses **Ark UI `FileUpload`** component for accessible drag-and-drop primitives.

### 4.3 Source 3: Contract Address — All Chains

**Parallel strategy** (not race/fallback — both run simultaneously, results merged):

```ts
async function fetchToken(address: `0x${string}`, chainId: number): Promise<ScrapedData> {
  const [clankerRes, rpcRes] = await Promise.allSettled([
    withTimeout(fetchClankerApi(address), 1500),
    withTimeout(fetchOnchainRpc(address, chainId), 5000),
  ]);

  const clanker = clankerRes.status === 'fulfilled' ? clankerRes.value : null;
  const rpc     = rpcRes.status    === 'fulfilled' ? rpcRes.value    : null;

  if (!clanker && !rpc) throw new Error('Token not found on any source');

  // Merge: RPC authoritative for name/symbol (on-chain truth)
  //        Clanker authoritative for image, description, socials
  return {
    name:           rpc?.name        || clanker?.name        || '',
    symbol:         rpc?.symbol      || clanker?.symbol      || '',
    description:    clanker?.description,
    imageUrl:       clanker?.imageUrl,
    socials:        clanker?.socials || {},
    detectedChainId: clanker?.chainId ?? chainId,
    source:         clanker ? 'clanker-api' : 'on-chain',
  };
}
```

**Clanker API:**
```
GET https://www.clanker.world/api/tokens/{address}
Returns: name, symbol, description, imageUrl (ipfs://), socials, chainId
Rate limit 429 → log warning, RPC result still available
```

**On-chain RPC — all chains via CHAIN_CONFIG:**

```
viem multicall:
  name()   ← ERC20 universal
  symbol() ← ERC20 universal
  try tokenURI():
    data:application/json;base64,... → atob() → JSON.parse()
    ipfs://...                       → fetch via public gateway
    https://...                      → direct fetch
    → extract .image and .description
```

**RPC URLs added to CHAIN_CONFIG:**

| Chain | ID | RPC |
|-------|----|-----|
| Base | 8453 | `https://mainnet.base.org` |
| Ethereum | 1 | `https://eth.llamarpc.com` |
| Optimism | 10 | `https://mainnet.optimism.io` |
| Arbitrum | 42161 | `https://arb1.llamarpc.com` |
| Zora | 7777777 | `https://rpc.zora.energy` |
| Degen | 666666666 | `https://rpc.degen.tips` |
| Blast | 81457 | `https://rpc.blast.io` |

Address validated via `viem.isAddress()` before any RPC call.

---

## 5. PreviewView — Metadata Confirmation

After any source fetch, user lands on `PreviewView`:

```
┌─────────────────────────────────┐
│  ← Back              Preview    │
├─────────────────────────────────┤
│  Source: twitter.com/...        │  ← readonly label
├─────────────────────────────────┤
│  ┌──────────┐  Token Name       │
│  │          │  $SYMBOL          │
│  │  [img]   │  Base chain       │
│  └──────────┘                   │
│  [ ✓ Pakai Ini ] [ ✗ Skip ]    │  ← image confirm
│    atau: [ 🔗 Paste URL lain ] │
├─────────────────────────────────┤
│  NAME        Token Name         │  ← editable inline
│  SYMBOL      SYMBOL             │
│  DESC        Description...     │
│  TWITTER     @handle            │
│  WEBSITE     website.com        │
├─────────────────────────────────┤
│  [ Quick Deploy ⚡ ]            │  ← skip form
│  [ Edit Advanced Config → ]     │  ← go to FormView
└─────────────────────────────────┘
```

### Image Confirmation States

| State | UI |
|-------|----|
| Image found | Large thumbnail + "Pakai Ini / Skip" |
| "Pakai Ini" clicked | Spinner → Pinata upload → `ipfs://...` |
| "Skip" clicked | Placeholder 🪙 + inline URL input |
| No image detected | URL input shown immediately |
| Drop image source | Preview inline + "Upload & Pakai" |

**Critical:** `UPLOAD_IMAGE` / `UPLOAD_IMAGE_BLOB` only called after explicit user confirmation. Zero silent uploads.

---

## 6. Backend Alignment

### 6.1 New Message Types

```ts
// src/lib/messages.ts additions
| { type: 'FETCH_URL';   url: string }
| { type: 'FETCH_TOKEN'; address: `0x${string}`; chainId: number }

export type FetchState =
  | 'idle'
  | 'fetching-fast'    // SW HTML parse
  | 'fetching-tab'     // background tab loading
  | 'fetching-api'     // Clanker API
  | 'fetching-rpc'     // on-chain RPC
  | 'uploading-image'  // Pinata upload
  | 'done'
  | 'error'
```

### 6.2 Three-Level Caching

| Layer | Store | TTL | Content |
|-------|-------|-----|---------|
| In-memory Map | SW lifetime | Session | Instant repeat hits |
| `chrome.storage.session` | Browser session | URL: 5min, Token: 10min | Cross-popup consistency |
| `chrome.storage.local` | Permanent | ∞ | Pinata image uploads (SHA-1 keyed) |

### 6.3 Security & Validation

| Input | Validation |
|-------|-----------|
| URL | Must be `http://` or `https://` — reject `file://`, `javascript:`, data: |
| Contract address | `viem.isAddress()` before any RPC call |
| Image URL (fetched) | HEAD request, verify `Content-Type: image/*` |
| File drop | `file.type.startsWith('image/')` + max 5MB |
| Tab URL | Same as validated input URL — no redirect hijack |

### 6.4 New Files

```
src/lib/
  url-fetcher.ts      ← smart routing: fast HTML path + bg-tab orchestration
  token-fetcher.ts    ← parallel Clanker API + on-chain RPC, merge strategy
  bg-tab.ts           ← background tab lifecycle manager with mutex
```

### 6.5 Modified Files

| File | Change |
|------|--------|
| `src/lib/messages.ts` | +2 message types, +`FetchState` |
| `src/lib/chains.ts` | Add `rpcUrl` for all 7 chains |
| `entrypoints/background.ts` | +case `FETCH_URL`, `FETCH_TOKEN` |
| `entrypoints/content.ts` | Ensure responds to background tab SCRAPE |
| `src/lib/image-pipeline.ts` | +`validateImageUrl()` helper |
| `src/popup/App.tsx` | +views `'source'`, `'preview'`; remove auto-scrape init |
| `src/popup/popup.css` | Full macOS white redesign |

**No changes to:** `FormView.tsx` (core), `ConfirmView.tsx`, `SuccessView.tsx`, `BatchView.tsx`, `HistoryView.tsx`, `image-pipeline.ts` upload logic.

### 6.6 New Frontend Files

```
src/popup/views/
  SourceView.tsx      ← 3-panel source selector
  PreviewView.tsx     ← metadata + image confirmation
```

---

## 7. macOS White Theme + Tailwind v4 + Ark UI

### 7.1 Dependencies

```bash
pnpm add @ark-ui/preact
pnpm add -D @tailwindcss/vite
```

```ts
// wxt.config.ts
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  vite: () => ({ plugins: [tailwindcss()] }),
});
```

### 7.2 Color System

```css
/* @theme in popup.css */
--color-bg:         #F5F5F7;   /* macOS window background */
--color-surface:    #FFFFFF;   /* panel / card */
--color-surface-2:  #F5F5F7;   /* nested surface */
--color-surface-3:  #EBEBED;   /* hover state */

--color-text:       #1D1D1F;   /* primary */
--color-text-2:     #6E6E73;   /* secondary */
--color-text-3:     #AEAEB2;   /* tertiary / placeholder */

--color-accent:     #0052FF;   /* Base chain blue */
--color-accent-hover: #0040CC;
--color-accent-dim: rgba(0,82,255,0.10);
--color-accent-ring: rgba(0,82,255,0.25);

--color-ok:         #34C759;   /* macOS green */
--color-warn:       #FF9F0A;   /* macOS amber */
--color-err:        #FF3B30;   /* macOS red */

--color-border:     rgba(0,0,0,0.08);
--color-border-hi:  rgba(0,0,0,0.14);
```

### 7.3 Shadow Scale

```css
--shadow-sm:    0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
--shadow-md:    0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05);
--shadow-lg:    0 8px 30px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.05);
--shadow-float: 0 20px 60px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06);
```

### 7.4 Typography

```css
--font-sans: -apple-system, 'SF Pro Display', BlinkMacSystemFont,
             'Helvetica Neue', Inter, sans-serif;
--font-mono: 'SF Mono', 'JetBrains Mono', 'Fira Code',
             ui-monospace, monospace;
```

### 7.5 Component Patterns

**Buttons:**
- Primary: `bg #0052FF`, white text, `shadow-sm`, 8px radius, hover: `#0040CC + shadow-md`
- Secondary: `bg white`, `border --border`, hover: `bg --surface-3`
- Ghost: transparent, `color --text-2`, hover: `bg --surface-3`

**Inputs (Apple style):**
- `bg rgba(0,0,0,0.06)`, no border, `border-radius 8px`
- Focus: `bg white + box-shadow: 0 0 0 3px --accent-ring`

**Cards:** `bg white`, `border --border`, `border-radius 12px`, `shadow-sm`

**Vibrancy (dropdowns, tooltips):**
- `background: rgba(255,255,255,0.85)`
- `backdrop-filter: blur(20px) saturate(180%)`

### 7.6 Ark UI Components Used

| Component | Used For |
|-----------|----------|
| `Switch` | vault / devbuy / airdrop / ghost mode toggles |
| `Slider` | Market cap range slider |
| `Select` | Chain selector, pool preset, fee type |
| `Collapsible` | Form section headers |
| `Dialog` | Confirm deploy (replaces ConfirmView page) |
| `Toast` | Error / success notifications |
| `Tooltip` | Help hints on complex fields |
| `FileUpload` | Drag & drop image zone |

### 7.7 Popup Dimensions

| Mode | Width | Height |
|------|-------|--------|
| Normal popup | 400px | max 600px (existing) |
| Tab mode (`?mode=tab`) | 520px | 100vh, content max 480px |

---

## 8. Frontend–Backend Contract

| Action | Frontend sends | Backend returns |
|--------|---------------|-----------------|
| Fetch from URL | `FETCH_URL { url }` | `ScrapedData` |
| Fetch from contract | `FETCH_TOKEN { address, chainId }` | `ScrapedData` |
| Upload image URL | `UPLOAD_IMAGE { url }` (existing) | `{ ipfsUrl }` |
| Upload image file | `UPLOAD_IMAGE_BLOB { data, filename }` (existing) | `{ ipfsUrl }` |
| Deploy | `DEPLOY { form, scraped }` (existing) | `{ txHash, tokenAddress }` |

`ScrapedData` type unchanged — no migration needed.

---

## 9. Out of Scope

- OAuth / authenticated Twitter scraping
- Batch URL import
- Video / GIF support for token image
- Changes to vault, devbuy, airdrop, rewards logic
- Options page redesign (separate task)

---

## 10. Success Criteria

- [ ] User never sees a random/wrong image auto-uploaded — zero silent uploads
- [ ] Drag & drop works without popup closing (tab mode)
- [ ] Contract fetch returns name+symbol for any ERC20 on all 7 chains
- [ ] Contract fetch returns full metadata (image, desc, socials) for Clanker tokens
- [ ] URL fetch works for Twitter, Farcaster, GMGN, and generic sites
- [ ] Background tab always cleaned up — no zombie tabs
- [ ] Build size within 10% of current (1.52 MB)
- [ ] All existing 70 tests still pass
- [ ] macOS white theme renders cleanly in Chrome extension popup
