// src/popup/App.tsx
import { useState, useEffect } from 'preact/hooks';
import type { ScrapedData, DeployFormState, BatchDeployResult } from '../lib/messages.js';
import { storage, CONFIG_DEFAULTS } from '../lib/storage.js';
import { bgSend } from '../lib/bg-send.js';
import { buildInitialFormState } from './form-init.js';
import { FormView } from './views/FormView.js';
import { ConfirmView } from './views/ConfirmView.js';
import { PendingView } from './views/PendingView.js';
import { SuccessView } from './views/SuccessView.js';
import { HistoryView } from './views/HistoryView.js';
import { BatchView } from './views/BatchView.js';

export type AppView = 'loading' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';

export interface AppState {
  view: AppView;
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  deployError?: string;
  chainId: number;
  vaultWallets: Array<{ id: string; name: string; active: boolean }>;
  batchWalletIds?: string[];
  batchWalletNames?: Record<string, string>;
  pickMode: boolean;  // element picker active
  activeTabId?: number;
}

const EMPTY_SCRAPED: ScrapedData = { name: '', symbol: '', socials: {} };

export function App() {
  const [state, setState] = useState<AppState>({
    view: 'loading',
    form: buildInitialFormState(CONFIG_DEFAULTS, EMPTY_SCRAPED),
    scraped: EMPTY_SCRAPED,
    imageStatus: 'idle',
    chainId: 8453,
    vaultWallets: [],
    pickMode: false,
  });

  useEffect(() => {
    init();

    // ── Pick result relay via chrome.storage.session ────────
    // content script → storage.session → popup (runtime.sendMessage can't reach popup in MV3)
    const storageHandler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !changes.__clanker_pick) return;
      const val: any = changes.__clanker_pick.newValue;
      if (!val) return;

      if (val.cancelled) {
        setState(prev => ({ ...prev, pickMode: false }));
      } else if (val.data) {
        const picked: ScrapedData = val.data;
        setState(prev => ({
          ...prev,
          pickMode: false,
          form: {
            ...prev.form,
            name: picked.name || prev.form.name,
            description: picked.description || prev.form.description,
            imageUrl: picked.imageUrl || prev.form.imageUrl,
          },
          scraped: { ...prev.scraped, ...picked },
        }));
        if (picked.imageUrl && !picked.imageUrl.startsWith('ipfs://')) {
          uploadImage(picked.imageUrl);
        }
      }
      // Clear the key so next pick works
      chrome.storage.session.remove('__clanker_pick');
    };
    chrome.storage.onChanged.addListener(storageHandler);
    return () => chrome.storage.onChanged.removeListener(storageHandler);
  }, []);

  async function init() {
    const config = await storage.get();
    const vaultWallets = config.vaultEntries.map(e => ({ id: e.id, name: e.name, active: e.active }));

    // Scrape active tab — use lastFocusedWindow so this works in detached window too
    let scraped: ScrapedData = EMPTY_SCRAPED;
    let activeTabId: number | undefined;
    try {
      // Try lastFocusedWindow first (works in detached popup), fallback to WINDOW_ID_NONE
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs.find(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')) ?? tabs[0];
      activeTabId = tab?.id;
      if (tab?.id) {
        scraped = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE' });
      }
    } catch { /* no content script or restricted tab */ }

    const form = buildInitialFormState(config, scraped);
    const chainId = scraped.detectedChainId ?? config.defaultChain;

    setState(prev => ({
      ...prev,
      view: 'form',
      form: { ...form, chainId },
      scraped,
      vaultWallets,
      activeTabId,
    }));

    // Pre-upload image in background
    if (scraped.imageUrl && !scraped.imageUrl.startsWith('ipfs://')) {
      uploadImage(scraped.imageUrl);
    }
  }

  function uploadImage(url: string) {
    setState(prev => ({ ...prev, imageStatus: 'uploading' }));
    bgSend({ type: 'UPLOAD_IMAGE', url })
      .then(res => {
        if ('error' in res) throw new Error((res as any).error);
        setState(prev => ({
          ...prev,
          form: { ...prev.form, imageUrl: (res as any).ipfsUrl },
          imageStatus: 'done',
        }));
      })
      .catch(e => {
        setState(prev => ({ ...prev, imageStatus: 'error', imageError: (e as Error).message }));
      });
  }

  async function enterPickMode() {
    const { activeTabId } = state;
    if (!activeTabId) return;
    try {
      await chrome.tabs.sendMessage(activeTabId, { type: 'ENTER_PICK_MODE' });
      setState(prev => ({ ...prev, pickMode: true }));
    } catch {
      // Content script not available on this tab
    }
  }

  async function exitPickMode() {
    const { activeTabId } = state;
    if (activeTabId) {
      try { await chrome.tabs.sendMessage(activeTabId, { type: 'EXIT_PICK_MODE' }); } catch {}
    }
    setState(prev => ({ ...prev, pickMode: false }));
  }

  function updateForm(patch: Partial<DeployFormState>) {
    setState(prev => ({ ...prev, form: { ...prev.form, ...patch } }));
  }

  async function onDeploy() {
    setState(prev => ({ ...prev, deployError: undefined, view: 'confirm' }));
  }

  async function onConfirm() {
    setState(prev => ({ ...prev, view: 'pending', deployError: undefined }));

    const res = await bgSend({
      type: 'DEPLOY',
      payload: { form: state.form, scraped: state.scraped },
    });
    if ('error' in res) {
      setState(prev => ({ ...prev, view: 'form', deployError: (res as any).error }));
      return;
    }
    const { txHash, tokenAddress } = res as { txHash: `0x${string}`; tokenAddress: `0x${string}` };
    setState(prev => ({ ...prev, view: 'success', txHash, tokenAddress }));
  }

  function onBack() { setState(prev => ({ ...prev, view: 'form' })); }

  function onDeployAnother() {
    setState(prev => ({
      ...prev,
      view: 'form',
      txHash: undefined,
      tokenAddress: undefined,
      deployError: undefined,
    }));
  }

  function onBatchDeploy(walletIds: string[], walletNames: Record<string, string>) {
    setState(prev => ({ ...prev, view: 'batch', batchWalletIds: walletIds, batchWalletNames: walletNames }));
  }

  // ── Loading ──────────────────────────────────────────────
  if (state.view === 'loading') {
    return (
      <div class="view-body" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div class="spinner-lg" style={{ margin: '0 auto 14px' }} />
        <p style={{ color: 'var(--text-2)', fontSize: '12px' }}>Loading…</p>
      </div>
    );
  }

  if (state.view === 'history') return <HistoryView onBack={onBack} />;

  if (state.view === 'confirm') {
    return <ConfirmView form={state.form} onBack={onBack} onConfirm={onConfirm} />;
  }

  if (state.view === 'pending') {
    return <PendingView txHash={state.txHash} chainId={state.form.chainId} />;
  }

  if (state.view === 'success') {
    return (
      <SuccessView
        tokenAddress={state.tokenAddress!}
        txHash={state.txHash!}
        chainId={state.form.chainId}
        name={state.form.name}
        symbol={state.form.symbol}
        onDeployAnother={onDeployAnother}
      />
    );
  }

  if (state.view === 'batch') {
    return (
      <BatchView
        payload={{ form: state.form, scraped: state.scraped }}
        walletIds={state.batchWalletIds!}
        walletNames={state.batchWalletNames!}
        chainId={state.form.chainId}
        onComplete={(_results: BatchDeployResult[]) => setState(prev => ({ ...prev, view: 'history' }))}
        onBack={onBack}
      />
    );
  }

  return (
    <FormView
      form={state.form}
      scraped={state.scraped}
      imageStatus={state.imageStatus}
      imageError={state.imageError}
      deployError={state.deployError}
      onFormChange={updateForm}
      onDeploy={onDeploy}
      onHistory={() => setState(prev => ({ ...prev, view: 'history' }))}
      vaultWallets={state.vaultWallets}
      onBatchDeploy={onBatchDeploy}
      pickMode={state.pickMode}
      onPickMode={enterPickMode}
      onCancelPick={exitPickMode}
    />
  );
}
