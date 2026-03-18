// src/popup/components/RewardsSection.tsx
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
                onInput={e => updateRow(i, { recipient: (e.target as HTMLInputElement).value as `0x${string}` })} />
            </div>
            <div class="field" style={{ flex: 1 }}>
              <label>BPS ({(r.bps / 100).toFixed(1)}%)</label>
              <input type="number" min={0} max={10000} value={r.bps} disabled={locked}
                onInput={e => updateRow(i, { bps: +(e.target as HTMLInputElement).value })} />
            </div>
          </div>
          <div class="field-row">
            <div class="field" style={{ flex: 2 }}>
              <label>Admin</label>
              <input value={r.admin} disabled={locked}
                onInput={e => updateRow(i, { admin: (e.target as HTMLInputElement).value as `0x${string}` })} />
            </div>
            <div class="field" style={{ flex: 1 }}>
              <label>Token</label>
              <select value={r.token} disabled={locked}
                onChange={e => updateRow(i, { token: (e.target as HTMLSelectElement).value as any })}>
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
