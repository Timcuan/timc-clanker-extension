// src/popup/components/FeeSection.tsx
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
              onClick={() => onChange({ staticClankerFeeBps: 1000, staticPairedFeeBps: 0 })}>10% ★</button>
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
                onInput={e => onChange({ staticClankerFeeBps: +(e.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label>Paired Fee ({(form.staticPairedFeeBps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={2000} step={50}
                value={form.staticPairedFeeBps}
                onInput={e => onChange({ staticPairedFeeBps: +(e.target as HTMLInputElement).value })} />
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
              onClick={() => onChange({ dynamicBaseBps: 100, dynamicMaxBps: 1000 })}>1%–10% ★</button>
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
                onInput={e => onChange({ dynamicBaseBps: +(e.target as HTMLInputElement).value })} />
            </div>
            <div class="field">
              <label>Max Fee ({(form.dynamicMaxBps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={3000} step={50}
                value={form.dynamicMaxBps}
                onInput={e => onChange({ dynamicMaxBps: +(e.target as HTMLInputElement).value })} />
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
