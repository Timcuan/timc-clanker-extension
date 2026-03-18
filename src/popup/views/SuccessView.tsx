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
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div class="view-body">
      <div class="success-glow">
        <span class="success-icon">🎉</span>
        <div class="success-title">Token Deployed!</div>
        <div class="success-subtitle">{name} <span style={{ color: 'var(--text-muted)' }}>${symbol}</span></div>
      </div>

      <div class="summary-card" style={{ marginBottom: '12px' }}>
        <div class="summary-row">
          <span class="label">Network</span>
          <span class="value">{chain?.name ?? `Chain ${chainId}`}</span>
        </div>
        <div class="summary-row">
          <span class="label">Token Address</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '220px' }}>
            <span class="address" style={{ fontSize: '10px' }}>
              {tokenAddress.slice(0, 10)}...{tokenAddress.slice(-8)}
            </span>
            <button class="copy-btn" onClick={copyAddress}>
              {copied ? '✓' : '⎘'}
            </button>
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <a href={`https://clanker.world/clanker/${tokenAddress}`}
          target="_blank" class="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
          🌍 clanker.world
        </a>
        <a href={`${explorer}/token/${tokenAddress}`}
          target="_blank" class="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
          🔍 Explorer
        </a>
        <a href={`${explorer}/tx/${txHash}`}
          target="_blank" class="btn btn-secondary btn-sm" style={{ flex: 1, textAlign: 'center' }}>
          📄 Tx
        </a>
      </div>

      <button class="btn btn-primary" onClick={onDeployAnother}>
        ⚡ Deploy Another
      </button>
    </div>
  );
}
