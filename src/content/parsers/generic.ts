import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseGeneric(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? document.title ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // Symbol: first word of title
  const firstWord = ogTitle.trim().split(/\s+/)[0] ?? '';
  const symbol = generateSymbol(firstWord);

  return {
    name: ogTitle,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { website: location.href },
    source: 'generic',
    pageUrl: location.href,
    messageId: location.href, // page URL as fallback messageId
  };
}
