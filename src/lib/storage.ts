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
