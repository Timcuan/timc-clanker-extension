# Clanker Extension — Phase 3: Popup + Options UI

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Phase 1 and Phase 2 complete.

**Goal:** Build the complete popup (deploy form, quick deploy, confirm/pending/success/history views, batch UI) and the options page (wallet vault, identity, deploy defaults, image config, templates).

**Architecture:** Preact components + plain CSS. Popup is a state machine: `form → confirm → pending → success`. Options page has tabbed sections. All onchain calls go through `chrome.runtime.sendMessage` to the service worker — never direct SDK imports in UI.

**Tech Stack:** Preact ^10, plain CSS variables, chrome.runtime messaging

**Spec:** `docs/superpowers/specs/2026-03-17-timc-clanker-extension-design.md` — "Popup UI — Views" and "Full Deploy Form" sections

---

## Task 1: Shared UI Utilities + CSS Variables

**Files:**
- Create: `src/popup/popup.css`
- Create: `src/lib/bg-send.ts` (typed sendMessage helper)

- [ ] **Step 1: Create src/lib/bg-send.ts**

Typed wrapper so popup components never use raw `chrome.runtime.sendMessage`.

```typescript
import type { BgMessage, BgResult } from './messages.js';

export async function bgSend<T extends BgMessage>(
  msg: T
): Promise<BgResult<T['type']>> {
  return chrome.runtime.sendMessage(msg);
}
```

- [ ] **Step 2: Create src/popup/popup.css**

```css
:root {
  --bg: #0f0f13;
  --bg2: #1a1a22;
  --bg3: #24242e;
  --border: #2e2e3a;
  --text: #e8e8f0;
  --text-dim: #7a7a96;
  --accent: #6c5ce7;
  --accent-hover: #7d6ff0;
  --green: #00c896;
  --red: #ff4757;
  --yellow: #ffd32a;
  --orange: #ff6b35;
  --radius: 8px;
  --radius-sm: 4px;
  --width: 400px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  width: var(--width);
  min-height: 480px;
  max-height: 600px;
  overflow-y: auto;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--bg2);
}
.header-title { font-weight: 600; font-size: 14px; }
.header-actions { display: flex; gap: 6px; }
.icon-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
}
.icon-btn:hover { background: var(--bg3); color: var(--text); }

/* Quick deploy card */
.quick-card {
  padding: 14px;
  border-bottom: 1px solid var(--border);
}
.token-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.token-img {
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  object-fit: cover;
  background: var(--bg3);
}
.token-info h2 { font-size: 16px; font-weight: 700; }
.token-info .symbol { color: var(--text-dim); font-size: 12px; }
.status-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
  font-size: 11px;
}
.status-badge {
  padding: 2px 6px;
  border-radius: 100px;
  border: 1px solid var(--border);
  color: var(--text-dim);
}
.status-badge.ok { border-color: var(--green); color: var(--green); }
.status-badge.warn { border-color: var(--yellow); color: var(--yellow); }
.status-badge.err { border-color: var(--red); color: var(--red); }
.status-badge.loading { border-color: var(--accent); color: var(--accent); }

/* Buttons */
.btn {
  display: block;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: opacity 0.15s;
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-secondary {
  background: var(--bg3);
  color: var(--text);
  border: 1px solid var(--border);
}
.btn-secondary:hover:not(:disabled) { background: var(--border); }
.btn-danger { background: var(--red); color: #fff; }
.btn-sm { padding: 6px 12px; font-size: 12px; width: auto; display: inline-block; }

/* Form sections (collapsible) */
.form-area { padding: 10px 14px; }
.section {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 8px;
  overflow: hidden;
}
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg2);
  cursor: pointer;
  user-select: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}
.section-header:hover { color: var(--text); }
.section-header .summary { font-weight: 400; color: var(--text-dim); margin-left: 8px; }
.section-body { padding: 12px; background: var(--bg); }
.section-body.hidden { display: none; }

/* Form fields */
.field { margin-bottom: 10px; }
.field label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 4px; }
.field input, .field select, .field textarea {
  width: 100%;
  padding: 7px 10px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
}
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.field input.warn { border-color: var(--yellow); }
.field-row { display: flex; gap: 8px; }
.field-row .field { flex: 1; }

/* Chips (preset selector) */
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chip {
  padding: 4px 10px;
  border-radius: 100px;
  border: 1px solid var(--border);
  background: var(--bg2);
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
}
.chip.active { border-color: var(--accent); color: var(--accent); background: rgba(108,92,231,0.1); }
.chip:hover:not(.active) { border-color: var(--text-dim); color: var(--text); }

/* Toggle */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}
.toggle-label { font-size: 13px; }
.toggle {
  position: relative;
  width: 36px;
  height: 20px;
}
.toggle input { display: none; }
.toggle-track {
  position: absolute;
  inset: 0;
  border-radius: 100px;
  background: var(--bg3);
  cursor: pointer;
  transition: background 0.2s;
}
.toggle input:checked + .toggle-track { background: var(--accent); }
.toggle-track::after {
  content: '';
  position: absolute;
  left: 3px; top: 3px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
}
.toggle input:checked + .toggle-track::after { transform: translateX(16px); }

/* BPS bar */
.bps-bar-wrap { margin-top: 8px; }
.bps-bar { height: 6px; border-radius: 3px; background: var(--bg3); overflow: hidden; }
.bps-bar-fill { height: 100%; background: var(--green); transition: width 0.2s; }
.bps-bar-fill.invalid { background: var(--red); }
.bps-bar-label { font-size: 11px; color: var(--text-dim); margin-top: 4px; }
.bps-bar-label.invalid { color: var(--red); }

/* Confirm / Pending / Success views */
.view-body { padding: 14px; }
.view-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.summary-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.summary-row:last-child { border-bottom: none; }
.summary-row .label { color: var(--text-dim); }
.summary-row .value { font-weight: 500; font-family: monospace; }
.address { font-family: monospace; font-size: 11px; word-break: break-all; }
.copy-btn { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 12px; }

/* History */
.history-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.history-item:last-child { border-bottom: none; }
.history-name { font-weight: 600; }
.history-meta { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.history-actions { display: flex; gap: 6px; margin-top: 6px; }

/* Ghost Mode */
.ghost-panel {
  background: rgba(255, 71, 87, 0.08);
  border: 1px solid rgba(255, 71, 87, 0.3);
  border-radius: var(--radius);
  padding: 12px;
  margin-bottom: 12px;
}
.ghost-title { color: var(--red); font-weight: 700; margin-bottom: 8px; }

/* Spinner */
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  vertical-align: middle;
}

/* Link */
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
```

- [ ] **Step 3: Commit CSS + bgSend**

```bash
git add src/popup/popup.css src/lib/bg-send.ts && git commit -m "feat: popup CSS design system + typed bgSend helper"
```

---

## Task 2: Popup State Machine (App.tsx)

**Files:**
- Create: `src/popup/App.tsx`
- Modify: `src/popup/index.tsx`

- [ ] **Step 1: Create src/popup/App.tsx**

```tsx
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
          if ('error' in res) throw new Error(res.error);
          setState(prev => ({
            ...prev,
            form: { ...prev.form, imageUrl: (res as any).ipfsUrl },
            imageStatus: 'done',
          }));
        })
        .catch(e => {
          setState(prev => ({ ...prev, imageStatus: 'error', imageError: e.message }));
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

    // Deploy is split into two phases so PendingView can show txHash while waiting for confirmation.
    // Phase A: DEPLOY message → returns txHash immediately after broadcast
    // Phase B: WAIT_DEPLOY message with txHash → polls until confirmed, returns tokenAddress
    // Note: background/handlers/deploy.ts must be split to support this pattern.
    // Simpler alternative (Phase 3 implementation): use a single DEPLOY message but have
    // the SW send the txHash via a DEPLOY_TX_HASH chrome.runtime.sendMessage back to popup
    // before calling waitForTransaction. For now: use single-message approach but store
    // txHash in state as soon as it arrives via a polling mechanism.
    //
    // IMPLEMENTATION NOTE: The simplest correct approach for Phase 3 is to use a Port API
    // for deploy (like batch), sending DEPLOY_PROGRESS events. However to keep Phase 3 simpler,
    // we use the single sendMessage approach and accept that txHash is only shown in SuccessView.
    // The PendingView shows the spinner + "may take 60s". This is a known UX simplification.
    // A future enhancement can split this into a Port-based flow.

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
```

- [ ] **Step 2: Create src/popup/form-init.ts**

```typescript
import type { DeployFormState, ScrapedData } from '../lib/messages.js';
import type { ExtensionConfig } from '../lib/storage.js';
import { generateSymbol } from '../lib/symbol.js';

export function buildInitialFormState(
  config: ExtensionConfig,
  scraped: ScrapedData
): DeployFormState {
  const tokenAdmin = config.tokenAdmin;
  const defaultRewards = config.defaultRewards.length > 0
    ? config.defaultRewards
    : [{ admin: tokenAdmin, recipient: tokenAdmin, bps: 10000, token: 'Both' as const }];

  return {
    name: scraped.name || 'Unnamed Token',
    symbol: scraped.symbol || generateSymbol(scraped.name || '') || 'TOKEN',
    description: scraped.description || 'Deployed with Clanker',
    imageUrl: scraped.imageUrl || '',
    socials: scraped.socials || {},
    chainId: scraped.detectedChainId ?? config.defaultChain,
    pairedToken: config.defaultPairedToken,
    poolPreset: config.defaultPoolPreset,
    marketCap: config.defaultMarketCap,
    feeType: config.defaultFeeType,
    staticClankerFeeBps: config.defaultStaticClankerFeeBps,
    staticPairedFeeBps: config.defaultStaticPairedFeeBps,
    dynamicBaseBps: config.defaultDynamicBaseBps,
    dynamicMaxBps: config.defaultDynamicMaxBps,
    sniperEnabled: config.defaultSniperEnabled,
    sniperStartingFee: config.sniperStartingFee,
    sniperEndingFee: config.sniperEndingFee,
    sniperSecondsToDecay: config.sniperSecondsToDecay,
    vaultEnabled: false,
    vaultSupplyPct: 10,
    vaultLockupDays: 30,
    vaultVestingDays: 0,
    vaultRecipient: '',
    devBuyEnabled: false,
    devBuyAmount: '0.05',
    devBuyRecipient: '',
    airdropEnabled: false,
    airdropMerkleRoot: '',
    airdropAmount: '',
    airdropLockupDays: 0,
    airdropVestingDays: 0,
    rewards: defaultRewards,
    tokenAdmin,
    vanityEnabled: false,
    customSalt: '',
    simulateBeforeDeploy: true,
    ghostMode: false,
    ghostTargetAddress: '',
    ghostYourShareBps: 9900,
  };
}
```

- [ ] **Step 3: Update src/popup/index.tsx**

```tsx
import { render } from 'preact';
import { App } from './App.js';
import './popup.css';

render(<App />, document.getElementById('app')!);
```

- [ ] **Step 4: Commit App skeleton**

```bash
git add src/popup/App.tsx src/popup/form-init.ts src/popup/index.tsx && git commit -m "feat: popup App state machine — loading, form, confirm, pending, success, history views"
```

---

## Task 3: FormView

**Files:**
- Create: `src/popup/views/FormView.tsx`
- Create: `src/popup/components/CollapsibleSection.tsx`
- Create: `src/popup/components/FeeSection.tsx`
- Create: `src/popup/components/RewardsSection.tsx`

- [ ] **Step 1: Create src/popup/components/CollapsibleSection.tsx**

```tsx
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ComponentChildren;
}

export function CollapsibleSection({ title, summary, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div class="section">
      <div class="section-header" onClick={() => setOpen(o => !o)}>
        <span>{open ? '▼' : '▶'} {title}</span>
        {!open && summary && <span class="summary">{summary}</span>}
      </div>
      <div class={`section-body ${open ? '' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/popup/components/FeeSection.tsx**

```tsx
import type { DeployFormState } from '../../lib/messages.js';

interface Props {
  form: DeployFormState;
  chainId: number;
  onChange: (patch: Partial<DeployFormState>) => void;
}

// Chains where dynamic fees are NOT available (feeDynamicHook = 0x0)
const NO_DYNAMIC_FEE_CHAINS = [1]; // Ethereum mainnet

export function FeeSection({ form, chainId, onChange }: Props) {
  const dynamicDisabled = NO_DYNAMIC_FEE_CHAINS.includes(chainId);

  return (
    <div>
      <div class="field">
        <label>Fee Type</label>
        <div class="chips">
          <button
            class={`chip ${form.feeType === 'static' ? 'active' : ''}`}
            onClick={() => onChange({ feeType: 'static' })}
          >Static</button>
          <button
            class={`chip ${form.feeType === 'dynamic' ? 'active' : ''}`}
            onClick={() => !dynamicDisabled && onChange({ feeType: 'dynamic' })}
            disabled={dynamicDisabled}
            title={dynamicDisabled ? 'Dynamic fees not available on Ethereum Mainnet' : undefined}
          >Dynamic</button>
        </div>
      </div>

      {form.feeType === 'static' && (
        <div>
          <div class="chips" style={{ marginBottom: '8px' }}>
            <button class={`chip ${form.staticClankerFeeBps === 1000 && form.staticPairedFeeBps === 0 ? 'active' : ''}`}
              onClick={() => onChange({ staticClankerFeeBps: 1000, staticPairedFeeBps: 0 })}>10%</button>
            <button class={`chip ${form.staticClankerFeeBps === 500 && form.staticPairedFeeBps === 0 ? 'active' : ''}`}
              onClick={() => onChange({ staticClankerFeeBps: 500, staticPairedFeeBps: 0 })}>5%</button>
            <button class={`chip ${form.staticClankerFeeBps === 300 && form.staticPairedFeeBps === 300 ? 'active' : ''}`}
              onClick={() => onChange({ staticClankerFeeBps: 300, staticPairedFeeBps: 300 })}>3%+3%</button>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Clanker Fee ({(form.staticClankerFeeBps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={2000} step={50}
                value={form.staticClankerFeeBps}
                onInput={e => onChange({ staticClankerFeeBps: +e.currentTarget.value })} />
            </div>
            <div class="field">
              <label>Paired Fee ({(form.staticPairedFeeBps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={2000} step={50}
                value={form.staticPairedFeeBps}
                onInput={e => onChange({ staticPairedFeeBps: +e.currentTarget.value })} />
            </div>
          </div>
          {(form.staticClankerFeeBps + form.staticPairedFeeBps) > 600 && (
            <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
              ℹ️ Total &gt;6% — token deploys normally but won't receive Blue Badge on clanker.world
            </p>
          )}
        </div>
      )}

      {form.feeType === 'dynamic' && (
        <div>
          <div class="chips" style={{ marginBottom: '8px' }}>
            <button class={`chip ${form.dynamicBaseBps === 100 && form.dynamicMaxBps === 1000 ? 'active' : ''}`}
              onClick={() => onChange({ dynamicBaseBps: 100, dynamicMaxBps: 1000 })}>1%–10%</button>
            <button class={`chip ${form.dynamicBaseBps === 100 && form.dynamicMaxBps === 500 ? 'active' : ''}`}
              onClick={() => onChange({ dynamicBaseBps: 100, dynamicMaxBps: 500 })}>1%–5%</button>
            <button class={`chip ${form.dynamicBaseBps === 100 && form.dynamicMaxBps === 300 ? 'active' : ''}`}
              onClick={() => onChange({ dynamicBaseBps: 100, dynamicMaxBps: 300 })}>1%–3%</button>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Base Fee ({(form.dynamicBaseBps / 100).toFixed(2)}%)</label>
              <input type="number" min={25} max={2000} step={25}
                value={form.dynamicBaseBps}
                onInput={e => onChange({ dynamicBaseBps: +e.currentTarget.value })} />
            </div>
            <div class="field">
              <label>Max Fee ({(form.dynamicMaxBps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={3000} step={50}
                value={form.dynamicMaxBps}
                onInput={e => onChange({ dynamicMaxBps: +e.currentTarget.value })} />
            </div>
          </div>
          {form.dynamicMaxBps <= form.dynamicBaseBps && (
            <p style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px' }}>
              ⚠️ Max fee must be greater than base fee
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create src/popup/components/RewardsSection.tsx**

```tsx
import type { DeployFormState } from '../../lib/messages.js';

interface Props {
  rewards: DeployFormState['rewards'];
  locked?: boolean;
  onChange: (rewards: DeployFormState['rewards']) => void;
}

const TOKEN_OPTIONS = ['Both', 'Clanker', 'Paired'] as const;

export function RewardsSection({ rewards, locked, onChange }: Props) {
  const totalBps = rewards.reduce((s, r) => s + r.bps, 0);
  const valid = totalBps === 10000;

  function updateRow(i: number, patch: Partial<DeployFormState['rewards'][0]>) {
    onChange(rewards.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function addRow() {
    if (rewards.length >= 7) return;
    onChange([...rewards, {
      admin: '' as `0x${string}`,
      recipient: '' as `0x${string}`,
      bps: 0,
      token: 'Both',
    }]);
  }

  function removeRow(i: number) {
    onChange(rewards.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      {locked && (
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px' }}>
          🔒 Reward slots locked in Ghost Mode — managed automatically
        </p>
      )}

      {rewards.map((r, i) => (
        <div key={i} style={{ marginBottom: '8px', padding: '8px', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)' }}>
          <div class="field-row">
            <div class="field" style={{ flex: 2 }}>
              <label>Recipient</label>
              <input value={r.recipient} disabled={locked}
                onInput={e => updateRow(i, { recipient: e.currentTarget.value as `0x${string}` })} />
            </div>
            <div class="field" style={{ flex: 1 }}>
              <label>BPS ({(r.bps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={10000} value={r.bps} disabled={locked}
                onInput={e => updateRow(i, { bps: +e.currentTarget.value })} />
            </div>
          </div>
          <div class="field-row">
            <div class="field" style={{ flex: 2 }}>
              <label>Admin</label>
              <input value={r.admin} disabled={locked}
                onInput={e => updateRow(i, { admin: e.currentTarget.value as `0x${string}` })} />
            </div>
            <div class="field" style={{ flex: 1 }}>
              <label>Token</label>
              <select value={r.token} disabled={locked}
                onChange={e => updateRow(i, { token: e.currentTarget.value as any })}>
                {TOKEN_OPTIONS.map(t => <option value={t}>{t}</option>)}
              </select>
            </div>
            {!locked && (
              <button class="btn btn-danger btn-sm" style={{ alignSelf: 'flex-end', marginBottom: '10px' }}
                onClick={() => removeRow(i)}>✕</button>
            )}
          </div>
        </div>
      ))}

      {!locked && rewards.length < 7 && (
        <button class="btn btn-secondary btn-sm" onClick={addRow}>+ Add Recipient</button>
      )}

      <div class="bps-bar-wrap">
        <div class="bps-bar">
          <div class={`bps-bar-fill ${valid ? '' : 'invalid'}`}
            style={{ width: `${Math.min(100, totalBps / 100)}%` }} />
        </div>
        <p class={`bps-bar-label ${valid ? '' : 'invalid'}`}>
          {valid ? `✓ ${totalBps / 100}% allocated` : `⚠ ${totalBps / 100}% — must equal 100%`}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create src/popup/views/FormView.tsx**

```tsx
import type { DeployFormState, ScrapedData } from '../../lib/messages.js';
import { CollapsibleSection } from '../components/CollapsibleSection.js';
import { FeeSection } from '../components/FeeSection.js';
import { RewardsSection } from '../components/RewardsSection.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

const CHAIN_OPTIONS = Object.entries(CHAIN_CONFIG).map(([id, c]) => ({ id: +id, name: c.name }));

const PAIRED_TOKEN_OPTIONS = [
  { label: 'WETH', value: 'WETH' },
  { label: 'DEGEN', value: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed' },
  { label: 'CLANKER', value: '0x1bc0c42215582d5A085795f4baDbaC3ff36d1Bcb' },
  { label: 'ANON', value: '0x0Db510e79909666d6dEc7f5e49370838c16D950f' },
  { label: 'HIGHER', value: '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe' },
];

interface Props {
  form: DeployFormState;
  scraped: ScrapedData;
  imageStatus: 'idle' | 'uploading' | 'done' | 'error';
  imageError?: string;
  deployError?: string;
  onFormChange: (patch: Partial<DeployFormState>) => void;
  onDeploy: () => void;
  onHistory: () => void;
}

const SNIPER_CHAINS = [8453, 1, 143]; // Base, Mainnet, Monad — have mevModuleV2

export function FormView({ form, scraped, imageStatus, imageError, deployError, onFormChange, onDeploy, onHistory }: Props) {
  const rewardBpsValid = form.rewards.reduce((s, r) => s + r.bps, 0) === 10000;
  const imageReady = imageStatus === 'done' || imageStatus === 'idle' || form.imageUrl.startsWith('ipfs://');
  const deployBlocked = !imageReady || !rewardBpsValid || !form.tokenAdmin || form.tokenAdmin === '0x0000000000000000000000000000000000000000';

  const sourceLabel = scraped.source ? `${scraped.source.toUpperCase()}` : 'Generic';
  const feeSummary = form.feeType === 'static'
    ? `${(form.staticClankerFeeBps / 100).toFixed(0)}% static`
    : `${(form.dynamicBaseBps / 100).toFixed(0)}%–${(form.dynamicMaxBps / 100).toFixed(0)}% dynamic`;

  return (
    <div>
      <div class="header">
        <span class="header-title">🔷 Clanker Deployer</span>
        <div class="header-actions">
          <button class="icon-btn" onClick={() => chrome.runtime.openOptionsPage()} title="Options">⚙</button>
          <button class="icon-btn" onClick={onHistory} title="History">📋</button>
        </div>
      </div>

      <div class="quick-card">
        <div class="token-preview">
          {form.imageUrl ? (
            <img class="token-img" src={form.imageUrl.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${form.imageUrl.slice(7)}` : form.imageUrl} alt="" />
          ) : (
            <div class="token-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '20px' }}>🪙</div>
          )}
          <div class="token-info">
            <h2>{form.name || 'Unnamed Token'}</h2>
            <div class="symbol">${form.symbol || 'TOKEN'} · {CHAIN_CONFIG[form.chainId]?.name ?? 'Base'}</div>
          </div>
        </div>

        <div class="status-row">
          <span class={`status-badge ${scraped.source ? 'ok' : ''}`}>{sourceLabel}</span>
          <span class={`status-badge ${scraped.messageId ? 'ok' : 'warn'}`}>
            {scraped.messageId ? `context ✓` : 'context (synthetic)'}
          </span>
          <span class={`status-badge ${imageStatus === 'uploading' ? 'loading' : imageStatus === 'error' ? 'err' : 'ok'}`}>
            {imageStatus === 'uploading' ? '⏳ img uploading' : imageStatus === 'error' ? '⚠ img failed' : '✓ img'}
          </span>
          <span class={`status-badge ${form.tokenAdmin && form.tokenAdmin !== '0x0000000000000000000000000000000000000000' ? 'ok' : 'err'}`}>
            {form.tokenAdmin && form.tokenAdmin !== '0x0000000000000000000000000000000000000000' ? '✓ wallet' : '⚠ no wallet'}
          </span>
        </div>

        {deployError && (
          <p style={{ color: 'var(--red)', fontSize: '12px', marginBottom: '8px' }}>⚠ {deployError}</p>
        )}

        <button class="btn btn-primary" onClick={onDeploy} disabled={deployBlocked}>
          {deployBlocked ? '⚠ Setup required' : '⚡ QUICK DEPLOY'}
        </button>
      </div>

      <div class="form-area">
        {/* Section 1: Basic Info — always open */}
        <CollapsibleSection title="Basic Info" defaultOpen>
          <div class="field">
            <label>Name</label>
            <input value={form.name} onInput={e => onFormChange({ name: e.currentTarget.value })} />
          </div>
          <div class="field">
            <label>Symbol (max 8 chars)</label>
            <input value={form.symbol} maxLength={8}
              onInput={e => onFormChange({ symbol: e.currentTarget.value.toUpperCase().slice(0, 8) })} />
          </div>
          <div class="field">
            <label>Description</label>
            <textarea rows={2} value={form.description}
              onInput={e => onFormChange({ description: e.currentTarget.value })} />
          </div>
          <div class="field-row">
            <div class="field">
              <label>Twitter</label>
              <input value={form.socials.twitter ?? ''}
                onInput={e => onFormChange({ socials: { ...form.socials, twitter: e.currentTarget.value } })} />
            </div>
            <div class="field">
              <label>Telegram</label>
              <input value={form.socials.telegram ?? ''}
                onInput={e => onFormChange({ socials: { ...form.socials, telegram: e.currentTarget.value } })} />
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 2: Network & Pool */}
        <CollapsibleSection title="Network & Pool" summary={`${CHAIN_CONFIG[form.chainId]?.name} / ${form.poolPreset}`}>
          <div class="field">
            <label>Chain</label>
            <select value={form.chainId} onChange={e => onFormChange({ chainId: +e.currentTarget.value })}>
              {CHAIN_OPTIONS.map(c => <option value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Paired Token</label>
            <select value={form.pairedToken} onChange={e => onFormChange({ pairedToken: e.currentTarget.value as any })}>
              {PAIRED_TOKEN_OPTIONS.map(p => <option value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div class="field">
            <label>Pool Preset</label>
            <div class="chips">
              {(['Standard', 'Project', 'TwentyETH'] as const).map(p => (
                <button class={`chip ${form.poolPreset === p ? 'active' : ''}`}
                  onClick={() => onFormChange({ poolPreset: p })}>{p}</button>
              ))}
            </div>
          </div>
          <div class="field">
            <label>Starting Market Cap ({CHAIN_CONFIG[form.chainId]?.marketCapUnit ?? 'ETH'}): {form.marketCap}</label>
            <input type="range" min={0.1} max={100} step={0.1} value={form.marketCap}
              onInput={e => onFormChange({ marketCap: +e.currentTarget.value })} />
          </div>
        </CollapsibleSection>

        {/* Section 3: Fee Config */}
        <CollapsibleSection title="Fee Configuration" summary={feeSummary}>
          <FeeSection form={form} chainId={form.chainId} onChange={onFormChange} />
        </CollapsibleSection>

        {/* Section 4: Sniper Protection */}
        {SNIPER_CHAINS.includes(form.chainId) && (
          <CollapsibleSection title="Sniper Protection" summary={form.sniperEnabled ? 'enabled' : 'off'}>
            <div class="toggle-row">
              <span class="toggle-label">Enable sniper protection</span>
              <label class="toggle">
                <input type="checkbox" checked={form.sniperEnabled}
                  onChange={e => onFormChange({ sniperEnabled: e.currentTarget.checked })} />
                <span class="toggle-track" />
              </label>
            </div>
            {form.sniperEnabled && (
              <div>
                <div class="field-row">
                  <div class="field">
                    <label>Starting Fee ({(form.sniperStartingFee / 10000).toFixed(1)}%)</label>
                    <input type="number" min={30000} max={800000}
                      value={form.sniperStartingFee}
                      onInput={e => onFormChange({ sniperStartingFee: +e.currentTarget.value })} />
                  </div>
                  <div class="field">
                    <label>Ending Fee ({(form.sniperEndingFee / 10000).toFixed(1)}%)</label>
                    <input type="number" min={30000} max={800000}
                      value={form.sniperEndingFee}
                      onInput={e => onFormChange({ sniperEndingFee: +e.currentTarget.value })} />
                  </div>
                </div>
                <div class="field">
                  <label>Decay (seconds)</label>
                  <input type="number" min={1} max={3600} value={form.sniperSecondsToDecay}
                    onInput={e => onFormChange({ sniperSecondsToDecay: +e.currentTarget.value })} />
                </div>
              </div>
            )}
          </CollapsibleSection>
        )}

        {/* Section 5: Extensions */}
        <CollapsibleSection title="Extensions" summary="vault / dev buy / airdrop">
          {/* Creator Vault */}
          <div class="toggle-row">
            <span class="toggle-label">Creator Vault</span>
            <label class="toggle">
              <input type="checkbox" checked={form.vaultEnabled}
                onChange={e => onFormChange({ vaultEnabled: e.currentTarget.checked })} />
              <span class="toggle-track" />
            </label>
          </div>
          {form.vaultEnabled && (
            <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--accent)' }}>
              <div class="field">
                <label>Supply % (0–90%)</label>
                <input type="number" min={0} max={90} value={form.vaultSupplyPct}
                  onInput={e => onFormChange({ vaultSupplyPct: +e.currentTarget.value })} />
              </div>
              <div class="field">
                <label>Lockup (days)</label>
                <div class="chips">
                  {[7, 30, 90, 365].map(d => (
                    <button class={`chip ${form.vaultLockupDays === d ? 'active' : ''}`}
                      onClick={() => onFormChange({ vaultLockupDays: d })}>{d}d</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dev Buy */}
          <div class="toggle-row" style={{ marginTop: '8px' }}>
            <span class="toggle-label">Dev Buy</span>
            <label class="toggle">
              <input type="checkbox" checked={form.devBuyEnabled}
                onChange={e => onFormChange({ devBuyEnabled: e.currentTarget.checked })} />
              <span class="toggle-track" />
            </label>
          </div>
          {form.devBuyEnabled && (
            <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--accent)' }}>
              <div class="field">
                <label>ETH Amount</label>
                <input value={form.devBuyAmount}
                  onInput={e => onFormChange({ devBuyAmount: e.currentTarget.value })} />
              </div>
              {form.pairedToken !== 'WETH' && (
                <p style={{ fontSize: '11px', color: 'var(--yellow)' }}>
                  ⚠️ Dev Buy with non-WETH pairs requires a poolKey — check Advanced settings.
                </p>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Section 6: Rewards */}
        <CollapsibleSection title="Rewards" summary={form.rewards.length + ' recipients'}>
          <RewardsSection
            rewards={form.rewards}
            locked={form.ghostMode}
            onChange={rewards => onFormChange({ rewards })}
          />
        </CollapsibleSection>

        {/* Section 7: Advanced */}
        <CollapsibleSection title="Advanced">
          <div class="toggle-row">
            <span class="toggle-label">Vanity address (...b07 suffix)</span>
            <label class="toggle">
              <input type="checkbox" checked={form.vanityEnabled}
                onChange={e => onFormChange({ vanityEnabled: e.currentTarget.checked })} />
              <span class="toggle-track" />
            </label>
          </div>
          <div class="toggle-row">
            <span class="toggle-label">Simulate before deploy</span>
            <label class="toggle">
              <input type="checkbox" checked={form.simulateBeforeDeploy}
                onChange={e => onFormChange({ simulateBeforeDeploy: e.currentTarget.checked })} />
              <span class="toggle-track" />
            </label>
          </div>

          {/* Ghost Mode */}
          <div class="toggle-row" style={{ marginTop: '8px' }}>
            <span class="toggle-label" style={{ color: form.ghostMode ? 'var(--red)' : undefined }}>
              👻 Ghost Deploy Mode
            </span>
            <label class="toggle">
              <input type="checkbox" checked={form.ghostMode}
                onChange={e => onFormChange({ ghostMode: e.currentTarget.checked })} />
              <span class="toggle-track" />
            </label>
          </div>
          {form.ghostMode && (
            <div class="ghost-panel">
              <div class="ghost-title">⚠️ GHOST DEPLOY MODE</div>
              <div class="field">
                <label>Token Admin (appears as creator)</label>
                <input value={form.ghostTargetAddress}
                  placeholder="0x..."
                  onInput={e => onFormChange({ ghostTargetAddress: e.currentTarget.value as `0x${string}` })} />
              </div>
              <div class="field">
                <label>Your reward share (%)</label>
                <input type="number" min={1} max={99} value={form.ghostYourShareBps / 100}
                  onInput={e => {
                    const pct = Math.min(99, Math.max(1, +e.currentTarget.value));
                    // Ghost Mode reward slots: admin MUST be yourAddress (the deploying wallet),
                    // NOT form.tokenAdmin (which in Ghost Mode IS the target address).
                    // In vault mode, yourAddress = the vault wallet's account.address.
                    // We use form.tokenAdmin here as a fallback display value for the non-ghost
                    // identity address — but the actual admin enforcement happens in ghost-validator.ts
                    // and deploy.ts uses rewardRecipient (vault wallet address) as admin.
                    // The UI preview uses config.tokenAdmin as a placeholder — deploy.ts overrides.
                    const yourAddr = form.tokenAdmin; // Options identity address (fee recipient)
                    const targetAddr = (form.ghostTargetAddress as `0x${string}`) || '0x0000000000000000000000000000000000000000';
                    onFormChange({
                      ghostYourShareBps: pct * 100,
                      rewards: [
                        // admin = yourAddr (you control this slot — you receive fees)
                        { admin: yourAddr, recipient: yourAddr, bps: pct * 100, token: 'Both' },
                        // admin = yourAddr (you still control target's slot — they can't reroute)
                        { admin: yourAddr, recipient: targetAddr, bps: (100 - pct) * 100, token: 'Both' },
                      ],
                    });
                  }} />
              </div>
            </div>
          )}
        </CollapsibleSection>

        <button class="btn btn-secondary" onClick={onDeploy} disabled={deployBlocked} style={{ marginTop: '8px' }}>
          Deploy (with edits)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit FormView**

```bash
git add src/popup/views/FormView.tsx src/popup/components/ && git commit -m "feat: FormView — quick deploy card, 7 collapsible sections, ghost mode UI"
```

---

## Task 4: Confirm / Pending / Success / History Views

**Files:**
- Create: `src/popup/views/ConfirmView.tsx`
- Create: `src/popup/views/PendingView.tsx`
- Create: `src/popup/views/SuccessView.tsx`
- Create: `src/popup/views/HistoryView.tsx`

- [ ] **Step 1: Create src/popup/views/ConfirmView.tsx**

```tsx
import type { DeployFormState } from '../../lib/messages.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  form: DeployFormState;
  onBack: () => void;
  onConfirm: () => void;
}

export function ConfirmView({ form, onBack, onConfirm }: Props) {
  const totalFee = form.feeType === 'static'
    ? `${((form.staticClankerFeeBps + form.staticPairedFeeBps) / 100).toFixed(0)}% static`
    : `${(form.dynamicBaseBps / 100).toFixed(1)}%–${(form.dynamicMaxBps / 100).toFixed(1)}% dynamic`;

  return (
    <div>
      <div class="header">
        <span class="header-title">Confirm Deploy</span>
        <button class="icon-btn" onClick={onBack}>← Back</button>
      </div>

      <div class="view-body">
        {form.ghostMode && (
          <div class="ghost-panel">
            <div class="ghost-title">⚠️ GHOST DEPLOY MODE</div>
            <div class="summary-row">
              <span class="label">Token Admin (appears as creator)</span>
              <span class="value address">{form.ghostTargetAddress}</span>
            </div>
            <div class="summary-row">
              <span class="label">Your fee share</span>
              <span class="value" style={{ color: 'var(--green)' }}>{(form.ghostYourShareBps / 100).toFixed(0)}% → you ✅</span>
            </div>
            <div class="summary-row">
              <span class="label">Target share</span>
              <span class="value">{((10000 - form.ghostYourShareBps) / 100).toFixed(0)}% → target</span>
            </div>
            <div class="summary-row">
              <span class="label">You control all reward slots</span>
              <span class="value" style={{ color: 'var(--green)' }}>✅</span>
            </div>
          </div>
        )}

        <div>
          <div class="summary-row"><span class="label">Token</span><span class="value">{form.name} (${form.symbol})</span></div>
          <div class="summary-row"><span class="label">Chain</span><span class="value">{CHAIN_CONFIG[form.chainId]?.name}</span></div>
          <div class="summary-row"><span class="label">Market Cap</span><span class="value">{form.marketCap} {CHAIN_CONFIG[form.chainId]?.marketCapUnit}</span></div>
          <div class="summary-row"><span class="label">Pool</span><span class="value">{form.poolPreset}</span></div>
          <div class="summary-row"><span class="label">Fees</span><span class="value">{totalFee}</span></div>
          {form.sniperEnabled && <div class="summary-row"><span class="label">Sniper</span><span class="value">enabled ✅</span></div>}
          {form.vaultEnabled && <div class="summary-row"><span class="label">Vault</span><span class="value">{form.vaultSupplyPct}% / {form.vaultLockupDays}d</span></div>}
          {form.devBuyEnabled && <div class="summary-row"><span class="label">Dev Buy</span><span class="value">{form.devBuyAmount} ETH</span></div>}
          <div class="summary-row"><span class="label">Rewards</span><span class="value">{form.rewards.length} recipient(s)</span></div>
          <div class="summary-row"><span class="label">Simulate</span><span class="value">{form.simulateBeforeDeploy ? 'yes ✅' : 'no ⚠'}</span></div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
          <button class="btn btn-secondary" onClick={onBack}>← Back</button>
          <button class="btn btn-primary" onClick={onConfirm}>Confirm & Sign</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/popup/views/PendingView.tsx**

```tsx
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  txHash?: `0x${string}`;
  chainId: number;
}

export function PendingView({ txHash, chainId }: Props) {
  const explorer = CHAIN_CONFIG[chainId]?.explorer ?? 'https://basescan.org';
  return (
    <div class="view-body" style={{ textAlign: 'center', paddingTop: '40px' }}>
      <div class="spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      <p style={{ marginTop: '16px', fontSize: '15px', fontWeight: 600 }}>
        Deploying on {CHAIN_CONFIG[chainId]?.name ?? 'chain'}...
      </p>
      {txHash && (
        <p style={{ marginTop: '8px' }}>
          <a href={`${explorer}/tx/${txHash}`} target="_blank">View on explorer ↗</a>
        </p>
      )}
      <p style={{ marginTop: '8px', color: 'var(--text-dim)', fontSize: '12px' }}>
        This may take up to 60 seconds
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create src/popup/views/SuccessView.tsx**

```tsx
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  tokenAddress: `0x${string}`;
  txHash: `0x${string}`;
  chainId: number;
  name: string;
  symbol: string;
  onDeployAnother: () => void;
}

export function SuccessView({ tokenAddress, txHash, chainId, name, symbol, onDeployAnother }: Props) {
  const explorer = CHAIN_CONFIG[chainId]?.explorer ?? 'https://basescan.org';
  const shortAddr = `${tokenAddress.slice(0, 8)}...${tokenAddress.slice(-6)}`;

  function copyAddress() {
    navigator.clipboard.writeText(tokenAddress);
  }

  return (
    <div class="view-body">
      <div class="view-title" style={{ color: 'var(--green)' }}>✅ Token Deployed!</div>

      <div style={{ marginBottom: '16px' }}>
        <p style={{ fontWeight: 600, fontSize: '15px' }}>{name} (${symbol})</p>
        <p class="address" style={{ marginTop: '6px', color: 'var(--text-dim)' }}>
          {tokenAddress}
          <button class="copy-btn" onClick={copyAddress}> [copy]</button>
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <a href={`https://clanker.world/clanker/${tokenAddress}`} target="_blank"
          class="btn btn-secondary btn-sm">clanker.world ↗</a>
        <a href={`${explorer}/token/${tokenAddress}`} target="_blank"
          class="btn btn-secondary btn-sm">Explorer ↗</a>
        <a href={`${explorer}/tx/${txHash}`} target="_blank"
          class="btn btn-secondary btn-sm">Tx ↗</a>
      </div>

      <button class="btn btn-primary" onClick={onDeployAnother}>Deploy Another</button>
    </div>
  );
}
```

- [ ] **Step 4: Create src/popup/views/HistoryView.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import type { DeployRecord } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props { onBack: () => void; }

export function HistoryView({ onBack }: Props) {
  const [records, setRecords] = useState<DeployRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [availableRewards, setAvailableRewards] = useState<Record<string, string>>({});

  useEffect(() => {
    bgSend({ type: 'GET_HISTORY' }).then(res => {
      if ('records' in res) {
        setRecords(res.records);
        // Fetch available rewards for each record
        res.records.forEach(r => {
          bgSend({ type: 'GET_AVAILABLE_REWARDS', token: r.address, recipient: r.rewardRecipient, chainId: r.chainId })
            .then(rewardRes => {
              if ('amount' in rewardRes) {
                setAvailableRewards(prev => ({ ...prev, [r.address]: rewardRes.amount }));
              }
            })
            .catch(() => {});
        });
      }
      setLoading(false);
    });
  }, []);

  async function claimFees(record: DeployRecord) {
    setClaiming(record.address);
    await bgSend({ type: 'CLAIM_REWARDS', token: record.address, recipient: record.rewardRecipient, chainId: record.chainId });
    setClaiming(null);
    // Refresh rewards
    const res = await bgSend({ type: 'GET_AVAILABLE_REWARDS', token: record.address, recipient: record.rewardRecipient, chainId: record.chainId });
    if ('amount' in res) {
      setAvailableRewards(prev => ({ ...prev, [record.address]: res.amount }));
    }
  }

  const explorer = (r: DeployRecord) => CHAIN_CONFIG[r.chainId]?.explorer ?? 'https://basescan.org';

  return (
    <div>
      <div class="header">
        <span class="header-title">Deployed Tokens</span>
        <button class="icon-btn" onClick={onBack}>← Back</button>
      </div>
      <div class="view-body">
        {loading && <p style={{ color: 'var(--text-dim)' }}><span class="spinner" /> Loading...</p>}
        {!loading && records.length === 0 && (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center', paddingTop: '40px' }}>No deployments yet</p>
        )}
        {records.map(r => {
          const rewardAmt = availableRewards[r.address];
          const rewardEth = rewardAmt ? (Number(BigInt(rewardAmt)) / 1e18).toFixed(4) : '...';
          return (
            <div key={r.address} class="history-item">
              <div class="history-name">
                {r.name} (${r.symbol})
                {r.isGhostDeploy && <span style={{ color: 'var(--text-dim)', fontSize: '11px' }}> 👻 ghost</span>}
              </div>
              <div class="history-meta">
                {CHAIN_CONFIG[r.chainId]?.name} · {new Date(r.deployedAt).toLocaleDateString()}
              </div>
              <div class="history-meta address">{r.address}</div>
              <div class="history-meta">
                Rewards: ~{rewardEth} ETH available
              </div>
              <div class="history-actions">
                <a href={`${explorer(r)}/token/${r.address}`} target="_blank"
                  class="btn btn-secondary btn-sm">Explorer ↗</a>
                <a href={`https://clanker.world/clanker/${r.address}`} target="_blank"
                  class="btn btn-secondary btn-sm">clanker.world ↗</a>
                <button class="btn btn-primary btn-sm"
                  disabled={claiming === r.address}
                  onClick={() => claimFees(r)}>
                  {claiming === r.address ? '...' : 'Claim'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit confirm/pending/success/history views**

```bash
git add src/popup/views/ && git commit -m "feat: confirm, pending, success, history views"
```

---

## Task 5: Options Page

**Files:**
- Create: `src/options/options.css` (reuse popup.css design tokens)
- Create: `src/options/Options.tsx` (tabbed layout)
- Create: `src/options/sections/WalletSection.tsx`
- Create: `src/options/sections/DeploySection.tsx`
- Create: `src/options/sections/ImageSection.tsx`
- Modify: `src/options/index.tsx`

- [ ] **Step 1: Create src/options/options.css**

```css
@import url('../popup/popup.css');

body {
  width: 100%;
  max-width: 640px;
  min-height: 100vh;
  max-height: none;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.tab {
  padding: 8px 16px;
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 13px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab:hover:not(.active) { color: var(--text); }

.section-title { font-size: 15px; font-weight: 700; margin-bottom: 16px; }
.save-btn { margin-top: 16px; }
```

- [ ] **Step 2: Create src/options/sections/WalletSection.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import { storage, type RotationMode } from '../../lib/storage.js';
import type { WalletVaultEntry } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const ROTATION_MODES: RotationMode[] = ['manual', 'round-robin', 'random', 'least-used'];

export function WalletSection() {
  const [entries, setEntries] = useState<WalletVaultEntry[]>([]);
  const [rotationMode, setRotationMode] = useState<RotationMode>('round-robin');
  const [vaultStatus, setVaultStatus] = useState<{ unlocked: boolean; walletCount: number } | null>(null);
  const [newName, setNewName] = useState('');
  const [newPk, setNewPk] = useState('');
  const [newAddr, setNewAddr] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    storage.get().then(c => { setEntries(c.vaultEntries); setRotationMode(c.rotationMode); });
    bgSend({ type: 'VAULT_STATUS' }).then(res => {
      if ('unlocked' in res) setVaultStatus({ unlocked: res.unlocked, walletCount: res.walletCount });
    });
  }, []);

  function generateNewKey() {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    setNewPk(pk);
    setNewAddr(account.address);
  }

  function onPkInput(pk: string) {
    setNewPk(pk);
    try {
      if (pk.startsWith('0x') && pk.length === 66) {
        const account = privateKeyToAccount(pk as `0x${string}`);
        setNewAddr(account.address);
      } else {
        setNewAddr('');
      }
    } catch { setNewAddr(''); }
  }

  async function addWallet() {
    if (!newName || !newPk || !addPassword) { setError('Name, private key, and password required'); return; }
    setSaving(true); setError('');
    try {
      // Encryption happens in the service worker (ADD_WALLET message) so plaintext PK
      // never exists in popup heap beyond this function call. (Security: Gotcha #1 analogue)
      const res = await chrome.runtime.sendMessage({ type: 'ADD_WALLET', name: newName, plainPk: newPk, password: addPassword });
      if (res?.error) throw new Error(res.error);
      // Reload vault entries from storage (SW updated them)
      const config = await storage.get();
      setEntries(config.vaultEntries);
      setNewName(''); setNewPk(''); setNewAddr(''); setAddPassword('');
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }

  async function toggleEntry(id: string) {
    const updated = entries.map(e => e.id === id ? { ...e, active: !e.active } : e);
    await storage.set({ vaultEntries: updated });
    setEntries(updated);
  }

  async function removeEntry(id: string) {
    const updated = entries.filter(e => e.id !== id);
    await storage.set({ vaultEntries: updated });
    setEntries(updated);
  }

  async function saveRotation() {
    await storage.set({ rotationMode });
  }

  async function lockVault() {
    await bgSend({ type: 'LOCK_VAULT' });
    setVaultStatus(prev => prev ? { ...prev, unlocked: false } : null);
  }

  return (
    <div>
      <div class="section-title">Wallet Vault</div>

      {vaultStatus && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ color: vaultStatus.unlocked ? 'var(--green)' : 'var(--text-dim)' }}>
            {vaultStatus.unlocked ? '🔓 Vault unlocked' : '🔒 Vault locked'}
          </span>
          {vaultStatus.unlocked && (
            <button class="btn btn-secondary btn-sm" onClick={lockVault}>Lock Now</button>
          )}
        </div>
      )}

      <div class="field" style={{ marginBottom: '16px' }}>
        <label>Rotation Mode</label>
        <select value={rotationMode} onChange={e => setRotationMode(e.currentTarget.value as RotationMode)}>
          {ROTATION_MODES.map(m => <option value={m}>{m}</option>)}
        </select>
        <button class="btn btn-secondary btn-sm save-btn" onClick={saveRotation}>Save</button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        {entries.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <label class="toggle" style={{ flexShrink: 0 }}>
              <input type="checkbox" checked={e.active} onChange={() => toggleEntry(e.id)} />
              <span class="toggle-track" />
            </label>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{e.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'monospace' }}>{e.address}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>deploys: {e.deployCount}</div>
            </div>
            <button class="btn btn-danger btn-sm" onClick={() => removeEntry(e.id)}>🗑</button>
          </div>
        ))}
        {entries.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No wallets in vault</p>}
      </div>

      <div style={{ background: 'var(--bg2)', padding: '12px', borderRadius: 'var(--radius)' }}>
        <div style={{ fontWeight: 600, marginBottom: '10px' }}>+ Add Wallet</div>
        <div class="field">
          <label>Name</label>
          <input value={newName} onInput={e => setNewName(e.currentTarget.value)} placeholder="Sniper A" />
        </div>
        <div class="field">
          <label>Private Key</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="password" value={newPk} style={{ flex: 1 }}
              onInput={e => onPkInput(e.currentTarget.value)} placeholder="0x..." />
            <button class="btn btn-secondary btn-sm" onClick={generateNewKey}>Generate</button>
          </div>
          {newAddr && <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px', fontFamily: 'monospace' }}>Address: {newAddr}</p>}
        </div>
        <div class="field">
          <label>Vault Password</label>
          <input type="password" value={addPassword} onInput={e => setAddPassword(e.currentTarget.value)} />
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: '12px' }}>{error}</p>}
        <button class="btn btn-primary save-btn" onClick={addWallet} disabled={saving}>
          {saving ? 'Saving...' : 'Save to Vault'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create src/options/sections/DeploySection.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import { storage } from '../../lib/storage.js';
import type { ExtensionConfig } from '../../lib/storage.js';

export function DeploySection() {
  const [config, setConfig] = useState<Partial<ExtensionConfig>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => { storage.get().then(setConfig); }, []);

  async function save() {
    await storage.set(config as ExtensionConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div class="section-title">Deploy Defaults</div>

      <div class="field">
        <label>tokenAdmin / Identity Address</label>
        <input value={config.tokenAdmin ?? ''} placeholder="0x..."
          onInput={e => setConfig(prev => ({ ...prev, tokenAdmin: e.currentTarget.value as `0x${string}` }))} />
        <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>
          Required for deploying. In vault mode, each wallet's own address is used automatically.
        </p>
      </div>

      <div class="field">
        <label>Default Chain</label>
        <select value={config.defaultChain ?? 8453}
          onChange={e => setConfig(prev => ({ ...prev, defaultChain: +e.currentTarget.value }))}>
          <option value={8453}>Base</option>
          <option value={1}>Ethereum</option>
          <option value={42161}>Arbitrum</option>
          <option value={130}>Unichain</option>
          <option value={143}>Monad</option>
        </select>
      </div>

      <div class="field">
        <label>Default Fee Type</label>
        <select value={config.defaultFeeType ?? 'static'}
          onChange={e => setConfig(prev => ({ ...prev, defaultFeeType: e.currentTarget.value as any }))}>
          <option value="static">Static</option>
          <option value="dynamic">Dynamic</option>
        </select>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Default Static Clanker Fee (bps)</label>
          <input type="number" min={0} max={2000} value={config.defaultStaticClankerFeeBps ?? 1000}
            onInput={e => setConfig(prev => ({ ...prev, defaultStaticClankerFeeBps: +e.currentTarget.value }))} />
        </div>
        <div class="field">
          <label>Default Static Paired Fee (bps)</label>
          <input type="number" min={0} max={2000} value={config.defaultStaticPairedFeeBps ?? 0}
            onInput={e => setConfig(prev => ({ ...prev, defaultStaticPairedFeeBps: +e.currentTarget.value }))} />
        </div>
      </div>

      <div class="field">
        <label>Default Pool Preset</label>
        <select value={config.defaultPoolPreset ?? 'Standard'}
          onChange={e => setConfig(prev => ({ ...prev, defaultPoolPreset: e.currentTarget.value as any }))}>
          <option value="Standard">Standard</option>
          <option value="Project">Project</option>
          <option value="TwentyETH">TwentyETH</option>
        </select>
      </div>

      <div class="toggle-row">
        <span class="toggle-label">Enable Quick Deploy by default</span>
        <label class="toggle">
          <input type="checkbox" checked={config.enableQuickDeploy ?? true}
            onChange={e => setConfig(prev => ({ ...prev, enableQuickDeploy: e.currentTarget.checked }))} />
          <span class="toggle-track" />
        </label>
      </div>

      <button class="btn btn-primary save-btn" onClick={save}>
        {saved ? '✓ Saved' : 'Save Defaults'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Create src/options/sections/ImageSection.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import { storage } from '../../lib/storage.js';

export function ImageSection() {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.get().then(c => { setApiKey(c.pinataApiKey); setSecretKey(c.pinataSecretKey); });
  }, []);

  async function save() {
    await storage.set({ pinataApiKey: apiKey, pinataSecretKey: secretKey });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div class="section-title">Image Upload (Pinata IPFS)</div>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '12px' }}>
        Get free API keys at pinata.cloud. Tokens require an IPFS image.
      </p>
      <div class="field">
        <label>Pinata API Key</label>
        <input value={apiKey} onInput={e => setApiKey(e.currentTarget.value)} />
      </div>
      <div class="field">
        <label>Pinata Secret API Key</label>
        <input type="password" value={secretKey} onInput={e => setSecretKey(e.currentTarget.value)} />
      </div>
      <button class="btn btn-primary save-btn" onClick={save}>
        {saved ? '✓ Saved' : 'Save Keys'}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Create src/options/sections/RewardsDefaultSection.tsx** (default rewards template)

```tsx
import { useState, useEffect } from 'preact/hooks';
import { storage } from '../../lib/storage.js';

type RewardEntry = { admin: `0x${string}`; recipient: `0x${string}`; bps: number; token: 'Both' | 'Clanker' | 'Paired' };

export function RewardsDefaultSection() {
  const [rewards, setRewards] = useState<RewardEntry[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => { storage.get().then(c => setRewards(c.defaultRewards as RewardEntry[])); }, []);

  const totalBps = rewards.reduce((s, r) => s + r.bps, 0);
  const valid = totalBps === 10000 || rewards.length === 0;

  function update(i: number, patch: Partial<RewardEntry>) {
    setRewards(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  async function save() {
    await storage.set({ defaultRewards: rewards as any });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <div class="section-title">Default Rewards Template</div>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '12px' }}>
        Applied to all new deploys. Leave empty to use single-recipient default (100% to tokenAdmin).
      </p>
      {rewards.map((r, i) => (
        <div key={i} style={{ padding: '8px', background: 'var(--bg2)', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}>
          <div class="field-row">
            <div class="field" style={{ flex: 2 }}>
              <label>Recipient</label>
              <input value={r.recipient} onInput={e => update(i, { recipient: e.currentTarget.value as `0x${string}` })} />
            </div>
            <div class="field">
              <label>BPS</label>
              <input type="number" min={0} max={10000} value={r.bps} onInput={e => update(i, { bps: +e.currentTarget.value })} />
            </div>
            <button class="btn btn-danger btn-sm" style={{ alignSelf: 'flex-end', marginBottom: '10px' }}
              onClick={() => setRewards(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
          </div>
          <div class="field-row">
            <div class="field" style={{ flex: 2 }}>
              <label>Admin (controller)</label>
              <input value={r.admin} onInput={e => update(i, { admin: e.currentTarget.value as `0x${string}` })} />
            </div>
            <div class="field">
              <label>Token</label>
              <select value={r.token} onChange={e => update(i, { token: e.currentTarget.value as any })}>
                <option>Both</option><option>Clanker</option><option>Paired</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      {rewards.length < 7 && (
        <button class="btn btn-secondary btn-sm" onClick={() => setRewards(prev => [...prev, { admin: '' as any, recipient: '' as any, bps: 0, token: 'Both' }])}>+ Add</button>
      )}
      {!valid && <p style={{ color: 'var(--red)', fontSize: '12px', marginTop: '8px' }}>BPS must sum to 10000 (currently {totalBps})</p>}
      <button class="btn btn-primary save-btn" onClick={save} disabled={!valid}>
        {saved ? '✓ Saved' : 'Save Default Rewards'}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Create src/options/sections/TemplatesSection.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import { listTemplates, deleteTemplate } from '../../lib/templates.js';

export function TemplatesSection() {
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listTemplates>>>([]);

  useEffect(() => { listTemplates().then(setTemplates); }, []);

  async function remove(id: string) {
    await deleteTemplate(id);
    setTemplates(prev => prev.filter(t => t.id !== id));
  }

  return (
    <div>
      <div class="section-title">Deploy Templates</div>
      <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '12px' }}>
        Templates are saved from the popup using the 💾 button. Load them from the popup form.
      </p>
      {templates.length === 0 && <p style={{ color: 'var(--text-dim)' }}>No saved templates</p>}
      {templates.map(t => (
        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600 }}>{t.name}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{new Date(t.createdAt).toLocaleDateString()}</div>
          </div>
          <button class="btn btn-danger btn-sm" onClick={() => remove(t.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Create src/options/Options.tsx** (all 5 tabs)

```tsx
import { useState } from 'preact/hooks';
import { WalletSection } from './sections/WalletSection.js';
import { DeploySection } from './sections/DeploySection.js';
import { ImageSection } from './sections/ImageSection.js';
import { RewardsDefaultSection } from './sections/RewardsDefaultSection.js';
import { TemplatesSection } from './sections/TemplatesSection.js';

type Tab = 'wallet' | 'deploy' | 'rewards' | 'image' | 'templates';

const TAB_LABELS: Record<Tab, string> = {
  wallet: '🔑 Wallets',
  deploy: '⚙ Deploy',
  rewards: '💰 Rewards',
  image: '🖼 Image',
  templates: '📋 Templates',
};

export function Options() {
  const [tab, setTab] = useState<Tab>('wallet');

  return (
    <div>
      <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>
        🔷 Clanker Extension Settings
      </h1>
      <div class="tabs">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button class={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      {tab === 'wallet'    && <WalletSection />}
      {tab === 'deploy'    && <DeploySection />}
      {tab === 'rewards'   && <RewardsDefaultSection />}
      {tab === 'image'     && <ImageSection />}
      {tab === 'templates' && <TemplatesSection />}
    </div>
  );
}
```

- [ ] **Step 8: Update src/options/index.tsx**

```tsx
import { render } from 'preact';
import { Options } from './Options.js';
import './options.css';

render(<Options />, document.getElementById('app')!);
```

- [ ] **Step 9: Commit options page**

```bash
git add src/options/ && git commit -m "feat: options page — wallet vault, deploy defaults, rewards template, Pinata config, templates"
```

---

## Task 6: Batch Deploy UI

**Files:**
- Create: `src/popup/views/BatchView.tsx`
- Modify: `src/popup/App.tsx` (add `batch` view + port logic)
- Modify: `src/popup/views/FormView.tsx` (add BATCH DEPLOY button)

The batch UI uses the Port API (not sendMessage) — the SW pushes `SwEvent` frames over the port.

- [ ] **Step 1: Create src/popup/views/BatchView.tsx**

```tsx
import { useState, useEffect } from 'preact/hooks';
import type { SwEvent, BatchDeployResult, DeployPayload } from '../../lib/messages.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface BatchProgress {
  walletId: string;
  walletName: string;
  status: 'pending' | 'deploying' | 'success' | 'failed';
  txHash?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  error?: string;
}

interface Props {
  payload: DeployPayload;
  walletIds: string[];
  walletNames: Record<string, string>;
  chainId: number;
  onComplete: (results: BatchDeployResult[]) => void;
  onBack: () => void;
}

export function BatchView({ payload, walletIds, walletNames, chainId, onComplete, onBack }: Props) {
  const [progress, setProgress] = useState<BatchProgress[]>(
    walletIds.map(id => ({ walletId: id, walletName: walletNames[id] ?? id, status: 'pending' }))
  );
  const [done, setDone] = useState(false);
  const [interrupted, setInterrupted] = useState(false);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'batch-deploy' });

    port.postMessage({ type: 'BATCH_DEPLOY', payload, walletIds });

    port.onMessage.addListener((event: SwEvent) => {
      if (event.type === 'BATCH_PROGRESS') {
        setProgress(prev => prev.map(p =>
          p.walletId === event.walletId
            ? { ...p, status: event.status, txHash: event.txHash, tokenAddress: event.tokenAddress, error: event.error }
            : p
        ));
      }
      if (event.type === 'BATCH_COMPLETE') {
        setDone(true);
        port.disconnect();
        onComplete(event.results);
      }
    });

    port.onDisconnect.addListener(() => {
      // SW killed mid-batch
      if (!done) setInterrupted(true);
    });

    return () => { try { port.disconnect(); } catch {} };
  }, []);

  const explorer = CHAIN_CONFIG[chainId]?.explorer ?? 'https://basescan.org';

  return (
    <div>
      <div class="header">
        <span class="header-title">⚡ Batch Deploy</span>
        {done && <button class="icon-btn" onClick={onBack}>← Back</button>}
      </div>
      <div class="view-body">
        {interrupted && (
          <div style={{ background: 'rgba(255,71,87,0.1)', border: '1px solid var(--red)', borderRadius: 'var(--radius)', padding: '12px', marginBottom: '12px' }}>
            <p style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ Batch interrupted (service worker killed)</p>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px' }}>
              {progress.filter(p => p.status === 'success').length}/{walletIds.length} completed
            </p>
          </div>
        )}

        {progress.map(p => (
          <div key={p.walletId} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: '16px', textAlign: 'center' }}>
              {p.status === 'pending' && '○'}
              {p.status === 'deploying' && <span class="spinner" />}
              {p.status === 'success' && <span style={{ color: 'var(--green)' }}>✅</span>}
              {p.status === 'failed' && <span style={{ color: 'var(--red)' }}>❌</span>}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>{p.walletName}</div>
              {p.status === 'success' && p.tokenAddress && (
                <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                  <span style={{ fontFamily: 'monospace' }}>{p.tokenAddress.slice(0, 10)}...</span>
                  {' '}<a href={`${explorer}/token/${p.tokenAddress}`} target="_blank">↗</a>
                  {' '}<a href={`https://clanker.world/clanker/${p.tokenAddress}`} target="_blank">🌍</a>
                </div>
              )}
              {p.status === 'failed' && p.error && (
                <div style={{ fontSize: '11px', color: 'var(--red)' }}>{p.error.slice(0, 80)}</div>
              )}
            </div>
          </div>
        ))}

        {done && (
          <button class="btn btn-primary" onClick={onBack} style={{ marginTop: '16px' }}>
            View History
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add batch state to App.tsx**

In `App.tsx`, add `'batch'` to `AppView`, add `batchWalletIds` and `batchWalletNames` to `AppState`, and add the BatchView render:

```tsx
// Add to AppView:
export type AppView = 'loading' | 'form' | 'confirm' | 'pending' | 'success' | 'history' | 'batch';

// Add to AppState:
export interface AppState {
  // ... existing fields ...
  batchWalletIds?: string[];
  batchWalletNames?: Record<string, string>;
}

// Add handler:
async function onBatchDeploy(walletIds: string[], walletNames: Record<string, string>) {
  setState(prev => ({ ...prev, view: 'batch', batchWalletIds: walletIds, batchWalletNames: walletNames }));
}

// Add render case (before FormView return):
if (state.view === 'batch') {
  return (
    <BatchView
      payload={{ form: state.form, scraped: state.scraped }}
      walletIds={state.batchWalletIds!}
      walletNames={state.batchWalletNames!}
      chainId={state.form.chainId}
      onComplete={() => setState(prev => ({ ...prev, view: 'history' }))}
      onBack={() => setState(prev => ({ ...prev, view: 'form' }))}
    />
  );
}
```

- [ ] **Step 3: Add BATCH DEPLOY button to FormView**

In `FormView.tsx`, load vault entries and add the batch button to the quick card. Add to FormView props and quick-card:

```tsx
// Add to FormView Props:
interface Props {
  // ... existing ...
  vaultWallets: Array<{ id: string; name: string; active: boolean }>;
  onBatchDeploy: (walletIds: string[], walletNames: Record<string, string>) => void;
}

// In quick-card, after QUICK DEPLOY button:
{vaultWallets.filter(w => w.active).length >= 2 && (
  <button
    class="btn btn-secondary"
    style={{ marginTop: '6px' }}
    disabled={deployBlocked}
    onClick={() => {
      const active = vaultWallets.filter(w => w.active);
      const names = Object.fromEntries(active.map(w => [w.id, w.name]));
      onBatchDeploy(active.map(w => w.id), names);
    }}
  >
    ⚡ BATCH DEPLOY ({vaultWallets.filter(w => w.active).length} wallets)
  </button>
)}
```

In `App.tsx`, load vault wallets from storage and pass to FormView:

```tsx
// In App state init / init() function, after loading config:
const vaultWallets = config.vaultEntries.map(e => ({ id: e.id, name: e.name, active: e.active }));
setState(prev => ({ ...prev, ..., vaultWallets })); // add vaultWallets to AppState
```

- [ ] **Step 4: Commit batch UI**

```bash
git add src/popup/views/BatchView.tsx src/popup/App.tsx src/popup/views/FormView.tsx && git commit -m "feat: batch deploy UI — BatchView with Port API, progress tracking, BATCH DEPLOY button in FormView"
```

---

## Task 7: Build + Manual End-to-End Test

- [ ] **Step 1: TypeScript check**

```bash
rtk tsc --noEmit
```

Fix any errors. Common issues:
- Import `.js` extensions required for ESM resolution in WXT
- Preact hook imports: `import { useState } from 'preact/hooks'`
- `ComponentChildren` from `preact`

- [ ] **Step 2: Build extension**

```bash
rtk pnpm run build
```

- [ ] **Step 3: Load in Chrome**

1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. "Load unpacked" → select `.output/chrome-mv3/`
4. Extension should appear without errors

- [ ] **Step 4: Manual smoke tests**

Test sequence:
1. Open Options → Wallet Vault → add a test wallet (generate new key)
2. Open Options → Deploy → set tokenAdmin, default chain = Base
3. Open Options → Image → enter Pinata keys
4. Navigate to `https://x.com/VitalikButerin`
5. Open popup → verify name/image pre-populated
6. Check status badges all show ✓
7. Click "Review/Edit" → verify form sections open
8. Navigate to `https://gmgn.ai/base/token/0x...` (any token)
9. Open popup → verify chain auto-set to Base
10. Open History tab (should be empty until you deploy)

- [ ] **Step 5: Final commit**

```bash
git add -A && git commit -m "feat: Phase 3 complete — full popup + options UI, end-to-end deploy flow"
```

---

## Phase 3 Exit Criteria

- [ ] TypeScript compiles with no errors
- [ ] Extension builds and loads in Chrome without errors
- [ ] Popup shows correct scraped data for Twitter, GMGN pages
- [ ] Quick deploy card status badges reflect actual state
- [ ] Form sections expand/collapse correctly
- [ ] Fee presets work (10%, 5%, 3%+3%, 1%–10%)
- [ ] Rewards BPS bar turns red when ≠ 10,000
- [ ] Ghost mode locks reward section and shows warning panel in confirm
- [ ] Options → Wallet Vault: can add wallet, toggle active, delete
- [ ] Options → Deploy: saves defaults, pre-fills form on next popup open
- [ ] Options → Image: saves Pinata keys

---

## Known Post-Phase-3 Work

- Mode A (injected wallet) full flow testing — requires real Rabby/MetaMask install
- Two-phase deploy (Port API) for live txHash in PendingView — current impl shows hash only in SuccessView
- GMGN selector verification — check against live site before production use
- Real deploy test with test ETH on Base Sepolia (if available)
- Monad chain: add custom RPC input to DeploySection in Options
