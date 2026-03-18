// src/popup/views/SuccessView.tsx
import { useState } from 'preact/hooks';
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
  const [copied, setCopied] = useState(false);
  const chain = CHAIN_CONFIG[chainId as keyof typeof CHAIN_CONFIG];
  const explorer = chain?.explorer ?? 'https://basescan.org';

  function copyAddress() {
    navigator.clipboard.writeText(tokenAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div class="view-body" style={{ padding: '0 12px 16px' }}>
      {/* Hero */}
      <div style={{
        textAlign: 'center', padding: '28px 16px 20px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(29,185,84,0.10), transparent 65%)',
        marginBottom: '12px',
      }}>
        <div style={{ fontSize: '40px', marginBottom: '10px', lineHeight: 1 }}>🎉</div>
        <div style={{
          fontSize: '19px', fontWeight: 700, letterSpacing: '-0.025em',
          color: 'var(--color-text)', marginBottom: '4px',
        }}>
          {name} deployed!
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-2)' }}>
          <span class="symbol" style={{ marginRight: '6px' }}>${symbol}</span>
          <span class="chain-tag">{chain?.name ?? `Chain ${chainId}`}</span>
        </div>
      </div>

      {/* Address card */}
      <div class="card" style={{ padding: '10px 12px', marginBottom: '10px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-3)', marginBottom: '6px' }}>
          Token Address
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text)',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tokenAddress}
          </span>
          <button
            class="btn btn-sm btn-secondary"
            onClick={copyAddress}
            style={{ flexShrink: 0, minWidth: '60px' }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Links */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
        <a
          href={`https://clanker.world/clanker/${tokenAddress}`}
          target="_blank"
          class="btn btn-secondary btn-sm"
          style={{ flex: 1, textAlign: 'center' }}
        >
          clanker.world
        </a>
        <a
          href={`${explorer}/token/${tokenAddress}`}
          target="_blank"
          class="btn btn-secondary btn-sm"
          style={{ flex: 1, textAlign: 'center' }}
        >
          Explorer
        </a>
        <a
          href={`${explorer}/tx/${txHash}`}
          target="_blank"
          class="btn btn-secondary btn-sm"
          style={{ flex: 1, textAlign: 'center' }}
        >
          Tx
        </a>
      </div>

      <button class="btn btn-primary btn-lg btn-full" onClick={onDeployAnother}>
        ⚡ Deploy Another
      </button>
    </div>
  );
}
