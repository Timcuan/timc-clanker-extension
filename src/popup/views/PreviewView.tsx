// src/popup/views/PreviewView.tsx
import { useState } from 'preact/hooks';
import type { ScrapedData } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  scraped: ScrapedData;
  sourceMode: 'url' | 'image' | 'contract';
  onConfirmAdvanced: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onQuickDeploy: (scraped: ScrapedData, imageIpfsUrl: string | undefined) => void;
  onBack: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  url:      '🔗 URL',
  image:    '📁 Image drop',
  contract: '🔷 Contract',
};

export function PreviewView({ scraped, sourceMode, onConfirmAdvanced, onQuickDeploy, onBack }: Props) {
  const [draft, setDraft] = useState<ScrapedData>({ ...scraped });
  const [imageIpfsUrl, setImageIpfsUrl] = useState<string | undefined>(
    scraped.imageUrl?.startsWith('ipfs://') ? scraped.imageUrl : undefined
  );
  const [imgStatus, setImgStatus] = useState<'idle' | 'uploading' | 'done' | 'skipped' | 'error'>('idle');
  const [imgError, setImgError] = useState('');
  const [manualUrl, setManualUrl] = useState('');

  // If source was image drop, the imageUrl is already an ipfs:// URL
  const imageAlreadyUploaded = sourceMode === 'image' && scraped.imageUrl?.startsWith('ipfs://');
  const imageVerified = (scraped as any).__imageVerified as boolean | undefined;

  const chain = CHAIN_CONFIG[draft.detectedChainId as keyof typeof CHAIN_CONFIG];

  // Resolve display URL (ipfs → gateway)
  function toDisplayUrl(url?: string) {
    if (!url) return undefined;
    if (url.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${url.slice(7)}`;
    return url;
  }

  const displayImageSrc = imageAlreadyUploaded
    ? toDisplayUrl(scraped.imageUrl)
    : imgStatus === 'done'
      ? toDisplayUrl(imageIpfsUrl)
      : toDisplayUrl(draft.imageUrl);

  async function handleUseImage() {
    if (!draft.imageUrl) return;
    setImgStatus('uploading');
    setImgError('');
    try {
      const res = await bgSend({ type: 'UPLOAD_IMAGE', url: draft.imageUrl });
      if ('error' in res) throw new Error((res as any).error);
      const ipfs = (res as any).ipfsUrl as string;
      setImageIpfsUrl(ipfs);
      setImgStatus('done');
    } catch (e) {
      setImgStatus('error');
      setImgError((e as Error).message || 'Upload failed');
    }
  }

  async function handleManualUpload() {
    if (!manualUrl.trim()) return;
    setDraft(d => ({ ...d, imageUrl: manualUrl }));
    setImgStatus('uploading');
    setImgError('');
    try {
      const res = await bgSend({ type: 'UPLOAD_IMAGE', url: manualUrl });
      if ('error' in res) throw new Error((res as any).error);
      setImageIpfsUrl((res as any).ipfsUrl);
      setImgStatus('done');
    } catch (e) {
      setImgStatus('error');
      setImgError((e as Error).message || 'Upload failed');
    }
  }

  const finalImageUrl = imageAlreadyUploaded
    ? scraped.imageUrl
    : imgStatus === 'done' ? imageIpfsUrl : undefined;

  const sourceDomain = draft.pageUrl
    ? (() => { try { return new URL(draft.pageUrl).hostname; } catch { return ''; } })()
    : '';

  return (
    <div class="view-body">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px 6px', borderBottom: '1px solid var(--color-border)' }}>
        <button class="btn btn-ghost btn-sm" onClick={onBack}>← Back</button>
        <span style={{ fontSize: '12px', color: 'var(--color-text-3)', flex: 1 }}>
          {SOURCE_LABELS[sourceMode]}{sourceDomain ? ` · ${sourceDomain}` : ''}
        </span>
      </div>

      {/* ── Token Banner ── */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
        <div class="token-img-ring">
          {displayImageSrc
            ? <img src={displayImageSrc} class="token-img" alt="" />
            : <div class="token-img" style={{ fontSize: '20px', display: 'grid', placeItems: 'center' }}>🪙</div>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            class="inline-edit heading-md"
            value={draft.name}
            onInput={e => setDraft(d => ({ ...d, name: (e.target as HTMLInputElement).value }))}
            placeholder="Token Name"
            style={{ display: 'block', width: '100%', fontSize: '16px' }}
          />
          <input
            class="inline-edit mono"
            value={draft.symbol}
            onInput={e => setDraft(d => ({ ...d, symbol: (e.target as HTMLInputElement).value }))}
            placeholder="SYMBOL"
            style={{ display: 'block', width: '100%', marginTop: '3px', color: 'var(--color-text-2)' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--color-text-3)', marginTop: '3px' }}>
            {chain?.name ?? `Chain ${draft.detectedChainId ?? 8453}`}
          </div>
        </div>
      </div>

      {/* ── Image Section ── */}
      {!imageAlreadyUploaded && (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Image</span>
            {draft.imageUrl && imgStatus === 'idle' && (
              <span class={`badge ${imageVerified ? 'badge-ok' : 'badge-warn'}`}>
                {imageVerified ? '✓ verified' : '⚠ unverified'}
              </span>
            )}
            {imgStatus === 'done'      && <span class="badge badge-ok">✓ uploaded</span>}
            {imgStatus === 'uploading' && <span class="badge">uploading…</span>}
            {imgStatus === 'skipped'   && <span class="badge">skipped</span>}
          </div>

          {draft.imageUrl && imgStatus !== 'skipped' && (
            <>
              {displayImageSrc && (
                <img src={displayImageSrc} alt="preview"
                  style={{ width: '56px', height: '56px', borderRadius: '10px', objectFit: 'cover', marginBottom: '8px', display: 'block' }} />
              )}
              {imgStatus === 'idle' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button class="btn btn-primary" style={{ flex: 2 }} onClick={handleUseImage}>
                    ✓ Use This Image
                  </button>
                  <button class="btn btn-secondary" style={{ flex: 1 }} onClick={() => setImgStatus('skipped')}>
                    ✗ Skip
                  </button>
                </div>
              )}
              {imgStatus === 'uploading' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-text-2)' }}>
                  <span class="spinner" /> Uploading to IPFS…
                </div>
              )}
              {imgStatus === 'error' && (
                <div>
                  <div style={{ color: 'var(--color-err)', fontSize: '12px', marginBottom: '6px' }}>{imgError}</div>
                  <button class="btn btn-secondary btn-sm" onClick={handleUseImage}>Retry</button>
                </div>
              )}
            </>
          )}

          {(!draft.imageUrl || imgStatus === 'skipped') && (
            <div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-3)', marginBottom: '6px' }}>
                {draft.imageUrl ? 'Or enter a different URL:' : 'No image detected — enter URL:'}
              </p>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input type="url" placeholder="https://…" value={manualUrl}
                  style={{ flex: 1, padding: '6px 8px', fontSize: '12px', background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '8px', fontFamily: 'inherit' }}
                  onInput={e => setManualUrl((e.target as HTMLInputElement).value)} />
                <button class="btn btn-secondary btn-sm"
                  disabled={!manualUrl.trim()} onClick={handleManualUpload}>Upload</button>
              </div>
              {imgStatus === 'error' && <div class="field-error" style={{ marginTop: '4px' }}>{imgError}</div>}
            </div>
          )}
        </div>
      )}

      {/* ── Metadata Fields ── */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px' }}>Details</div>
        <div class="field">
          <label class="label-sm">Description</label>
          <textarea rows={2}
            value={draft.description ?? ''}
            onInput={e => setDraft(d => ({ ...d, description: (e.target as HTMLTextAreaElement).value }))}
            placeholder="Short description…"
            style={{ resize: 'none' }} />
        </div>
        <div class="field">
          <label class="label-sm">Twitter</label>
          <input type="text" placeholder="@handle or URL"
            value={draft.socials?.twitter ?? ''}
            onInput={e => setDraft(d => ({ ...d, socials: { ...d.socials, twitter: (e.target as HTMLInputElement).value } }))} />
        </div>
        <div class="field">
          <label class="label-sm">Website</label>
          <input type="url" placeholder="https://…"
            value={draft.socials?.website ?? ''}
            onInput={e => setDraft(d => ({ ...d, socials: { ...d.socials, website: (e.target as HTMLInputElement).value } }))} />
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button class="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={() => onQuickDeploy(draft, finalImageUrl)}>
          ⚡ Quick Deploy
        </button>
        <button class="btn btn-secondary" style={{ width: '100%' }}
          onClick={() => onConfirmAdvanced(draft, finalImageUrl)}>
          Edit Advanced Config →
        </button>
      </div>
    </div>
  );
}
