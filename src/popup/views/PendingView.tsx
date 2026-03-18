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
    <div class="view-body" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '280px', padding: '40px 20px',
      gap: '0',
    }}>
      {/* Spinner with glow ring */}
      <div style={{
        width: '52px', height: '52px', borderRadius: '50%',
        background: 'var(--color-accent-dim)',
        display: 'grid', placeItems: 'center', marginBottom: '20px',
      }}>
        <div class="spinner-lg" />
      </div>

      <div style={{
        fontSize: '16px', fontWeight: 700, letterSpacing: '-0.025em',
        color: 'var(--color-text)', marginBottom: '5px',
      }}>
        Broadcasting…
      </div>

      <div style={{ fontSize: '13px', color: 'var(--color-text-2)', marginBottom: '3px' }}>
        Deploying on {chain?.name ?? 'chain'}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-3)', marginBottom: '20px' }}>
        May take up to 60 seconds
      </div>

      {txHash && (
        <a
          href={`${explorer}/tx/${txHash}`}
          target="_blank"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-hi)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            fontSize: '11px', color: 'var(--color-text-2)',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.01em',
          }}
        >
          <span class="spinner" />
          {txHash.slice(0, 10)}…{txHash.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}
