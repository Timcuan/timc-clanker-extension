import { describe, it, expect } from 'vitest';
import { validateGhostConfig } from '../ghost-validator.js';

const YOU = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as `0x${string}`;
const TARGET = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as `0x${string}`;

function validConfig(overrides = {}) {
  return {
    rewards: {
      recipients: [
        { admin: YOU, recipient: YOU, bps: 9900, token: 'Both' as const },
        { admin: YOU, recipient: TARGET, bps: 100, token: 'Both' as const },
      ],
    },
    ...overrides,
  } as any;
}

describe('validateGhostConfig', () => {
  it('passes valid ghost config', () => {
    expect(() => validateGhostConfig(validConfig(), YOU, TARGET)).not.toThrow();
  });

  it('throws if rewards missing', () => {
    expect(() => validateGhostConfig({} as any, YOU, TARGET)).toThrow('GHOST: rewards must be');
  });

  it('throws if any reward admin is not yourAddress', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].admin = TARGET;
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: reward slot admin');
  });

  it('throws if bps do not sum to 10000', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].bps = 5000;
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: reward bps must sum');
  });

  it('throws if your address has 0 bps', () => {
    const cfg = validConfig();
    cfg.rewards.recipients[0].recipient = TARGET; // both go to target
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: your address has 0 bps');
  });

  it('throws if vault recipient is target', () => {
    const cfg = { ...validConfig(), vault: { recipient: TARGET, supplyPct: 10, lockupSeconds: 86400 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: vault.recipient');
  });

  it('passes when vault recipient is yourAddress', () => {
    const cfg = { ...validConfig(), vault: { recipient: YOU, supplyPct: 10, lockupSeconds: 86400 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).not.toThrow();
  });

  it('throws if devBuy recipient is target', () => {
    const cfg = { ...validConfig(), devBuy: { recipient: TARGET, ethAmount: '0.1' } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: devBuy.recipient');
  });

  it('throws if airdrop admin is target', () => {
    const cfg = { ...validConfig(), airdrop: { admin: TARGET, merkleRoot: '0x01', tokenAmount: '100', lockupSeconds: 0 } };
    expect(() => validateGhostConfig(cfg, YOU, TARGET)).toThrow('GHOST: airdrop.admin');
  });
});
