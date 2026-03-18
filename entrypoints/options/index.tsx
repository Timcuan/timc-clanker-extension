// entrypoints/options/index.tsx
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { ExtensionConfig, RotationMode } from '../../src/lib/storage.js';
import type { DeployFormState } from '../../src/lib/messages.js';
import { storage, CONFIG_DEFAULTS } from '../../src/lib/storage.js';
import { bgSend } from '../../src/lib/bg-send.js';

// ─── Shared CSS ──────────────────────────────────────────────────────────────
const css = `
:root {
  --bg: #0f0f13; --bg2: #1a1a22; --bg3: #24242e;
  --border: #2e2e3a; --text: #e8e8f0; --text-dim: #7a7a96;
  --accent: #6c5ce7; --accent-hover: #7d6ff0;
  --green: #00c896; --red: #ff4757; --yellow: #ffd32a;
  --radius: 8px; --radius-sm: 4px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; min-height: 100vh; }
.page { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
h1 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.subtitle { color: var(--text-dim); font-size: 13px; margin-bottom: 24px; }
.section { background: var(--bg2); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 16px; overflow: hidden; }
.section-title { font-size: 14px; font-weight: 600; padding: 14px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
.section-body { padding: 16px; }
.field { margin-bottom: 12px; }
.field:last-child { margin-bottom: 0; }
.field label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.field input, .field select, .field textarea { width: 100%; padding: 8px 10px; background: var(--bg3); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: 13px; }
.field input:focus, .field select:focus { outline: none; border-color: var(--accent); }
.field-row { display: flex; gap: 10px; }
.field-row .field { flex: 1; }
.btn { padding: 8px 16px; border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-secondary { background: var(--bg3); color: var(--text); border: 1px solid var(--border); }
.btn-secondary:hover:not(:disabled) { border-color: var(--text-dim); }
.btn-danger { background: rgba(255,71,87,0.15); color: var(--red); border: 1px solid rgba(255,71,87,0.3); }
.btn-danger:hover:not(:disabled) { background: rgba(255,71,87,0.25); }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip { padding: 4px 12px; border-radius: 100px; border: 1px solid var(--border); background: var(--bg3); color: var(--text-dim); cursor: pointer; font-size: 12px; }
.chip.active { border-color: var(--accent); color: var(--accent); background: rgba(108,92,231,0.1); }
.save-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--bg2); border-top: 1px solid var(--border); padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; }
.badge-ok { background: rgba(0,200,150,0.15); color: var(--green); border: 1px solid rgba(0,200,150,0.3); }
.badge-warn { background: rgba(255,211,42,0.1); color: var(--yellow); }
.wallet-row { display: flex; align-items: center; gap: 8px; padding: 10px; background: var(--bg3); border-radius: var(--radius-sm); margin-bottom: 6px; }
.wallet-row:last-child { margin-bottom: 0; }
.wallet-info { flex: 1; min-width: 0; }
.wallet-name { font-weight: 600; font-size: 13px; }
.wallet-addr { font-family: monospace; font-size: 11px; color: var(--text-dim); }
.wallet-meta { font-size: 11px; color: var(--text-dim); }
.toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
.toggle input { display: none; }
.toggle-track { position: absolute; inset: 0; border-radius: 100px; background: var(--bg3); cursor: pointer; transition: background 0.2s; }
.toggle input:checked + .toggle-track { background: var(--accent); }
.toggle-track::after { content: ''; position: absolute; left: 3px; top: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
.toggle input:checked + .toggle-track::after { transform: translateX(16px); }
.info { font-size: 11px; color: var(--text-dim); margin-top: 4px; line-height: 1.5; }
@keyframes spin { to { transform: rotate(360deg); } }
.spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; }
`;

// ─── Toggle component ─────────────────────────────────────────────────────────
function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div>
      <div class="toggle-row">
        <span>{label}</span>
        <label class="toggle">
          <input type="checkbox" checked={checked} onChange={e => onChange((e.target as HTMLInputElement).checked)} />
          <span class="toggle-track" />
        </label>
      </div>
      {hint && <div class="info">{hint}</div>}
    </div>
  );
}

// ─── Wallet Section ───────────────────────────────────────────────────────────
function WalletSection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPk, setNewPk] = useState('');
  const [password, setPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockPw, setUnlockPw] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [vaultStatus, setVaultStatus] = useState<{ unlocked: boolean; activeIds: string[] } | null>(null);

  useEffect(() => {
    bgSend({ type: 'VAULT_STATUS' }).then(res => {
      if (!('error' in res)) setVaultStatus(res as any);
    });
  }, []);

  async function addWallet() {
    if (!newName || !newPk || !password) return;
    setAdding(true); setAddError('');
    const res = await bgSend({ type: 'ADD_WALLET', name: newName, plainPk: newPk, password });
    setAdding(false);
    if ('error' in res) { setAddError((res as any).error); return; }
    // refresh config to pick up new vault entry
    const fresh = await storage.get();
    onChange({ vaultEntries: fresh.vaultEntries });
    setNewName(''); setNewPk(''); setPassword(''); setShowAdd(false);
  }

  async function removeWallet(id: string) {
    if (!confirm('Remove wallet from vault?')) return;
    await bgSend({ type: 'REMOVE_WALLET', id });
    const fresh = await storage.get();
    onChange({ vaultEntries: fresh.vaultEntries });
  }

  function toggleActive(id: string) {
    const entries = config.vaultEntries.map(e => e.id === id ? { ...e, active: !e.active } : e);
    onChange({ vaultEntries: entries });
  }

  async function unlock() {
    if (!unlockPw) return;
    setUnlocking(true); setUnlockError('');
    const res = await bgSend({ type: 'UNLOCK_VAULT', password: unlockPw });
    setUnlocking(false);
    if ('error' in res) { setUnlockError((res as any).error); return; }
    setVaultStatus(prev => prev ? { ...prev, unlocked: true } : prev);
    setUnlockPw('');
  }

  async function lock() {
    await bgSend({ type: 'LOCK_VAULT' });
    setVaultStatus(prev => prev ? { ...prev, unlocked: false } : prev);
  }

  return (
    <div class="section">
      <div class="section-title">🔑 Wallet Vault</div>
      <div class="section-body">

        {/* Mode selector */}
        <div class="field">
          <label>Wallet Mode</label>
          <select value={config.walletMode} onChange={e => onChange({ walletMode: (e.target as HTMLSelectElement).value as any })}>
            <option value="vault">Mode B — Vault (private keys, recommended)</option>
            <option value="injected">Mode A — Injected (Rabby/MetaMask)</option>
          </select>
          <div class="info">Vault mode supports multi-wallet rotation and batch deploy.</div>
        </div>

        {config.walletMode === 'vault' && (
          <>
            {/* Session status */}
            {vaultStatus && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
                <span class={`badge ${vaultStatus.unlocked ? 'badge-ok' : 'badge-warn'}`}>
                  {vaultStatus.unlocked ? '🔓 Unlocked' : '🔒 Locked'}
                </span>
                {vaultStatus.unlocked ? (
                  <button class="btn btn-sm btn-secondary" onClick={lock}>Lock Now</button>
                ) : (
                  <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                    <input type="password" placeholder="Master password..." value={unlockPw}
                      onInput={e => setUnlockPw((e.target as HTMLInputElement).value)}
                      style={{ flex: 1, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }} />
                    <button class="btn btn-sm btn-primary" onClick={unlock} disabled={unlocking}>
                      {unlocking ? <span class="spinner" /> : 'Unlock'}
                    </button>
                  </div>
                )}
                {unlockError && <span style={{ color: 'var(--red)', fontSize: '11px' }}>{unlockError}</span>}
              </div>
            )}

            {/* Rotation mode */}
            <div class="field">
              <label>Rotation Mode</label>
              <select value={config.rotationMode} onChange={e => onChange({ rotationMode: (e.target as HTMLSelectElement).value as RotationMode })}>
                <option value="round-robin">Round-Robin — equal airtime</option>
                <option value="least-used">Least Used — freshest wallets first</option>
                <option value="random">Random — unpredictable</option>
                <option value="manual">Manual — you pick per deploy</option>
              </select>
            </div>

            {/* Wallet list */}
            {config.vaultEntries.length === 0 ? (
              <div class="info" style={{ textAlign: 'center', padding: '12px' }}>No wallets in vault. Add one below.</div>
            ) : (
              <div style={{ marginBottom: '10px' }}>
                {config.vaultEntries.map(entry => (
                  <div key={entry.id} class="wallet-row">
                    <label class="toggle">
                      <input type="checkbox" checked={entry.active} onChange={() => toggleActive(entry.id)} />
                      <span class="toggle-track" />
                    </label>
                    <div class="wallet-info">
                      <div class="wallet-name">{entry.name}</div>
                      <div class="wallet-addr">{entry.address.slice(0, 10)}…{entry.address.slice(-6)}</div>
                    </div>
                    <div class="wallet-meta">deploys: {entry.deployCount}</div>
                    <button class="btn btn-sm btn-danger" onClick={() => removeWallet(entry.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add wallet form */}
            {showAdd ? (
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', padding: '12px' }}>
                <div class="field">
                  <label>Wallet Name</label>
                  <input value={newName} onInput={e => setNewName((e.target as HTMLInputElement).value)} placeholder="Sniper A, Fresh 1, etc." />
                </div>
                <div class="field">
                  <label>Private Key (0x...)</label>
                  <input type="password" value={newPk} onInput={e => setNewPk((e.target as HTMLInputElement).value)} placeholder="0x..." />
                </div>
                <div class="field">
                  <label>Master Password (encrypts the key)</label>
                  <input type="password" value={password} onInput={e => setPassword((e.target as HTMLInputElement).value)} placeholder="Your vault password" />
                </div>
                {addError && <div style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '8px' }}>❌ {addError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button class="btn btn-primary btn-sm" onClick={addWallet} disabled={adding || !newName || !newPk || !password}>
                    {adding ? <span class="spinner" /> : 'Save to Vault'}
                  </button>
                  <button class="btn btn-secondary btn-sm" onClick={() => { setShowAdd(false); setAddError(''); }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button class="btn btn-secondary btn-sm" onClick={() => setShowAdd(true)}>+ Add Wallet</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Identity Section ──────────────────────────────────────────────────────────
function IdentitySection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  return (
    <div class="section">
      <div class="section-title">👤 Identity</div>
      <div class="section-body">
        <div class="field">
          <label>Token Admin / Fee Recipient Address</label>
          <input
            value={config.tokenAdmin}
            onInput={e => onChange({ tokenAdmin: (e.target as HTMLInputElement).value as any })}
            placeholder="0x..."
            style={{ fontFamily: 'monospace' }}
          />
          <div class="info">
            In vault mode: each wallet's own address is used as tokenAdmin per deploy. This field is used as a fallback for injected mode, and as the fee-recipient address for Ghost Mode.
          </div>
        </div>
        <div class="field">
          <label>Context Interface Name</label>
          <input value={config.contextInterface} onInput={e => onChange({ contextInterface: (e.target as HTMLInputElement).value })} />
          <div class="info">Used as the <code>context.interface</code> field in every deploy. Default: ClankerExtension</div>
        </div>
      </div>
    </div>
  );
}

// ─── Deploy Defaults Section ──────────────────────────────────────────────────
function DeploySection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  return (
    <div class="section">
      <div class="section-title">⚙️ Deploy Defaults</div>
      <div class="section-body">

        <div class="field">
          <label>Default Chain</label>
          <select value={config.defaultChain} onChange={e => onChange({ defaultChain: Number((e.target as HTMLSelectElement).value) })}>
            <option value={8453}>Base (8453)</option>
            <option value={1}>Ethereum Mainnet (1)</option>
            <option value={42161}>Arbitrum (42161)</option>
            <option value={130}>Unichain (130)</option>
            <option value={143}>Monad (143)</option>
          </select>
        </div>

        <div class="field">
          <label>Default Fee Type</label>
          <div class="chips">
            {(['static', 'dynamic'] as const).map(v => (
              <button key={v} class={`chip ${config.defaultFeeType === v ? 'active' : ''}`} onClick={() => onChange({ defaultFeeType: v })}>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Default Clanker Fee % (static)</label>
            <input type="number" min={0} max={20} step={0.1}
              value={(config.defaultStaticClankerFeeBps / 100).toFixed(1)}
              onInput={e => onChange({ defaultStaticClankerFeeBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
          </div>
          <div class="field">
            <label>Default Paired Fee % (static)</label>
            <input type="number" min={0} max={20} step={0.1}
              value={(config.defaultStaticPairedFeeBps / 100).toFixed(1)}
              onInput={e => onChange({ defaultStaticPairedFeeBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Default Base Fee % (dynamic)</label>
            <input type="number" min={0.25} max={20} step={0.25}
              value={(config.defaultDynamicBaseBps / 100).toFixed(2)}
              onInput={e => onChange({ defaultDynamicBaseBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
          </div>
          <div class="field">
            <label>Default Max Fee % (dynamic)</label>
            <input type="number" min={0} max={30} step={0.25}
              value={(config.defaultDynamicMaxBps / 100).toFixed(2)}
              onInput={e => onChange({ defaultDynamicMaxBps: Math.round(Number((e.target as HTMLInputElement).value) * 100) })} />
          </div>
        </div>

        <div class="field">
          <label>Default Pool Preset</label>
          <div class="chips">
            {(['Standard', 'Project', 'TwentyETH'] as const).map(v => (
              <button key={v} class={`chip ${config.defaultPoolPreset === v ? 'active' : ''}`} onClick={() => onChange({ defaultPoolPreset: v })}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div class="field">
          <label>Default Market Cap (ETH)</label>
          <input type="number" min={0.1} step={0.1} value={config.defaultMarketCap}
            onInput={e => onChange({ defaultMarketCap: Number((e.target as HTMLInputElement).value) })} />
        </div>

        <div class="field">
          <label>Sniper Protection Defaults</label>
          <div class="field-row">
            <div class="field">
              <label>Starting Fee (unibps)</label>
              <input type="number" value={config.sniperStartingFee}
                onInput={e => onChange({ sniperStartingFee: Number((e.target as HTMLInputElement).value) })} />
            </div>
            <div class="field">
              <label>Ending Fee (unibps, min 30000)</label>
              <input type="number" min={30000} value={config.sniperEndingFee}
                onInput={e => onChange({ sniperEndingFee: Math.max(30000, Number((e.target as HTMLInputElement).value)) })} />
            </div>
            <div class="field">
              <label>Decay (seconds)</label>
              <input type="number" min={1} value={config.sniperSecondsToDecay}
                onInput={e => onChange({ sniperSecondsToDecay: Number((e.target as HTMLInputElement).value) })} />
            </div>
          </div>
        </div>

        <Toggle
          label="Enable Quick Deploy by default"
          checked={config.enableQuickDeploy}
          onChange={v => onChange({ enableQuickDeploy: v })}
          hint="Shows the ⚡ QUICK DEPLOY button as primary CTA, skipping full form review."
        />

        <div style={{ marginTop: '8px' }}>
          <Toggle
            label="Enable Sniper Protection by default"
            checked={config.defaultSniperEnabled}
            onChange={v => onChange({ defaultSniperEnabled: v })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Image / Pinata Section ────────────────────────────────────────────────────
function ImageSection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  return (
    <div class="section">
      <div class="section-title">🖼 Image Upload (Pinata)</div>
      <div class="section-body">
        <div class="field">
          <label>Pinata API Key</label>
          <input type="password" value={config.pinataApiKey} onInput={e => onChange({ pinataApiKey: (e.target as HTMLInputElement).value })} placeholder="Pinata API Key" />
        </div>
        <div class="field">
          <label>Pinata Secret Key</label>
          <input type="password" value={config.pinataSecretKey} onInput={e => onChange({ pinataSecretKey: (e.target as HTMLInputElement).value })} placeholder="Pinata Secret API Key" />
        </div>
        <div class="info">
          Get your keys at <a href="https://app.pinata.cloud/keys" target="_blank" rel="noreferrer">app.pinata.cloud/keys</a>.
          Free tier supports ~100 images/month (1GB). Keys are stored in chrome.storage.local — encrypted at OS level.
        </div>
      </div>
    </div>
  );
}

// ─── Default Rewards Section ───────────────────────────────────────────────────
function RewardsSection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  const rewards = config.defaultRewards;
  const total = rewards.reduce((s, r) => s + r.bps, 0);

  function update(i: number, patch: Partial<typeof rewards[0]>) {
    onChange({ defaultRewards: rewards.map((r, idx) => idx === i ? { ...r, ...patch } : r) });
  }
  function add() {
    if (rewards.length >= 7) return;
    onChange({ defaultRewards: [...rewards, { admin: config.tokenAdmin as `0x${string}`, recipient: config.tokenAdmin as `0x${string}`, bps: 0, token: 'Both' as const }] });
  }
  function remove(i: number) {
    onChange({ defaultRewards: rewards.filter((_, idx) => idx !== i) });
  }

  return (
    <div class="section">
      <div class="section-title">💰 Default Rewards Template</div>
      <div class="section-body">
        <div class="info" style={{ marginBottom: '12px' }}>
          These reward slots are pre-filled in every new deploy. Leave empty to use a single 100% slot pointing to your tokenAdmin address.
        </div>

        {rewards.map((r, i) => (
          <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '6px', padding: '10px', marginBottom: '8px' }}>
            <div class="field-row">
              <div class="field">
                <label>Admin</label>
                <input value={r.admin} onInput={e => update(i, { admin: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace', fontSize: '11px' }} />
              </div>
              <div class="field">
                <label>Recipient</label>
                <input value={r.recipient} onInput={e => update(i, { recipient: (e.target as HTMLInputElement).value as any })} placeholder="0x..." style={{ fontFamily: 'monospace', fontSize: '11px' }} />
              </div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>BPS (0–10000)</label>
                <input type="number" min={0} max={10000} value={r.bps} onInput={e => update(i, { bps: Number((e.target as HTMLInputElement).value) })} />
              </div>
              <div class="field">
                <label>Token</label>
                <select value={r.token} onChange={e => update(i, { token: (e.target as HTMLSelectElement).value as any })}>
                  <option value="Both">Both</option>
                  <option value="Clanker">Clanker</option>
                  <option value="Paired">Paired</option>
                </select>
              </div>
              <button class="btn btn-sm btn-danger" onClick={() => remove(i)} style={{ alignSelf: 'flex-end', marginBottom: '12px' }}>✕</button>
            </div>
          </div>
        ))}

        {/* BPS status */}
        <div style={{ fontSize: '12px', color: total === 10000 ? 'var(--green)' : 'var(--yellow)', marginBottom: '8px' }}>
          {rewards.length > 0 ? (total === 10000 ? `✓ ${total} bps (100%)` : `⚠️ ${total} / 10000 bps`) : 'No slots — uses single 100% slot at deploy time'}
        </div>

        {rewards.length < 7 && (
          <button class="btn btn-secondary btn-sm" onClick={add}>+ Add Slot</button>
        )}
      </div>
    </div>
  );
}

// ─── Templates Section ────────────────────────────────────────────────────────
function TemplatesSection({ config, onChange }: { config: ExtensionConfig; onChange: (p: Partial<ExtensionConfig>) => void }) {
  const [saveName, setSaveName] = useState('');

  function saveTemplate(formConfig: Partial<DeployFormState>) {
    if (!saveName.trim()) return;
    const template = {
      id: crypto.randomUUID(),
      name: saveName.trim(),
      config: formConfig,
      createdAt: Date.now(),
    };
    onChange({ templates: [...config.templates, template] });
    setSaveName('');
  }

  function deleteTemplate(id: string) {
    onChange({ templates: config.templates.filter(t => t.id !== id) });
  }

  // Snapshot the current deploy defaults as a template
  function snapshotDefaults() {
    const snap: Partial<DeployFormState> = {
      chainId: config.defaultChain,
      feeType: config.defaultFeeType,
      staticClankerFeeBps: config.defaultStaticClankerFeeBps,
      staticPairedFeeBps: config.defaultStaticPairedFeeBps,
      dynamicBaseBps: config.defaultDynamicBaseBps,
      dynamicMaxBps: config.defaultDynamicMaxBps,
      poolPreset: config.defaultPoolPreset,
      marketCap: config.defaultMarketCap,
      sniperEnabled: config.defaultSniperEnabled,
      sniperStartingFee: config.sniperStartingFee,
      sniperEndingFee: config.sniperEndingFee,
      sniperSecondsToDecay: config.sniperSecondsToDecay,
    };
    saveTemplate(snap);
  }

  return (
    <div class="section">
      <div class="section-title">📋 Named Deploy Templates</div>
      <div class="section-body">
        <div class="info" style={{ marginBottom: '12px' }}>
          Save your current deploy defaults as a named template. Load a template in the popup to instantly apply all settings.
        </div>

        {/* Save new template from current defaults */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input
            value={saveName}
            onInput={e => setSaveName((e.target as HTMLInputElement).value)}
            placeholder="Template name (e.g. Base High Fee, Sniper)"
            style={{ flex: 1, padding: '6px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text)' }}
          />
          <button class="btn btn-primary btn-sm" onClick={snapshotDefaults} disabled={!saveName.trim()}>
            Save Current Defaults
          </button>
        </div>

        {/* Template list */}
        {config.templates.length === 0 ? (
          <div class="info" style={{ textAlign: 'center', padding: '12px' }}>No templates saved yet.</div>
        ) : (
          config.templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg3)', borderRadius: '6px', marginBottom: '6px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{t.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  {new Date(t.createdAt).toLocaleDateString()} ·{' '}
                  chain {(t.config as any).chainId ?? '?'} ·{' '}
                  {(t.config as any).feeType === 'dynamic'
                    ? `dyn ${((t.config as any).dynamicBaseBps/100).toFixed(1)}%–${((t.config as any).dynamicMaxBps/100).toFixed(1)}%`
                    : `static ${((t.config as any).staticClankerFeeBps/100).toFixed(1)}%`}
                </div>
              </div>
              <button class="btn btn-sm btn-danger" onClick={() => deleteTemplate(t.id)}>🗑</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Main Options App ─────────────────────────────────────────────────────────
function Options() {
  const [config, setConfig] = useState<ExtensionConfig>(CONFIG_DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.get().then(setConfig);
  }, []);

  function onChange(patch: Partial<ExtensionConfig>) {
    setConfig(prev => ({ ...prev, ...patch }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    await storage.set(config);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div class="page" style={{ paddingBottom: '80px' }}>
      <style>{css}</style>
      <h1>🔷 Clanker Deployer</h1>
      <div class="subtitle">Extension Options · Personal use only</div>

      <WalletSection config={config} onChange={onChange} />
      <IdentitySection config={config} onChange={onChange} />
      <DeploySection config={config} onChange={onChange} />
      <ImageSection config={config} onChange={onChange} />
      <RewardsSection config={config} onChange={onChange} />
      <TemplatesSection config={config} onChange={onChange} />

      {/* Save bar */}
      <div class="save-bar">
        <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
          {saving ? '⏳ Saving...' : saved ? '✅ Settings saved!' : 'Unsaved changes'}
        </span>
        <button class="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <span class="spinner" /> : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}

render(<Options />, document.getElementById('app')!);
