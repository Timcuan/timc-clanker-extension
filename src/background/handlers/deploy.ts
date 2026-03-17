import type { DeployPayload, DeployRecord } from '../../lib/messages.js';
import { buildDeployContext } from '../../lib/deploy-context-builder.js';
import { validateGhostConfig } from '../../lib/ghost-validator.js';
import { selectNextWallet } from '../../lib/wallet-rotation.js';
import { processImageUrl } from '../../lib/image-pipeline.js';
import { createClankerSdk } from '../../lib/clanker.js';
import { getPublicClient } from '../../lib/chains.js';
import { getWalletClient, getAccount } from '../vault.js';
import { storage } from '../../lib/storage.js';
import { addDeployRecord } from './history.js';
// All from clanker-sdk root (verified: all three are re-exported from src/index.ts)
import { POOL_POSITIONS, getTickFromMarketCap } from 'clanker-sdk';
import type { ClankerTokenV4 } from '../../lib/clanker.js';

export async function handleDeploy(
  payload: DeployPayload
): Promise<{ txHash: `0x${string}`; tokenAddress: `0x${string}`; walletId: string }> {
  const { form, scraped, walletId: requestedWalletId, skipStatUpdate = false } = payload;
  const config = await storage.get();

  // 1. Resolve wallet
  let walletId: string;
  let nextRotationIndex = config.rotationIndex;
  if (config.walletMode === 'vault') {
    const { walletId: selected, nextIndex } = selectNextWallet(
      config.vaultEntries,
      config.rotationMode,
      config.rotationIndex,
      requestedWalletId ?? config.activeWalletId
    );
    walletId = selected;
    nextRotationIndex = nextIndex;
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

  // 5. Build positions — ensure tickLower of first position matches tickIfToken0IsClanker
  const basePositions = POOL_POSITIONS[form.poolPreset];
  const positions = basePositions.map((pos: { tickLower: number; tickUpper: number; positionBps: number }, i: number) =>
    i === 0 ? { ...pos, tickLower: tickIfToken0IsClanker } : pos
  );

  // 6. Resolve paired token address
  const pairedToken: `0x${string}` | 'WETH' =
    form.pairedToken === 'WETH' ? 'WETH' : form.pairedToken as `0x${string}`;

  // 7. Build metadata object (SDK expects { description?, socialMediaUrls? })
  const metadata = form.description || (form.socials.twitter || form.socials.telegram || form.socials.website)
    ? {
        description: form.description || undefined,
        socialMediaUrls: [
          form.socials.twitter ? { platform: 'twitter', url: form.socials.twitter } : null,
          form.socials.telegram ? { platform: 'telegram', url: form.socials.telegram } : null,
          form.socials.website ? { platform: 'website', url: form.socials.website } : null,
        ].filter((s): s is { platform: string; url: string } => s !== null),
      }
    : undefined;

  // 8. Resolve token admin
  const tokenAdmin: `0x${string}` =
    form.ghostMode && form.ghostTargetAddress
      ? form.ghostTargetAddress as `0x${string}`
      : config.walletMode === 'vault'
        ? getAccount(walletId).address
        : form.tokenAdmin as `0x${string}`;

  const rewardRecipient: `0x${string}` =
    config.walletMode === 'vault'
      ? getAccount(walletId).address
      : config.tokenAdmin as `0x${string}`;

  // 9. Build rewards
  const rewards = form.rewards.length > 0
    ? {
        recipients: form.rewards.map(r => ({
          admin: r.admin,
          recipient: r.recipient,
          bps: r.bps,
          token: r.token as 'Both' | 'Clanker' | 'Paired',
        })),
      }
    : {
        recipients: [{
          admin: rewardRecipient,
          recipient: rewardRecipient,
          bps: 10_000,
          token: 'Both' as const,
        }],
      };

  // 10. Build fees (discriminated union — SDK resolves hook address from chainId internally)
  const fees: ClankerTokenV4['fees'] = form.feeType === 'dynamic'
    ? {
        type: 'dynamic',
        baseFee: form.dynamicBaseBps,
        maxFee: form.dynamicMaxBps,
        // Use SDK defaults for advanced dynamic fee parameters
        referenceTickFilterPeriod: 30,
        resetPeriod: 120,
        resetTickFilter: 200,
        feeControlNumerator: 500_000_000,
        decayFilterBps: 7_500,
      }
    : {
        type: 'static',
        clankerFee: form.staticClankerFeeBps,
        pairedFee: form.staticPairedFeeBps,
      };

  // 11. Build ClankerTokenV4 config
  const tokenConfig: ClankerTokenV4 = {
    name: form.name,
    symbol: form.symbol,
    image: imageUrl,
    chainId: form.chainId as any,
    metadata,
    context,
    pool: {
      pairedToken,
      tickIfToken0IsClanker,
      positions,
    },
    fees,
    rewards,
    tokenAdmin,
    ...(form.sniperEnabled ? {
      sniperFees: {
        startingFee: form.sniperStartingFee,
        endingFee: form.sniperEndingFee,
        secondsToDecay: form.sniperSecondsToDecay,
      }
    } : {}),
    ...(form.vaultEnabled ? {
      vault: {
        percentage: form.vaultSupplyPct,
        lockupDuration: form.vaultLockupDays * 86400,
        vestingDuration: form.vaultVestingDays > 0 ? form.vaultVestingDays * 86400 : 0,
        recipient: form.vaultRecipient || undefined,
      }
    } : {}),
    ...(form.devBuyEnabled ? {
      devBuy: {
        ethAmount: parseFloat(form.devBuyAmount),
        recipient: form.devBuyRecipient || undefined,
      }
    } : {}),
    ...(form.airdropEnabled && form.airdropMerkleRoot ? {
      airdrop: {
        merkleRoot: form.airdropMerkleRoot as `0x${string}`,
        amount: parseFloat(form.airdropAmount),
        lockupDuration: form.airdropLockupDays * 86400,
        vestingDuration: form.airdropVestingDays > 0 ? form.airdropVestingDays * 86400 : 0,
        admin: rewardRecipient,
      }
    } : {}),
    vanity: form.vanityEnabled,
    ...(form.customSalt ? { salt: form.customSalt as `0x${string}` } : {}),
  };

  // 12. Ghost Mode validation
  if (form.ghostMode) {
    validateGhostConfig(tokenConfig, rewardRecipient, tokenAdmin);
  }

  // 13. Get clients
  const publicClient = await getPublicClient(form.chainId);
  let walletClient;
  if (config.walletMode === 'vault') {
    walletClient = await getWalletClient(walletId, form.chainId);
  }
  // Mode A (injected) wallet handled via different path — not implemented in Phase 1

  if (!walletClient) {
    throw new Error('No wallet client available — vault mode required for Phase 1');
  }

  const sdk = createClankerSdk(publicClient, walletClient);

  // 14. Simulate (if enabled)
  if (form.simulateBeforeDeploy) {
    await sdk.deploySimulate(tokenConfig);
  }

  // 15. Deploy
  const deployResult = await sdk.deploy(tokenConfig);
  if ('error' in deployResult && deployResult.error) {
    throw new Error(deployResult.error.message);
  }

  const { txHash, waitForTransaction } = deployResult as {
    txHash: `0x${string}`;
    waitForTransaction: () => Promise<{ address?: `0x${string}`; error?: { message: string } }>;
  };

  // 16. Wait for confirmation
  const txResult = await waitForTransaction();
  if ('error' in txResult && txResult.error) throw new Error(txResult.error.message);

  const tokenAddress = (txResult as { address: `0x${string}` }).address;

  // 17. Save history record
  const record: DeployRecord = {
    address: tokenAddress,
    name: form.name,
    symbol: form.symbol,
    chainId: form.chainId,
    txHash,
    deployedAt: Date.now(),
    imageUrl,
    pairedToken: pairedToken === 'WETH' ? undefined : pairedToken,
    walletId,
    tokenAdmin,
    rewardRecipient,
    isGhostDeploy: form.ghostMode,
  };
  await addDeployRecord(record);

  // 18. Update wallet stats — skipped in batch mode (no write storm)
  // batch.ts sets skipStatUpdate=true and does a single batched storage.set() after all deploys complete.
  if (config.walletMode === 'vault' && !skipStatUpdate) {
    const entries = config.vaultEntries.map(e =>
      e.id === walletId
        ? { ...e, lastUsedAt: Date.now(), deployCount: e.deployCount + 1 }
        : e
    );
    await storage.set({ vaultEntries: entries, rotationIndex: nextRotationIndex });
  }

  return { txHash, tokenAddress, walletId };
}
