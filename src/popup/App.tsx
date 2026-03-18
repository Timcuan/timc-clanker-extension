// src/popup/App.tsx
import { useState, useEffect } from 'preact/hooks';
import type { ScrapedData, DeployFormState, BatchDeployResult, FetchState } from '../lib/messages.js';
import { storage, CONFIG_DEFAULTS } from '../lib/storage.js';
import type { ExtensionConfig } from '../lib/storage.js';
import { bgSend } from '../lib/bg-send.js';
import { buildInitialFormState } from './form-init.js';
import { isTab } from './window-utils.js';
import { SourceView } from './views/SourceView.js';
import { PreviewView } from './views/PreviewView.js';
import { FormView } from './views/FormView.js';
import { ConfirmView } from './views/ConfirmView.js';
import { PendingView } from './views/PendingView.js';
import { SuccessView } from './views/SuccessView.js';
import { HistoryView } from './views/HistoryView.js';
import { BatchView } from './views/BatchView.js';

export type AppView =
  | 'source' | 'preview'
  | 'form' | 'confirm' | 'pending' | 'success'
  | 'history' | 'batch';

export interface AppState {
  view: AppView;
  form: DeployFormState;
  scraped: ScrapedData;
  config: ExtensionConfig;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  deployError?: string;
  chainId: number;
  vaultWallets: Array<{ id: string; name: string; active: boolean }>;
  batchWalletIds?: string[];
  batchWalletNames?: Record<string, string>;
  sourceMode?: 'url' | 'image' | 'contract';
  fetchState: FetchState;
}

const EMPTY_SCRAPED: ScrapedData = { name: '', symbol: '', socials: {} };

export function App() {
  const tabMode = isTab();

  const [state, setState] = useState<AppState>({
    view: 'source',
    form: buildInitialFormState(CONFIG_DEFAULTS, EMPTY_SCRAPED),
    scraped: EMPTY_SCRAPED,
    config: CONFIG_DEFAULTS,
    imageStatus: 'idle',
    chainId: 8453,
    vaultWallets: [],
    fetchState: 'idle',
  });

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const config = await storage.get();
    const vaultWallets = config.vaultEntries.map(e => ({
      id: e.id, name: e.name, active: e.active,
    }));
    setState(prev => ({
      ...prev,
      view: 'source',
      config,
      form: buildInitialFormState(config, EMPTY_SCRAPED),
      vaultWallets,
      fetchState: 'idle',
    }));
  }

  // ── Source → Preview ─────────────────────────────────
  function onSourceFetched(scraped: ScrapedData, mode: 'url' | 'image' | 'contract') {
    setState(prev => ({
      ...prev,
      view: 'preview',
      scraped,
      sourceMode: mode,
      fetchState: 'done',
    }));
  }

  // ── Preview → Form (advanced config) ─────────────────
  function onPreviewConfirmAdvanced(scraped: ScrapedData, imageIpfsUrl: string | undefined) {
    setState(prev => ({
      ...prev,
      view: 'form',
      scraped,
      form: {
        ...buildInitialFormState(prev.config, scraped),
        imageUrl: imageIpfsUrl ?? '',
      },
    }));
  }

  // ── Preview → Confirm (quick deploy) ─────────────────
  function onPreviewQuickDeploy(scraped: ScrapedData, imageIpfsUrl: string | undefined) {
    setState(prev => ({
      ...prev,
      view: 'confirm',
      scraped,
      form: {
        ...buildInitialFormState(prev.config, scraped),
        imageUrl: imageIpfsUrl ?? '',
      },
    }));
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
      view: 'source',
      txHash: undefined,
      tokenAddress: undefined,
      deployError: undefined,
      scraped: EMPTY_SCRAPED,
      fetchState: 'idle',
    }));
  }

  function onBatchDeploy(walletIds: string[], walletNames: Record<string, string>) {
    setState(prev => ({ ...prev, view: 'batch', batchWalletIds: walletIds, batchWalletNames: walletNames }));
  }

  // ── Views ─────────────────────────────────────────────
  if (state.view === 'source') {
    return (
      <SourceView
        tabMode={tabMode}
        fetchState={state.fetchState}
        onFetched={onSourceFetched}
        onFetchStateChange={(fs) => setState(prev => ({ ...prev, fetchState: fs }))}
        onStartFromScratch={() => setState(prev => ({ ...prev, view: 'form' }))}
      />
    );
  }

  if (state.view === 'preview') {
    return (
      <PreviewView
        scraped={state.scraped}
        sourceMode={state.sourceMode ?? 'url'}
        onConfirmAdvanced={onPreviewConfirmAdvanced}
        onQuickDeploy={onPreviewQuickDeploy}
        onBack={() => setState(prev => ({ ...prev, view: 'source' }))}
      />
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

  // Default: form view
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
    />
  );
}
