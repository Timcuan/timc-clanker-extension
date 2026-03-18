// src/popup/views/PendingView.tsx
import { CHAIN_CONFIG } from '../../lib/chains.js';

interface Props {
  txHash?: `0x${string}`;
  chainId: number;
}

export function PendingView({ txHash, chainId }: Props) {
  const chain = CHAIN_CONFIG[chainId as keyof typeof CHAIN_CONFIG];
  const explorer = chain?.explorer ?? 'https://basescan.org';

  return (
    <div class="view-body" style={{ textAlign: 'center', paddingTop: '50px', paddingBottom: '50px' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <div class="spinner-lg" />
      </div>

      <p style={{ fontFamily: "'Syne', sans-serif", fontSize: '16px', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: '6px' }}>
        Broadcasting…
      </p>

      <p style={{ fontSize: '12px', color: 'var(--text-2)', marginBottom: '4px' }}>
        Deploying on {chain?.name ?? 'chain'}
      </p>
      <p style={{ fontSize: '11px', color: 'var(--text-3)', marginBottom: '16px' }}>
        This may take up to 60 seconds
      </p>

      {txHash && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', padding: '7px 12px',
          fontSize: '11px', color: 'var(--text-2)',
        }}>
          <span class="spinner" />
          <a href={`${explorer}/tx/${txHash}`} target="_blank"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
          </a>
        </div>
      )}
    </div>
  );
}
