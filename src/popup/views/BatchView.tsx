// src/popup/views/BatchView.tsx
import { useState, useEffect, useRef } from 'preact/hooks';
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
  const doneRef = useRef(false);

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
        doneRef.current = true;
        setDone(true);
        port.disconnect();
        onComplete(event.results);
      }
    });

    port.onDisconnect.addListener(() => {
      // SW killed mid-batch
      if (!doneRef.current) setInterrupted(true);
    });

    return () => { try { port.disconnect(); } catch {} };
  }, []);

  const explorer = CHAIN_CONFIG[chainId as keyof typeof CHAIN_CONFIG]?.explorer ?? 'https://basescan.org';

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
