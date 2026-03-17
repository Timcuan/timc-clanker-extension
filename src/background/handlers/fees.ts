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
  if ('error' in result && result.error) throw new Error(result.error.message);
  return { ok: true };
}
