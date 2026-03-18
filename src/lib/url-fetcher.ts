// src/lib/url-fetcher.ts
// Orchestrates URL → ScrapedData: fast HTML parse first, bg-tab as fallback for SPAs.

import type { ScrapedData } from './messages.js';
import { bgTab } from './bg-tab.js';
import { validateImageUrl } from './image-pipeline.js';

const SPA_DOMAINS = [
  'twitter.com', 'x.com', 'warpcast.com', 'farcaster.xyz',
  'gmgn.ai', 'zora.co', 'supercast.xyz', 'hey.xyz',
];

export async function fetchFromUrl(url: string): Promise<ScrapedData & { __imageVerified?: boolean }> {
  // Validate scheme
  const parsed = new URL(url); // throws on invalid URL
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  // Session cache check
  const cacheKey = `url:${await sha1hex(url)}`;
  try {
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey]) return cached[cacheKey] as ScrapedData;
  } catch { /* unavailable in tests */ }

  let result: ScrapedData;
  const isSpa = SPA_DOMAINS.some(d =>
    parsed.hostname === d || parsed.hostname.endsWith(`.${d}`)
  );

  if (isSpa) {
    // SPA: skip HTML parse, go directly to bg-tab
    result = await bgTab(url);
  } else {
    // Non-SPA: try fast HTML parse first
    try {
      const fast = await htmlFetch(url);
      result = (fast.name || fast.imageUrl) ? fast : await bgTab(url);
    } catch {
      result = await bgTab(url);
    }
  }

  // Validate image URL — mark as verified/unverified, never discard
  let imageVerified: boolean | undefined;
  if (result.imageUrl) {
    const status = await validateImageUrl(result.imageUrl).catch(() => 'unverified' as const);
    imageVerified = status === 'verified';
  }

  const output = { ...result, __imageVerified: imageVerified };

  // Cache result
  try {
    await chrome.storage.session.set({ [cacheKey]: output });
  } catch { /* ignore */ }

  return output;
}

async function htmlFetch(url: string): Promise<ScrapedData> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseOgMeta(html, url);
}

function parseOgMeta(html: string, pageUrl: string): ScrapedData {
  function getMeta(prop: string): string | undefined {
    // Match both attribute orderings: property="..." content="..." and content="..." property="..."
    const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
           ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
    return m?.[1]?.trim() || undefined;
  }

  const title = getMeta('og:title')
             ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

  return {
    name:        title ?? '',
    symbol:      '',
    imageUrl:    getMeta('og:image'),
    description: getMeta('og:description'),
    socials:     {},
    pageUrl,
    source:      'generic',
  };
}

async function sha1hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
