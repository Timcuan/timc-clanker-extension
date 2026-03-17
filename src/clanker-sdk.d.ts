// Ambient module declarations for clanker-sdk (no .d.ts in dist)
// Types derived from SDK source inspection at /Users/aaa/projects/ClankerSDK-2026/src/

declare module 'clanker-sdk' {
  export type ClankerTokenV4 = {
    name: string;
    symbol: string;
    image?: string;
    chainId?: number;
    salt?: `0x${string}`;
    tokenAdmin: `0x${string}`;
    metadata?: {
      description?: string;
      socialMediaUrls?: Array<{ platform: string; url: string }>;
      auditUrls?: string[];
    };
    context?: {
      interface?: string;
      platform?: string;
      messageId?: string;
      id?: string;
    };
    pool?: {
      pairedToken?: `0x${string}` | 'WETH';
      tickIfToken0IsClanker?: number;
      tickSpacing?: number;
      positions?: Array<{ tickLower: number; tickUpper: number; positionBps: number }>;
    };
    locker?: {
      locker?: 'Locker' | `0x${string}`;
      lockerData?: `0x${string}`;
    };
    vault?: {
      percentage: number;
      lockupDuration: number;
      vestingDuration?: number;
      recipient?: `0x${string}`;
    };
    airdrop?: {
      admin?: `0x${string}`;
      merkleRoot: `0x${string}`;
      lockupDuration: number;
      vestingDuration?: number;
      amount: number;
    };
    devBuy?: {
      ethAmount: number;
      poolKey?: {
        currency0: `0x${string}`;
        currency1: `0x${string}`;
        fee: number;
        tickSpacing: number;
        hooks: `0x${string}`;
      };
      amountOutMin?: number;
      recipient?: `0x${string}`;
    };
    fees?: (
      | { type: 'static'; clankerFee: number; pairedFee: number }
      | {
          type: 'dynamic';
          baseFee: number;
          maxFee: number;
          referenceTickFilterPeriod: number;
          resetPeriod: number;
          resetTickFilter: number;
          feeControlNumerator: number;
          decayFilterBps: number;
        }
    );
    sniperFees?: {
      startingFee: number;
      endingFee: number;
      secondsToDecay: number;
    };
    rewards?: {
      recipients: Array<{
        admin: `0x${string}`;
        recipient: `0x${string}`;
        bps: number;
        token: 'Both' | 'Clanker' | 'Paired';
      }>;
    };
    presale?: { bps: number };
    vanity?: boolean;
    poolExtension?: {
      address: `0x${string}`;
      initData: `0x${string}`;
    };
  };

  export const POOL_POSITIONS: Record<string, Array<{
    tickLower: number;
    tickUpper: number;
    positionBps: number;
  }>>;

  export function getTickFromMarketCap(marketCap: number): {
    pairedToken: 'WETH';
    tickIfToken0IsClanker: number;
  };

  export function clankerConfigFor(
    chainId: number,
    type: string
  ): {
    address: `0x${string}`;
    chainId: number;
    type: string;
    related: {
      locker: `0x${string}`;
      vault: `0x${string}`;
      airdrop: `0x${string}`;
      devbuy: `0x${string}`;
      mevModule: `0x${string}`;
      feeLocker: `0x${string}`;
      feeStaticHook: `0x${string}`;
      feeDynamicHook: `0x${string}`;
      mevModuleV2?: `0x${string}`;
      feeStaticHookV2?: `0x${string}`;
      feeDynamicHookV2?: `0x${string}`;
    };
  } | undefined;
}

declare module 'clanker-sdk/v4' {
  import type { PublicClient, WalletClient, Chain, Transport, Account } from 'viem';
  import type { ClankerTokenV4 } from 'clanker-sdk';

  export class Clanker {
    constructor(opts: {
      publicClient?: PublicClient;
      wallet?: WalletClient<Transport, Chain, Account>;
    });

    deploy(token: ClankerTokenV4, options?: { dataSuffix?: `0x${string}` }): Promise<
      | {
          txHash: `0x${string}`;
          waitForTransaction: () => Promise<
            | { address: `0x${string}`; error?: undefined }
            | { address?: undefined; error: { message: string } }
          >;
          error?: undefined;
        }
      | { txHash?: undefined; waitForTransaction?: undefined; error: { message: string } }
    >;

    deploySimulate(token: ClankerTokenV4, account?: unknown): Promise<unknown>;

    availableRewards(params: {
      token: `0x${string}`;
      rewardRecipient: `0x${string}`;
    }): Promise<bigint>;

    claimRewards(params: {
      token: `0x${string}`;
      rewardRecipient: `0x${string}`;
    }): Promise<
      | { txHash: `0x${string}`; error?: undefined }
      | { txHash?: undefined; error: { message: string } }
    >;
  }
}
