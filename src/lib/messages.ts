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
  | { type: 'REMOVE_WALLET'; id: string }
  | { type: 'FETCH_URL';   url: string }
  | { type: 'FETCH_TOKEN'; address: `0x${string}`; chainId: number };

export type BgResponse<T extends BgMessage['type']> =
  T extends 'DEPLOY' ? { txHash: `0x${string}`; tokenAddress: `0x${string}` } :
  T extends 'UPLOAD_IMAGE' | 'UPLOAD_IMAGE_BLOB' ? { ipfsUrl: string } :
  T extends 'GET_AVAILABLE_REWARDS' ? { amount: string } :
  T extends 'GET_HISTORY' ? { records: DeployRecord[] } :
  T extends 'WALLET_PING' ? { ready: true } :
  T extends 'VAULT_STATUS' ? { unlocked: boolean; walletCount: number; activeIds: string[] } :
  T extends 'FETCH_URL'   ? ScrapedData :
  T extends 'FETCH_TOKEN' ? ScrapedData :
  { ok: true };

export type BgError = { error: string };
export type BgResult<T extends BgMessage['type']> = BgResponse<T> | BgError;

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

// ── Service Worker → Popup (Port API, batch only) ───────────────────────────
export type SwEvent =
  | { type: 'BATCH_PROGRESS'; walletId: string; index: number; total: number;
      status: 'pending' | 'deploying' | 'success' | 'failed';
      txHash?: `0x${string}`; tokenAddress?: `0x${string}`; error?: string }
  | { type: 'BATCH_COMPLETE'; results: BatchDeployResult[] };

// ── Content Script messages ──────────────────────────────────────────────────
export type ContentMessage =
  | { type: 'REGISTER_TAB' }
  // Note: ENTER/EXIT_PICK_MODE removed — feature replaced by SourceView.
  // Content script may still handle them gracefully; type removed to prevent new usage.
  | { type: 'SCRAPE' }
  | { type: 'SCRAPE_RESULT'; data: ScrapedData };
