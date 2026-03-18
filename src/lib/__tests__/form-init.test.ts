// src/lib/__tests__/form-init.test.ts
import { describe, it, expect } from 'vitest';
import { buildInitialFormState } from '../../popup/form-init.js';
import { CONFIG_DEFAULTS } from '../storage.js';

const defaultConfig = CONFIG_DEFAULTS;

const emptyScrape = { name: '', symbol: '', socials: {} };

const twitterScrape = {
  name: 'Vitalik Buterin',
  symbol: 'VITALIK',
  description: 'Ethereum creator',
  imageUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
  socials: { twitter: 'https://x.com/VitalikButerin' },
  source: 'twitter' as const,
  messageId: '1234567890',
  userId: '295218901',
  pageUrl: 'https://x.com/VitalikButerin',
};

const gmgnScrape = {
  name: 'SOME TOKEN',
  symbol: 'SOME',
  socials: {},
  detectedChainId: 42161,
};

describe('buildInitialFormState', () => {
  it('falls back to "Unnamed Token" when name is empty', () => {
    const state = buildInitialFormState(defaultConfig, emptyScrape);
    expect(state.name).toBe('Unnamed Token');
  });

  it('uses scraped name when present', () => {
    const state = buildInitialFormState(defaultConfig, twitterScrape);
    expect(state.name).toBe('Vitalik Buterin');
  });

  it('uses scraped symbol when present', () => {
    const state = buildInitialFormState(defaultConfig, twitterScrape);
    expect(state.symbol).toBe('VITALIK');
  });

  it('generates symbol from name when scraped symbol is empty', () => {
    const state = buildInitialFormState(defaultConfig, { ...twitterScrape, symbol: '' });
    // generateSymbol('Vitalik Buterin') → 'VITALIK' (first word uppercased, alphanum only, max 8)
    expect(state.symbol).toMatch(/^[A-Z0-9]{1,8}$/);
  });

  it('uses scraped imageUrl', () => {
    const state = buildInitialFormState(defaultConfig, twitterScrape);
    expect(state.imageUrl).toBe('https://pbs.twimg.com/profile_images/alice.jpg');
  });

  it('uses config defaultChain when detectedChainId is absent', () => {
    const state = buildInitialFormState(defaultConfig, emptyScrape);
    expect(state.chainId).toBe(defaultConfig.defaultChain);
  });

  it('overrides chainId with scraped detectedChainId', () => {
    const state = buildInitialFormState(defaultConfig, gmgnScrape);
    expect(state.chainId).toBe(42161);
  });

  it('uses config defaultFeeType', () => {
    const state = buildInitialFormState({ ...defaultConfig, defaultFeeType: 'dynamic' }, emptyScrape);
    expect(state.feeType).toBe('dynamic');
  });

  it('uses config defaultPoolPreset', () => {
    const state = buildInitialFormState({ ...defaultConfig, defaultPoolPreset: 'Project' }, emptyScrape);
    expect(state.poolPreset).toBe('Project');
  });

  it('creates single 100% reward slot from tokenAdmin when defaultRewards is empty', () => {
    const config = { ...defaultConfig, tokenAdmin: '0xABCDEF1234567890ABCDEF1234567890ABCDEF12' as `0x${string}`, defaultRewards: [] };
    const state = buildInitialFormState(config, emptyScrape);
    expect(state.rewards).toHaveLength(1);
    expect(state.rewards[0].bps).toBe(10000);
    expect(state.rewards[0].admin).toBe('0xABCDEF1234567890ABCDEF1234567890ABCDEF12');
  });

  it('uses defaultRewards from config when present', () => {
    const rewardSlots = [
      { admin: '0xAAAA' as `0x${string}`, recipient: '0xAAAA' as `0x${string}`, bps: 5000, token: 'Both' as const },
      { admin: '0xBBBB' as `0x${string}`, recipient: '0xBBBB' as `0x${string}`, bps: 5000, token: 'Both' as const },
    ];
    const state = buildInitialFormState({ ...defaultConfig, defaultRewards: rewardSlots }, emptyScrape);
    expect(state.rewards).toHaveLength(2);
    expect(state.rewards[0].bps).toBe(5000);
  });

  it('ghost mode defaults to false', () => {
    const state = buildInitialFormState(defaultConfig, emptyScrape);
    expect(state.ghostMode).toBe(false);
  });

  it('simulateBeforeDeploy defaults to true', () => {
    const state = buildInitialFormState(defaultConfig, emptyScrape);
    expect(state.simulateBeforeDeploy).toBe(true);
  });

  it('extensions are disabled by default', () => {
    const state = buildInitialFormState(defaultConfig, emptyScrape);
    expect(state.vaultEnabled).toBe(false);
    expect(state.devBuyEnabled).toBe(false);
    expect(state.airdropEnabled).toBe(false);
  });
});
