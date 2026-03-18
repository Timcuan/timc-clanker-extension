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
      // Fetch available rewards for each token
      r.forEach(rec => {
        bgSend({
          type: 'GET_AVAILABLE_REWARDS',
          token: rec.address,
          recipient: rec.rewardRecipient,
          chainId: rec.chainId,
        }).then(rewardRes => {
          if ('error' in rewardRes) return;
          const amount = (rewardRes as any).amount as string;
          setRewards(prev => ({ ...prev, [rec.address]: amount }));
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
      setClaimResult(prev => ({ ...prev, [rec.address]: `❌ ${(res as any).error}` }));
    } else {
      setClaimResult(prev => ({ ...prev, [rec.address]: '✅ Claimed!' }));
      setRewards(prev => ({ ...prev, [rec.address]: '0' }));
    }
  }

  return (
    <div>
      <div class="header">
        <button class="icon-btn" onClick={onBack}>← Back</button>
        <div class="header-logo">
          <span class="header-title">History</span>
        </div>
        <span />
      </div>

      <div class="view-body">
        {loading && (
          <div style={{ textAlign: 'center', paddingTop: '48px' }}>
            <div class="spinner-lg" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-3)', fontSize: '12px' }}>Loading history…</p>
          </div>
        )}

        {!loading && records.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '48px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📭</div>
            <p style={{ color: 'var(--text-2)', fontSize: '13px', fontWeight: 600 }}>No deployments yet</p>
            <p style={{ color: 'var(--text-3)', fontSize: '11px', marginTop: '4px' }}>Your deployed tokens will appear here</p>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span class="history-name">{rec.name}</span>
                  <span style={{ color: 'var(--text-3)', marginLeft: '5px', fontSize: '11px', fontWeight: 600 }}>${rec.symbol}</span>
                  {rec.isGhostDeploy && <span style={{ marginLeft: '5px', fontSize: '11px' }}>👻</span>}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-3)', fontWeight: 600 }}>{timeAgo(rec.deployedAt)}</span>
              </div>

              <div class="history-meta">
                {chain?.name ?? `Chain ${rec.chainId}`} · <span style={{ fontFamily: 'monospace' }}>{short(rec.address)}</span>
                {rec.isGhostDeploy && ` · admin: ${short(rec.tokenAdmin)}`}
              </div>

              {reward !== undefined && (
                <div style={{ fontSize: '11px', marginTop: '5px' }}>
                  {hasReward ? (
                    <span style={{ color: 'var(--ok)', fontWeight: 600 }}>
                      ~{(Number(BigInt(reward)) / 1e18).toFixed(5)} ETH claimable
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-3)' }}>0 fees</span>
                  )}
                </div>
              )}

              {claimResult[rec.address] && (
                <div style={{ fontSize: '12px', marginTop: '2px' }}>{claimResult[rec.address]}</div>
              )}

              <div class="history-actions">
                {explorerUrl && (
                  <a href={explorerUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">🔍 Explorer</a>
                )}
                <a href={clankerUrl} target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">🌐 clanker</a>
                {hasReward && (
                  <button class="btn btn-primary btn-sm" disabled={claiming[rec.address]} onClick={() => claim(rec)}>
                    {claiming[rec.address] ? <span class="spinner" /> : 'Claim'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
