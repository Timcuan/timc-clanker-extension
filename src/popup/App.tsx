// src/popup/App.tsx
import { useState, useEffect } from 'preact/hooks';
import type { ScrapedData, DeployFormState, DeployRecord } from '../lib/messages.js';
import { storage, CONFIG_DEFAULTS } from '../lib/storage.js';
import { bgSend } from '../lib/bg-send.js';
import { buildInitialFormState } from './form-init.js';
import { FormView } from './views/FormView.js';
import { ConfirmView } from './views/ConfirmView.js';
import { PendingView } from './views/PendingView.js';
import { SuccessView } from './views/SuccessView.js';
import { HistoryView } from './views/HistoryView.js';

export type AppView = 'loading' | 'form' | 'confirm' | 'pending' | 'success' | 'history';

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
}

const EMPTY_SCRAPED: ScrapedData = { name: '', symbol: '', socials: {} };

export function App() {
  const [state, setState] = useState<AppState>({
    view: 'loading',
    form: buildInitialFormState(CONFIG_DEFAULTS, EMPTY_SCRAPED),
    scraped: EMPTY_SCRAPED,
    imageStatus: 'idle',
    chainId: 8453,
  });

  useEffect(() => {
    init();
  }, []);

  async function init() {
    // 1. Load config
    const config = await storage.get();

    // 2. Scrape current tab (direct to content script)
    let scraped: ScrapedData = EMPTY_SCRAPED;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        scraped = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE' });
      }
    } catch { /* no content script on this tab */ }

    // 3. Build form state
    const form = buildInitialFormState(config, scraped);
    const chainId = scraped.detectedChainId ?? config.defaultChain;

    setState(prev => ({ ...prev, view: 'form', form: { ...form, chainId }, scraped }));

    // 4. Pre-upload image in background
    if (scraped.imageUrl && !scraped.imageUrl.startsWith('ipfs://')) {
      setState(prev => ({ ...prev, imageStatus: 'uploading' }));
      bgSend({ type: 'UPLOAD_IMAGE', url: scraped.imageUrl! })
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

  function onBack() {
    setState(prev => ({ ...prev, view: 'form' }));
  }

  function onDeployAnother() {
    setState(prev => ({
      ...prev,
      view: 'form',
      txHash: undefined,
      tokenAddress: undefined,
      deployError: undefined,
    }));
  }

  if (state.view === 'loading') {
    return (
      <div class="view-body" style={{ textAlign: 'center', paddingTop: '60px' }}>
        <div class="spinner" />
        <p style={{ marginTop: '12px', color: 'var(--text-dim)' }}>Loading...</p>
      </div>
    );
  }

  if (state.view === 'history') {
    return <HistoryView onBack={() => setState(prev => ({ ...prev, view: 'form' }))} />;
  }

  if (state.view === 'confirm') {
    return (
      <ConfirmView
        form={state.form}
        onBack={onBack}
        onConfirm={onConfirm}
      />
    );
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
    />
  );
}
