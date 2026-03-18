// src/popup/views/HistoryView.tsx
import { useState, useEffect } from 'preact/hooks';
import type { DeployRecord } from '../../lib/messages.js';
import { bgSend } from '../../lib/bg-send.js';
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  onBack: () => void;
}

function short(addr: string) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function HistoryView({ onBack }: Props) {
  const [records, setRecords] = useState<DeployRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [rewards, setRewards] = useState<Record<string, string>>({});
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [claimResult, setClaimResult] = useState<Record<string, string>>({});

  useEffect(() => {
    bgSend({ type: 'GET_HISTORY' }).then(res => {
      if ('error' in res) return;
      const r = (res as any).records as DeployRecord[];
      setRecords(r);
      setLoading(false);
      r.forEach(rec => {
        bgSend({
          type: 'GET_AVAILABLE_REWARDS',
          token: rec.address,
          recipient: rec.rewardRecipient,
          chainId: rec.chainId,
        }).then(rewardRes => {
          if ('error' in rewardRes) return;
          setRewards(prev => ({ ...prev, [rec.address]: (rewardRes as any).amount as string }));
        }).catch(() => {});
      });
    });
  }, []);

  async function claim(rec: DeployRecord) {
    setClaiming(prev => ({ ...prev, [rec.address]: true }));
    const res = await bgSend({
      type: 'CLAIM_REWARDS',
      token: rec.address,
      recipient: rec.rewardRecipient,
      chainId: rec.chainId,
    });
    setClaiming(prev => ({ ...prev, [rec.address]: false }));
    if ('error' in res) {
      setClaimResult(prev => ({ ...prev, [rec.address]: `Failed: ${(res as any).error}` }));
    } else {
      setClaimResult(prev => ({ ...prev, [rec.address]: 'Claimed!' }));
      setRewards(prev => ({ ...prev, [rec.address]: '0' }));
    }
  }

  return (
    <div>
      {/* Header */}
      <div class="header">
        <button class="icon-btn" onClick={onBack} style={{ marginRight: '4px' }}>←</button>
        <span class="header-title">Deploy History</span>
      </div>

      <div class="view-body">
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '52px', gap: '12px' }}>
            <div class="spinner-lg" />
            <p style={{ color: 'var(--color-text-3)', fontSize: '12px' }}>Loading…</p>
          </div>
        )}

        {!loading && records.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '52px', gap: '8px' }}>
            <div style={{ fontSize: '28px' }}>📭</div>
            <p style={{ color: 'var(--color-text)', fontSize: '13px', fontWeight: 600 }}>No deployments yet</p>
            <p style={{ color: 'var(--color-text-3)', fontSize: '11px' }}>Tokens you deploy will appear here</p>
          </div>
        )}

        {records.map(rec => {
          const chain = CHAIN_CONFIG[rec.chainId as keyof typeof CHAIN_CONFIG];
          const reward = rewards[rec.address];
          const hasReward = reward && BigInt(reward) > 0n;
          const explorerUrl = chain ? `${chain.explorer}/token/${rec.address}` : null;
          const clankerUrl = `https://clanker.world/clanker/${rec.address}`;

          return (
            <div key={rec.address} class="history-item">
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Name + time */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    <span class="history-name">{rec.name}</span>
                    <span class="symbol" style={{ flexShrink: 0 }}>${rec.symbol}</span>
                    {rec.isGhostDeploy && <span style={{ fontSize: '11px' }}>👻</span>}
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-3)', fontWeight: 600, flexShrink: 0 }}>
                    {timeAgo(rec.deployedAt)}
                  </span>
                </div>

                {/* Meta */}
                <div class="history-meta" style={{ marginTop: '2px' }}>
                  {chain?.name ?? `Chain ${rec.chainId}`} ·{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{short(rec.address)}</span>
                  {rec.isGhostDeploy && ` · admin: ${short(rec.tokenAdmin)}`}
                </div>

                {/* Rewards */}
                {reward !== undefined && (
                  <div style={{ fontSize: '11px', marginTop: '4px', fontWeight: 500 }}>
                    {hasReward ? (
                      <span style={{ color: 'var(--color-ok)' }}>
                        ~{(Number(BigInt(reward)) / 1e18).toFixed(5)} ETH claimable
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-3)' }}>No fees yet</span>
                    )}
                  </div>
                )}

                {claimResult[rec.address] && (
                  <div style={{ fontSize: '11px', marginTop: '2px', color: claimResult[rec.address].startsWith('Failed') ? 'var(--color-err)' : 'var(--color-ok)', fontWeight: 500 }}>
                    {claimResult[rec.address]}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: '5px', marginTop: '8px', flexWrap: 'wrap' }}>
                  {explorerUrl && (
                    <a href={explorerUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">
                      Explorer ↗
                    </a>
                  )}
                  <a href={clankerUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">
                    clanker.world ↗
                  </a>
                  {hasReward && (
                    <button
                      class="btn btn-primary btn-sm"
                      disabled={claiming[rec.address]}
                      onClick={() => claim(rec)}
                    >
                      {claiming[rec.address] ? <span class="spinner" /> : 'Claim fees'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
