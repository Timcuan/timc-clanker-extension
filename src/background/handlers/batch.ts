import type { DeployPayload, BatchDeployResult, SwEvent } from '../../lib/messages.js';
import { handleDeploy } from './deploy.js';
import { storage } from '../../lib/storage.js';

interface BatchDeployMsg {
  type: 'BATCH_DEPLOY';
  payload: DeployPayload;
  walletIds: string[];
}

export async function runBatchDeploy(
  msg: BatchDeployMsg,
  port: chrome.runtime.Port
): Promise<void> {
  const { payload, walletIds } = msg;
  const batchId = crypto.randomUUID();

  // Persist batch state for crash recovery
  await storage.set({
    pendingBatch: {
      batchId,
      walletIds,
      payload,
      completedIds: [],
      startedAt: Date.now(),
    },
  });

  const results: BatchDeployResult[] = [];
  const config = await storage.get();
  const walletNames = Object.fromEntries(
    config.vaultEntries.map(e => [e.id, e.name])
  );

  for (let i = 0; i < walletIds.length; i++) {
    const walletId = walletIds[i];

    const progress: SwEvent = {
      type: 'BATCH_PROGRESS',
      walletId,
      index: i,
      total: walletIds.length,
      status: 'deploying',
    };
    port.postMessage(progress);

    try {
      // Randomize salt per wallet deploy
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      const walletPayload: DeployPayload = {
        ...payload,
        form: { ...payload.form, customSalt: `0x${salt}`, vanityEnabled: false },
        walletId,
        skipStatUpdate: true,  // batch defers stat writes
      };

      const { txHash, tokenAddress } = await handleDeploy(walletPayload);

      const successEvent: SwEvent = {
        type: 'BATCH_PROGRESS',
        walletId,
        index: i,
        total: walletIds.length,
        status: 'success',
        txHash,
        tokenAddress,
      };
      port.postMessage(successEvent);

      results.push({
        walletId,
        walletName: walletNames[walletId] ?? walletId,
        status: 'success',
        txHash,
        tokenAddress,
      });

      // Update crash recovery checkpoint
      const current = await storage.get();
      if (current.pendingBatch) {
        await storage.set({
          pendingBatch: {
            ...current.pendingBatch,
            completedIds: [...current.pendingBatch.completedIds, walletId],
          },
        });
      }
    } catch (e) {
      const error = (e as Error).message;
      const failEvent: SwEvent = {
        type: 'BATCH_PROGRESS',
        walletId,
        index: i,
        total: walletIds.length,
        status: 'failed',
        error,
      };
      port.postMessage(failEvent);
      results.push({
        walletId,
        walletName: walletNames[walletId] ?? walletId,
        status: 'failed',
        error,
      });
    }

    // 500ms gap between deploys
    if (i < walletIds.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Batch write all vault stat updates in a single storage.set() call
  const successWalletIds = results.filter(r => r.status === 'success').map(r => r.walletId);
  if (successWalletIds.length > 0) {
    const current = await storage.get();
    const now = Date.now();
    const updatedEntries = current.vaultEntries.map(e => {
      const useCount = successWalletIds.filter(id => id === e.id).length;
      if (useCount === 0) return e;
      return { ...e, lastUsedAt: now, deployCount: e.deployCount + useCount };
    });
    await storage.set({
      vaultEntries: updatedEntries,
      rotationIndex: current.rotationIndex + successWalletIds.length,
      pendingBatch: undefined,
    });
  } else {
    await storage.set({ pendingBatch: undefined });
  }

  const completeEvent: SwEvent = { type: 'BATCH_COMPLETE', results };
  port.postMessage(completeEvent);
}
