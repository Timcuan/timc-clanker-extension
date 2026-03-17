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
