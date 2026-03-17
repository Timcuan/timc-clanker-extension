# Timc Clanker Extension — Design Spec
*Last updated: 2026-03-17*

## Overview

A Chrome/Brave browser extension (Manifest V3) that scrapes token metadata from any webpage (Twitter/X, Farcaster, generic sites), auto-fills a full-featured deploy form, and deploys ERC-20 tokens via the local **clanker-sdk v4** directly onchain. Supports deploy history, LP fee claiming, and named deploy templates.

**Personal use only. Not for public distribution.**

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Extension Framework | **WXT** (wxt.dev) | MV3, Vite bundler, TypeScript, HMR |
| UI | **Preact** | ~3KB, React-compatible API |
| Styling | **Plain CSS + CSS variables** | No Tailwind — keep bundle small |
| Onchain | **viem ^2.x + local clanker-sdk** | `file:../ClankerSDK 2026` — built locally |
| Image IPFS | **Pinata API** (free tier) | Upload blob → `ipfs://CID` |
| Storage | **chrome.storage.local** | Encrypted at rest by Chrome |
| Crypto | **Web Crypto API (AES-256-GCM)** | Native browser, zero deps |
| Validation | **Zod v4** | Already in SDK, reuse for message types |

---

## Supported Chains

SDK v4 supported chains only (BNB Chain not in SDK — dropped):

| Chain | ChainId | Notes |
|---|---|---|
| Base | 8453 | v4.1, primary chain |
| Ethereum Mainnet | 1 | v4.1 |
| Arbitrum | 42161 | v4 |
| Unichain | 1301 | v4 |
| Abstract | 2741 | v4 |
| Monad | custom | v4 |

Chain config is derived directly from `clankerConfigFor()` in the SDK — no hardcoded factory addresses needed.

---

## Project Structure

```
timc-clanker-extension/
├── package.json
├── wxt.config.ts
├── tsconfig.json
│
├── src/
│   ├── background/
│   │   ├── index.ts                     # Service worker entry + keepalive alarm
│   │   └── handlers/
│   │       ├── deploy.ts                # Deploy orchestration (simulate → sign → broadcast)
│   │       ├── image.ts                 # Fetch URL → upload Pinata → ipfs://CID (with cache)
│   │       ├── fees.ts                  # claimRewards + availableRewards via SDK
│   │       └── history.ts               # Merge chrome.storage + clanker.world public API
│   │
│   ├── background/crypto.ts             # AES-256-GCM encrypt/decrypt private key (600k PBKDF2)
│   │
│   ├── content/
│   │   ├── scraper.ts                   # Injected on activeTab, parses page → ScrapedData
│   │   ├── wallet-bridge.ts             # Relay window.ethereum EIP-1193 to service worker
│   │   └── parsers/
│   │       ├── twitter.ts               # twitter.com / x.com
│   │       ├── farcaster.ts             # warpcast.com
│   │       └── generic.ts               # Universal OG meta fallback
│   │
│   ├── popup/
│   │   ├── index.html
│   │   ├── index.tsx                    # Preact entry
│   │   ├── App.tsx                      # State machine root
│   │   ├── popup.css
│   │   └── views/
│   │       ├── FormView.tsx             # Full deploy form — collapsible sections
│   │       ├── ConfirmView.tsx          # Pre-sign summary with gas estimate
│   │       ├── PendingView.tsx          # Tx in-flight + txHash explorer link
│   │       ├── SuccessView.tsx          # Token address + links + deploy another
│   │       └── HistoryView.tsx          # Token list + available fees + claim button
│   │
│   ├── options/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   └── sections/
│   │       ├── WalletSection.tsx        # Mode A/B toggle + PK input + encrypt
│   │       ├── IdentitySection.tsx      # tokenAdmin address
│   │       ├── RewardsSection.tsx       # Default reward recipients template
│   │       ├── DeploySection.tsx        # Default chain, fee preset, pool preset
│   │       ├── ImageSection.tsx         # Pinata API key + secret
│   │       └── TemplatesSection.tsx     # Save/load/delete named deploy templates
│   │
│   └── lib/
│       ├── messages.ts                  # Typed discriminated union message protocol
│       ├── chains.ts                    # Chain registry with RPC fallback arrays
│       ├── storage.ts                   # Typed chrome.storage.local wrapper
│       ├── clanker.ts                   # clanker-sdk v4 wrapper (service worker only)
│       ├── image-pipeline.ts            # Fetch → cache check → Pinata upload → ipfs://CID
│       ├── pinata.ts                    # Pinata pinFileToIPFS wrapper
│       ├── symbol.ts                    # Auto-generate symbol from handle/name
│       └── templates.ts                 # Save/load deploy config templates
│
└── public/
    └── icons/                           # 16, 32, 48, 128px PNG
```

---

## Typed Message Protocol

All inter-context communication uses a single discriminated union. No raw string messages.

```typescript
// lib/messages.ts

export type BgMessage =
  | { type: 'SCRAPE' }
  | { type: 'DEPLOY'; payload: DeployPayload }
  | { type: 'UPLOAD_IMAGE'; url: string }
  | { type: 'UPLOAD_IMAGE_BLOB'; data: ArrayBuffer; filename: string }
  | { type: 'CLAIM_REWARDS'; token: `0x${string}`; recipient: `0x${string}`; chainId: number }
  | { type: 'GET_AVAILABLE_REWARDS'; token: `0x${string}`; recipient: `0x${string}`; chainId: number }
  | { type: 'GET_HISTORY' }
  | { type: 'WALLET_PING' }
  | { type: 'WALLET_REQUEST'; request: EIP1193Request };

export type BgResponse<T extends BgMessage['type']> =
  T extends 'DEPLOY' ? { txHash: `0x${string}`; tokenAddress: `0x${string}` } :
  T extends 'UPLOAD_IMAGE' | 'UPLOAD_IMAGE_BLOB' ? { ipfsUrl: string } :
  T extends 'GET_AVAILABLE_REWARDS' ? { amount: bigint } :
  T extends 'GET_HISTORY' ? { records: DeployRecord[] } :
  T extends 'WALLET_PING' ? { ready: true } :
  { ok: true };
```

---

## Service Worker Keepalive

MV3 service workers die after ~30s idle. Deploys can take 45–60s. Fix:

```typescript
// background/index.ts
chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((_alarm) => { /* no-op — prevents SW death */ });
```

---

## Chain Config (RPC Fallback)

```typescript
// lib/chains.ts
export const CHAIN_CONFIG = {
  8453: {
    name: 'Base',
    viemChain: base,
    rpcs: [
      'https://mainnet.base.org',
      'https://base.llamarpc.com',
      'https://base-rpc.publicnode.com',
    ],
    explorer: 'https://basescan.org',
    marketCapUnit: 'ETH',
  },
  1: {
    name: 'Ethereum',
    viemChain: mainnet,
    rpcs: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
    ],
    explorer: 'https://etherscan.io',
    marketCapUnit: 'ETH',
  },
  42161: {
    name: 'Arbitrum',
    viemChain: arbitrum,
    rpcs: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.llamarpc.com',
    ],
    explorer: 'https://arbiscan.io',
    marketCapUnit: 'ETH',
  },
  // ... unichain, abstract, monad
} as const;

export async function getPublicClient(chainId: number) {
  const config = CHAIN_CONFIG[chainId];
  for (const rpc of config.rpcs) {
    try {
      const client = createPublicClient({ chain: config.viemChain, transport: http(rpc) });
      await client.getBlockNumber(); // health check
      return client;
    } catch { continue; }
  }
  throw new Error(`All RPCs failed for chain ${chainId}`);
}
```

---

## Full Settings Schema

```typescript
// lib/storage.ts

interface ExtensionConfig {
  // WALLET
  walletMode: 'injected' | 'privatekey';
  encryptedPK?: string;    // AES-256-GCM ciphertext, base64
  pkIv?: string;           // base64 IV
  pkSalt?: string;         // base64 PBKDF2 salt (separate from IV)

  // IDENTITY
  tokenAdmin: `0x${string}`;

  // DEFAULT DEPLOY SETTINGS
  defaultChain: number;               // chainId
  defaultFeePreset: 'StaticBasic' | 'DynamicBasic' | 'Dynamic3' | 'Custom';
  defaultPoolPreset: 'Standard' | 'Project' | 'TwentyETH';
  defaultPairedToken: 'WETH' | `0x${string}`;
  defaultMarketCap: number;           // in ETH/native unit

  // DEFAULT REWARDS TEMPLATE
  defaultRewards: Array<{
    admin: `0x${string}`;
    recipient: `0x${string}`;
    bps: number;
    token: 'Both' | 'Clanker' | 'Paired';
  }>;

  // SNIPER PROTECTION DEFAULTS (v4.1+)
  sniperStartingFee: number;    // default: 666777
  sniperEndingFee: number;      // default: 41673
  sniperSecondsToDecay: number; // default: 15

  // PINATA
  pinataApiKey: string;
  pinataSecretKey: string;

  // NAMED TEMPLATES
  templates: Array<{
    id: string;
    name: string;
    config: Partial<DeployFormState>;
    createdAt: number;
  }>;

  // INTERNAL
  contextInterface: string; // default: 'ClankerExtension'
}
```

---

## Full Deploy Form — Sections

The popup form uses collapsible sections. Basic info is always expanded; advanced sections are collapsed by default.

### Section 1 — Basic Info (always open)
Scraped automatically, all editable:
- Image preview (48px) + upload override button
- Name (text)
- Symbol (text, auto-generated from handle, max 8 chars)
- Description / Metadata
- Socials: Twitter, Telegram, Website

### Section 2 — Network & Pool (collapsed)
- **Chain**: dropdown (Base, Ethereum, Arbitrum, Unichain, Abstract, Monad)
- **Paired Token**: dropdown with logos — WETH, DEGEN, CLANKER, ANON, HIGHER, cbBTC, A0X, Custom address
- **Pool Position**: preset chips — Standard / Project / TwentyETH — with tooltip showing tick ranges in USD
- **Starting Market Cap**: slider → translates to `tickIfToken0IsClanker`

### Section 3 — Fee Configuration (collapsed)
- Preset chips: `Static 1%` / `DynamicBasic` / `Dynamic3` / `Custom`
- Static mode: clankerFee bps + pairedFee bps (0–2000)
- Dynamic mode: baseFee + maxFee + `[Advanced ▾]` toggle for full params

### Section 4 — Sniper Protection (collapsed, v4.1+)
- Starting fee %, Ending fee %, Decay duration (seconds)
- Tooltip explaining MEV auction mechanic

### Section 5 — Extensions (collapsed)
Each extension is a toggle. Expands when enabled:

**Creator Vault**
- Supply % (0–90%)
- Lockup: preset chips 7d / 30d / 90d / 1y + custom input
- Vesting duration (optional)
- Recipient address (defaults to tokenAdmin)

**Dev Buy (Creator Buy)**
- ETH amount input
- Recipient address (defaults to tokenAdmin)

**Airdrop**
- Merkle root (hex input)
- Token amount
- Lockup duration
- Vesting duration

### Section 6 — Rewards (collapsed)
- List of up to 7 recipients
- Each row: Admin address | Recipient address | BPS % | Token type (Both/Clanker/Paired)
- Live BPS sum bar — red if ≠ 10,000, green if valid
- Add/remove recipient buttons

### Section 7 — Advanced (collapsed)
- Vanity address toggle (generates `...b07` suffix — adds ~2s to deploy)
- Custom salt (hex, optional)
- tokenAdmin override (defaults to options setting)
- Simulate before deploy toggle (default: on)

---

## Deploy Flow (End-to-End)

```
1. User opens popup → content script SCRAPE → ScrapedData pre-fills FormView
2. User reviews/edits all sections → clicks DEPLOY
3. Popup validates: bps sum = 10000, addresses valid, image reachable
4. Popup sends BgMessage { type: 'DEPLOY', payload } to service worker

[Service Worker: handlers/deploy.ts]
5. image-pipeline.ts:
   a. Check image cache (chrome.storage key = hash of URL)
   b. If cached → return ipfs://CID immediately
   c. If not → fetch as blob → uploadToPinata → cache result → return ipfs://CID
6. Build ClankerTokenV4 config from payload (full schema including extensions)
7. If simulate=true: clanker.deploySimulate(config) → catch revert early, show error
8. Wallet signing:
   Mode A: WALLET_PING → content script ready check → relay EIP-1193 to Rabby
   Mode B: password prompt → decrypt PK (600k PBKDF2) → viem.privateKeyToAccount → sign
9. clanker.deploy(config) → { txHash, waitForTransaction }
10. Send txHash to popup → show PendingView with explorer link
11. waitForTransaction() → { address: tokenAddress }
12. Save DeployRecord to chrome.storage deployHistory
13. Popup shows SuccessView
```

---

## Image Pipeline

```
[Any image source]
    │
    ├─ Already ipfs://... → use as-is
    │
    ├─ https:// URL
    │   ├─ Check cache: storage.get(`imgcache:${hash(url)}`)
    │   ├─ Hit → return cached ipfs://CID
    │   └─ Miss → service worker fetch() → blob → Pinata → cache → return ipfs://CID
    │
    └─ User file upload (File input in popup)
        └─ ArrayBuffer sent to service worker → Pinata → return ipfs://CID
```

**Rule:** All network fetches happen in service worker only — never in content script or popup.

---

## Wallet Architecture

### Mode A — Injected Wallet (Rabby/MetaMask, Chrome + Brave)

Wallet bridge handshake prevents race condition:

```
popup
  └─ BgMessage { type: 'WALLET_PING' }
        └─ content/wallet-bridge.ts
              └─ reply { ready: true }
  └─ BgMessage { type: 'WALLET_REQUEST', request: EIP1193Request }
        └─ content/wallet-bridge.ts
              └─ window.ethereum.request(payload) → Rabby signs
                    └─ reply with result
```

### Mode B — Private Key

```typescript
// background/crypto.ts
// PBKDF2 with 600,000 iterations (OWASP 2023 recommendation)
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt: saltBytes, iterations: 600_000, hash: 'SHA-256' },
  keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
```

Flow: popup password prompt → service worker decrypt → `viem.privateKeyToAccount(pk)` → sign tx → PK cleared from memory immediately.

**Never stored:** plaintext PK, password. Only: ciphertext + IV + salt.

---

## Fee Claiming (SDK-aligned)

The spec's original `claimFees()` does not match the SDK. Correct interface:

```typescript
// background/handlers/fees.ts
import { Clanker } from 'clanker-sdk/v4';

export async function claimRewards(
  wallet: WalletClient,
  publicClient: PublicClient,
  token: `0x${string}`,
  recipient: `0x${string}`
) {
  const sdk = new Clanker({ wallet, publicClient });
  return sdk.claimRewards({ token, rewardRecipient: recipient });
}

export async function getAvailableRewards(
  publicClient: PublicClient,
  token: `0x${string}`,
  recipient: `0x${string}`
) {
  const sdk = new Clanker({ publicClient });
  return sdk.availableRewards({ token, rewardRecipient: recipient });
}
```

HistoryView shows available reward amount per token (fetched on open), then Claim button triggers `claimRewards`.

---

## Deploy History

```typescript
interface DeployRecord {
  address: `0x${string}`;
  name: string;
  symbol: string;
  chainId: number;
  txHash: `0x${string}`;
  deployedAt: number;        // Unix ms
  imageUrl?: string;         // ipfs:// or https://
  pairedToken?: `0x${string}`;
}
```

Merge strategy:
1. Local `chrome.storage.local['deployHistory']`
2. `GET https://clanker.world/api/search-creator?q={tokenAdmin}&limit=50`
3. Deduplicate by `address`, sort by `deployedAt` descending

---

## Symbol Generation

```typescript
// lib/symbol.ts
export function generateSymbol(input: string): string {
  return input
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}
// "@vitalik.eth" → "VITALIKE"
// "punk6529"    → "PUNK6529"
```

---

## Scraping Strategy

| Parser | Target | Primary Source | Symbol Source |
|---|---|---|---|
| `twitter.ts` | twitter.com, x.com | `og:title` "Name (@handle)" | `@handle` |
| `farcaster.ts` | warpcast.com | `og:title`, `og:description` | handle from URL |
| `generic.ts` | any site | `og:title`, `og:image`, `og:description` | first word of title |

All parsers return:
```typescript
interface ScrapedData {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  socials: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
}
```

---

## Templates System

Named deploy configs saved in `ExtensionConfig.templates`:

- **Save template**: captures current FormState (all fields except name/symbol/image/socials — those are page-specific)
- **Load template**: populates form with saved config, keeps scraped data
- **Use cases**: "Base Standard", "Base Vault 90d", "High Fee Sniper"

Managed in Options → Templates section.

---

## Popup UI — Views

### FormView
```
┌──────────────────────────────────────┐
│  🔷 Clanker Deployer    [⚙] [📋] [💾]│  gear=options, history, save template
├──────────────────────────────────────┤
│  [img]  Name:   [___________________]│
│         Symbol: [$__________________]│
│  Desc:  [___________________________]│
│  Links: [tw] [tg] [web]             │
├──────────────────────────────────────┤
│  ▶ Network & Pool        [Base/WETH] │  collapsed, shows summary
│  ▶ Fee Configuration     [Dynamic]  │
│  ▶ Sniper Protection     [66%→4%]   │
│  ▶ Extensions            [Vault ON] │
│  ▶ Rewards               [1 recip.] │
│  ▶ Advanced              [vanity ON]│
├──────────────────────────────────────┤
│  Admin: 0x...abc   Wallet: Rabby 🟢  │
├──────────────────────────────────────┤
│       [       DEPLOY TOKEN       ]   │
└──────────────────────────────────────┘
Width: 400px
```

### ConfirmView
- Summary of all params (chain, fees, extensions, rewards, gas estimate from simulation)
- [Back] [Confirm & Sign]

### PendingView
- Spinner + "Deploying on {chain}..."
- txHash → explorer link (clickable)

### SuccessView
- Token address + copy button
- "View on clanker.world" + explorer links
- [Deploy Another] resets form (keeps settings)

### HistoryView
```
┌──────────────────────────────────────┐
│  ←  Deployed Tokens                  │
├──────────────────────────────────────┤
│  [img] DEMO  $DEMO   Base  Mar 17    │
│  0x...abc   ~0.042 ETH avail  [Claim]│
│  [basescan] [clanker.world]          │
├──────────────────────────────────────┤
│  [img] FOO   $FOO    Arb   Mar 15    │
│  0x...def   0 avail          [Claim] │
└──────────────────────────────────────┘
```

---

## wxt.config.ts

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Clanker Token Deployer',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'scripting', 'alarms'],
    host_permissions: [
      'https://api.pinata.cloud/*',
      'https://clanker.world/*',
      'https://*.twimg.com/*',
      'https://*.farcaster.xyz/*',
      '*://*/*',
    ],
  },
  vite: () => ({
    resolve: {
      alias: { 'react': 'preact/compat', 'react-dom': 'preact/compat' },
    },
    build: { target: 'es2022' },
  }),
});
```

---

## package.json (Key Dependencies)

```json
{
  "dependencies": {
    "preact": "^10.0.0",
    "viem": "^2.38.3",
    "clanker-sdk": "file:../ClankerSDK 2026"
  },
  "devDependencies": {
    "wxt": "latest",
    "@wxt-dev/module-react": "latest",
    "@types/chrome": "latest",
    "typescript": "^5.3.0"
  }
}
```

SDK must be built before `npm install`: `cd "../ClankerSDK 2026" && bun run build`

---

## Key Constraints & Gotchas

1. **SDK only in service worker** — never import clanker-sdk in popup or content scripts
2. **Image fetch only in service worker** — CORS-free for extension origins
3. **window.ethereum not in popup** — use wallet-bridge.ts relay
4. **SW keepalive required** — `chrome.alarms` prevents 30s idle death
5. **`claimRewards` not `claimFees`** — SDK v4 uses `claimRewards({ token, rewardRecipient })`
6. **Pinata returns IpfsHash** — format as `ipfs://${data.IpfsHash}` before passing to SDK
7. **PBKDF2 iterations: 600,000** — not 100,000 (OWASP 2023)
8. **Pre-deploy simulation** — use `clanker.deploySimulate()` to catch reverts before signing
9. **Rewards bps must sum to exactly 10,000** — validate before DEPLOY button enables
10. **SDK chain config via `clankerConfigFor()`** — do not hardcode factory addresses
11. **Wallet bridge handshake** — WALLET_PING before WALLET_REQUEST to avoid race condition
12. **Image cache** — hash URL → ipfs:// to avoid duplicate Pinata uploads

---

## Build Phases

### Phase 1 — Foundation
- [ ] WXT scaffold with Preact + TypeScript
- [ ] `lib/chains.ts` — all 6 chains, RPC fallback arrays
- [ ] `lib/storage.ts` — typed wrapper
- [ ] `lib/messages.ts` — typed message protocol
- [ ] `background/crypto.ts` — AES-256-GCM, 600k PBKDF2
- [ ] `background/index.ts` — keepalive alarm setup
- [ ] Options page: all 6 sections including Templates
- [ ] Build SDK: `cd "../ClankerSDK 2026" && bun run build`

### Phase 2 — Image Pipeline
- [ ] `lib/pinata.ts`
- [ ] `lib/image-pipeline.ts` — with URL cache
- [ ] Service worker image fetch + blob handler
- [ ] Test with Twitter avatar URL

### Phase 3 — Deploy Core
- [ ] Content script parsers (twitter + farcaster + generic)
- [ ] `lib/symbol.ts`
- [ ] `lib/clanker.ts` — SDK wrapper with simulate support
- [ ] `background/handlers/deploy.ts` — full flow
- [ ] Popup FormView (all sections) + ConfirmView + PendingView + SuccessView
- [ ] Wallet Mode A (injected) + wallet-bridge.ts with handshake

### Phase 4 — History + Fees
- [ ] `background/handlers/history.ts` — local + API merge
- [ ] `background/handlers/fees.ts` — SDK claimRewards + availableRewards
- [ ] Popup HistoryView with available amounts
- [ ] Wallet Mode B (private key) + password prompt

### Phase 5 — Templates + Polish
- [ ] `lib/templates.ts` + TemplatesSection in options
- [ ] Form validation UX (bps bar, address checksum, image reachable indicator)
- [ ] Pool position tick → USD display
- [ ] Paired token logos
- [ ] Vault duration preset chips
- [ ] Icons (16/32/48/128px)
- [ ] End-to-end test on Base mainnet

---

## TODO Before Coding

- [ ] **Build local SDK**: `cd "/Users/aaa/Projects/ClankerSDK 2026" && bun run build`
- [ ] **Generate fresh Pinata API key** (revoke any previously shared keys)
- [ ] **Confirm Rabby installed** in test Chrome + Brave
