import { describe, it, expect } from 'vitest';
import { generateSymbol } from '../symbol.js';

describe('generateSymbol', () => {
  it('strips @ prefix and uppercases', () => {
    expect(generateSymbol('@vitalik')).toBe('VITALIK');
  });
  it('removes non-alphanumeric chars', () => {
    expect(generateSymbol('@vitalik.eth')).toBe('VITALIKE');
  });
  it('truncates to 8 chars', () => {
    expect(generateSymbol('toolonghandle')).toBe('TOOLONGH');
  });
  it('handles numeric handles', () => {
    expect(generateSymbol('punk6529')).toBe('PUNK6529');
  });
  it('returns empty string for empty input', () => {
    expect(generateSymbol('')).toBe('');
  });
});
