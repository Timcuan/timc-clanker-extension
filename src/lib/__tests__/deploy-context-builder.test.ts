import { describe, it, expect } from 'vitest';
import { buildDeployContext } from '../deploy-context-builder.js';
import type { ScrapedData } from '../messages.js';

function scraped(overrides: Partial<ScrapedData> = {}): ScrapedData {
  return { name: 'Test', symbol: 'TEST', socials: {}, ...overrides };
}

describe('buildDeployContext', () => {
  it('uses twitter platform for twitter source', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter', messageId: '12345' }));
    expect(ctx.platform).toBe('twitter');
    expect(ctx.messageId).toBe('12345');
  });

  it('never uses "x" as platform', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.platform).not.toBe('x');
  });

  it('uses "clanker" platform for gmgn source', () => {
    const ctx = buildDeployContext(scraped({ source: 'gmgn' }));
    expect(ctx.platform).toBe('clanker');
  });

  it('uses "website" for generic source', () => {
    const ctx = buildDeployContext(scraped({ source: 'generic' }));
    expect(ctx.platform).toBe('website');
  });

  it('generates synthetic messageId when none provided', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.messageId).toBeTruthy();
    expect(ctx.messageId.length).toBeGreaterThan(10);
  });

  it('includes userId as id when present', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter', userId: '99999' }));
    expect(ctx.id).toBe('99999');
  });

  it('omits id when userId not present', () => {
    const ctx = buildDeployContext(scraped({ source: 'twitter' }));
    expect(ctx.id).toBeUndefined();
  });

  it('uses custom interface name', () => {
    const ctx = buildDeployContext(scraped(), 'MyExtension');
    expect(ctx.interface).toBe('MyExtension');
  });

  it('platform is never empty', () => {
    const ctx = buildDeployContext(scraped({}));
    expect(ctx.platform).toBeTruthy();
  });
});
