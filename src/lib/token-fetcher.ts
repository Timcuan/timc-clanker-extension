// src/lib/token-fetcher.ts
// Fetch token metadata from a contract address.
// Strategy: Clanker API + on-chain RPC run in parallel; results merged.

import { isAddress } from 'viem';
import type { ScrapedData } from './messages.js';
import { getPublicClient } from './chains.js';

const erc20Abi = [
  { name: 'name',   type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
  { name: 'symbol', type: 'function', inputs: [], outputs: [{ type: 'string' }], stateMutability: 'view' },
] as const;

export async function fetchToken(
  address: `0x${string}`,
  chainId: number
): Promise<ScrapedData> {
  if (!isAddress(address)) throw new Error('Invalid contract address');

  // Session cache (10 min effective)
  const cacheKey = `token:${chainId}:${address.toLowerCase()}`;
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;
  } catch { /* unavailable in tests */ }

  // Run both fetches in parallel — each has its own timeout
  const [clankerRes, rpcRes] = await Promise.allSettled([
    withTimeout(fetchClankerApi(address), 1500),
    withTimeout(fetchOnchainRpc(address, chainId), 5000),
  ]);

  const clanker = clankerRes.status === 'fulfilled' ? clankerRes.value : null;
  const rpc     = rpcRes.status    === 'fulfilled' ? rpcRes.value    : null;

  if (!clanker && !rpc) throw new Error('Token not found on any source');

  const result: ScrapedData = {
    // RPC name/symbol preferred (on-chain is authoritative for these fields)
    name:            rpc?.name        || clanker?.name   || '',
    symbol:          rpc?.symbol      || clanker?.symbol || '',
    // Rich metadata only from Clanker API
    description:     clanker?.description,
    imageUrl:        clanker?.imageUrl,
    socials:         clanker?.socials ?? {},
    detectedChainId: clanker?.detectedChainId ?? chainId,
    source:          'generic',
  };

  try {
    await chrome.storage.session.set({ [cacheKey]: result });
  } catch { /* ignore */ }

  return result;
}

async function fetchClankerApi(address: `0x${string}`): Promise<Partial<ScrapedData & { detectedChainId: number }>> {
  const url = `https://www.clanker.world/api/tokens?contract_address=${address}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!res.ok) throw new Error(`Clanker API ${res.status}`);
  const body = await res.json();

  // Handle both response shapes: { data: [...] }, [...], or single object
  const token = Array.isArray(body?.data) ? body.data[0]
              : Array.isArray(body)        ? body[0]
              : body?.data                 ?? body;

  if (!token?.name) throw new Error('Token not found in Clanker API');

  return {
    name:            token.name,
    symbol:          token.symbol,
    imageUrl:        token.img_url ?? undefined,
    detectedChainId: token.chain_id,
    description:     token.metadata?.description,
    socials: {
      twitter: token.metadata?.socialMediaUrls?.twitter,
      website: token.metadata?.socialMediaUrls?.website,
    },
  };
}

async function fetchOnchainRpc(
  address: `0x${string}`,
  chainId: number
): Promise<Pick<ScrapedData, 'name' | 'symbol'>> {
  const client = await getPublicClient(chainId);
  const [nameRes, symbolRes] = await (client as any).multicall({
    contracts: [
      { address, abi: erc20Abi, functionName: 'name'   },
      { address, abi: erc20Abi, functionName: 'symbol' },
    ],
    allowFailure: true,
  });
  return {
    name:   nameRes?.status   === 'success' ? String(nameRes.result)   : '',
    symbol: symbolRes?.status === 'success' ? String(symbolRes.result) : '',
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}
