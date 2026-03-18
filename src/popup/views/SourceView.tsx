// src/popup/views/SourceView.tsx
import { useState } from 'preact/hooks';
import type { ScrapedData, FetchState } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';
import { openAsTab } from '../window-utils.js';

interface Props {
  tabMode: boolean;
  fetchState: FetchState;
  onFetched: (scraped: ScrapedData, mode: 'url' | 'image' | 'contract') => void;
  onFetchStateChange: (state: FetchState) => void;
  onStartFromScratch: () => void;
}

type Panel = 'url' | 'image' | 'contract' | null;

const CHAIN_OPTIONS = (Object.entries(CHAIN_CONFIG) as [string, any][]).map(([id, cfg]) => ({
  id: Number(id),
  name: cfg.name as string,
}));

const FETCH_LABELS: Partial<Record<FetchState, string>> = {
  'fetching-fast':   'Reading page…',
  'fetching-tab':    'Opening tab…',
  'fetching-api':    'Fetching from Clanker…',
  'fetching-rpc':    'Reading on-chain…',
  'uploading-image': 'Uploading image…',
};

export function SourceView({ tabMode, fetchState, onFetched, onFetchStateChange, onStartFromScratch }: Props) {
  const [open, setOpen] = useState<Panel>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const [contractInput, setContractInput] = useState('');
  const [contractError, setContractError] = useState('');
  const [contractChain, setContractChain] = useState(8453);

  const loading = fetchState !== 'idle' && fetchState !== 'done' && fetchState !== 'error';

  function toggle(panel: Panel) {
    setOpen(o => o === panel ? null : panel);
  }

  async function handleUrlFetch() {
    setUrlError('');
    let parsed: URL;
    try { parsed = new URL(urlInput); } catch {
      setUrlError('Enter a valid URL (e.g. https://x.com/…)');
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      setUrlError('Only http/https URLs are supported');
      return;
    }
    onFetchStateChange('fetching-fast');
    try {
      const res = await bgSend({ type: 'FETCH_URL', url: urlInput });
      if ('error' in res) throw new Error((res as any).error);
      onFetched(res as ScrapedData, 'url');
    } catch (e) {
      onFetchStateChange('error');
      setUrlError((e as Error).message || 'Failed to fetch page');
    }
  }

  async function handleContractFetch() {
    setContractError('');
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractInput)) {
      setContractError('Enter a valid 0x address (40 hex characters)');
      return;
    }
    onFetchStateChange('fetching-api');
    try {
      const res = await bgSend({
        type: 'FETCH_TOKEN',
        address: contractInput as `0x${string}`,
        chainId: contractChain,
      });
      if ('error' in res) throw new Error((res as any).error);
      onFetched(res as ScrapedData, 'contract');
    } catch (e) {
      onFetchStateChange('error');
      setContractError((e as Error).message || 'Failed to fetch token');
    }
  }

  function readAndUploadFile(file: File) {
    if (!file.type.startsWith('image/')) { alert('Only image files are supported'); return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5MB'); return; }
    onFetchStateChange('uploading-image');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await bgSend({
          type: 'UPLOAD_IMAGE_BLOB',
          data: reader.result as ArrayBuffer,
          filename: file.name,
        });
        if ('error' in res) throw new Error((res as any).error);
        const ipfsUrl = (res as any).ipfsUrl as string;
        onFetched({
          name: '',
          symbol: '',
          imageUrl: ipfsUrl,
          socials: {},
          source: 'generic',
        }, 'image');
      } catch (e) {
        onFetchStateChange('error');
        alert((e as Error).message || 'Upload failed');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileInput(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) readAndUploadFile(file);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) readAndUploadFile(file);
  }

  const urlLabel = loading && open === 'url'
    ? (FETCH_LABELS[fetchState] ?? 'Fetching…')
    : 'Fetch Metadata →';
  const contractLabel = loading && open === 'contract'
    ? (FETCH_LABELS[fetchState] ?? 'Fetching…')
    : 'Fetch Token Info →';

  return (
    <div class="view-body source-view">
      <div style={{ padding: '20px 16px 12px' }}>
        <h1 class="heading-lg">Deploy a new token</h1>
        <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginTop: '4px' }}>
          Choose how to fill in the token details
        </p>
      </div>

      {/* ── URL Panel ─── */}
      <div class={`source-card card ${open === 'url' ? 'expanded' : ''}`}>
        <div class="source-card-header" onClick={() => toggle('url')}>
          <span class="source-icon">🔗</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Paste Link / Thread URL</div>
            <div class="label-sm" style={{ marginTop: '2px', textTransform: 'none', letterSpacing: 0 }}>
              twitter, warpcast, zora, any page
            </div>
          </div>
          <span class="chevron">{open === 'url' ? '▲' : '▼'}</span>
        </div>
        {open === 'url' && (
          <div class="source-card-body">
            <div class="field">
              <input
                type="url"
                placeholder="https://x.com/user/status/…"
                value={urlInput}
                onInput={e => { setUrlInput((e.target as HTMLInputElement).value); setUrlError(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && handleUrlFetch()}
                disabled={loading}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
              />
              {urlError && <div class="field-error">{urlError}</div>}
            </div>
            <button class="btn btn-primary" onClick={handleUrlFetch}
              disabled={loading || !urlInput.trim()}
              style={{ width: '100%', marginTop: '4px' }}>
              {loading ? <><span class="spinner" style={{ marginRight: '6px' }} />{urlLabel}</> : urlLabel}
            </button>
          </div>
        )}
      </div>

      {/* ── Image Drop Panel ─── */}
      <div class={`source-card card ${open === 'image' ? 'expanded' : ''}`}>
        <div class="source-card-header" onClick={() => toggle('image')}>
          <span class="source-icon">📁</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Drop Image</div>
            <div class="label-sm" style={{ marginTop: '2px', textTransform: 'none', letterSpacing: 0 }}>
              JPG, PNG, GIF · max 5MB
            </div>
          </div>
          <span class="chevron">{open === 'image' ? '▲' : '▼'}</span>
        </div>
        {open === 'image' && (
          <div class="source-card-body">
            {fetchState === 'uploading-image' ? (
              <div style={{ textAlign: 'center', padding: '12px', color: 'var(--color-text-2)', fontSize: '13px' }}>
                <span class="spinner" style={{ marginRight: '6px' }} /> Uploading to IPFS…
              </div>
            ) : tabMode ? (
              <div class="drop-zone"
                onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('drag-over'); }}
                onDragLeave={e => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
                onDrop={handleDrop}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📸</div>
                <p style={{ marginBottom: '8px' }}>Drag & drop image here</p>
                <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginBottom: '10px' }}>or</p>
                <label class="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  Browse file
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
                </label>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <p style={{ fontSize: '13px', color: 'var(--color-text-2)', marginBottom: '10px' }}>
                  Drag & drop works best in a full tab
                </p>
                <button class="btn btn-secondary" onClick={() => openAsTab()} style={{ marginBottom: '10px' }}>
                  🗗 Open as Tab
                </button>
                <div style={{ fontSize: '12px', color: 'var(--color-text-3)', marginBottom: '8px' }}>
                  or browse directly:
                </div>
                <label class="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  Browse file
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileInput} />
                </label>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Contract Panel ─── */}
      <div class={`source-card card ${open === 'contract' ? 'expanded' : ''}`}>
        <div class="source-card-header" onClick={() => toggle('contract')}>
          <span class="source-icon">🔷</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '14px' }}>Copy from Contract</div>
            <div class="label-sm" style={{ marginTop: '2px', textTransform: 'none', letterSpacing: 0 }}>
              fetch name, symbol, image from any token
            </div>
          </div>
          <span class="chevron">{open === 'contract' ? '▲' : '▼'}</span>
        </div>
        {open === 'contract' && (
          <div class="source-card-body">
            <div class="field" style={{ marginBottom: '8px' }}>
              <label class="label-sm">Chain</label>
              <select
                value={contractChain}
                onChange={e => setContractChain(Number((e.target as HTMLSelectElement).value))}>
                {CHAIN_OPTIONS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div class="field">
              <label class="label-sm">Contract Address</label>
              <input
                type="text"
                placeholder="0x…"
                value={contractInput}
                onInput={e => { setContractInput((e.target as HTMLInputElement).value); setContractError(''); }}
                onKeyDown={e => e.key === 'Enter' && !loading && handleContractFetch()}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                disabled={loading}
              />
              {contractError && <div class="field-error">{contractError}</div>}
            </div>
            <button class="btn btn-primary" onClick={handleContractFetch}
              disabled={loading || !contractInput.trim()}
              style={{ width: '100%', marginTop: '4px' }}>
              {loading ? <><span class="spinner" style={{ marginRight: '6px' }} />{contractLabel}</> : contractLabel}
            </button>
          </div>
        )}
      </div>

      {/* ── Start from scratch ─── */}
      <div style={{ textAlign: 'center', padding: '16px 16px 20px' }}>
        <button class="btn btn-ghost" onClick={onStartFromScratch} style={{ fontSize: '13px' }}>
          Or start from scratch →
        </button>
      </div>
    </div>
  );
}
