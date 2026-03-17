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

SDK v4 supported chains only (BNB Chain not in SDK — dropped, Abstract only v3.1 — excluded):

| Chain | ChainId | Notes |
|---|---|---|
| Base | 8453 | v4.1 — full feature set, primary chain |
| Ethereum Mainnet | 1 | v4.1 — **no dynamic fees** (hook = 0x0), presale supported |
| Arbitrum | 42161 | v4 — no mevModuleV2, no V2 hooks |
| Unichain | **130** | v4 — no V2 hooks |
| Monad | **143** | v4.1 — only V2 hooks (static V1 = 0x0), RPC TBD |

**Corrections from original spec:**
- Unichain chain ID is **130** (not 1301)
- Abstract (2741) is only in clanker v3.1, **not v4** — excluded
- Monad chain ID is **143** (custom viem chain definition)
- Ethereum Mainnet: feeDynamicHook = 0x0 — UI must disable dynamic fee option for this chain

Chain config is derived directly from `clankerConfigFor()` in the SDK — no hardcoded factory addresses needed. The UI must check if `related.feeStaticHook` or `related.feeDynamicHook` is zero address and disable those options per chain.

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
│   │       ├── gmgn.ts                  # gmgn.ai token pages
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
│       ├── ghost-validator.ts           # Ghost Deploy Mode safety checks (7 assertions)
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

// NOTE: bigint is NOT serializable via structuredClone (chrome.runtime.sendMessage).
// All bigint values must be serialized to string before sending and parsed back on receipt.
export type BgResponse<T extends BgMessage['type']> =
  T extends 'DEPLOY' ? { txHash: `0x${string}`; tokenAddress: `0x${string}` } :
  T extends 'UPLOAD_IMAGE' | 'UPLOAD_IMAGE_BLOB' ? { ipfsUrl: string } :
  T extends 'GET_AVAILABLE_REWARDS' ? { amount: string } :  // bigint.toString() — parse with BigInt(amount)
  T extends 'GET_HISTORY' ? { records: DeployRecord[] } :
  T extends 'WALLET_PING' ? { ready: true } :
  { ok: true };

// All BgResponse types also include an error branch:
// { error: string } — handler must always check error before using result fields.
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
  130: {
    name: 'Unichain',
    viemChain: unichain,
    rpcs: ['https://mainnet.unichain.org'],
    explorer: 'https://uniscan.xyz',
    marketCapUnit: 'ETH',
  },
  143: {
    name: 'Monad',
    viemChain: monad,  // custom viem chain from SDK
    rpcs: [], // TODO: Monad RPC not yet in SDK — user must configure in Options
    explorer: 'https://explorer.monad.xyz',
    marketCapUnit: 'MON',
    rpcRequired: true, // flag: show warning if no custom RPC configured
  },
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
  defaultFeePreset: 'Static10' | 'DynamicDefault' | 'DynamicBasic' | 'Dynamic3' | 'Custom';
  // Static10 = clankerFee: 1000, pairedFee: 1000 (10% each) ← default
  // DynamicDefault = baseFee: 100, maxFee: 1000 (1%–10%) ← user default for dynamic
  defaultStaticFeeBps: number;       // default: 1000 (10%), applies to both clankerFee + pairedFee
  defaultDynamicBaseBps: number;     // default: 100 (1%)
  defaultDynamicMaxBps: number;      // default: 1000 (10%)
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
  // Note: stored as plaintext in chrome.storage.local. Chrome's "encrypted at rest"
  // applies at OS disk level only — not JS-accessible layer. Acceptable tradeoff for
  // personal use (Pinata key only grants image upload, no fund access).
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
- **Chain**: dropdown (Base, Ethereum, Arbitrum, Unichain, Monad) — Abstract excluded (v3.1 only)
- **Paired Token**: dropdown with logos — WETH, DEGEN, CLANKER, ANON, HIGHER, cbBTC, A0X, Custom address
- **Pool Position**: preset chips — Standard / Project / TwentyETH — with tooltip showing tick ranges in USD
- **Starting Market Cap**: slider → translates to `tickIfToken0IsClanker`

### Section 3 — Fee Configuration (collapsed)

**Default fee type: Static 10%**

#### Static Mode
- **Default**: `clankerFee = 1000 bps (10%)`, `pairedFee = 1000 bps (10%)`
- Both fields fully editable, range 0–2000 bps (0–20%)
- Displayed as `%` in UI — convert to/from bps internally (`% × 100`)
- Preset chips for quick selection:
  - `1%` → 100/100 bps
  - `5%` → 500/500 bps
  - `10%` ← **default** → 1000/1000 bps
  - `Custom` → manual input

#### Dynamic Mode
- **Default**: `baseFee = 100 bps (1%)`, `maxFee = 1000 bps (10%)`
- Fee fluctuates between baseFee and maxFee based on volatility
- Displayed as range: `"1% → 10%"`
- baseFee range: 0.25%–20% (25–2000 bps, SDK minimum = 25)
- maxFee range: 0%–30% (0–3000 bps)
- Constraint: `maxFee > baseFee` — validate before deploy
- `[Advanced ▾]` toggle exposes full dynamic params:
  - `referenceTickFilterPeriod` (seconds, default 30)
  - `resetPeriod` (seconds, default 120)
  - `resetTickFilter` (bps, default 200)
  - `feeControlNumerator` (default 500,000,000)
  - `decayFilterBps` (default 7500 = 75%)
- Preset chips:
  - `1%–10%` ← **default** → baseFee 100, maxFee 1000, DynamicBasic params
  - `1%–5%` → DynamicBasic preset from SDK
  - `1%–3%` → Dynamic3 preset from SDK
  - `Custom` → manual input

#### Fee Type Toggle
- Radio: `Static` | `Dynamic`
- **Default selection: Static**
- If chain = Ethereum Mainnet → Dynamic option greyed out (hook = 0x0 on mainnet)

### Section 4 — Sniper Protection (collapsed, v4.1+)
- Starting fee %, Ending fee %, Decay duration (seconds)
- **Sniper fee values are in Unibps** (1,000,000 = 100%). Display = `value / 10_000` as %.
- Constraints: `endingFee` min = **30,000 Unibps (3%)**, max = 800,000. `startingFee` must be > `endingFee`.
- UI: clamp inputs to valid ranges. Show "%" label, convert to/from Unibps internally.
- Tooltip explaining MEV auction mechanic
- Only show if chain has `mevModuleV2` (Base, Mainnet, Monad). Grey out + tooltip for other chains.

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
- **⚠️ Warning**: Dev Buy only works correctly for WETH-paired tokens. If paired token ≠ WETH, `poolKey` must be manually configured (advanced). Show inline warning when Dev Buy is enabled + non-WETH paired token is selected: *"Dev Buy with non-WETH pairs requires a poolKey — check Advanced settings."*
- Advanced (hidden by default): poolKey fields (currency0, currency1, fee, tickSpacing, hooks) + amountOutMin

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
- **Ghost Deploy toggle** — see Ghost Deploy Mode section below

---

## Ghost Deploy Mode

Deploys a token where `tokenAdmin` is a target address (appears as creator on clanker.world), while reward fees are routed to the user's own address.

### Concept

```
tokenAdmin  = targetAddress    ← appears as token creator, can update metadata
rewardSlot1 = { admin: yourAddress, recipient: targetAddress, bps: 100  }  ← 1%
rewardSlot2 = { admin: yourAddress, recipient: yourAddress,   bps: 9900 }  ← 99%
```

**You are `admin` on both reward slots** — meaning only you can change who receives fees. The target cannot reroute fees to themselves.

---

### Risk Vectors & Mitigations

| Risk | What happens | Mitigation |
|---|---|---|
| `rewards` not set | SDK fallback: 100% to `tokenAdmin` (target) | Ghost mode ALWAYS explicitly sets `rewards` — never leaves undefined |
| `admin: targetAddress` in any slot | Target can call `updateRewardRecipient()` → steal fees | Ghost validator asserts ALL `admin` fields = `yourAddress` |
| `vault.recipient` defaults to `tokenAdmin` | Vault tokens go to target | Ghost mode force-sets `vault.recipient = yourAddress` |
| `devBuy.recipient` defaults to `tokenAdmin` | Dev buy tokens go to target | Ghost mode force-sets `devBuy.recipient = yourAddress` |
| `airdrop.admin` defaults to `tokenAdmin` | Target controls airdrop | Ghost mode force-sets `airdrop.admin = yourAddress` |
| `yourAddress` not configured in Options | Wrong address used | Ghost mode blocked if `walletMode` + address not set in Options |

---

### Ghost Validator (`lib/ghost-validator.ts`)

Runs before deploy in Ghost Mode. Throws descriptive errors if misconfigured:

```typescript
export function validateGhostConfig(
  config: ClankerTokenV4,
  yourAddress: `0x${string}`,
  targetAddress: `0x${string}`
): void {
  // 1. rewards must be explicitly present
  if (!config.rewards) {
    throw new Error('GHOST: rewards must be explicitly set — SDK default sends 100% to tokenAdmin');
  }

  // 2. ALL reward admin fields must be yourAddress
  for (const r of config.rewards.recipients) {
    if (r.admin.toLowerCase() !== yourAddress.toLowerCase()) {
      throw new Error(
        `GHOST: reward slot admin must be your address (${yourAddress}), got ${r.admin}`
      );
    }
  }

  // 3. bps sum must be 10,000
  const bpsSum = config.rewards.recipients.reduce((s, r) => s + r.bps, 0);
  if (bpsSum !== 10_000) {
    throw new Error(`GHOST: reward bps must sum to 10000, got ${bpsSum}`);
  }

  // 4. verify your expected share
  const yourBps = config.rewards.recipients
    .filter(r => r.recipient.toLowerCase() === yourAddress.toLowerCase())
    .reduce((s, r) => s + r.bps, 0);
  if (yourBps === 0) {
    throw new Error('GHOST: your address has 0 bps — you will receive no fees');
  }

  // 5. vault recipient must not be tokenAdmin (target)
  if (config.vault && (!config.vault.recipient ||
      config.vault.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: vault.recipient must be your address, not tokenAdmin');
  }

  // 6. devBuy recipient must not be tokenAdmin (target)
  if (config.devBuy && (!config.devBuy.recipient ||
      config.devBuy.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: devBuy.recipient must be your address, not tokenAdmin');
  }

  // 7. airdrop admin must not be tokenAdmin (target)
  if (config.airdrop && (!config.airdrop.admin ||
      config.airdrop.admin.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: airdrop.admin must be your address, not tokenAdmin');
  }
}
```

This runs BEFORE `deploySimulate()` in `handlers/deploy.ts`. If any check fails, the popup gets an error and deploy is blocked.

---

### Ghost Mode UI Flow

**Advanced Section toggle:**
```
☑ Ghost Deploy
  Token Admin (appears as creator):  [0x...target    ] [paste]
  Your reward share:                  [99] % to [0x...you (auto)]
  Target's share:                     [1 ] % to tokenAdmin
```

- "Your address" is read from Options wallet config — not editable in this field
- Reward % is adjustable (default 99/1)
- Only `Both` token type used (WETH + token fees)

**Auto-configuration in Ghost Mode:**
When Ghost Mode is toggled ON, the extension automatically:
1. Sets `tokenAdmin = targetAddress`
2. Builds `rewards.recipients` with correct admin/recipient split
3. Overrides `vault.recipient = yourAddress` (if vault enabled)
4. Overrides `devBuy.recipient = yourAddress` (if devBuy enabled)
5. Overrides `airdrop.admin = yourAddress` (if airdrop enabled)

The Rewards section (Section 6) is **locked** in Ghost Mode — user cannot manually edit reward slots. This prevents accidental misconfiguration.

---

### ConfirmView in Ghost Mode

Shows an explicit "Fee Routing" panel before signing:

```
┌─────────────────────────────────────────┐
│  ⚠️  GHOST DEPLOY MODE                  │
│                                         │
│  Token appears created by:              │
│  0x...target   [copy]                   │
│                                         │
│  Fee Routing (WETH + Token):            │
│  99% → 0x...you  [YOU]      ✅           │
│   1% → 0x...target [target]             │
│                                         │
│  You control all reward slots           │
│  (admin: 0x...you on both)   ✅          │
│                                         │
│  Vault recipient: 0x...you   ✅          │
│                                         │
│  ✅ Ghost validator passed              │
└─────────────────────────────────────────┘
```

All green checkmarks must be present before "Confirm & Sign" is enabled.

---

### Claiming Fees in Ghost Mode

In HistoryView, Ghost Deploy tokens show:
- "**Your fees** (99%): ~0.042 ETH available [Claim]"
- Extension calls `claimRewards({ token, rewardRecipient: yourAddress })`
- The 1% slot for targetAddress is their responsibility to claim — extension does not claim on their behalf

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
   Mode B: password prompt → decrypt PK (600k PBKDF2) → viem.privateKeyToAccount(pk)
          → createWalletClient({ account, chain: CHAIN_CONFIG[chainId].viemChain, transport: http(rpc) })
          → PK cleared from memory immediately after WalletClient created
9. clanker.deploy(config) → ClankerResult<{ txHash, waitForTransaction }>
   9a. ALWAYS destructure result: if (result.error) → send { error: result.error.message } to popup, abort
9b. Send txHash to popup → show PendingView with explorer link
10. waitForTransaction() → ClankerResult<{ address: tokenAddress }>
   10a. ALWAYS check error branch before proceeding
11. Save DeployRecord to chrome.storage deployHistory
12. Popup shows SuccessView
```

---

## Image Pipeline

```
[Any image source]
    │
    ├─ Already ipfs://... → use as-is
    │
    ├─ https:// URL
    │   ├─ Check cache: storage.get(`imgcache:${sha1hex(url)}`)
    │   │   hash = SHA-1 via crypto.subtle.digest('SHA-1', TextEncoder.encode(url)) → hex string
    │   │   (SHA-1 is fine here — not security-sensitive, just a cache key)
    │   ├─ Hit → return cached ipfs://CID
    │   └─ Miss → service worker fetch() → blob → Pinata → cache → return ipfs://CID
    │       Note: large files (>5MB) are cloned through structured clone — resize before upload
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

### Source Detection

`scraper.ts` selects the correct parser based on `location.hostname`:

```typescript
const PARSERS: Record<string, () => Promise<ScrapedData>> = {
  'twitter.com':    parseTwitter,
  'x.com':          parseTwitter,
  'warpcast.com':   parseFarcaster,
  'gmgn.ai':        parseGMGN,
};

export function detect(): () => Promise<ScrapedData> {
  return PARSERS[location.hostname] ?? parseGeneric;
}
```

### Parser Overview

| Parser | Target | Method | Symbol Source | Chain Auto-detect |
|---|---|---|---|---|
| `twitter.ts` | twitter.com, x.com | OG meta (SSR) | `@handle` from og:title | No |
| `farcaster.ts` | warpcast.com | OG meta (SSR) | handle from URL path | No |
| `gmgn.ts` | gmgn.ai | DOM wait + OG (CSR) | ticker from DOM | **Yes** (from URL) |
| `generic.ts` | any site | OG meta fallback | first word of og:title | No |

---

### Parser: twitter.ts (SSR — fast)
Twitter/X is server-side rendered. OG meta is available immediately.
- **Name**: parse `og:title` format `"Name (@handle)"` — extract both
- **Symbol**: `generateSymbol(handle)` from `@handle`
- **Image**: `og:image` (Twitter CDN high-res URL)
- **Description**: `og:description` (bio text)
- **Social**: current URL as twitter social

---

### Parser: farcaster.ts (SSR — fast)
- **Name + Symbol**: `og:title` → parse handle from URL path (`/warpcast.com/username`)
- **Image**: `og:image`
- **Description**: `og:description`

---

### Parser: gmgn.ts (CSR — needs DOM wait)

**Key fact**: GMGN is a React SPA (client-side rendered). Meta tags may be minimal on initial load. The content script must wait for the DOM to settle.

**URL pattern**: `https://gmgn.ai/{chain}/token/{address}`
- Supported chains: `sol`, `eth`, `base`, `bsc`, `trx`, `monad`
- Chain is extractable from URL directly → **auto-set chain dropdown in popup**

**Chain URL → chainId mapping**:
```typescript
const GMGN_CHAIN_MAP: Record<string, number | null> = {
  base: 8453,
  eth:  1,
  sol:  null,   // not supported by Clanker, show warning
  bsc:  null,   // not in SDK
  trx:  null,
  monad: 143,
};
```

**Scraping approach** (content script, runs inside browser):
```typescript
// content/parsers/gmgn.ts
export async function parseGMGN(): Promise<ScrapedData> {
  // 1. Extract chain + address from URL immediately
  const [, chain, , address] = location.pathname.split('/');
  const chainId = GMGN_CHAIN_MAP[chain] ?? null;

  // 2. Wait for DOM to load token content (CSR — up to 5s)
  await waitForElement('[class*="token"], h1, [data-testid]', 5000);

  // 3. Try OG meta first (sometimes populated by SSR prefetch)
  const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '';
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '';
  const ogDesc  = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';

  // 4. Fallback: parse from DOM
  // Token name: first <h1> or element with token name pattern
  const name = ogTitle || document.querySelector('h1')?.textContent?.trim() || '';

  // 5. Symbol: find ticker — look for "$TICKER" pattern in page text
  const symbolMatch = document.body.innerText.match(/\$([A-Z0-9]{1,8})\b/);
  const symbol = symbolMatch?.[1] ?? generateSymbol(name);

  // 6. Social links: find <a> tags pointing to known social domains
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(a => (a as HTMLAnchorElement).href);
  const twitter  = links.find(h => h.includes('twitter.com') || h.includes('x.com'));
  const telegram = links.find(h => h.includes('t.me'));
  const website  = links.find(h => !h.includes('gmgn.ai') && h.startsWith('https://') && !twitter && !telegram);

  return {
    name,
    symbol,
    description: ogDesc,
    imageUrl: ogImage,
    socials: { twitter, telegram, website },
    detectedChainId: chainId,  // extra field — popup uses this to pre-select chain
  };
}
```

**`waitForElement` helper** (content scripts only):
```typescript
function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
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

**Note on selectors**: GMGN uses dynamically generated class names (minified CSS). Use **structural selectors** (`h1`, `a[href*="twitter"]`, `$TICKER` text pattern) rather than class names. Actual selectors should be verified with DevTools before Phase 3 implementation.

---

### UX: Auto-fill Feedback

Popup shows scrape source + confidence indicator:

```
┌────────────────────────────────────┐
│  🟢 Scraped from GMGN (base)       │  ← source badge
│  ⚡ Chain auto-set to Base          │  ← if detectedChainId present
│  [img] Name: Bonk      Symbol: $BONK│
│  ↻ Re-scrape                        │  ← refresh button if incomplete
└────────────────────────────────────┘
```

Rules:
- If `detectedChainId` comes back from GMGN scraper → auto-set chain dropdown, show info toast
- If chain from GMGN URL not supported by Clanker SDK → show warning: *"[chain] not supported. Please select a chain manually."*
- Empty fields highlighted in yellow — user can fill manually
- "Re-scrape" button re-runs parser (useful for CSR pages still loading)

---

### Extended ScrapedData Type

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
  detectedChainId?: number | null;  // GMGN only — auto-select chain
  source?: 'twitter' | 'farcaster' | 'gmgn' | 'generic';
}

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
  modules: ['@wxt-dev/module-preact'],  // @wxt-dev/module-preact, NOT module-react
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
    // Note: @wxt-dev/module-preact already injects preact/compat aliases.
    // Only add manual aliases if a third-party dep imports 'react' directly.
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
    "@wxt-dev/module-preact": "latest",
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
13. **Ghost Mode: rewards must always be explicit** — SDK fallback sends 100% to tokenAdmin; never omit rewards in Ghost Mode
14. **Ghost Mode: ALL reward slot `admin` must be yourAddress** — target can hijack slots if they're set as admin
15. **Ghost Mode: vault/devBuy/airdrop defaults point to tokenAdmin** — Ghost mode force-overrides all three to yourAddress
16. **Ghost Mode: Rewards section locked in UI** — prevent manual edits that could break the validated config

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
- [ ] Content script parsers (twitter + farcaster + gmgn + generic)
- [ ] `lib/symbol.ts`
- [ ] `lib/ghost-validator.ts` — 7 assertions, throws on any misconfiguration
- [ ] `lib/clanker.ts` — SDK wrapper with simulate support
- [ ] `background/handlers/deploy.ts` — full flow + ghost validator before simulate
- [ ] Popup FormView (all sections) + ConfirmView (with Ghost fee routing panel) + PendingView + SuccessView
- [ ] Wallet Mode A (injected) + wallet-bridge.ts with handshake
- [ ] Ghost Deploy toggle in Advanced section + locked Rewards section in Ghost Mode

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

## Error Handling & Edge Cases

| Scenario | Handling |
|---|---|
| Pinata upload fails | Show error in FormView with retry button; block deploy |
| All RPCs fail for chain | Show "Network unavailable" error; suggest switching chain |
| User rejects wallet tx | Return to FormView with "Transaction rejected" toast |
| deploySimulate() reverts | Show revert reason before sign prompt; block deploy |
| Image URL unreachable | Warn user, allow proceeding with no image (empty ipfs) |
| BPS sum ≠ 10,000 | DEPLOY button disabled, live error under rewards section |
| SW killed mid-deploy | On popup reopen: check pending txHash in storage, show recovery view |
| Pinata key invalid/expired | Show config error pointing to Options → Image section |
| Dynamic fee on mainnet | Fee type forced to Static; dynamic option greyed out |
| Monad RPC = "TODO" | Show chain warning banner; user must provide custom RPC in options |

## TODO Before Coding

- [ ] **Build local SDK**: `cd "/Users/aaa/Projects/ClankerSDK 2026" && bun run build`
- [ ] **Generate fresh Pinata API key** (revoke any previously shared keys)
- [ ] **Confirm Rabby installed** in test Chrome + Brave
