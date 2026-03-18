// src/popup/views/ConfirmView.tsx
import type { DeployFormState } from '../../lib/messages.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  form: DeployFormState;
  onBack: () => void;
  onConfirm: () => void;
}

function short(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div class="summary-row">
      <span class="label">{label}</span>
      <span class="value" style={valueColor ? { color: valueColor } : {}}>{value}</span>
    </div>
  );
}

export function ConfirmView({ form, onBack, onConfirm }: Props) {
  const chain = CHAIN_CONFIG[form.chainId as keyof typeof CHAIN_CONFIG];
  const feeSummary = form.feeType === 'static'
    ? `${(form.staticClankerFeeBps / 100).toFixed(1)}% + ${(form.staticPairedFeeBps / 100).toFixed(1)}%`
    : `${(form.dynamicBaseBps / 100).toFixed(1)}%–${(form.dynamicMaxBps / 100).toFixed(1)}% dyn`;
  const bpsTotal = form.rewards.reduce((s, r) => s + r.bps, 0);
  const bpsOk = bpsTotal === 10000;
  const imageSrc = form.imageUrl.startsWith('ipfs://')
    ? `https://ipfs.io/ipfs/${form.imageUrl.slice(7)}`
    : form.imageUrl;

  return (
    <div class="view-body">
      {/* Token banner */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '12px', marginBottom: '10px',
      }}>
        <div class="token-img-ring" style={{ width: '48px', height: '48px', borderRadius: '11px', flexShrink: 0 }}>
          {imageSrc ? (
            <img src={imageSrc} class="token-img" style={{ borderRadius: '9px' }} alt="" />
          ) : (
            <div class="token-img" style={{ borderRadius: '9px', fontSize: '20px' }}>🪙</div>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '16px', letterSpacing: '-0.02em' }}>{form.name}</div>
          <div style={{ color: 'var(--color-text-2)', fontSize: '12px', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
            ${form.symbol} · {chain?.name ?? `Chain ${form.chainId}`}
          </div>
        </div>
      </div>

      {/* Ghost Mode Warning */}
      {form.ghostMode && (
        <div class="ghost-panel">
          <div class="ghost-title">⚠️ Ghost Deploy Mode</div>
          <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
            <div>Appears created by: <span style={{ fontFamily: 'monospace' }}>{short(form.ghostTargetAddress)}</span></div>
            <div style={{ color: 'var(--green)', marginTop: '4px' }}>
              ✅ {(form.ghostYourShareBps / 100).toFixed(0)}% fees → you · admin: you<br/>
              {((10000 - form.ghostYourShareBps) / 100).toFixed(0)}% fees → target · admin: you
            </div>
          </div>
        </div>
      )}

      {/* Deploy params */}
      <div class="summary-card">
        <Row label="Pool" value={form.poolPreset} />
        <Row label="Market Cap" value={`${form.marketCap} ${chain?.marketCapUnit ?? 'ETH'}`} />
        <Row label="Fees" value={feeSummary} />
        {/* TODO: sniperStartingFee/sniperEndingFee unit is /1_000_000 per SDK (666_777 = 66.68%) */}
        {/* Current display uses /10_000 which shows approx correct % by coincidence — fix in next PR */}
        {form.sniperEnabled && (
          <Row label="Sniper"
            value={`${(form.sniperStartingFee / 10000).toFixed(0)}%→${(form.sniperEndingFee / 10000).toFixed(0)}% / ${form.sniperSecondsToDecay}s`}
          />
        )}
        {form.vaultEnabled && <Row label="Vault" value={`${form.vaultSupplyPct}% supply / ${form.vaultLockupDays}d`} />}
        {form.devBuyEnabled && <Row label="Dev Buy" value={`${form.devBuyAmount} ETH`} />}
        {form.vanityEnabled && <Row label="Vanity" valueColor="var(--green)" value="✓ …b07 suffix" />}
        <Row label="Simulate" value={form.simulateBeforeDeploy ? '✓ yes' : '✗ skip'}
          valueColor={form.simulateBeforeDeploy ? undefined : 'var(--yellow)'} />
        <Row label="Token Admin" value={short(form.ghostMode ? form.ghostTargetAddress : form.tokenAdmin)} />
      </div>

      {/* Rewards */}
      <div class="summary-card" style={{ marginBottom: '14px' }}>
        <div class="summary-row" style={{ background: 'var(--bg3)' }}>
          <span class="label">Rewards</span>
          <span class="value" style={{ color: bpsOk ? 'var(--green)' : 'var(--red)' }}>
            {bpsOk ? `✓ ${form.rewards.length} slot(s)` : `⚠ ${bpsTotal} bps ≠ 10000`}
          </span>
        </div>
        {form.rewards.map((r, i) => (
          <div key={i} class="summary-row">
            <span class="label" style={{ fontFamily: 'var(--font-mono)' }}>{short(r.recipient)}</span>
            <span class="value">{(r.bps / 100).toFixed(1)}% {r.token}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button class="btn btn-secondary" onClick={onBack} style={{ flex: 1 }}>← Back</button>
        <button class="btn btn-primary" onClick={onConfirm} style={{ flex: 2 }} disabled={!bpsOk}>
          Confirm & Sign →
        </button>
      </div>
    </div>
  );
}
