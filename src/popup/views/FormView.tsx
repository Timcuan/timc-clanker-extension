// src/popup/views/FormView.tsx
import { useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { DeployFormState, ScrapedData } from '../../lib/messages.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';
import { storage } from '../../lib/storage.js';
import type { ExtensionConfig } from '../../lib/storage.js';
import { isDetached, detachToWindow, openOptions } from '../window-utils.js';

interface Props {
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  deployError?: string;
  onFormChange: (patch: Partial<DeployFormState>) => void;
  onDeploy: () => void;
  onHistory: () => void;
  vaultWallets?: Array<{ id: string; name: string; active: boolean }>;
  onBatchDeploy?: (walletIds: string[], walletNames: Record<string, string>) => void;
  // Element picker
  pickMode?: boolean;
  onPickMode?: () => void;
  onCancelPick?: () => void;
}

// Collapsible section wrapper
function Section({
  title, summary, defaultOpen = false, children,
}: {
  title: string; summary?: string; defaultOpen?: boolean; children: ComponentChildren;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class="section">
      <div class={`section-header ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span class="chevron">▼</span>
          {title}
          {summary && <span class="summary">{summary}</span>}
        </span>
      </div>
      <div class={`section-body ${open ? '' : 'hidden'}`}>{children}</div>
    </div>
  );
}

// Chip preset selector
function Chips<T extends string>({
  options, value, onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div class="chips">
      {options.map(o => (
        <button
          key={o.value}
          class={`chip ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Toggle row
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div class="toggle-row">
      <span class="toggle-label">{label}</span>
      <label class="toggle">
        <input type="checkbox" checked={checked} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
        <span class="toggle-track" />
      </label>
    </div>
  );
}

// BPS sum bar for rewards
function BpsBar({ total }: { total: number }) {
  const pct = Math.min((total / 10000) * 100, 100);
  const valid = total === 10000;
  return (
    <div class="bps-bar-wrap">
      <div class="bps-bar">
        <div class={`bps-bar-fill ${valid ? '' : 'invalid'}`} style={{ width: `${pct}%` }} />
      </div>
      <div class={`bps-bar-label ${valid ? '' : 'invalid'}`}>
        {valid ? `✓ ${total} bps (100%)` : `${total} / 10000 bps — must equal 10000`}
      </div>
    </div>
  );
}

const CHAIN_OPTIONS = Object.entries(CHAIN_CONFIG).map(([id, cfg]) => ({
  label: cfg.name,
  value: Number(id),
}));

const POOL_PRESETS = [
  { label: 'Standard', value: 'Standard' as const },
  { label: 'Project', value: 'Project' as const },
  { label: '20 ETH', value: 'TwentyETH' as const },
];

const FEE_PRESETS_STATIC = [
  { label: '3%+3%', value: 'Static3x3' as const },
  { label: '5%', value: 'Static5' as const },
  { label: '10% ★', value: 'Static10' as const },
];

const FEE_PRESETS_DYNAMIC = [
  { label: '1%–5%', value: 'DynamicSafe' as const },
  { label: '1%–10% ★', value: 'DynamicBasic' as const },
  { label: '1%–3%', value: 'Dynamic3' as const },
];

const LOCKUP_PRESETS = [
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
];

export function FormView({
  form, scraped, imageStatus, imageError, deployError,
  onFormChange, onDeploy, onHistory,
  vaultWallets = [], onBatchDeploy,
  pickMode = false, onPickMode, onCancelPick,
}: Props) {
  const [templates, setTemplates] = useState<ExtensionConfig['templates']>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    storage.get().then(cfg => setTemplates(cfg.templates));
  }, []);

  function loadTemplate(t: ExtensionConfig['templates'][0]) {
    onFormChange(t.config as Partial<DeployFormState>);
    setShowTemplates(false);
  }

  const bpsTotal = form.rewards.reduce((s, r) => s + r.bps, 0);
  const bpsValid = bpsTotal === 10000;

  // Quick deploy blocked conditions
  const imageReady = imageStatus === 'done' || imageStatus === 'idle' || form.imageUrl.startsWith('ipfs://');
  const tokenAdminSet = form.tokenAdmin && form.tokenAdmin !== '0x0000000000000000000000000000000000000000';
  const quickDeployDisabled = !imageReady || !bpsValid;

  const chain = CHAIN_CONFIG[form.chainId as keyof typeof CHAIN_CONFIG];

  // Fee preset chip sync
  function applyFeePreset(preset: string) {
    if (preset === 'Static3x3') onFormChange({ feeType: 'static', staticClankerFeeBps: 300, staticPairedFeeBps: 300 });
    else if (preset === 'Static5') onFormChange({ feeType: 'static', staticClankerFeeBps: 500, staticPairedFeeBps: 0 });
    else if (preset === 'Static10') onFormChange({ feeType: 'static', staticClankerFeeBps: 1000, staticPairedFeeBps: 0 });
    else if (preset === 'DynamicSafe') onFormChange({ feeType: 'dynamic', dynamicBaseBps: 100, dynamicMaxBps: 500 });
    else if (preset === 'DynamicBasic') onFormChange({ feeType: 'dynamic', dynamicBaseBps: 100, dynamicMaxBps: 1000 });
    else if (preset === 'Dynamic3') onFormChange({ feeType: 'dynamic', dynamicBaseBps: 100, dynamicMaxBps: 300 });
  }

  function currentFeePreset(): string {
    if (form.feeType === 'static') {
      if (form.staticClankerFeeBps === 300 && form.staticPairedFeeBps === 300) return 'Static3x3';
      if (form.staticClankerFeeBps === 500 && form.staticPairedFeeBps === 0) return 'Static5';
      if (form.staticClankerFeeBps === 1000 && form.staticPairedFeeBps === 0) return 'Static10';
    } else {
      if (form.dynamicBaseBps === 100 && form.dynamicMaxBps === 500) return 'DynamicSafe';
      if (form.dynamicBaseBps === 100 && form.dynamicMaxBps === 1000) return 'DynamicBasic';
      if (form.dynamicBaseBps === 100 && form.dynamicMaxBps === 300) return 'Dynamic3';
    }
    return 'Custom';
  }

  function updateReward(i: number, patch: Partial<typeof form.rewards[0]>) {
    const updated = form.rewards.map((r, idx) => idx === i ? { ...r, ...patch } : r);
    onFormChange({ rewards: updated });
  }

  function addReward() {
    if (form.rewards.length >= 7) return;
    onFormChange({
      rewards: [...form.rewards, {
        admin: form.tokenAdmin,
        recipient: form.tokenAdmin,
        bps: 0,
        token: 'Both' as const,
      }],
    });
  }

  function removeReward(i: number) {
    onFormChange({ rewards: form.rewards.filter((_, idx) => idx !== i) });
  }

  const imageSrc = form.imageUrl.startsWith('ipfs://')
    ? `https://ipfs.io/ipfs/${form.imageUrl.slice(7)}`
    : form.imageUrl || '';

  const feeSummary = form.feeType === 'static'
    ? `Static ${(form.staticClankerFeeBps / 100).toFixed(1)}%+${(form.staticPairedFeeBps / 100).toFixed(1)}%`
    : `Dynamic ${(form.dynamicBaseBps / 100).toFixed(1)}%–${(form.dynamicMaxBps / 100).toFixed(1)}%`;

  const chainEthereum = form.chainId === 1;
  const chainHasSniper = [8453, 1, 143].includes(form.chainId);

  return (
    <div>
      {/* Pick Mode Banner — shown over full popup when picker is active */}
      {pickMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: 'rgba(123,95,230,0.95)', backdropFilter: 'blur(8px)',
          color: '#fff', padding: '10px 14px', textAlign: 'center',
          fontSize: '12px', fontWeight: 700, letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.2)',
        }}>
          <span>🎯 Click any element on the page</span>
          <button onClick={onCancelPick} style={{
            background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)',
            color: '#fff', borderRadius: '4px', padding: '3px 8px',
            cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', fontWeight: 700,
          }}>ESC</button>
        </div>
      )}

      {/* Header */}
      <div class="header">
        <div class="header-logo">
          <div class="header-logo-mark">C</div>
          <span class="header-title">Clanker</span>
        </div>
        <div class="header-actions">
          {/* Pin — detaches popup to persistent window */}
          <button
            class="icon-btn"
            title={isDetached() ? 'Already pinned' : 'Pin — keep open'}
            onClick={isDetached() ? undefined : detachToWindow}
            style={isDetached() ? { color: 'var(--v2)', cursor: 'default' } : {}}
          >
            {isDetached() ? '📌' : '📍'}
          </button>

          {templates.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button class="icon-btn" title="Load Template" onClick={() => setShowTemplates(s => !s)}>📂</button>
              {showTemplates && (
                <div class="template-dropdown">
                  <div class="template-dropdown-label">Load Template</div>
                  {templates.map(t => (
                    <button key={t.id} class="template-btn" onClick={() => loadTemplate(t)}>{t.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button class="icon-btn" title="History" onClick={onHistory}>📋</button>
          {/* Settings — fixed: use direct URL instead of openOptionsPage() */}
          <button class="icon-btn" title="Options" onClick={openOptions}>⚙</button>
        </div>
      </div>

      {/* Quick Deploy Card */}
      <div class="quick-card">
        {/* Token preview */}
        <div class="token-preview">
          {imageSrc ? (
            <img class="token-img" src={imageSrc} alt={form.name} />
          ) : (
            <div class="token-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>🪙</div>
          )}
          <div class="token-info" style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {form.name || 'Unnamed Token'}
            </h2>
            <div class="symbol">
              <span>${form.symbol || 'TOKEN'}</span>
              <span class="chain-tag">{chain?.name ?? `Chain ${form.chainId}`}</span>
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div class="status-row">
          {scraped.source && (
            <span class="status-badge ok">{scraped.source}{scraped.detectedChainId ? ' ⬥ chain' : ''}</span>
          )}
          {scraped.messageId && <span class="status-badge ok">context</span>}
          <span class={`status-badge ${imageStatus === 'uploading' ? 'loading' : imageStatus === 'error' ? 'err' : imageStatus === 'done' ? 'ok' : ''}`}>
            {imageStatus === 'uploading' ? 'uploading…' : imageStatus === 'error' ? 'img failed' : imageStatus === 'done' ? 'img ✓' : form.imageUrl ? 'img' : 'no img'}
          </span>
          <span class="status-badge ok">{feeSummary}</span>
          {form.ghostMode && <span class="status-badge err">👻 ghost</span>}
        </div>

        {/* Errors */}
        {imageError && <div class="deploy-error">⚠ {imageError}</div>}
        {deployError && <div class="deploy-error">✕ {deployError}</div>}

        {/* No content detected — offer element picker */}
        {!scraped.name && !pickMode && onPickMode && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 'var(--r2)', padding: '8px 10px', marginBottom: '8px',
          }}>
            <span style={{ fontSize: '11px', color: 'var(--warn)', fontWeight: 500 }}>
              No page content detected
            </span>
            <button class="btn btn-sm" onClick={onPickMode} style={{
              background: 'rgba(123,95,230,0.2)', border: '1px solid rgba(123,95,230,0.4)',
              color: 'var(--v2)', fontWeight: 700, padding: '4px 10px',
            }}>
              🎯 Pick from Page
            </button>
          </div>
        )}

        {/* Quick Deploy CTA */}
        <button class="btn btn-primary" disabled={quickDeployDisabled} onClick={onDeploy}>
          {imageStatus === 'uploading' ? '⏳ Uploading image…' : '⚡ Deploy'}
        </button>
        {!bpsValid && (
          <div style={{ fontSize: '10px', color: 'var(--err)', textAlign: 'center', marginTop: '5px', fontWeight: 600 }}>
            Reward BPS must sum to 10,000
          </div>
        )}
        {vaultWallets.filter(w => w.active).length >= 2 && onBatchDeploy && (
          <button class="btn btn-secondary" style={{ marginTop: '6px' }}
            disabled={quickDeployDisabled}
            onClick={() => {
              const active = vaultWallets.filter(w => w.active);
              onBatchDeploy?.(active.map(w => w.id), Object.fromEntries(active.map(w => [w.id, w.name])));
            }}
          >
            ⚡ Batch ({vaultWallets.filter(w => w.active).length} wallets)
          </button>
        )}
      </div>

      {/* Collapsible form sections */}
      <div class="form-area">

        {/* Section 1 — Basic Info */}
        <Section title="Basic Info" defaultOpen={true}>
          <div class="field">
            <label>Name</label>
            <input value={form.name} onInput={e => onFormChange({ name: (e.target as HTMLInputElement).value })} maxLength={40} />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Symbol</label>
              <input value={form.symbol} onInput={e => onFormChange({ symbol: (e.target as HTMLInputElement).value.toUpperCase().slice(0, 8) })} maxLength={8} />
            </div>
          </div>
          <div class="field">
            <label>Description</label>
            <textarea rows={2} value={form.description} onInput={e => onFormChange({ description: (e.target as HTMLTextAreaElement).value })} style={{ resize: 'vertical' }} />
          </div>
          <div class="field">
            <label>Twitter / X</label>
            <input value={form.socials.twitter || ''} onInput={e => onFormChange({ socials: { ...form.socials, twitter: (e.target as HTMLInputElement).value } })} placeholder="https://x.com/..." />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Telegram</label>
              <input value={form.socials.telegram || ''} onInput={e => onFormChange({ socials: { ...form.socials, telegram: (e.target as HTMLInputElement).value } })} placeholder="https://t.me/..." />
            </div>
            <div class="field">
              <label>Website</label>
              <input value={form.socials.website || ''} onInput={e => onFormChange({ socials: { ...form.socials, website: (e.target as HTMLInputElement).value } })} placeholder="https://..." />
            </div>
          </div>
          <div class="field">
            <label>Image URL</label>
            <input value={form.imageUrl} onInput={e => onFormChange({ imageUrl: (e.target as HTMLInputElement).value })} placeholder="https://... or ipfs://..." />
          </div>
        </Section>

        {/* Section 2 — Network & Pool */}
        <Section title="Network & Pool" summary={`${chain?.name ?? form.chainId} · ${form.poolPreset} · ${form.marketCap} ETH`}>
          <div class="field">
            <label>Chain</label>
            <select value={form.chainId} onChange={e => onFormChange({ chainId: Number((e.target as HTMLSelectElement).value) })}>
              {CHAIN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Paired Token</label>
            <select value={form.pairedToken} onChange={e => onFormChange({ pairedToken: (e.target as HTMLSelectElement).value as any })}>
              <option value="WETH">WETH</option>
              <option value="0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed">DEGEN</option>
              <option value="0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb">CLANKER</option>
            </select>
          </div>
          <div class="field">
            <label>Pool Preset</label>
            <Chips options={POOL_PRESETS} value={form.poolPreset} onChange={v => onFormChange({ poolPreset: v })} />
          </div>
          <div class="field">
            <label>Starting Market Cap: {form.marketCap} {chain?.marketCapUnit ?? 'ETH'}</label>
            <input
              type="range" min={0.1} max={100} step={0.1}
              value={form.marketCap}
              onInput={e => onFormChange({ marketCap: Number((e.target as HTMLInputElement).value) })}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '3px' }}>
              ≈ ${(form.marketCap * 2000).toLocaleString('en', { maximumFractionDigits: 0 })} USD
              <span style={{ marginLeft: '6px', opacity: 0.6 }}>(using ~$2000/ETH estimate)</span>
            </div>
          </div>
        </Section>

        {/* Section 3 — Fee Configuration */}
        <Section title="Fee Configuration" summary={feeSummary}>
          <div class="field">
            <Chips
              options={[{ label: 'Static', value: 'static' as const }, { label: 'Dynamic', value: 'dynamic' as const }]}
              value={form.feeType}
              onChange={v => onFormChange({ feeType: v })}
            />
            {chainEthereum && form.feeType === 'dynamic' && (
              <div style={{ fontSize: '11px', color: 'var(--yellow)', marginTop: '4px' }}>
                ⚠️ Dynamic fees not available on Ethereum Mainnet (hook = 0x0)
              </div>
            )}
          </div>

          {form.feeType === 'static' ? (
            <>
              <div class="field">
                <label>Fee Preset</label>
                <Chips options={FEE_PRESETS_STATIC} value={currentFeePreset() as any} onChange={applyFeePreset} />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Clanker Fee %</label>
                  <input type="number" min={0} max={20} step={0.1}
                    value={(form.staticClankerFeeBps / 100).toFixed(1)}
                    onInput={e => onFormChange({ staticClankerFeeBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
                </div>
                <div class="field">
                  <label>Paired Fee %</label>
                  <input type="number" min={0} max={20} step={0.1}
                    value={(form.staticPairedFeeBps / 100).toFixed(1)}
                    onInput={e => onFormChange({ staticPairedFeeBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
                </div>
              </div>
              {(form.staticClankerFeeBps + form.staticPairedFeeBps) > 600 && (
                <div style={{ fontSize: '11px', color: 'var(--yellow)' }}>
                  ℹ️ Total &gt;6% — token deploys fine but won't get Blue Badge on clanker.world
                </div>
              )}
            </>
          ) : (
            <>
              <div class="field">
                <label>Fee Preset</label>
                <Chips options={FEE_PRESETS_DYNAMIC} value={currentFeePreset() as any} onChange={applyFeePreset} />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Base Fee %</label>
                  <input type="number" min={0.25} max={20} step={0.25}
                    value={(form.dynamicBaseBps / 100).toFixed(2)}
                    onInput={e => onFormChange({ dynamicBaseBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
                </div>
                <div class="field">
                  <label>Max Fee %</label>
                  <input type="number" min={0} max={30} step={0.25}
                    value={(form.dynamicMaxBps / 100).toFixed(2)}
                    onInput={e => onFormChange({ dynamicMaxBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
                </div>
              </div>
              {form.dynamicMaxBps > 500 && (
                <div style={{ fontSize: '11px', color: 'var(--yellow)' }}>
                  ℹ️ maxFee &gt;5% — no Blue Badge (deploys fine)
                </div>
              )}
            </>
          )}
        </Section>

        {/* Section 4 — Sniper Protection */}
        {chainHasSniper && (
          <Section title="Sniper Protection" summary={form.sniperEnabled ? `${(form.sniperStartingFee / 10000).toFixed(1)}%→${(form.sniperEndingFee / 10000).toFixed(1)}%` : 'off'}>
            <Toggle label="Enable Sniper Protection" checked={form.sniperEnabled} onChange={v => onFormChange({ sniperEnabled: v })} />
            {form.sniperEnabled && (
              <div class="field-row" style={{ marginTop: '8px' }}>
                <div class="field">
                  <label>Starting Fee% (÷10000)</label>
                  <input type="number" min={1} step={1}
                    value={(form.sniperStartingFee / 10000).toFixed(2)}
                    onInput={e => onFormChange({ sniperStartingFee: Math.round(Number((e.target as HTMLInputElement).value) * 10000) })} />
                </div>
                <div class="field">
                  <label>Ending Fee%</label>
                  <input type="number" min={3} step={0.1}
                    value={(form.sniperEndingFee / 10000).toFixed(2)}
                    onInput={e => onFormChange({ sniperEndingFee: Math.max(30000, Math.round(Number((e.target as HTMLInputElement).value) * 10000)) })} />
                </div>
                <div class="field">
                  <label>Decay (sec)</label>
                  <input type="number" min={1}
                    value={form.sniperSecondsToDecay}
                    onInput={e => onFormChange({ sniperSecondsToDecay: Number((e.target as HTMLInputElement).value) })} />
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Section 5 — Extensions */}
        <Section title="Extensions" summary={[form.vaultEnabled && 'vault', form.devBuyEnabled && 'devbuy', form.airdropEnabled && 'airdrop'].filter(Boolean).join(', ') || 'none'}>

          {/* Creator Vault */}
          <Toggle label="Creator Vault" checked={form.vaultEnabled} onChange={v => onFormChange({ vaultEnabled: v })} />
          {form.vaultEnabled && (
            <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              <div class="field">
                <label>Supply % (0–90)</label>
                <input type="number" min={0} max={90} value={form.vaultSupplyPct}
                  onInput={e => onFormChange({ vaultSupplyPct: Number((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Lockup</label>
                <div class="chips" style={{ marginBottom: '6px' }}>
                  {LOCKUP_PRESETS.map(p => (
                    <button key={p.value} class={`chip ${form.vaultLockupDays === p.value ? 'active' : ''}`} onClick={() => onFormChange({ vaultLockupDays: p.value })}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div class="field">
                <label>Vesting (days, 0=none)</label>
                <input type="number" min={0} value={form.vaultVestingDays}
                  onInput={e => onFormChange({ vaultVestingDays: Number((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Recipient (blank = tokenAdmin)</label>
                <input value={form.vaultRecipient} onInput={e => onFormChange({ vaultRecipient: (e.target as HTMLInputElement).value as any })} placeholder="0x..." />
              </div>
            </div>
          )}

          <div style={{ marginTop: '8px' }} />

          {/* Dev Buy */}
          <Toggle label="Dev Buy" checked={form.devBuyEnabled} onChange={v => onFormChange({ devBuyEnabled: v })} />
          {form.devBuyEnabled && (
            <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              <div class="field-row">
                <div class="field">
                  <label>ETH Amount</label>
                  <input type="number" min={0} step={0.01} value={form.devBuyAmount}
                    onInput={e => onFormChange({ devBuyAmount: (e.target as HTMLInputElement).value })} />
                </div>
                <div class="field">
                  <label>Recipient (blank = tokenAdmin)</label>
                  <input value={form.devBuyRecipient} onInput={e => onFormChange({ devBuyRecipient: (e.target as HTMLInputElement).value as any })} placeholder="0x..." />
                </div>
              </div>
              {form.pairedToken !== 'WETH' && (
                <div style={{ fontSize: '11px', color: 'var(--yellow)' }}>
                  ⚠️ Dev Buy with non-WETH pairs requires manual poolKey config
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '8px' }} />

          {/* Airdrop */}
          <Toggle label="Airdrop" checked={form.airdropEnabled} onChange={v => onFormChange({ airdropEnabled: v })} />
          {form.airdropEnabled && (
            <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border)' }}>
              <div class="field">
                <label>Merkle Root (0x...)</label>
                <input value={form.airdropMerkleRoot} onInput={e => onFormChange({ airdropMerkleRoot: (e.target as HTMLInputElement).value as any })} placeholder="0x..." />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Amount</label>
                  <input value={form.airdropAmount} onInput={e => onFormChange({ airdropAmount: (e.target as HTMLInputElement).value })} placeholder="e.g. 1000000" />
                </div>
                <div class="field">
                  <label>Lockup (days)</label>
                  <input type="number" min={0} value={form.airdropLockupDays} onInput={e => onFormChange({ airdropLockupDays: Number((e.target as HTMLInputElement).value) })} />
                </div>
              </div>
            </div>
          )}
        </Section>

        {/* Section 6 — Rewards */}
        <Section title="Rewards" summary={bpsValid ? '✓ 100%' : `⚠️ ${bpsTotal}/10000`}>
          {form.ghostMode ? (
            <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
              🔒 Locked in Ghost Mode — reward slots auto-configured
            </div>
          ) : (
            <>
              {form.rewards.map((r, i) => (
                <div key={i} style={{ marginBottom: '8px', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <div class="field-row">
                    <div class="field">
                      <label>Admin (0x...)</label>
                      <input value={r.admin} onInput={e => updateReward(i, { admin: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace', fontSize: '11px' }} />
                    </div>
                    <div class="field">
                      <label>Recipient (0x...)</label>
                      <input value={r.recipient} onInput={e => updateReward(i, { recipient: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace', fontSize: '11px' }} />
                    </div>
                  </div>
                  <div class="field-row">
                    <div class="field">
                      <label>BPS (0–10000)</label>
                      <input type="number" min={0} max={10000} value={r.bps}
                        onInput={e => updateReward(i, { bps: Number((e.target as HTMLInputElement).value) })} />
                    </div>
                    <div class="field">
                      <label>Token</label>
                      <select value={r.token} onChange={e => updateReward(i, { token: (e.target as HTMLSelectElement).value as any })}>
                        <option value="Both">Both</option>
                        <option value="Clanker">Clanker</option>
                        <option value="Paired">Paired</option>
                      </select>
                    </div>
                    <button class="btn btn-danger btn-sm" onClick={() => removeReward(i)} style={{ alignSelf: 'flex-end', marginBottom: '10px' }}>✕</button>
                  </div>
                </div>
              ))}
              <BpsBar total={bpsTotal} />
              {form.rewards.length < 7 && (
                <button class="btn btn-secondary btn-sm" onClick={addReward} style={{ marginTop: '8px' }}>+ Add Recipient</button>
              )}
            </>
          )}
        </Section>

        {/* Section 7 — Advanced */}
        <Section title="Advanced" summary={[form.vanityEnabled && 'vanity', form.ghostMode && '👻 ghost'].filter(Boolean).join(', ') || ''}>
          <Toggle label="Vanity address (...b07 suffix)" checked={form.vanityEnabled} onChange={v => onFormChange({ vanityEnabled: v })} />
          <Toggle label="Simulate before deploy" checked={form.simulateBeforeDeploy} onChange={v => onFormChange({ simulateBeforeDeploy: v })} />
          <div style={{ marginTop: '8px' }} />
          <Toggle label="👻 Ghost Deploy Mode" checked={form.ghostMode} onChange={v => onFormChange({ ghostMode: v })} />
          {form.ghostMode && (
            <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--red)' }}>
              <div class="ghost-panel">
                <div class="ghost-title">⚠️ GHOST DEPLOY MODE</div>
                <div class="field">
                  <label>Target Address (appears as creator)</label>
                  <input value={form.ghostTargetAddress} onInput={e => onFormChange({ ghostTargetAddress: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace' }} />
                </div>
                <div class="field">
                  <label>Your Reward Share %</label>
                  <input type="number" min={0} max={100} step={1}
                    value={(form.ghostYourShareBps / 100).toFixed(0)}
                    onInput={e => onFormChange({ ghostYourShareBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
                    Target gets {((10000 - form.ghostYourShareBps) / 100).toFixed(0)}% · You control all admin slots
                  </div>
                </div>
              </div>
            </div>
          )}
          <div class="field" style={{ marginTop: '8px' }}>
            <label>Token Admin override</label>
            <input value={form.tokenAdmin} onInput={e => onFormChange({ tokenAdmin: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace', fontSize: '11px' }} />
          </div>
          <div class="field">
            <label>Custom Salt (hex, optional)</label>
            <input value={form.customSalt} onInput={e => onFormChange({ customSalt: (e.target as HTMLInputElement).value })} placeholder="0x..." style={{ fontFamily: 'monospace' }} />
          </div>
        </Section>

        {/* Secondary deploy CTA */}
        <button class="btn btn-secondary" onClick={onDeploy} disabled={quickDeployDisabled} style={{ marginTop: '4px' }}>
          Deploy (with edits)
        </button>
      </div>
    </div>
  );
}
