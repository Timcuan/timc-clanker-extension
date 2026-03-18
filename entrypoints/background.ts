import { handleDeploy } from '../src/background/handlers/deploy.js';
import { getAvailableRewards, claimRewards } from '../src/background/handlers/fees.js';
import { getHistory } from '../src/background/handlers/history.js';
import { processImageUrl, processImageBlob } from '../src/lib/image-pipeline.js';
import { unlockVault, lockVault, isUnlocked, getActiveIds } from '../src/background/vault.js';
import type { BgMessage } from '../src/lib/messages.js';
import { storage } from '../src/lib/storage.js';
import { fetchFromUrl } from '../src/lib/url-fetcher.js';
import { fetchToken } from '../src/lib/token-fetcher.js';

export default defineBackground(() => {
  // Keepalive — prevents SW death during 45-60s deploys
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((_alarm) => { /* no-op */ });

  // Tab registration for Mode A wallet bridge
  let activeTabId: number | undefined;

  chrome.runtime.onMessage.addListener((msg: BgMessage, sender, sendResponse) => {
    // Tab registration from content script
    if ((msg as any).type === 'REGISTER_TAB') {
      activeTabId = sender.tab?.id;
      sendResponse({ ok: true });
      return true;
    }

    handleMessage(msg, activeTabId).then(sendResponse).catch(e => {
      sendResponse({ error: (e as Error).message });
    });
    return true; // keep channel open for async response
  });

  // Batch deploy via Port API
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'batch-deploy') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'BATCH_DEPLOY') return;
      const { runBatchDeploy } = await import('../src/background/handlers/batch.js');
      await runBatchDeploy(msg, port);
    });
  });
});

async function handleMessage(msg: BgMessage, activeTabId?: number): Promise<unknown> {
  switch (msg.type) {
    case 'DEPLOY':
      return handleDeploy(msg.payload);

    case 'UPLOAD_IMAGE':
      return { ipfsUrl: await processImageUrl(msg.url) };

    case 'UPLOAD_IMAGE_BLOB':
      return { ipfsUrl: await processImageBlob(msg.data, msg.filename) };

    case 'GET_AVAILABLE_REWARDS':
      return getAvailableRewards(msg.token, msg.recipient, msg.chainId);

    case 'CLAIM_REWARDS': {
      const config = await storage.get();
      const walletId = config.activeWalletId ?? config.vaultEntries.find(e => e.active)?.id ?? '';
      return claimRewards(msg.token, msg.recipient, msg.chainId, walletId);
    }

    case 'GET_HISTORY':
      return getHistory();

    case 'WALLET_PING':
      if (!activeTabId) return { error: 'Wallet bridge not ready — reload the page' };
      return new Promise(resolve => {
        chrome.tabs.sendMessage(activeTabId!, { type: 'WALLET_PING' }, resolve);
      });

    case 'WALLET_REQUEST':
      if (!activeTabId) return { error: 'Wallet bridge not ready — reload the page' };
      return new Promise(resolve => {
        chrome.tabs.sendMessage(activeTabId!, { type: 'WALLET_REQUEST', request: msg.request }, resolve);
      });

    case 'UNLOCK_VAULT':
      await unlockVault(msg.password);
      return { ok: true };

    case 'LOCK_VAULT':
      lockVault();
      return { ok: true };

    case 'VAULT_STATUS': {
      const cfg = await storage.get();
      return {
        unlocked: isUnlocked(),
        walletCount: cfg.vaultEntries.length,
        activeIds: getActiveIds(),
      };
    }

    // ADD_WALLET: encryption happens in SW so plaintext PK never lives in popup heap
    case 'ADD_WALLET': {
      const { encryptPrivateKey } = await import('../src/background/crypto.js');
      const { privateKeyToAccount } = await import('viem/accounts');
      const { encryptedPK, iv, salt } = await encryptPrivateKey(msg.plainPk, msg.password);
      const account = privateKeyToAccount(msg.plainPk as `0x${string}`);
      const entry = {
        id: crypto.randomUUID(), name: msg.name, address: account.address,
        encryptedPK, iv, salt, createdAt: Date.now(), lastUsedAt: 0, deployCount: 0, active: true,
      };
      const cfg = await storage.get();
      await storage.set({ vaultEntries: [...cfg.vaultEntries, entry] });
      return { ok: true, address: account.address };
    }

    case 'REMOVE_WALLET': {
      const cfg = await storage.get();
      await storage.set({ vaultEntries: cfg.vaultEntries.filter(e => e.id !== msg.id) });
      return { ok: true };
    }

    case 'FETCH_URL': {
      const { url } = msg;
      return fetchFromUrl(url);
    }

    case 'FETCH_TOKEN': {
      const { address, chainId } = msg;
      return fetchToken(address, chainId);
    }

    default:
      return { error: `Unknown message type: ${(msg as any).type}` };
  }
}
