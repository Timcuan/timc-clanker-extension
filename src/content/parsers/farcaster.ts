import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, extractCastHash } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseFarcaster(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // Extract handle from URL pathname: /username or /username/0xhash
  const pathParts = location.pathname.split('/').filter(Boolean);
  const handle = pathParts[0] ?? '';
  const name = ogTitle.split('(@')[0].trim() || handle;
  const symbol = generateSymbol(handle || name);

  // messageId: cast hash from URL if on a cast page
  const messageId = extractCastHash(location.href) ?? undefined;

  // FID: look in meta tags — not always available
  const userId = document.querySelector('meta[name="fc:frame:author_fid"]')?.getAttribute('content') ?? undefined;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter: undefined, telegram: undefined, website: location.href },
    source: 'farcaster',
    pageUrl: location.href,
    messageId,
    userId,
  };
}
