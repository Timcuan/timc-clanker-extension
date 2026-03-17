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
