import type { WalletVaultEntry } from './messages.js';
import type { RotationMode } from './storage.js';

export function selectNextWallet(
  entries: WalletVaultEntry[],
  mode: RotationMode,
  currentIndex: number,
  activeWalletId: string | null
): { walletId: string; nextIndex: number } {
  const active = entries.filter(e => e.active);
  if (active.length === 0) throw new Error('No active wallets in vault');

  switch (mode) {
    case 'manual': {
      const manual = active.find(e => e.id === activeWalletId) ?? active[0];
      return { walletId: manual.id, nextIndex: currentIndex };
    }
    case 'round-robin': {
      const next = currentIndex % active.length;
      return { walletId: active[next].id, nextIndex: next + 1 };
    }
    case 'random': {
      const idx = Math.floor(Math.random() * active.length);
      return { walletId: active[idx].id, nextIndex: currentIndex };
    }
    case 'least-used': {
      const least = active.reduce((a, b) => a.deployCount <= b.deployCount ? a : b);
      return { walletId: least.id, nextIndex: currentIndex };
    }
  }
}
