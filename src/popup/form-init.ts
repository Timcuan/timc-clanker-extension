import type { DeployFormState, ScrapedData } from '../lib/messages.js';
import type { ExtensionConfig } from '../lib/storage.js';
import { generateSymbol } from '../lib/symbol.js';

export function buildInitialFormState(
  config: ExtensionConfig,
  scraped: ScrapedData
): DeployFormState {
  const tokenAdmin = config.tokenAdmin;
  const defaultRewards = config.defaultRewards.length > 0
    ? config.defaultRewards
    : [{ admin: tokenAdmin, recipient: tokenAdmin, bps: 10000, token: 'Both' as const }];

  return {
    name: scraped.name || 'Unnamed Token',
    symbol: scraped.symbol || generateSymbol(scraped.name || '') || 'TOKEN',
    description: scraped.description || 'Deployed with Clanker',
    imageUrl: scraped.imageUrl || '',
    socials: scraped.socials || {},
    chainId: scraped.detectedChainId ?? config.defaultChain,
    pairedToken: config.defaultPairedToken,
    poolPreset: config.defaultPoolPreset,
    marketCap: config.defaultMarketCap,
    feeType: config.defaultFeeType,
    staticClankerFeeBps: config.defaultStaticClankerFeeBps,
    staticPairedFeeBps: config.defaultStaticPairedFeeBps,
    dynamicBaseBps: config.defaultDynamicBaseBps,
    dynamicMaxBps: config.defaultDynamicMaxBps,
    sniperEnabled: config.defaultSniperEnabled,
    sniperStartingFee: config.sniperStartingFee,
    sniperEndingFee: config.sniperEndingFee,
    sniperSecondsToDecay: config.sniperSecondsToDecay,
    vaultEnabled: false,
    vaultSupplyPct: 10,
    vaultLockupDays: 30,
    vaultVestingDays: 0,
    vaultRecipient: '',
    devBuyEnabled: false,
    devBuyAmount: '0.05',
    devBuyRecipient: '',
    airdropEnabled: false,
    airdropMerkleRoot: '',
    airdropAmount: '',
    airdropLockupDays: 0,
    airdropVestingDays: 0,
    rewards: defaultRewards,
    tokenAdmin,
    vanityEnabled: false,
    customSalt: '',
    simulateBeforeDeploy: true,
    ghostMode: false,
    ghostTargetAddress: '',
    ghostYourShareBps: 9900,
  };
}
