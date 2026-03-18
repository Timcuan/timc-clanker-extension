// src/lib/__tests__/storage.test.ts
import { describe, it, expect } from 'vitest';
import { CONFIG_DEFAULTS } from '../storage.js';

describe('CONFIG_DEFAULTS', () => {
  it('has defaultChain = 8453 (Base)', () => {
    expect(CONFIG_DEFAULTS.defaultChain).toBe(8453);
  });

  it('has defaultFeeType = static', () => {
    expect(CONFIG_DEFAULTS.defaultFeeType).toBe('static');
  });

  it('has defaultStaticClankerFeeBps = 1000 (10%)', () => {
    expect(CONFIG_DEFAULTS.defaultStaticClankerFeeBps).toBe(1000);
  });

  it('has defaultStaticPairedFeeBps = 0', () => {
    expect(CONFIG_DEFAULTS.defaultStaticPairedFeeBps).toBe(0);
  });

  it('has defaultDynamicBaseBps = 100 (1%)', () => {
    expect(CONFIG_DEFAULTS.defaultDynamicBaseBps).toBe(100);
  });

  it('has defaultDynamicMaxBps = 1000 (10%)', () => {
    expect(CONFIG_DEFAULTS.defaultDynamicMaxBps).toBe(1000);
  });

  it('has defaultPoolPreset = Standard', () => {
    expect(CONFIG_DEFAULTS.defaultPoolPreset).toBe('Standard');
  });

  it('has defaultMarketCap = 3', () => {
    expect(CONFIG_DEFAULTS.defaultMarketCap).toBe(3);
  });

  it('has empty vaultEntries by default', () => {
    expect(CONFIG_DEFAULTS.vaultEntries).toEqual([]);
  });

  it('has empty defaultRewards by default', () => {
    expect(CONFIG_DEFAULTS.defaultRewards).toEqual([]);
  });

  it('has empty templates by default', () => {
    expect(CONFIG_DEFAULTS.templates).toEqual([]);
  });

  it('has rotationMode = round-robin', () => {
    expect(CONFIG_DEFAULTS.rotationMode).toBe('round-robin');
  });

  it('has pinataApiKey and pinataSecretKey as empty strings', () => {
    expect(CONFIG_DEFAULTS.pinataApiKey).toBe('');
    expect(CONFIG_DEFAULTS.pinataSecretKey).toBe('');
  });

  it('has defaultSniperEnabled = false (opt-in)', () => {
    expect(CONFIG_DEFAULTS.defaultSniperEnabled).toBe(false);
  });

  it('all required fields are present', () => {
    const required = [
      'defaultChain', 'defaultFeeType', 'defaultStaticClankerFeeBps', 'defaultStaticPairedFeeBps',
      'defaultDynamicBaseBps', 'defaultDynamicMaxBps', 'defaultPoolPreset', 'defaultMarketCap',
      'defaultPairedToken', 'defaultSniperEnabled', 'vaultEntries', 'defaultRewards',
      'templates', 'rotationMode', 'pinataApiKey', 'pinataSecretKey', 'tokenAdmin',
    ];
    for (const key of required) {
      expect(CONFIG_DEFAULTS).toHaveProperty(key);
    }
  });
});
