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
│   │       ├── WalletSection.tsx        # Vault UI: add/remove/toggle wallets, rotation mode
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
│       ├── deploy-context-builder.ts    # Build context { platform, messageId, id } from scrape
│       ├── wallet-rotation.ts           # selectNextWallet() — round-robin/random/least-used
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
  walletMode: 'injected' | 'vault';
  // Mode A (injected): uses Rabby/MetaMask via wallet-bridge
  // Mode B (vault): multi-wallet PK vault — primary mode

  // WALLET VAULT (Mode B)
  vaultEntries: WalletVaultEntry[];    // all stored wallets (see Wallet Architecture)
  activeWalletId: string | null;       // selected wallet for manual mode
  rotationMode: 'manual' | 'round-robin' | 'random' | 'least-used';
  rotationIndex: number;               // round-robin cursor

  // IDENTITY
  tokenAdmin: `0x${string}`;

  // DEFAULT DEPLOY SETTINGS
  defaultChain: number;               // chainId
  defaultFeeType: 'static' | 'dynamic';     // default: 'static'
  defaultFeePreset: 'Static10' | 'Static3x3' | 'DynamicBasic' | 'Dynamic3' | 'Custom';
  // Static10  = clankerFee: 1000, pairedFee: 0    (10% clanker side) ← DEFAULT
  // Static3x3 = clankerFee: 300,  pairedFee: 300  (6% total — protocol-safe cap)
  // DynamicBasic = baseFee: 100, maxFee: 1000 (1%–10%) ← user's dynamic default
  // Dynamic3     = baseFee: 100, maxFee: 300  (1%–3%)
  defaultStaticClankerFeeBps: number;  // default: 1000 (10%)
  defaultStaticPairedFeeBps: number;   // default: 0
  defaultDynamicBaseBps: number;       // default: 100 (1%)
  defaultDynamicMaxBps: number;        // default: 1000 (10%)
  defaultPoolPreset: 'Standard' | 'Project' | 'TwentyETH';
  defaultPairedToken: 'WETH' | `0x${string}`;
  defaultMarketCap: number;           // in ETH/native unit — default: 1 (1 ETH)
  defaultSniperEnabled: boolean;      // default: true
  enableQuickDeploy: boolean;         // default: true — skip form, go straight to ConfirmView

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

## Smart Auto-Fill — Form Initialization

**Goal: zero manual input for standard deploys.** When the popup opens, ALL fields are pre-populated before the user sees anything.

### Initialization Order (on popup open)

```
1. Load ExtensionConfig from chrome.storage (Options defaults)
2. Fire SCRAPE message to content script (parallel with step 1)
3. Merge: scraped data overrides defaults only for page-specific fields
4. Start background image pre-upload to Pinata (don't wait — show spinner on image)
5. Form is immediately shown, fully populated — DEPLOY / QUICK DEPLOY enabled
```

### Field Population Rules

| Field | Source | Fallback |
|---|---|---|
| Name | Scraped from page | `"Unnamed Token"` |
| Symbol | `generateSymbol(handle/name)` | `"TOKEN"` |
| Image | Scraped og:image → Pinata pre-upload | default CID (placeholder) |
| Description | Scraped og:description | `"Deployed with Clanker"` |
| Socials | Scraped links | empty (user can add later) |
| Chain | GMGN URL detect → Options.defaultChain | Base (8453) |
| Paired Token | Options.defaultPairedToken | WETH |
| Pool Preset | Options.defaultPoolPreset | Standard |
| Market Cap | Options.defaultMarketCap | 1 ETH |
| Fee Type | Options.defaultFeeType | Static |
| Clanker Fee | Options.defaultStaticClankerFeeBps | 1000 (10%) |
| Paired Fee | Options.defaultStaticPairedFeeBps | 0 |
| Sniper | Options.defaultSniperEnabled + saved values | Enabled (666777→41673, 15s) |
| Rewards | Options.defaultRewards | [{admin: tokenAdmin, recipient: tokenAdmin, bps: 10000, token: 'Both'}] |
| Token Admin | Options.tokenAdmin | blocked — must be set in Options |
| Context | `buildDeployContext(scraped)` | synthetic messageId always set |

### Background Image Pre-Upload

Immediately on SCRAPE complete, the service worker starts uploading the image to Pinata in the background. The form shows an image spinner while this runs. When done, the `ipfs://CID` is ready — deploy fires instantly without waiting.

```
popup open
  └─ SCRAPE → imageUrl found
        └─ (background) UPLOAD_IMAGE → Pinata
              └─ cache result in storage
              └─ update image field silently
  └─ user clicks DEPLOY → ipfs:// already ready → no wait
```

If upload fails: image field shows ⚠️ with retry button. Deploy is blocked until image resolves (or user removes image).

---

## Quick Deploy Mode

When `enableQuickDeploy = true` (default), the popup shows a **[⚡ DEPLOY]** button prominently in addition to the full form. This skips section review entirely:

```
popup open → scrape + auto-fill → user sees:

┌──────────────────────────────────────┐
│  🔷 Clanker Deployer    [⚙] [📋]    │
├──────────────────────────────────────┤
│  [img]  BONK  $BONK   Base  10% fee  │
│  Scraped: GMGN (base)   ✅            │
│  Context: tweet:1234567890  ✅        │
│  Image: uploading... ⏳              │
├──────────────────────────────────────┤
│  [⚡ QUICK DEPLOY]  ← big primary CTA │
├──────────────────────────────────────┤
│  ▼ Review / Edit form                │  ← secondary, collapsed by default
│    ▶ Network & Pool    [Base/WETH]   │
│    ▶ Fee Configuration [Static 10%] │
│    ▶ ...                             │
└──────────────────────────────────────┘
```

**[⚡ QUICK DEPLOY]** → directly opens ConfirmView (with summary of all auto-filled values) → user sees gas estimate → [Confirm & Sign].

**Review / Edit form** is a secondary expandable area — available if the user wants to tweak before deploying but not required.

### Status Indicators on Quick Deploy card

```
✅ Scraped from GMGN (base)
✅ Context: tweet:1234567890          ← messageId extracted
⏳ Image uploading... (pre-upload)    ← turns ✅ when done
✅ Chain: Base  Fees: 10% static
✅ Wallet: Rabby connected
```

Quick Deploy button is disabled if: image still uploading OR wallet not connected OR tokenAdmin not configured.

---

## Full Deploy Form — Sections

The popup form uses collapsible sections. All sections are pre-filled from Options defaults on open — user review only, no manual entry needed for standard deploys.

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

> **Protocol compatibility notes** (from validator analysis):
> - Static total fee > **600 bps (6%)** → token deploys and **indexes normally**, but will NOT receive Blue Badge verification on clanker.world
> - Static total fee ≤ 500 bps → eligible for strict/verified mode (Blue Badge)
> - Dynamic `maxFee` > **500 bps (5%)** → same: indexed but no Blue Badge
> - These are display-tier distinctions only — tokens deploy regardless of fee level
> - Our 10% default (1000 bps each side) exceeds the cap. **Intentional** for this personal tool.

#### Static Mode
- **Default**: `clankerFee = 1000 bps (10%)`, `pairedFee = 0 bps (0%)` — **10% total, user's preferred default**
- Both fields fully editable, range 0–2000 bps (0–20%)
- Displayed as `%` in UI — convert to/from bps internally (`% × 100`)
- Preset chips for quick selection:
  - `3%+3%` → 300/300 bps (within 6% protocol-safe cap, Blue Badge eligible)
  - `5%` → 500/0 bps
  - `10%` ← **default** → 1000/0 bps
  - `Custom` → manual input

#### Dynamic Mode
- **Default**: `baseFee = 100 bps (1%)`, `maxFee = 1000 bps (10%)` — **user's 1%–10% preferred range**
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
  - `1%–10%` ← **default** → baseFee 100, maxFee 1000
  - `1%–5%` → baseFee 100, maxFee 500 (Blue Badge eligible)
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

## Deploy Context Builder (`lib/deploy-context-builder.ts`)

**Critical for indexing on clanker.world.** A token without a valid `context.messageId` will not appear in clanker deployer scanners.

```typescript
// lib/deploy-context-builder.ts

import type { ScrapedData } from './messages';

interface ClankerDeployContext {
  interface: string;    // e.g. 'ClankerExtension'
  platform: string;     // 'twitter' | 'farcaster' | 'clanker' | 'website' | etc.
  messageId: string;    // tweet ID (digits), cast hash (0x...), or synthetic timestamp ID
  id?: string;          // Twitter user ID or Farcaster FID (optional but improves matching)
}

const PLATFORM_MAP: Record<string, string> = {
  twitter: 'twitter',
  farcaster: 'farcaster',
  gmgn: 'clanker',     // GMGN tokens → platform 'clanker' (no social matching)
  generic: 'website',
};

function generateSyntheticMessageId(): string {
  // Numeric synthetic ID matching validator's format: 1800000000000000000 + Date.now()
  return (1800000000000000000n + BigInt(Date.now())).toString();
}

export function buildDeployContext(
  scraped: ScrapedData,
  interfaceName: string = 'ClankerExtension'
): ClankerDeployContext {
  const platform = PLATFORM_MAP[scraped.source ?? 'generic'] ?? 'website';

  // messageId: use what parser extracted, or generate synthetic fallback
  const messageId = scraped.messageId?.trim() || generateSyntheticMessageId();

  return {
    interface: interfaceName,
    platform,
    messageId,
    ...(scraped.userId ? { id: scraped.userId } : {}),
  };
}
```

**Rules:**
1. `platform` is always set — never empty or undefined
2. `messageId` is always set — synthetic fallback if parser couldn't extract one
3. `id` (user ID) set only when available — warning logged if missing for twitter/farcaster
4. `'x'` is never used as platform — always normalize to `'twitter'`
5. This context is passed directly to the SDK `ClankerTokenV4.context` field

---

## Pool Tick Alignment

**Critical for successful deployment.** The SDK validates: at least one position in `pool.positions` must have `tickLower === pool.tickIfToken0IsClanker`. Mismatch causes a simulation revert.

### How Market Cap Translates to Tick

```typescript
// SDK utility: src/utils/market-cap.ts
import { getTickFromMarketCap } from 'clanker-sdk/utils';

// Returns: { pairedToken: 'WETH', tickIfToken0IsClanker, tickSpacing: 200 }
const { tickIfToken0IsClanker } = getTickFromMarketCap(marketCapInEth);
```

### Position Auto-Alignment Rule

When the market cap slider changes `tickIfToken0IsClanker`, the **first position's `tickLower`** must be updated to match:

```typescript
// In FormView state update:
function onMarketCapChange(newMarketCap: number) {
  const { tickIfToken0IsClanker } = getTickFromMarketCap(newMarketCap);

  // Update pool config — first position tickLower MUST match tick
  setPoolConfig(prev => ({
    ...prev,
    tickIfToken0IsClanker,
    positions: prev.positions.map((pos, i) =>
      i === 0
        ? { ...pos, tickLower: tickIfToken0IsClanker }
        : pos
    ),
  }));
}
```

### Preset Positions

The Standard/Project/TwentyETH SDK presets (`POOL_POSITIONS` in `src/constants.ts`) are defined with `tickLower = -230400` (default tick for ~1 ETH market cap). These presets are safe to use as-is only when `tickIfToken0IsClanker = -230400`.

If the user adjusts market cap → custom tick → always auto-update `positions[0].tickLower`.

**Rule: never allow a deploy where `pool.positions.every(p => p.tickLower !== pool.tickIfToken0IsClanker)`.**

---

## Deploy Flow (End-to-End)

```
1. User opens popup
   → Options defaults loaded from chrome.storage
   → content script SCRAPE fires in parallel → ScrapedData (name, symbol, image, messageId, userId)
   → Background UPLOAD_IMAGE pre-upload starts immediately after SCRAPE
   → ALL form fields populated — Quick Deploy card shown
2. User clicks [⚡ QUICK DEPLOY] (or reviews form and clicks DEPLOY)
3. Popup validates: bps sum = 10000, addresses valid, image ipfs:// ready
   3a. Validate pool tick alignment: positions.some(p => p.tickLower === tickIfToken0IsClanker)
4. Popup sends BgMessage { type: 'DEPLOY', payload } to service worker

[Service Worker: handlers/deploy.ts]
5. image-pipeline.ts:
   a. Check image cache (chrome.storage key = hash of URL)
   b. If cached → return ipfs://CID immediately
   c. If not → fetch as blob → uploadToPinata → cache result → return ipfs://CID
6. Build ClankerTokenV4 config from payload (full schema including extensions)
   6a. ALWAYS call buildDeployContext(scraped, config.contextInterface) → set config.context
       - platform, messageId (or synthetic fallback), id (if present)
       - Never deploy with empty context.messageId — always falls back to synthetic
7. If simulate=true: clanker.deploySimulate(config) → catch revert early, show error
8. Wallet signing:
   Mode A: WALLET_PING → content script ready check → relay EIP-1193 to Rabby
   Mode B (Vault): check sessionWallets.has(walletId)
     → if yes: use cached WalletClient (no password prompt)
     → if no: prompt password → unlockVault(password, chainId) → cache all active wallets
          → sessionWallets.get(walletId) → WalletClient ready
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

### Overview

The extension supports two modes that can coexist:

- **Mode A — Injected** (Rabby/MetaMask): one wallet from browser extension, used for quick single deploys
- **Mode B — Wallet Vault**: multiple private keys encrypted at rest, unlocked with one master password, enabling multi-wallet rotation and batch deploy

For the competition + sniper strategy, Mode B is primary. Mode A remains for quick single deploys.

---

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

---

### Mode B — Wallet Vault (Multi-Wallet)

#### Storage Schema

```typescript
interface WalletVaultEntry {
  id: string;                   // uuid — stable identifier
  name: string;                 // user-defined label: "Sniper A", "Wallet 2", etc.
  address: `0x${string}`;       // derived public address — stored plaintext for display
  encryptedPK: string;          // AES-256-GCM ciphertext of 0x-prefixed private key, base64
  iv: string;                   // base64 IV (unique per wallet)
  salt: string;                 // base64 PBKDF2 salt (unique per wallet)
  createdAt: number;            // Unix ms
  lastUsedAt: number;           // Unix ms — for "least-used" rotation strategy
  deployCount: number;          // total deploys from this wallet
  active: boolean;              // whether included in rotation pool
}

// In ExtensionConfig:
interface ExtensionConfig {
  // ...
  vaultEntries: WalletVaultEntry[];  // all wallets in vault
  activeWalletId: string | null;     // selected wallet for next single deploy
  rotationMode: 'manual' | 'round-robin' | 'random' | 'least-used';
  rotationIndex: number;             // current position in round-robin
}
```

#### Encryption Model

One master password protects all vault entries. Each wallet encrypted independently with a **unique salt + IV** so compromise of one entry does not help decrypt others.

```typescript
// background/crypto.ts

export async function encryptPrivateKey(
  pk: string,          // "0x..." hex string
  password: string
): Promise<{ encryptedPK: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(pk)
  );
  return {
    encryptedPK: btoa(String.fromCharCode(...new Uint8Array(ct))),
    iv:   btoa(String.fromCharCode(...iv)),
    salt: btoa(String.fromCharCode(...salt)),
  };
}
```

**Never stored:** plaintext PK, password, derived key. Only: ciphertext + IV + salt per wallet.

#### Session Key Cache

After entering the master password once, the service worker holds unlocked `WalletClient` instances in memory for the session. No re-prompting for rapid batch deploys.

```typescript
// Service worker in-memory only — never persisted
const sessionWallets = new Map<string, WalletClient>();  // walletId → WalletClient

// Unlock session: decrypt all active vault entries at once
async function unlockVault(password: string, chainId: number): Promise<void> {
  const { vaultEntries } = await storage.get();
  for (const entry of vaultEntries.filter(e => e.active)) {
    const pk = await decryptPrivateKey(entry.encryptedPK, entry.iv, entry.salt, password);
    const account = privateKeyToAccount(pk as `0x${string}`);
    const client = createWalletClient({
      account,
      chain: CHAIN_CONFIG[chainId].viemChain,
      transport: http(await getBestRpc(chainId)),
    });
    sessionWallets.set(entry.id, client);
    pk.fill(0); // zero out PK string — JS limitation: strings are immutable, but removes ref
  }
}

// Session expires naturally when service worker goes idle (~30min)
// Manual lock: sessionWallets.clear()
```

**Session flow:**
```
First deploy → popup shows password modal
  └─ unlockVault(password) → all active wallets cached
  └─ password discarded
Subsequent deploys → sessionWallets.get(walletId) → sign immediately (no password)
Idle 30min → SW killed → session cleared → next deploy re-prompts password
Manual lock → [🔒 Lock Vault] button in popup header
```

---

### Wallet Rotation Strategies

```typescript
// lib/wallet-rotation.ts

export function selectNextWallet(
  entries: WalletVaultEntry[],
  mode: RotationMode,
  currentIndex: number
): { walletId: string; nextIndex: number } {
  const active = entries.filter(e => e.active);
  if (active.length === 0) throw new Error('No active wallets in vault');

  switch (mode) {
    case 'manual':
      // Use activeWalletId from config — no rotation
      return { walletId: active[currentIndex % active.length].id, nextIndex: currentIndex };

    case 'round-robin':
      const next = currentIndex % active.length;
      return { walletId: active[next].id, nextIndex: next + 1 };

    case 'random':
      const idx = Math.floor(Math.random() * active.length);
      return { walletId: active[idx].id, nextIndex: currentIndex };

    case 'least-used':
      const least = active.reduce((a, b) => a.deployCount <= b.deployCount ? a : b);
      return { walletId: least.id, nextIndex: currentIndex };
  }
}
```

**Strategy guide:**
| Mode | Best for |
|---|---|
| `round-robin` | Systematic coverage — each wallet gets equal airtime |
| `least-used` | Competition fairness — freshest wallets appear first |
| `random` | Anti-pattern detection — unpredictable to bots |
| `manual` | Precise control — you pick the wallet per deploy |

---

### Batch Deploy Mode

Deploy the **same token config** from multiple wallets in rapid succession. Each deploy:
- Uses its own wallet (different `msg.sender` → different deployer address on chain)
- Gets a unique randomized `salt` (unless vanity is on — then sequential)
- Has `tokenAdmin` set to that wallet's address (unless Ghost Mode: tokenAdmin = target)
- Fires sequentially (no parallel — avoids nonce-ordering issues)

```typescript
// lib/messages.ts — new message type
| { type: 'BATCH_DEPLOY'; payload: DeployPayload; walletIds: string[] }

// Response stream — one update per wallet
| { type: 'BATCH_PROGRESS'; walletId: string; index: number; total: number;
    status: 'pending' | 'deploying' | 'success' | 'failed';
    txHash?: `0x${string}`; tokenAddress?: `0x${string}`; error?: string }
```

**Batch Deploy Flow:**

```
1. User opens Batch Deploy panel (from FormView, requires 2+ vault wallets)
2. User selects which wallets to include (checkboxes — default: all active)
3. User clicks [⚡ BATCH DEPLOY from N wallets]
4. ConfirmView shows N deploy summary rows
5. On confirm → BATCH_DEPLOY message to service worker

[Service Worker]
6. For each walletId in sequence:
   a. Get WalletClient from sessionWallets (or unlock if expired)
   b. Randomize salt: config.salt = crypto.getRandomValues(new Uint8Array(32))
   c. Set tokenAdmin = wallet.address (or target in Ghost Mode)
   d. Run ghost validator if Ghost Mode
   e. deploySimulate() → if fail, skip this wallet + report error, continue
   f. clanker.deploy() → txHash
   g. waitForTransaction() → tokenAddress
   h. Update walletEntry.lastUsedAt + deployCount in storage
   i. Send BATCH_PROGRESS update to popup
   j. Small delay between deploys (500ms) to avoid RPC rate limiting

7. All results collected → BatchSuccessView
```

**BatchSuccessView:**
```
┌──────────────────────────────────────────┐
│  ⚡ Batch Deploy Complete  3/3 ✅         │
├──────────────────────────────────────────┤
│  ✅ Sniper A   0x...abc  [basescan][🌍]  │
│  ✅ Wallet 2   0x...def  [basescan][🌍]  │
│  ✅ Fresh 1    0x...ghi  [basescan][🌍]  │
├──────────────────────────────────────────┤
│  [Deploy Another Batch]  [View History]  │
└──────────────────────────────────────────┘
```

---

### Wallet Vault + Ghost Mode Combined Strategy

The most powerful setup for competition + sniper attraction:

```
Wallet A deploys → tokenAdmin = fresh address X → fees → your main wallet (99%)
Wallet B deploys → tokenAdmin = fresh address Y → fees → your main wallet (99%)
Wallet C deploys → tokenAdmin = fresh address Z → fees → your main wallet (99%)
```

clanker.world sees: 3 different "creators", 3 different tokens.
Snipers see: 3 fresh creators = higher trust signal.
You receive: 99% of all fees from all 3 tokens.

The `tokenAdmin` addresses (X, Y, Z) don't need to be actual wallets you control — they can be any address you want to attribute the token to (including the page's Twitter handle wallet if known).

---

### Options — Wallet Vault UI

```
┌─── Wallet Vault ───────────────────────────────────┐
│  🔑 Master password set  [Change] [🔒 Lock Now]    │
│  Rotation mode: [round-robin ▾]                    │
│                                                    │
│  ┌─ Wallets ───────────────────────────────────┐  │
│  │ ☑ Sniper A   0x...abc  deploys: 12  [✏][🗑] │  │
│  │ ☑ Wallet 2   0x...def  deploys:  3  [✏][🗑] │  │
│  │ ☑ Fresh 1    0x...ghi  deploys:  0  [✏][🗑] │  │
│  │ ☐ Old Wallet 0x...jkl  deploys: 47  [✏][🗑] │  │
│  └────────────────────────────────────────────┘  │
│  [+ Add Wallet]  [Import from keystore]           │
│                                                   │
│  + Add Wallet:                                    │
│    Name: [________________]                       │
│    Private Key: [0x______] [paste] [generate]     │
│    [Save to Vault]                                │
└───────────────────────────────────────────────────┘
```

**[generate]** button: generates a brand-new random private key inline (uses `viem.generatePrivateKey()`). The derived address shown immediately so user can fund it with ETH for gas before deploying.

---

### Updated FormView — Wallet Selector

The Quick Deploy card shows the active wallet and rotation mode:

```
┌──────────────────────────────────────┐
│  [img] BONK  $BONK  ✅ ✅ ✅         │
│                                      │
│  Wallet: [Sniper A 0x..abc ▾]  🔄    │  ← dropdown + rotation icon
│  Next (round-robin): Wallet 2        │  ← shows which wallet fires next
│                                      │
│  [⚡ QUICK DEPLOY]                   │
│  [⚡ BATCH DEPLOY (3 wallets)]        │  ← shown when vault has 2+ wallets
└──────────────────────────────────────┘
```

The `🔄` rotation icon opens a quick rotation mode picker (manual/round-robin/random/least-used).

---

### New Message Types (multi-wallet additions)

```typescript
// lib/messages.ts additions
| { type: 'UNLOCK_VAULT'; password: string }
| { type: 'LOCK_VAULT' }
| { type: 'VAULT_STATUS' }
| { type: 'BATCH_DEPLOY'; payload: DeployPayload; walletIds: string[] }
| { type: 'BATCH_PROGRESS'; walletId: string; index: number; total: number;
    status: 'pending' | 'deploying' | 'success' | 'failed';
    txHash?: `0x${string}`; tokenAddress?: `0x${string}`; error?: string }

// Responses
T extends 'VAULT_STATUS' ? { unlocked: boolean; walletCount: number; activeIds: string[] } :
T extends 'BATCH_DEPLOY'  ? { results: BatchDeployResult[] } :
```

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
- **messageId**: extract from URL if on a tweet page (`/status/(\d+)` → digits only)
  - Profile page (`/username`): no messageId, deploy-context-builder generates synthetic
- **userId**: `meta[name="twitter:site"]` or user numeric ID from page — leave blank if not found; clanker.world uses it for improved matching but absence is not blocking
- **source**: `'twitter'`, **platform**: `'twitter'`

---

### Parser: farcaster.ts (SSR — fast)
- **Name + Symbol**: `og:title` → parse handle from URL path (`/warpcast.com/username`)
- **Image**: `og:image`
- **Description**: `og:description`
- **messageId**: extract cast hash from URL path (`/username/0xabc123...` → the `0x` segment)
  - Profile page: no messageId
- **userId**: FID if available from meta or URL — leave blank if not found
- **source**: `'farcaster'`, **platform**: `'farcaster'`

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
  detectedChainId?: number | null;       // GMGN only — auto-select chain
  source?: 'twitter' | 'farcaster' | 'gmgn' | 'generic';

  // --- Context fields for Clanker indexing ---
  // CRITICAL: without messageId the token may not index on clanker.world
  pageUrl?: string;       // Full URL of current page (used to extract messageId)
  messageId?: string;     // Tweet ID (digits only) or Farcaster cast hash (0x...)
  userId?: string;        // Twitter user numeric ID or Farcaster FID (for context.id)
}
```

**messageId extraction rules** (from protocol validator):
- Twitter/X: extract numeric ID from `/status/1234567890` URL path segment
- Farcaster: extract `0x`-prefixed cast hash from warpcast URL path
- GMGN: use token contract address as messageId (prefixed `0x`) with platform `clanker`
- Generic: use page URL as messageId (will be stored as-is, not a social message ID)
- If extraction fails: `deploy-context-builder.ts` generates a synthetic messageId (timestamp-based)

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
│  [img⏳] BONK    $BONK               │  ← scrape result, image pre-uploading
│  GMGN (base) ✅  Context ✅  Wallet ✅│  ← status row
│                                      │
│  [⚡  QUICK DEPLOY  ]  ← big primary │  ← disabled while image uploading
├──────────────────────────────────────┤
│  ▼ Review / Edit  ▼                  │  ← expandable, collapsed by default
│  ├─ Name:   [BONK________________]  │
│  ├─ Symbol: [$BONK_______________]  │
│  ├─ Desc:   [____________________]  │
│  ├─ Links:  [tw] [tg] [web]        │
│  ├─ ▶ Network & Pool  [Base/WETH]  │
│  ├─ ▶ Fee Config      [10% static] │
│  ├─ ▶ Sniper          [66%→4%]     │
│  ├─ ▶ Extensions      [off]        │
│  ├─ ▶ Rewards         [100% you]   │
│  └─ ▶ Advanced        [vanity ON]  │
│                                      │
│  [     DEPLOY (with edits)     ]     │  ← secondary CTA if user edited
└──────────────────────────────────────┘
Width: 400px
```

**Quick Deploy card status icons:**
- `✅` = ready, `⏳` = in progress, `⚠️` = needs attention (blocks deploy)
- Image spinner disappears when Pinata pre-upload completes → deploy unblocked

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
17. **`context.messageId` is required for indexing** — always set via `buildDeployContext()`; synthetic fallback if parser couldn't extract tweet ID / cast hash
18. **`context.platform` must be a valid string** — 'twitter', 'farcaster', 'clanker', 'website', etc. Never 'x' (normalize to 'twitter'). Never empty.
19. **`context.id` improves clanker.world matching** — set for twitter/farcaster when available (Twitter user numeric ID, Farcaster FID)
20. **Pool tick alignment** — `pool.positions` must have at least one entry where `tickLower === tickIfToken0IsClanker`; auto-update when market cap slider changes
21. **Static fees > 600 bps total** — token will deploy and index normally, but won't receive Blue Badge verification on clanker.world. Our 10% default is intentional.
22. **Dynamic `maxFee` > 500 bps** — same as above; no Blue Badge but deploys fine
23. **Wallet Vault: unique salt + IV per entry** — each PK encrypted independently; one compromised entry does not help decrypt others
24. **Session cache in SW memory only** — `sessionWallets` Map never persisted; cleared on SW idle kill (~30min) or manual lock
25. **Batch deploy: randomize salt per wallet** — same token config but different salt → different token address per deployer
26. **Batch deploy: sequential not parallel** — parallel deploys from different wallets can work (different nonces) but sequential is safer and avoids RPC rate limits; 500ms gap between each
27. **tokenAdmin per batch entry** — in normal batch mode, each wallet's own address is tokenAdmin; in Ghost Mode, tokenAdmin = target for all entries

---

## Build Phases

### Phase 1 — Foundation
- [ ] WXT scaffold with Preact + TypeScript
- [ ] `lib/chains.ts` — all 6 chains, RPC fallback arrays
- [ ] `lib/storage.ts` — typed wrapper with full defaults (10% static, Standard pool, Base chain)
- [ ] `lib/messages.ts` — typed message protocol
- [ ] `background/crypto.ts` — AES-256-GCM, 600k PBKDF2
- [ ] `background/index.ts` — keepalive alarm setup
- [ ] Options page: all 6 sections including Templates + enableQuickDeploy toggle + Wallet Vault UI
- [ ] Build SDK: `cd "../ClankerSDK 2026" && bun run build`

### Phase 2 — Image Pipeline
- [ ] `lib/pinata.ts`
- [ ] `lib/image-pipeline.ts` — with URL cache
- [ ] Service worker image fetch + blob handler
- [ ] Test with Twitter avatar URL

### Phase 3 — Deploy Core
- [ ] Content script parsers (twitter + farcaster + gmgn + generic) — include messageId + userId extraction
- [ ] `lib/symbol.ts`
- [ ] `lib/ghost-validator.ts` — 7 assertions, throws on any misconfiguration
- [ ] `lib/deploy-context-builder.ts` — builds `{ platform, messageId, id }` from ScrapedData
- [ ] `lib/wallet-rotation.ts` — selectNextWallet() with all 4 strategies
- [ ] `lib/clanker.ts` — SDK wrapper with simulate support + pool tick alignment helper
- [ ] `background/crypto.ts` — encrypt/decrypt per vault entry (unique salt + IV)
- [ ] `background/handlers/deploy.ts` — full flow + ghost validator + vault session cache
- [ ] `background/handlers/batch.ts` — sequential batch deploy with BATCH_PROGRESS stream
- [ ] Popup FormView with Quick Deploy card + Batch Deploy button + wallet selector
- [ ] ConfirmView (single + batch variants, Ghost fee routing panel) + PendingView + BatchSuccessView
- [ ] Background image pre-upload triggered immediately after SCRAPE completes
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
