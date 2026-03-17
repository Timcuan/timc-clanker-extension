import { describe, it, expect } from 'vitest';
import { selectNextWallet } from '../wallet-rotation.js';
import type { WalletVaultEntry } from '../messages.js';

function makeEntry(id: string, deployCount = 0, active = true): WalletVaultEntry {
  return { id, name: id, address: `0x${'a'.repeat(40)}` as any,
    encryptedPK: '', iv: '', salt: '', createdAt: 0,
    lastUsedAt: 0, deployCount, active };
}

const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')];

describe('selectNextWallet', () => {
  it('manual: returns activeWalletId', () => {
    const { walletId } = selectNextWallet(entries, 'manual', 0, 'b');
    expect(walletId).toBe('b');
  });

  it('manual: falls back to first if activeWalletId missing', () => {
    const { walletId } = selectNextWallet(entries, 'manual', 0, 'zzz');
    expect(walletId).toBe('a');
  });

  it('round-robin: advances index', () => {
    const r0 = selectNextWallet(entries, 'round-robin', 0, null);
    expect(r0.walletId).toBe('a');
    expect(r0.nextIndex).toBe(1);
    const r1 = selectNextWallet(entries, 'round-robin', 1, null);
    expect(r1.walletId).toBe('b');
    const r3 = selectNextWallet(entries, 'round-robin', 3, null);
    expect(r3.walletId).toBe('a'); // wraps
  });

  it('least-used: returns wallet with lowest deployCount', () => {
    const e = [makeEntry('a', 5), makeEntry('b', 2), makeEntry('c', 8)];
    const { walletId } = selectNextWallet(e, 'least-used', 0, null);
    expect(walletId).toBe('b');
  });

  it('random: returns one of the active wallets', () => {
    const { walletId } = selectNextWallet(entries, 'random', 0, null);
    expect(['a', 'b', 'c']).toContain(walletId);
  });

  it('throws if no active wallets', () => {
    const inactive = [makeEntry('a', 0, false)];
    expect(() => selectNextWallet(inactive, 'manual', 0, null)).toThrow('No active wallets');
  });
});
