# Clanker Extension — Phase 1: Scaffold + Core Lib + Background

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the project scaffold, all pure-TS library utilities (fully tested), and the complete background service worker — no UI, but the deploy pipeline works end-to-end.

**Architecture:** WXT (MV3) + Preact extension. Background service worker handles all onchain operations (deploy, fees, history, batch) and vault crypto. Lib layer is pure TS with no browser dependencies — fully testable with vitest.

**Tech Stack:** WXT latest, Preact ^10, viem ^2, clanker-sdk (file:../../ClankerSDK 2026), vitest, TypeScript 5.3

**Spec:** `docs/superpowers/specs/2026-03-17-timc-clanker-extension-design.md`

---

## Pre-flight

- [ ] **Build the SDK**

```bash
cd "/Users/aaa/projects/ClankerSDK 2026" && bun run build
```

Expected: `dist/` directory created with `index.js`, `v4/index.js`, etc.

- [ ] **Verify dist exports exist**

```bash
ls "/Users/aaa/projects/ClankerSDK 2026/dist/"
```

Expected: see `index.js`, `v4/`, `utils/`, etc.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wxt.config.ts`
- Create: `src/background/index.ts` (stub)
- Create: `src/popup/index.html` (stub)
- Create: `src/popup/index.tsx` (stub)
- Create: `src/options/index.html` (stub)
- Create: `src/options/index.tsx` (stub)
- Create: `src/content/scraper.ts` (stub)
- Create: `public/icons/` (placeholder PNGs)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "timc-clanker-extension",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "preact": "^10.0.0",
    "viem": "^2.38.3",
    "clanker-sdk": "file:../../ClankerSDK 2026"
  },
  "devDependencies": {
    "wxt": "latest",
    "@wxt-dev/module-preact": "latest",
    "@types/chrome": "latest",
    "typescript": "^5.3.0",
    "vitest": "^2.0.0",
    "jsdom": "^25.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "lib": ["ES2022", "DOM"],
    "skipLibCheck": true,
    "types": ["chrome"]
  },
  "include": ["src", "wxt.config.ts"]
}
```

- [ ] **Step 3: Create wxt.config.ts**

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  modules: ['@wxt-dev/module-preact'],
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
    build: {
      target: 'es2022',
    },
  }),
});
```

- [ ] **Step 4: Create stub entrypoints**

`src/background/index.ts`:
```typescript
export default defineBackground(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((_alarm) => { /* keepalive */ });
});
```

`src/popup/index.html` — WXT auto-generates from popup entrypoint, create `src/popup/index.tsx`:
```typescript
import { render } from 'preact';

function App() {
  return <div>Clanker Deployer</div>;
}

render(<App />, document.getElementById('app')!);
```

`src/popup/index.html`:
```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>Clanker Deployer</title></head>
  <body><div id="app"></div><script type="module" src="./index.tsx"></script></body>
</html>
```

`src/options/index.tsx`:
```typescript
import { render } from 'preact';
function Options() { return <div>Options</div>; }
render(<Options />, document.getElementById('app')!);
```

`src/options/index.html`:
```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>Options</title></head>
  <body><div id="app"></div><script type="module" src="./index.tsx"></script></body>
</html>
```

`src/content/scraper.ts`:
```typescript
export default defineContentScript({
  matches: ['<all_urls>'],
  main() { /* stub */ },
});
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/aaa/projects/timc-clanker-extension && pnpm install
```

(or `npm install` if pnpm not available)

- [ ] **Step 6: Verify WXT builds**

```bash
rtk pnpm run build
```

Expected: no errors, `dist/` or `.output/` created

- [ ] **Step 7: Create placeholder icons**

```bash
mkdir -p public/icons
# Create minimal 1x1 PNG placeholders (real icons can be added later)
python3 -c "
import struct, zlib
def make_png(size):
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(c[4:]) & 0xffffffff)
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    row = b'\x00' + b'\x00\x7f\xff' * size
    idat = zlib.compress(row * size)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
for s in [16,32,48,128]:
    open(f'public/icons/{s}.png','wb').write(make_png(s))
"
```

- [ ] **Step 8: Commit scaffold**

```bash
git add -A && git commit -m "feat: project scaffold — WXT, Preact, TypeScript, stub entrypoints"
```

---

## Task 2: Core Types & Messages

**Files:**
- Create: `src/lib/messages.ts`
- Create: `src/lib/storage.ts`
- Test: `src/lib/__tests__/storage.test.ts` (type-check only, no runtime browser APIs)

- [ ] **Step 1: Create src/lib/messages.ts**

```typescript
// src/lib/messages.ts

export interface ScrapedData {
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  socials: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
  detectedChainId?: number | null;
  source?: 'twitter' | 'farcaster' | 'gmgn' | 'generic';
  pageUrl?: string;
  messageId?: string;
  userId?: string;
}

export interface DeployRecord {
  address: `0x${string}`;
  name: string;
  symbol: string;
  chainId: number;
  txHash: `0x${string}`;
  deployedAt: number;
  imageUrl?: string;
  pairedToken?: `0x${string}`;
  walletId: string;
  tokenAdmin: `0x${string}`;
  rewardRecipient: `0x${string}`;
  isGhostDeploy: boolean;
}

export interface WalletVaultEntry {
  id: string;
  name: string;
  address: `0x${string}`;
  encryptedPK: string;
  iv: string;
  salt: string;
  createdAt: number;
  lastUsedAt: number;
  deployCount: number;
  active: boolean;
}

export interface DeployFormState {
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  socials: { twitter?: string; telegram?: string; website?: string };
  chainId: number;
  pairedToken: `0x${string}` | 'WETH';
  poolPreset: 'Standard' | 'Project' | 'TwentyETH';
  marketCap: number;
  feeType: 'static' | 'dynamic';
  staticClankerFeeBps: number;
  staticPairedFeeBps: number;
  dynamicBaseBps: number;
  dynamicMaxBps: number;
  sniperEnabled: boolean;
  sniperStartingFee: number;
  sniperEndingFee: number;
  sniperSecondsToDecay: number;
  vaultEnabled: boolean;
  vaultSupplyPct: number;
  vaultLockupDays: number;
  vaultVestingDays: number;
  vaultRecipient: `0x${string}` | '';
  devBuyEnabled: boolean;
  devBuyAmount: string;
  devBuyRecipient: `0x${string}` | '';
  airdropEnabled: boolean;
  airdropMerkleRoot: `0x${string}` | '';
  airdropAmount: string;
  airdropLockupDays: number;
  airdropVestingDays: number;
  rewards: Array<{
    admin: `0x${string}`;
    recipient: `0x${string}`;
    bps: number;
    token: 'Both' | 'Clanker' | 'Paired';
  }>;
  tokenAdmin: `0x${string}`;
  vanityEnabled: boolean;
  customSalt: string;
  simulateBeforeDeploy: boolean;
  ghostMode: boolean;
  ghostTargetAddress: `0x${string}` | '';
  ghostYourShareBps: number;
}

export interface DeployPayload {
  form: DeployFormState;
  scraped: ScrapedData;
  walletId?: string;
  skipStatUpdate?: boolean;  // batch.ts sets true — defers all stat writes to after batch completes
}

export interface BatchDeployResult {
  walletId: string;
  walletName: string;
  status: 'success' | 'failed';
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  error?: string;
}

export interface EIP1193Request {
  method: string;
  params?: unknown[];
}

// ── Popup/Content → Service Worker ──────────────────────────────────────────
export type BgMessage =
  | { type: 'DEPLOY'; payload: DeployPayload }
  | { type: 'UPLOAD_IMAGE'; url: string }
  | { type: 'UPLOAD_IMAGE_BLOB'; data: ArrayBuffer; filename: string }
  | { type: 'CLAIM_REWARDS'; token: `0x${string}`; recipient: `0x${string}`; chainId: number }
  | { type: 'GET_AVAILABLE_REWARDS'; token: `0x${string}`; recipient: `0x${string}`; chainId: number }
  | { type: 'GET_HISTORY' }
  | { type: 'WALLET_PING' }
  | { type: 'WALLET_REQUEST'; request: EIP1193Request }
  | { type: 'UNLOCK_VAULT'; password: string }
  | { type: 'LOCK_VAULT' }
  | { type: 'VAULT_STATUS' }
  // ADD_WALLET: encrypt PK in SW so plaintext never lives in popup heap
  | { type: 'ADD_WALLET'; name: string; plainPk: string; password: string }
  | { type: 'REMOVE_WALLET'; id: string };

export type BgResponse<T extends BgMessage['type']> =
  T extends 'DEPLOY' ? { txHash: `0x${string}`; tokenAddress: `0x${string}` } :
  T extends 'UPLOAD_IMAGE' | 'UPLOAD_IMAGE_BLOB' ? { ipfsUrl: string } :
  T extends 'GET_AVAILABLE_REWARDS' ? { amount: string } :
  T extends 'GET_HISTORY' ? { records: DeployRecord[] } :
  T extends 'WALLET_PING' ? { ready: true } :
  T extends 'VAULT_STATUS' ? { unlocked: boolean; walletCount: number; activeIds: string[] } :
  { ok: true };

export type BgError = { error: string };
export type BgResult<T extends BgMessage['type']> = BgResponse<T> | BgError;

// ── Service Worker → Popup (Port API, batch only) ───────────────────────────
export type SwEvent =
  | { type: 'BATCH_PROGRESS'; walletId: string; index: number; total: number;
      status: 'pending' | 'deploying' | 'success' | 'failed';
      txHash?: `0x${string}`; tokenAddress?: `0x${string}`; error?: string }
  | { type: 'BATCH_COMPLETE'; results: BatchDeployResult[] };

// ── Content Script messages ──────────────────────────────────────────────────
export type ContentMessage =
  | { type: 'REGISTER_TAB' }
  | { type: 'SCRAPE' }
  | { type: 'SCRAPE_RESULT'; data: ScrapedData };
```

- [ ] **Step 2: Create src/lib/storage.ts**

```typescript
// src/lib/storage.ts
import type { DeployRecord, WalletVaultEntry, DeployFormState } from './messages.js';

export type RotationMode = 'manual' | 'round-robin' | 'random' | 'least-used';

export interface ExtensionConfig {
  walletMode: 'injected' | 'vault';
  vaultEntries: WalletVaultEntry[];
  activeWalletId: string | null;
  rotationMode: RotationMode;
  rotationIndex: number;
  tokenAdmin: `0x${string}`;
  defaultChain: number;
  defaultFeeType: 'static' | 'dynamic';
  defaultFeePreset: 'Static10' | 'Static3x3' | 'DynamicBasic' | 'Dynamic3' | 'Custom';
  defaultStaticClankerFeeBps: number;
  defaultStaticPairedFeeBps: number;
  defaultDynamicBaseBps: number;
  defaultDynamicMaxBps: number;
  defaultPoolPreset: 'Standard' | 'Project' | 'TwentyETH';
  defaultPairedToken: 'WETH' | `0x${string}`;
  defaultMarketCap: number;
  defaultSniperEnabled: boolean;
  enableQuickDeploy: boolean;
  defaultRewards: Array<{
    admin: `0x${string}`;
    recipient: `0x${string}`;
    bps: number;
    token: 'Both' | 'Clanker' | 'Paired';
  }>;
  sniperStartingFee: number;
  sniperEndingFee: number;
  sniperSecondsToDecay: number;
  pinataApiKey: string;
  pinataSecretKey: string;
  templates: Array<{
    id: string;
    name: string;
    config: Partial<DeployFormState>;
    createdAt: number;
  }>;
  contextInterface: string;
  deployHistory: DeployRecord[];
  pendingBatch?: {
    batchId: string;
    walletIds: string[];
    payload: import('./messages.js').DeployPayload;
    completedIds: string[];
    startedAt: number;
  };
}

export const CONFIG_DEFAULTS: ExtensionConfig = {
  walletMode: 'vault',
  vaultEntries: [],
  activeWalletId: null,
  rotationMode: 'round-robin',
  rotationIndex: 0,
  tokenAdmin: '0x0000000000000000000000000000000000000000',
  defaultChain: 8453,
  defaultFeeType: 'static',
  defaultFeePreset: 'Static10',
  defaultStaticClankerFeeBps: 1000,
  defaultStaticPairedFeeBps: 0,
  defaultDynamicBaseBps: 100,
  defaultDynamicMaxBps: 1000,
  defaultPoolPreset: 'Standard',
  defaultPairedToken: 'WETH',
  defaultMarketCap: 1,
  defaultSniperEnabled: true,
  enableQuickDeploy: true,
  defaultRewards: [],
  sniperStartingFee: 666777,
  sniperEndingFee: 41673,
  sniperSecondsToDecay: 15,
  pinataApiKey: '',
  pinataSecretKey: '',
  templates: [],
  contextInterface: 'ClankerExtension',
  deployHistory: [],
};

export const storage = {
  async get(): Promise<ExtensionConfig> {
    const data = await chrome.storage.local.get(null);
    return { ...CONFIG_DEFAULTS, ...data } as ExtensionConfig;
  },

  async set(partial: Partial<ExtensionConfig>): Promise<void> {
    await chrome.storage.local.set(partial);
  },

  async update(updater: (current: ExtensionConfig) => Partial<ExtensionConfig>): Promise<void> {
    const current = await this.get();
    const patch = updater(current);
    await this.set(patch);
  },
};
```

- [ ] **Step 3: Commit types**

```bash
git add src/lib/messages.ts src/lib/storage.ts && git commit -m "feat: core types — messages protocol, storage schema, ExtensionConfig defaults"
```

---

## Task 3: Pure Utility Libraries (Tested)

**Files:**
- Create: `src/lib/symbol.ts`
- Create: `src/lib/deploy-context-builder.ts`
- Create: `src/lib/ghost-validator.ts`
- Create: `src/lib/wallet-rotation.ts`
- Create: `src/lib/templates.ts`
- Create: `src/lib/__tests__/symbol.test.ts`
- Create: `src/lib/__tests__/deploy-context-builder.test.ts`
- Create: `src/lib/__tests__/ghost-validator.test.ts`
- Create: `src/lib/__tests__/wallet-rotation.test.ts`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write failing tests for symbol.ts**

`src/lib/__tests__/symbol.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generateSymbol } from '../symbol.js';

describe('generateSymbol', () => {
  it('strips @ prefix and uppercases', () => {
    expect(generateSymbol('@vitalik')).toBe('VITALIK');
  });
  it('removes non-alphanumeric chars', () => {
    expect(generateSymbol('@vitalik.eth')).toBe('VITALIKE');
  });
  it('truncates to 8 chars', () => {
    expect(generateSymbol('toolonghandle')).toBe('TOOLONGH');
  });
  it('handles numeric handles', () => {
    expect(generateSymbol('punk6529')).toBe('PUNK6529');
  });
  it('returns empty string for empty input', () => {
    expect(generateSymbol('')).toBe('');
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
rtk vitest run src/lib/__tests__/symbol.test.ts
```

Expected: FAIL — `symbol.ts` not found

- [ ] **Step 4: Create src/lib/symbol.ts**

```typescript
export function generateSymbol(input: string): string {
  return input
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}
```

- [ ] **Step 5: Run symbol tests — expect PASS**

```bash
rtk vitest run src/lib/__tests__/symbol.test.ts
```

Expected: 5 tests pass

- [ ] **Step 6: Write failing tests for deploy-context-builder.ts**

`src/lib/__tests__/deploy-context-builder.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildDeployContext } from '../deploy-context-builder.js';
import type { ScrapedData } from '../messages.js';

function scraped(overrides: Partial<ScrapedData> = {}): ScrapedData {
  return { name: 'Test', symbol: 'TEST', socials: {}, ...overrides };
}

describe('buildDeployContext', () => {
  it('uses twitter platform for twitter source', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter', messageId: '12345' }));
    expect(ctx.platform).toBe('twitter');
    expect(ctx.messageId).toBe('12345');
  });

  it('never uses "x" as platform', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.platform).not.toBe('x');
  });

  it('uses "clanker" platform for gmgn source', () => {
    const ctx = buildDeployContext(scraped({ source: 'gmgn' }));
    expect(ctx.platform).toBe('clanker');
  });

  it('uses "website" for generic source', () => {
    const ctx = buildDeployContext(scraped({ source: 'generic' }));
    expect(ctx.platform).toBe('website');
  });

  it('generates synthetic messageId when none provided', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.messageId).toBeTruthy();
    expect(ctx.messageId.length).toBeGreaterThan(10);
  });

  it('includes userId as id when present', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter', userId: '99999' }));
    expect(ctx.id).toBe('99999');
  });

  it('omits id when userId not present', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.id).toBeUndefined();
  });

  it('uses custom interface name', () => {
    const ctx = buildDeployContext(scraped(), 'MyExtension');
    expect(ctx.interface).toBe('MyExtension');
  });

  it('platform is never empty', () => {
    const ctx = buildDeployContext(scraped({}));
    expect(ctx.platform).toBeTruthy();
  });
});
```

- [ ] **Step 7: Create src/lib/deploy-context-builder.ts**

```typescript
import type { ScrapedData } from './messages.js';

interface ClankerDeployContext {
  interface: string;
  platform: string;
  messageId: string;
  id?: string;
}

const PLATFORM_MAP: Record<string, string> = {
  twitter: 'twitter',
  farcaster: 'farcaster',
  gmgn: 'clanker',
  generic: 'website',
};

function generateSyntheticMessageId(): string {
  return (1800000000000000000n + BigInt(Date.now())).toString();
}

export function buildDeployContext(
  scraped: ScrapedData,
  interfaceName = 'ClankerExtension'
): ClankerDeployContext {
  const platform = PLATFORM_MAP[scraped.source ?? 'generic'] ?? 'website';
  const messageId = scraped.messageId?.trim() || generateSyntheticMessageId();

  return {
    interface: interfaceName,
    platform,
    messageId,
    ...(scraped.userId ? { id: scraped.userId } : {}),
  };
}
```

- [ ] **Step 8: Write failing tests for ghost-validator.ts**

`src/lib/__tests__/ghost-validator.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { validateGhostConfig } from '../ghost-validator.js';

const YOU = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const TARGET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

function validConfig(overrides = {}) {
  return {
    rewards: {
      recipients: [
        { admin: YOU, recipient: YOU, bps: 9900, token: 'Both' as const },
        { admin: YOU, recipient: TARGET, bps: 100, token: 'Both' as const },
      ],
    },
    ...overrides,
  } as any;
}

describe('validateGhostConfig', () => {
  it('passes valid ghost config', () => {
    expect(() => validateGhostConfig(validConfig(), YOU, TARGET)).not.toThrow();
  });

  it('throws if rewards missing', () => {
    expect(() => validateGhostConfig({} as any, YOU, TARGET)).toThrow('GHOST: rewards must be');
  });

  it('throws if any reward admin is not yourAddress', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].admin = TARGET;
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: reward slot admin');
  });

  it('throws if bps do not sum to 10000', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].bps = 5000;
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: reward bps must sum');
  });

  it('throws if your address has 0 bps', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].recipient = TARGET; // both go to target
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: your address has 0 bps');
  });

  it('throws if vault recipient is target', () => {
    const cfg = { ...validConfig(), vault: { recipient: TARGET, supplyPct: 10, lockupSeconds: 86400 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: vault.recipient');
  });

  it('passes when vault recipient is yourAddress', () => {
    const cfg = { ...validConfig(), vault: { recipient: YOU, supplyPct: 10, lockupSeconds: 86400 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).not.toThrow();
  });

  it('throws if devBuy recipient is target', () => {
    const cfg = { ...validConfig(), devBuy: { recipient: TARGET, ethAmount: '0.1' } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: devBuy.recipient');
  });

  it('throws if airdrop admin is target', () => {
    const cfg = { ...validConfig(), airdrop: { admin: TARGET, merkleRoot: '0x01', tokenAmount: '100', lockupSeconds: 0 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: airdrop.admin');
  });
});
```

- [ ] **Step 9: Create src/lib/ghost-validator.ts**

```typescript
export function validateGhostConfig(
  config: any,
  yourAddress: `0x${string}`,
  targetAddress: `0x${string}`
): void {
  if (!config.rewards) {
    throw new Error('GHOST: rewards must be explicitly set — SDK default sends 100% to tokenAdmin');
  }

  for (const r of config.rewards.recipients) {
    if (r.admin.toLowerCase() !== yourAddress.toLowerCase()) {
      throw new Error(
        `GHOST: reward slot admin must be your address (${yourAddress}), got ${r.admin}`
      );
    }
  }

  const bpsSum = config.rewards.recipients.reduce((s: number, r: any) => s + r.bps, 0);
  if (bpsSum !== 10_000) {
    throw new Error(`GHOST: reward bps must sum to 10000, got ${bpsSum}`);
  }

  const yourBps = config.rewards.recipients
    .filter((r: any) => r.recipient.toLowerCase() === yourAddress.toLowerCase())
    .reduce((s: number, r: any) => s + r.bps, 0);
  if (yourBps === 0) {
    throw new Error('GHOST: your address has 0 bps — you will receive no fees');
  }

  if (config.vault && (!config.vault.recipient ||
      config.vault.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: vault.recipient must be your address, not tokenAdmin');
  }

  if (config.devBuy && (!config.devBuy.recipient ||
      config.devBuy.recipient.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: devBuy.recipient must be your address, not tokenAdmin');
  }

  if (config.airdrop && (!config.airdrop.admin ||
      config.airdrop.admin.toLowerCase() === targetAddress.toLowerCase())) {
    throw new Error('GHOST: airdrop.admin must be your address, not tokenAdmin');
  }
}
```

- [ ] **Step 10: Write failing tests for wallet-rotation.ts**

`src/lib/__tests__/wallet-rotation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { selectNextWallet } from '../wallet-rotation.js';
import type { WalletVaultEntry } from '../messages.js';

function makeEntry(id: string, deployCount = 0, active = true): WalletVaultEntry {
  return { id, name: id, address: `0x${'a'.repeat(40)}` as any,
    encryptedPK: '', iv: '', salt: '', createdAt: 0,
    lastUsedAt: 0, deployCount, active };
}

const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')];

describe('selectNextWallet', () => {
  it('manual: returns activeWalletId', () => {
    const { walletId } = selectNextWallet(entries, 'manual', 0, 'b');
    expect(walletId).toBe('b');
  });

  it('manual: falls back to first if activeWalletId missing', () => {
    const { walletId } = selectNextWallet(entries, 'manual', 0, 'zzz');
    expect(walletId).toBe('a');
  });

  it('round-robin: advances index', () => {
    const r0 = selectNextWallet(entries, 'round-robin', 0, null);
    expect(r0.walletId).toBe('a');
    expect(r0.nextIndex).toBe(1);
    const r1 = selectNextWallet(entries, 'round-robin', 1, null);
    expect(r1.walletId).toBe('b');
    const r3 = selectNextWallet(entries, 'round-robin', 3, null);
    expect(r3.walletId).toBe('a'); // wraps
  });

  it('least-used: returns wallet with lowest deployCount', () => {
    const e = [makeEntry('a', 5), makeEntry('b', 2), makeEntry('c', 8)];
    const { walletId } = selectNextWallet(e, 'least-used', 0, null);
    expect(walletId).toBe('b');
  });

  it('random: returns one of the active wallets', () => {
    const { walletId } = selectNextWallet(entries, 'random', 0, null);
    expect(['a', 'b', 'c']).toContain(walletId);
  });

  it('throws if no active wallets', () => {
    const inactive = [makeEntry('a', 0, false)];
    expect(() => selectNextWallet(inactive, 'manual', 0, null)).toThrow('No active wallets');
  });
});
```

- [ ] **Step 11: Create src/lib/wallet-rotation.ts**

```typescript
import type { WalletVaultEntry } from './messages.js';
import type { RotationMode } from './storage.js';

export function selectNextWallet(
  entries: WalletVaultEntry[],
  mode: RotationMode,
  currentIndex: number,
  activeWalletId: string | null
): { walletId: string; nextIndex: number } {
  const active = entries.filter(e => e.active);
  if (active.length === 0) throw new Error('No active wallets in vault');

  switch (mode) {
    case 'manual': {
      const manual = active.find(e => e.id === activeWalletId) ?? active[0];
      return { walletId: manual.id, nextIndex: currentIndex };
    }
    case 'round-robin': {
      const next = currentIndex % active.length;
      return { walletId: active[next].id, nextIndex: next + 1 };
    }
    case 'random': {
      const idx = Math.floor(Math.random() * active.length);
      return { walletId: active[idx].id, nextIndex: currentIndex };
    }
    case 'least-used': {
      const least = active.reduce((a, b) => a.deployCount <= b.deployCount ? a : b);
      return { walletId: least.id, nextIndex: currentIndex };
    }
  }
}
```

- [ ] **Step 12: Create src/lib/templates.ts**

```typescript
import type { DeployFormState } from './messages.js';
import { storage } from './storage.js';

export async function saveTemplate(name: string, config: Partial<DeployFormState>): Promise<void> {
  const current = await storage.get();
  const template = {
    id: crypto.randomUUID(),
    name,
    config,
    createdAt: Date.now(),
  };
  await storage.set({ templates: [...current.templates, template] });
}

export async function deleteTemplate(id: string): Promise<void> {
  const current = await storage.get();
  await storage.set({ templates: current.templates.filter(t => t.id !== id) });
}

export async function listTemplates() {
  const config = await storage.get();
  return config.templates;
}
```

- [ ] **Step 13: Run all lib tests**

```bash
rtk vitest run src/lib/__tests__/
```

Expected: all tests pass (symbol: 5, deploy-context-builder: 9, ghost-validator: 9, wallet-rotation: 6)

- [ ] **Step 14: Commit lib utilities**

```bash
git add src/lib/ vitest.config.ts && git commit -m "feat: pure lib utilities — symbol, deploy-context-builder, ghost-validator, wallet-rotation, templates"
```

---

## Task 4: Chain Config + Image Pipeline

**Files:**
- Create: `src/lib/chains.ts`
- Create: `src/lib/pinata.ts`
- Create: `src/lib/image-pipeline.ts`

- [ ] **Step 1: Create src/lib/chains.ts**

Note: Monad mainnet (143) needs a custom viem chain definition. Check SDK for it:
```bash
cat "/Users/aaa/projects/ClankerSDK 2026/src/utils/chains/monad.ts"
```
Copy that definition or import it.

```typescript
import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
import { base, mainnet, arbitrum, unichain } from 'viem/chains';

// Custom Monad mainnet chain (chainId 143)
// Import from SDK if available, else define inline:
const monad: Chain = {
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [] } },
  blockExplorers: { default: { name: 'Monad Explorer', url: 'https://explorer.monad.xyz' } },
};

export const CHAIN_CONFIG: Record<number, {
  name: string;
  viemChain: Chain;
  rpcs: string[];
  explorer: string;
  marketCapUnit: string;
  rpcRequired?: boolean;
}> = {
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
    viemChain: monad,
    rpcs: [],
    explorer: 'https://explorer.monad.xyz',
    marketCapUnit: 'MON',
    rpcRequired: true,
  },
};

const rpcCache = new Map<number, string>();

async function probeRpc(url: string, chain: Chain, timeoutMs = 3000): Promise<boolean> {
  try {
    const client = createPublicClient({ chain, transport: http(url) });
    await Promise.race([
      client.getBlockNumber(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return true;
  } catch { return false; }
}

export async function getCustomRpc(chainId: number): Promise<string | null> {
  const { storage } = await import('./storage.js');
  const config = await storage.get();
  // Stored as `customRpc_${chainId}` in config — user sets in Options → Deploy Defaults
  return (config as any)[`customRpc_${chainId}`] ?? null;
}

export async function getBestRpc(chainId: number): Promise<string> {
  if (rpcCache.has(chainId)) return rpcCache.get(chainId)!;
  const config = CHAIN_CONFIG[chainId];
  if (!config) throw new Error(`Unsupported chain: ${chainId}`);

  // For chains requiring a user-configured RPC (e.g. Monad), check that first
  if (config.rpcRequired) {
    const customRpc = await getCustomRpc(chainId);
    if (!customRpc) throw new Error(`${config.name} requires a custom RPC — configure it in Options → Deploy Defaults`);
    if (await probeRpc(customRpc, config.viemChain)) {
      rpcCache.set(chainId, customRpc);
      return customRpc;
    }
    throw new Error(`Custom RPC for ${config.name} is unreachable: ${customRpc}`);
  }

  for (const rpc of config.rpcs) {
    if (await probeRpc(rpc, config.viemChain)) {
      rpcCache.set(chainId, rpc);
      return rpc;
    }
  }
  throw new Error(`All RPCs unavailable for chain ${chainId}`);
}

export async function getPublicClient(chainId: number): Promise<PublicClient> {
  const rpc = await getBestRpc(chainId);
  return createPublicClient({ chain: CHAIN_CONFIG[chainId].viemChain, transport: http(rpc) });
}
```

- [ ] **Step 2: Create src/lib/pinata.ts**

```typescript
export async function uploadToPinata(
  blob: Blob,
  filename: string,
  apiKey: string,
  secretKey: string
): Promise<string> {
  const form = new FormData();
  form.append('file', blob, filename);
  form.append('pinataMetadata', JSON.stringify({ name: filename }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      pinata_api_key: apiKey,
      pinata_secret_api_key: secretKey,
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinata upload failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { IpfsHash: string };
  return `ipfs://${data.IpfsHash}`;
}
```

- [ ] **Step 3: Create src/lib/image-pipeline.ts**

```typescript
import { uploadToPinata } from './pinata.js';
import { storage } from './storage.js';

async function sha1hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function processImageUrl(url: string): Promise<string> {
  // Already IPFS — pass through
  if (url.startsWith('ipfs://')) return url;

  // Check cache
  const cacheKey = `imgcache:${await sha1hex(url)}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey] as string;

  const config = await storage.get();
  if (!config.pinataApiKey || !config.pinataSecretKey) {
    throw new Error('Pinata API keys not configured — set them in Options');
  }

  // Fetch image in service worker (CORS-free for extension origins)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();

  if (blob.size > 5 * 1024 * 1024) {
    throw new Error('Image too large (>5MB). Please use a smaller image.');
  }

  const ext = blob.type.split('/')[1] ?? 'jpg';
  const filename = `token-image.${ext}`;
  const ipfsUrl = await uploadToPinata(blob, filename, config.pinataApiKey, config.pinataSecretKey);

  // Cache result
  await chrome.storage.local.set({ [cacheKey]: ipfsUrl });

  return ipfsUrl;
}

export async function processImageBlob(data: ArrayBuffer, filename: string): Promise<string> {
  const config = await storage.get();
  if (!config.pinataApiKey || !config.pinataSecretKey) {
    throw new Error('Pinata API keys not configured — set them in Options');
  }

  const blob = new Blob([data]);
  return uploadToPinata(blob, filename, config.pinataApiKey, config.pinataSecretKey);
}
```

- [ ] **Step 4: Commit chain config + image pipeline**

```bash
git add src/lib/chains.ts src/lib/pinata.ts src/lib/image-pipeline.ts && git commit -m "feat: chain config with RPC fallback, Pinata upload, image pipeline"
```

---

## Task 5: Background Crypto (Vault Encryption)

**Files:**
- Create: `src/background/crypto.ts`
- Create: `src/lib/__tests__/crypto.test.ts`

Note: Web Crypto API is available in Node 18+ and vitest's node environment.

- [ ] **Step 1: Write failing test for crypto.ts**

`src/lib/__tests__/crypto.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { encryptPrivateKey, decryptPrivateKey } from '../../background/crypto.js';

const TEST_PK = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const PASSWORD = 'test-password-123';

describe('vault crypto', () => {
  it('encrypts and decrypts a private key round-trip', async () => {
    const { encryptedPK, iv, salt } = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(encryptedPK).toBeTruthy();
    expect(iv).toBeTruthy();
    expect(salt).toBeTruthy();

    const decrypted = await decryptPrivateKey(encryptedPK, iv, salt, PASSWORD);
    expect(decrypted).toBe(TEST_PK);
  });

  it('each encryption produces unique iv and salt', async () => {
    const a = await encryptPrivateKey(TEST_PK, PASSWORD);
    const b = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('decryption fails with wrong password', async () => {
    const { encryptedPK, iv, salt } = await encryptPrivateKey(TEST_PK, PASSWORD);
    await expect(decryptPrivateKey(encryptedPK, iv, salt, 'wrong-password')).rejects.toThrow();
  });

  it('encrypted output is base64 string', async () => {
    const { encryptedPK } = await encryptPrivateKey(TEST_PK, PASSWORD);
    expect(() => atob(encryptedPK)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
rtk vitest run src/lib/__tests__/crypto.test.ts
```

- [ ] **Step 3: Create src/background/crypto.ts**

```typescript
// src/background/crypto.ts
// Uses Web Crypto API (available in MV3 service workers and Node 18+)

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(str: string): Uint8Array {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

export async function encryptPrivateKey(
  pk: string,
  password: string
): Promise<{ encryptedPK: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ['encrypt']);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(pk)
  );
  return {
    encryptedPK: b64encode(ct),
    iv: b64encode(iv.buffer),
    salt: b64encode(salt.buffer),
  };
}

export async function decryptPrivateKey(
  encryptedPK: string,
  iv: string,
  salt: string,
  password: string
): Promise<string> {
  const key = await deriveKey(password, b64decode(salt), ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(iv) },
    key,
    b64decode(encryptedPK)
  );
  return new TextDecoder().decode(pt);
}
```

- [ ] **Step 4: Run crypto tests — expect PASS**

```bash
rtk vitest run src/lib/__tests__/crypto.test.ts
```

Expected: 4 tests pass (note: slow due to 600k PBKDF2 iterations — ~2-3s per test is normal)

- [ ] **Step 5: Commit crypto**

```bash
git add src/background/crypto.ts src/lib/__tests__/crypto.test.ts && git commit -m "feat: AES-256-GCM vault encryption — 600k PBKDF2, unique salt+IV per key"
```

---

## Task 6: Background Service Worker — Core

**Files:**
- Create: `src/lib/clanker.ts` (SDK wrapper — SW only)
- Create: `src/background/index.ts` (keepalive + message router)
- Create: `src/background/vault.ts` (session wallet cache)
- Create: `src/background/handlers/deploy.ts`
- Create: `src/background/handlers/fees.ts`
- Create: `src/background/handlers/history.ts`

- [ ] **Step 1: Create src/lib/clanker.ts (SDK wrapper)**

```typescript
// src/lib/clanker.ts — ONLY imported in background service worker
// Never import this in popup or content scripts
import { Clanker } from 'clanker-sdk/v4';
import type { PublicClient, WalletClient, Chain, Transport, Account } from 'viem';
import type { ClankerTokenV4 } from 'clanker-sdk';

export type { ClankerTokenV4 };
export { Clanker };

export function createClankerSdk(
  publicClient: PublicClient,
  wallet?: WalletClient<Transport, Chain, Account>
): Clanker {
  return new Clanker({ publicClient, wallet });
}
```

- [ ] **Step 2: Create src/background/vault.ts**

```typescript
// src/background/vault.ts — Session wallet cache (never persisted)
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { createWalletClient, http, type WalletClient, type Chain, type Transport, type Account } from 'viem';
import { decryptPrivateKey } from './crypto.js';
import { storage } from '../lib/storage.js';
import { getBestRpc, CHAIN_CONFIG } from '../lib/chains.js';

// Chain-agnostic account cache — WalletClient created fresh per deploy
const sessionAccounts = new Map<string, PrivateKeyAccount>();

export function isUnlocked(): boolean {
  return sessionAccounts.size > 0;
}

export function getActiveIds(): string[] {
  return Array.from(sessionAccounts.keys());
}

export async function unlockVault(password: string): Promise<void> {
  const config = await storage.get();
  const active = config.vaultEntries.filter(e => e.active);
  if (active.length === 0) throw new Error('No active wallets in vault');

  // Clear before unlock attempt
  sessionAccounts.clear();

  try {
    for (const entry of active) {
      const pk = await decryptPrivateKey(entry.encryptedPK, entry.iv, entry.salt, password);
      const account = privateKeyToAccount(pk as `0x${string}`);
      sessionAccounts.set(entry.id, account);
    }
  } catch (e) {
    sessionAccounts.clear();
    throw new Error('Invalid password');
  }
}

export function lockVault(): void {
  sessionAccounts.clear();
}

export async function getWalletClient(
  walletId: string,
  chainId: number
): Promise<WalletClient<Transport, Chain, Account>> {
  const account = sessionAccounts.get(walletId);
  if (!account) throw new Error('Vault locked — password required');
  const rpc = await getBestRpc(chainId);
  return createWalletClient({
    account,
    chain: CHAIN_CONFIG[chainId].viemChain,
    transport: http(rpc),
  });
}

export function getAccount(walletId: string): PrivateKeyAccount {
  const account = sessionAccounts.get(walletId);
  if (!account) throw new Error('Vault locked — password required');
  return account;
}
```

- [ ] **Step 3: Create src/background/handlers/fees.ts**

```typescript
import { createClankerSdk } from '../../lib/clanker.js';
import { getPublicClient } from '../../lib/chains.js';
import { getWalletClient } from '../vault.js';

export async function getAvailableRewards(
  token: `0x${string}`,
  recipient: `0x${string}`,
  chainId: number
): Promise<{ amount: string }> {
  const publicClient = await getPublicClient(chainId);
  const sdk = createClankerSdk(publicClient);
  const amount = await sdk.availableRewards({ token, rewardRecipient: recipient });
  return { amount: amount.toString() };
}

export async function claimRewards(
  token: `0x${string}`,
  recipient: `0x${string}`,
  chainId: number,
  walletId: string
): Promise<{ ok: true }> {
  const publicClient = await getPublicClient(chainId);
  const walletClient = await getWalletClient(walletId, chainId);
  const sdk = createClankerSdk(publicClient, walletClient);
  const result = await sdk.claimRewards({ token, rewardRecipient: recipient });
  if ('error' in result) throw new Error(result.error.message);
  return { ok: true };
}
```

- [ ] **Step 4: Create src/background/handlers/history.ts**

```typescript
import { storage } from '../../lib/storage.js';
import type { DeployRecord } from '../../lib/messages.js';

export async function getHistory(): Promise<{ records: DeployRecord[] }> {
  const config = await storage.get();
  const local = config.deployHistory ?? [];

  // Fetch from clanker.world for non-ghost deploys
  const nonGhost = local.filter(r => !r.isGhostDeploy);
  const seen = new Set(local.map(r => r.address.toLowerCase()));

  for (const record of nonGhost) {
    try {
      const res = await fetch(
        `https://clanker.world/api/search-creator?q=${record.tokenAdmin}&limit=50`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) continue;
      const data = await res.json() as { tokens?: Array<{ address: string; name: string; symbol: string; chainId?: number }> };
      if (!data.tokens) continue;
      // Merge remote records not in local storage
      // (we don't overwrite local records as they have more data)
    } catch { /* network unavailable — skip */ }
  }

  // Sort by deployedAt descending
  const sorted = [...local].sort((a, b) => b.deployedAt - a.deployedAt);
  return { records: sorted };
}

export async function addDeployRecord(record: DeployRecord): Promise<void> {
  const config = await storage.get();
  const history = [record, ...(config.deployHistory ?? [])].slice(0, 200); // cap at 200
  await storage.set({ deployHistory: history });
}
```

- [ ] **Step 5: Create src/background/handlers/deploy.ts**

This is the core deploy handler. Read the spec section "Deploy Flow (End-to-End)" carefully.

```typescript
import type { DeployPayload, DeployRecord } from '../../lib/messages.js';
import { buildDeployContext } from '../../lib/deploy-context-builder.js';
import { validateGhostConfig } from '../../lib/ghost-validator.js';
import { selectNextWallet } from '../../lib/wallet-rotation.js';
import { processImageUrl } from '../../lib/image-pipeline.js';
import { createClankerSdk } from '../../lib/clanker.js';
import { getPublicClient, CHAIN_CONFIG } from '../../lib/chains.js';
import { getWalletClient, getAccount } from '../vault.js';
import { storage } from '../../lib/storage.js';
import { addDeployRecord } from './history.js';
// POOL_POSITIONS: verify import path against SDK dist/ after build:
//   cat "/Users/aaa/projects/ClankerSDK 2026/dist/constants.js" | grep POOL_POSITIONS
// Likely exports: 'clanker-sdk' (root) or 'clanker-sdk/v4'. NOT 'clanker-sdk/src/...' (source, not dist)
// Adjust if compile fails — check package.json exports field in the SDK.
import { POOL_POSITIONS } from 'clanker-sdk';
import { getTickFromMarketCap } from 'clanker-sdk/utils';
import { clankerConfigFor } from 'clanker-sdk';
import type { ClankerTokenV4 } from '../../lib/clanker.js';
import { createPublicClient, http } from 'viem';

export async function handleDeploy(
  payload: DeployPayload
): Promise<{ txHash: `0x${string}`; tokenAddress: `0x${string}`; walletId: string }> {
  const { form, scraped, walletId: requestedWalletId, skipStatUpdate = false } = payload;
  const config = await storage.get();

  // 1. Resolve wallet
  let walletId: string;
  if (config.walletMode === 'vault') {
    const { walletId: selected } = selectNextWallet(
      config.vaultEntries,
      config.rotationMode,
      config.rotationIndex,
      requestedWalletId ?? config.activeWalletId
    );
    walletId = selected;
  } else {
    walletId = requestedWalletId ?? '';
  }

  // 2. Process image
  let imageUrl = form.imageUrl;
  if (imageUrl && !imageUrl.startsWith('ipfs://')) {
    imageUrl = await processImageUrl(imageUrl);
  }

  // 3. Build deploy context
  const context = buildDeployContext(scraped, config.contextInterface);

  // 4. Resolve pool tick from market cap
  const { tickIfToken0IsClanker } = getTickFromMarketCap(form.marketCap);

  // 5. Build positions with aligned tick
  const basePositions = POOL_POSITIONS[form.poolPreset];
  const positions = basePositions.map((pos, i) =>
    i === 0 ? { ...pos, tickLower: tickIfToken0IsClanker } : pos
  );

  // 6. Resolve paired token address
  const chainConfig = CHAIN_CONFIG[form.chainId];
  const wethAddr = getWethAddress(form.chainId);
  const pairedToken = form.pairedToken === 'WETH' ? wethAddr : form.pairedToken as `0x${string}`;

  // 7. Build ClankerTokenV4 config
  const tokenAdmin = form.ghostMode && form.ghostTargetAddress
    ? form.ghostTargetAddress as `0x${string}`
    : (config.walletMode === 'vault' ? getAccount(walletId).address : form.tokenAdmin);

  const rewardRecipient = config.walletMode === 'vault'
    ? getAccount(walletId).address
    : (config.tokenAdmin as `0x${string}`);

  const rewards = form.rewards.length > 0
    ? { recipients: form.rewards.map(r => ({
        admin: r.admin,
        recipient: r.recipient,
        bps: r.bps,
        token: r.token,
      }))}
    : { recipients: [{ admin: rewardRecipient, recipient: rewardRecipient, bps: 10_000, token: 'Both' as const }] };

  // Determine fee hook based on chain + fee type
  const sdkConfig = clankerConfigFor(form.chainId as any, 'clanker_v4');
  const hasStaticHook = sdkConfig?.related?.feeStaticHook && sdkConfig.related.feeStaticHook !== '0x0000000000000000000000000000000000000000';
  const hasDynamicHook = sdkConfig?.related?.feeDynamicHook && sdkConfig.related.feeDynamicHook !== '0x0000000000000000000000000000000000000000';

  let feeHook: `0x${string}`;
  let feeConfig: any;

  if (form.feeType === 'dynamic' && hasDynamicHook) {
    feeHook = sdkConfig!.related.feeDynamicHook!;
    feeConfig = {
      baseFee: form.dynamicBaseBps,
      maxFee: form.dynamicMaxBps,
    };
  } else {
    feeHook = hasStaticHook ? sdkConfig!.related.feeStaticHook! : '0x0000000000000000000000000000000000000000';
    feeConfig = {
      clankerFee: form.staticClankerFeeBps,
      pairedFee: form.staticPairedFeeBps,
    };
  }

  const tokenConfig: ClankerTokenV4 = {
    name: form.name,
    symbol: form.symbol,
    image: imageUrl,
    metadata: form.description ? JSON.stringify({ description: form.description, socials: form.socials }) : undefined,
    context,
    pool: {
      pairedToken,
      tickIfToken0IsClanker,
      positions,
    },
    fees: {
      hook: feeHook,
      ...feeConfig,
    },
    rewards,
    tokenAdmin,
    ...(form.sniperEnabled && sdkConfig?.related?.mevModuleV2 ? {
      mevModule: {
        startingFee: form.sniperStartingFee,
        endingFee: form.sniperEndingFee,
        secondsToDecay: form.sniperSecondsToDecay,
      }
    } : {}),
    ...(form.vaultEnabled ? {
      vault: {
        supplyPct: form.vaultSupplyPct,
        lockupSeconds: form.vaultLockupDays * 86400,
        vestingSeconds: form.vaultVestingDays > 0 ? form.vaultVestingDays * 86400 : undefined,
        recipient: form.vaultRecipient || rewardRecipient,
      }
    } : {}),
    ...(form.devBuyEnabled ? {
      devBuy: {
        ethAmount: form.devBuyAmount,
        recipient: form.devBuyRecipient || rewardRecipient,
      }
    } : {}),
    ...(form.airdropEnabled && form.airdropMerkleRoot ? {
      airdrop: {
        merkleRoot: form.airdropMerkleRoot as `0x${string}`,
        tokenAmount: form.airdropAmount,
        lockupSeconds: form.airdropLockupDays * 86400,
        vestingSeconds: form.airdropVestingDays > 0 ? form.airdropVestingDays * 86400 : undefined,
        admin: rewardRecipient,
      }
    } : {}),
    ...(form.vanityEnabled ? { vanity: true } : {}),
    ...(form.customSalt ? { salt: form.customSalt } : {}),
  };

  // 8. Ghost Mode validation
  if (form.ghostMode) {
    validateGhostConfig(tokenConfig, rewardRecipient, tokenAdmin);
  }

  // 9. Get clients
  const publicClient = await getPublicClient(form.chainId);
  let walletClient;
  if (config.walletMode === 'vault') {
    walletClient = await getWalletClient(walletId, form.chainId);
  }
  // Mode A (injected) wallet handled via different path — not implemented in Phase 1

  const sdk = createClankerSdk(publicClient, walletClient);

  // 10. Simulate (if enabled)
  if (form.simulateBeforeDeploy) {
    await sdk.deploySimulate(tokenConfig);
  }

  // 11. Deploy
  const deployResult = await sdk.deploy(tokenConfig);
  if ('error' in deployResult) throw new Error(deployResult.error.message);

  const { txHash, waitForTransaction } = deployResult;

  // 12. Wait for confirmation
  const txResult = await waitForTransaction();
  if ('error' in txResult) throw new Error(txResult.error.message);

  const { address: tokenAddress } = txResult;

  // 13. Save history record
  const record: DeployRecord = {
    address: tokenAddress,
    name: form.name,
    symbol: form.symbol,
    chainId: form.chainId,
    txHash,
    deployedAt: Date.now(),
    imageUrl,
    walletId,
    tokenAdmin,
    rewardRecipient,
    isGhostDeploy: form.ghostMode,
  };
  await addDeployRecord(record);

  // 14. Update wallet stats — skipped in batch mode (Gotcha #28: no write storm)
  // batch.ts sets skipStatUpdate=true and does a single batched storage.set() after all deploys complete.
  if (config.walletMode === 'vault' && !skipStatUpdate) {
    const entries = config.vaultEntries.map(e =>
      e.id === walletId
        ? { ...e, lastUsedAt: Date.now(), deployCount: e.deployCount + 1 }
        : e
    );
    await storage.set({ vaultEntries: entries, rotationIndex: config.rotationIndex + 1 });
  }

  return { txHash, tokenAddress, walletId };
}

function getWethAddress(chainId: number): `0x${string}` {
  const map: Record<number, `0x${string}`> = {
    8453:  '0x4200000000000000000000000000000000000006',
    1:     '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    130:   '0x4200000000000000000000000000000000000006',
    143:   '0x3bd359c1119da7da1d913d1c4d2b7c461115433a',
  };
  return map[chainId] ?? '0x4200000000000000000000000000000000000006';
}
```

Note: The exact `ClankerTokenV4` shape from the SDK may differ. After installing SDK, check:
```bash
cat "/Users/aaa/projects/ClankerSDK 2026/src/config/clankerTokenV4.ts" | head -100
```
and adjust field names accordingly.

- [ ] **Step 6: Create src/background/index.ts (full message router)**

```typescript
import { handleDeploy } from './handlers/deploy.js';
import { getAvailableRewards, claimRewards } from './handlers/fees.js';
import { getHistory } from './handlers/history.js';
import { processImageUrl, processImageBlob } from '../lib/image-pipeline.js';
import { unlockVault, lockVault, isUnlocked, getActiveIds } from './vault.js';
import type { BgMessage } from '../lib/messages.js';
import { storage } from '../lib/storage.js';

export default defineBackground(() => {
  // Keepalive — prevents SW death during 45-60s deploys
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((_alarm) => { /* no-op */ });

  // Tab registration for Mode A wallet bridge
  let activeTabId: number | undefined;

  chrome.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
    // Tab registration from content script
    if ((msg as any).type === 'REGISTER_TAB') {
      activeTabId = sender.tab?.id;
      sendResponse({ ok: true });
      return true;
    }

    handleMessage(msg, activeTabId).then(sendResponse).catch(e => {
      sendResponse({ error: (e as Error).message });
    });
    return true; // keep channel open for async response
  });

  // Batch deploy via Port API
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'batch-deploy') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'BATCH_DEPLOY') return;
      const { runBatchDeploy } = await import('./handlers/batch.js');
      await runBatchDeploy(msg, port);
    });
  });
});

async function handleMessage(msg: BgMessage, activeTabId?: number): Promise<unknown> {
  switch (msg.type) {
    case 'DEPLOY':
      return handleDeploy(msg.payload);

    case 'UPLOAD_IMAGE':
      return { ipfsUrl: await processImageUrl(msg.url) };

    case 'UPLOAD_IMAGE_BLOB':
      return { ipfsUrl: await processImageBlob(msg.data, msg.filename) };

    case 'GET_AVAILABLE_REWARDS':
      return getAvailableRewards(msg.token, msg.recipient, msg.chainId);

    case 'CLAIM_REWARDS':
      // Use first active vault wallet for fee claiming
      const config = await storage.get();
      const walletId = config.activeWalletId ?? config.vaultEntries.find(e => e.active)?.id ?? '';
      return claimRewards(msg.token, msg.recipient, msg.chainId, walletId);

    case 'GET_HISTORY':
      return getHistory();

    case 'WALLET_PING':
      if (!activeTabId) return { error: 'Wallet bridge not ready — reload the page' };
      return new Promise(resolve => {
        chrome.tabs.sendMessage(activeTabId!, { type: 'WALLET_PING' }, resolve);
      });

    case 'WALLET_REQUEST':
      if (!activeTabId) return { error: 'Wallet bridge not ready — reload the page' };
      return new Promise(resolve => {
        chrome.tabs.sendMessage(activeTabId!, { type: 'WALLET_REQUEST', request: msg.request }, resolve);
      });

    case 'UNLOCK_VAULT':
      await unlockVault(msg.password);
      return { ok: true };

    case 'LOCK_VAULT':
      lockVault();
      return { ok: true };

    case 'VAULT_STATUS': {
      const cfg = await storage.get();
      return {
        unlocked: isUnlocked(),
        walletCount: cfg.vaultEntries.length,
        activeIds: getActiveIds(),
      };
    }

    // ADD_WALLET: encryption happens in SW so plaintext PK never lives in popup heap
    case 'ADD_WALLET': {
      const { encryptPrivateKey } = await import('./crypto.js');
      const { privateKeyToAccount } = await import('viem/accounts');
      const { encryptedPK, iv, salt } = await encryptPrivateKey(msg.plainPk, msg.password);
      const account = privateKeyToAccount(msg.plainPk as `0x${string}`);
      const entry = {
        id: crypto.randomUUID(), name: msg.name, address: account.address,
        encryptedPK, iv, salt, createdAt: Date.now(), lastUsedAt: 0, deployCount: 0, active: true,
      };
      const cfg = await storage.get();
      await storage.set({ vaultEntries: [...cfg.vaultEntries, entry] });
      return { ok: true, address: account.address };
    }

    case 'REMOVE_WALLET': {
      const cfg = await storage.get();
      await storage.set({ vaultEntries: cfg.vaultEntries.filter(e => e.id !== msg.id) });
      return { ok: true };
    }

    default:
      return { error: `Unknown message type: ${(msg as any).type}` };
  }
}
```

- [ ] **Step 7: Create src/background/handlers/batch.ts**

```typescript
import type { DeployPayload, BatchDeployResult, SwEvent } from '../../lib/messages.js';
import { handleDeploy } from './deploy.js';
import { storage } from '../../lib/storage.js';

interface BatchDeployMsg {
  type: 'BATCH_DEPLOY';
  payload: DeployPayload;
  walletIds: string[];
}

export async function runBatchDeploy(
  msg: BatchDeployMsg,
  port: chrome.runtime.Port
): Promise<void> {
  const { payload, walletIds } = msg;
  const batchId = crypto.randomUUID();

  // Persist batch state for crash recovery
  await storage.set({
    pendingBatch: {
      batchId,
      walletIds,
      payload,
      completedIds: [],
      startedAt: Date.now(),
    },
  });

  const results: BatchDeployResult[] = [];
  const config = await storage.get();
  const walletNames = Object.fromEntries(
    config.vaultEntries.map(e => [e.id, e.name])
  );

  for (let i = 0; i < walletIds.length; i++) {
    const walletId = walletIds[i];

    const progress: SwEvent = {
      type: 'BATCH_PROGRESS',
      walletId,
      index: i,
      total: walletIds.length,
      status: 'deploying',
    };
    port.postMessage(progress);

    try {
      // Randomize salt per wallet deploy
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const walletPayload: DeployPayload = {
        ...payload,
        form: { ...payload.form, customSalt: `0x${salt}`, vanityEnabled: false },
        walletId,
        skipStatUpdate: true,  // batch.ts defers stat writes (Gotcha #28)
      };

      const { txHash, tokenAddress } = await handleDeploy(walletPayload);

      const successEvent: SwEvent = {
        type: 'BATCH_PROGRESS',
        walletId,
        index: i,
        total: walletIds.length,
        status: 'success',
        txHash,
        tokenAddress,
      };
      port.postMessage(successEvent);

      results.push({
        walletId,
        walletName: walletNames[walletId] ?? walletId,
        status: 'success',
        txHash,
        tokenAddress,
      });

      // Update crash recovery checkpoint
      const current = await storage.get();
      if (current.pendingBatch) {
        await storage.set({
          pendingBatch: {
            ...current.pendingBatch,
            completedIds: [...current.pendingBatch.completedIds, walletId],
          },
        });
      }
    } catch (e) {
      const error = (e as Error).message;
      const failEvent: SwEvent = {
        type: 'BATCH_PROGRESS',
        walletId,
        index: i,
        total: walletIds.length,
        status: 'failed',
        error,
      };
      port.postMessage(failEvent);
      results.push({
        walletId,
        walletName: walletNames[walletId] ?? walletId,
        status: 'failed',
        error,
      });
    }

    // 500ms gap between deploys
    if (i < walletIds.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Batch write all vault stat updates in a single storage.set() call (Gotcha #28)
  // handleDeploy ran with skipStatUpdate=true, so no per-deploy writes happened
  const successWalletIds = results.filter(r => r.status === 'success').map(r => r.walletId);
  if (successWalletIds.length > 0) {
    const current = await storage.get();
    const now = Date.now();
    const updatedEntries = current.vaultEntries.map(e => {
      const useCount = successWalletIds.filter(id => id === e.id).length;
      if (useCount === 0) return e;
      return { ...e, lastUsedAt: now, deployCount: e.deployCount + useCount };
    });
    await storage.set({
      vaultEntries: updatedEntries,
      rotationIndex: current.rotationIndex + successWalletIds.length,
      pendingBatch: undefined,
    });
  } else {
    await storage.set({ pendingBatch: undefined });
  }

  const completeEvent: SwEvent = { type: 'BATCH_COMPLETE', results };
  port.postMessage(completeEvent);
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
rtk tsc --noEmit
```

Fix any type errors before proceeding. Common issues:
- SDK `ClankerTokenV4` field names — check `src/config/clankerTokenV4.ts` in the SDK
- `getTickFromMarketCap` export path — may be `clanker-sdk/utils` or direct export
- `clankerConfigFor` chain argument type

- [ ] **Step 9: Verify WXT builds**

```bash
rtk pnpm run build
```

Expected: extension built successfully, no errors

- [ ] **Step 10: Commit background service worker**

```bash
git add src/background/ src/lib/clanker.ts src/lib/chains.ts src/lib/pinata.ts src/lib/image-pipeline.ts && git commit -m "feat: background service worker — deploy, fees, history, batch, vault session cache"
```

---

## Task 7: Run All Tests + Final Verification

- [ ] **Step 1: Run full test suite**

```bash
rtk vitest run
```

Expected: all tests pass (symbol, deploy-context-builder, ghost-validator, wallet-rotation, crypto)

- [ ] **Step 2: TypeScript type check**

```bash
rtk tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Extension builds cleanly**

```bash
rtk pnpm run build
```

- [ ] **Step 4: Final commit**

```bash
git add -A && git commit -m "feat: Phase 1 complete — scaffold, lib, background SW — deploy pipeline end-to-end"
```

---

## Phase 1 Exit Criteria

- [ ] All vitest tests pass (≥25 tests across 5 modules)
- [ ] TypeScript compiles with no errors
- [ ] WXT builds the extension without errors
- [ ] SDK built and linked correctly
- [ ] Background can handle DEPLOY, VAULT_STATUS, UPLOAD_IMAGE, GET_HISTORY, CLAIM_REWARDS messages

---

## Known Gaps for Phase 2+

- Content scripts (scrapers) not yet implemented — Phase 2
- Popup UI not yet implemented — Phase 3
- Options UI not yet implemented — Phase 3
- Mode A (injected wallet) relay not fully tested
- Actual SDK ClankerTokenV4 field names may need adjustment after first compile
