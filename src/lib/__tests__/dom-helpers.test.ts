import { describe, it, expect, beforeEach } from 'vitest';
import { getOgMeta, extractHandle, extractTweetId, extractCastHash } from '../dom-helpers.js';

// jsdom environment needed for DOM tests — set via vitest config environmentMatchGlobs

describe('getOgMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('returns og:title content', () => {
    document.head.innerHTML = '<meta property="og:title" content="Test Title" />';
    expect(getOgMeta('og:title')).toBe('Test Title');
  });

  it('returns null when meta not present', () => {
    expect(getOgMeta('og:title')).toBeNull();
  });
});

describe('extractHandle', () => {
  it('extracts handle from "Name (@handle)" format', () => {
    expect(extractHandle('Vitalik Buterin (@VitalikButerin)')).toBe('VitalikButerin');
  });
  it('returns null if no handle', () => {
    expect(extractHandle('Just a name')).toBeNull();
  });
});

describe('extractTweetId', () => {
  it('extracts tweet ID from /status/ URL', () => {
    expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890');
  });
  it('returns null for profile URLs', () => {
    expect(extractTweetId('https://x.com/user')).toBeNull();
  });
});

describe('extractCastHash', () => {
  it('extracts 0x-prefixed hash from warpcast URL', () => {
    expect(extractCastHash('https://warpcast.com/user/0xabc123')).toBe('0xabc123');
  });
  it('returns null for profile URLs', () => {
    expect(extractCastHash('https://warpcast.com/user')).toBeNull();
  });
});
