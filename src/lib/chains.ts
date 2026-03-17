import { createPublicClient, http, type Chain, type PublicClient } from 'viem';
import { base, mainnet, arbitrum, unichain } from 'viem/chains';

// Custom Monad mainnet chain (chainId 143)
// No public RPC available — user must configure in Options
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
