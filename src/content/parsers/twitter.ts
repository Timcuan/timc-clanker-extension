import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, extractHandle, extractTweetId } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseTwitter(): Promise<ScrapedData> {
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // "Name (@handle)" → extract both
  const handle = extractHandle(ogTitle);
  const name = ogTitle.replace(/\s*\(@[^)]+\)/, '').trim() || ogTitle;
  const symbol = handle ? generateSymbol(handle) : generateSymbol(name);

  // messageId from URL if on a tweet page
  const messageId = extractTweetId(location.href) ?? undefined;

  // Twitter user ID — look for twitter:creator:id or similar meta
  const userId = document.querySelector('meta[name="twitter:creator:id"]')?.getAttribute('content')
    ?? document.querySelector('meta[property="al:ios:url"]')?.getAttribute('content')?.match(/user_id=(\d+)/)?.[1]
    ?? undefined;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter: location.href },
    source: 'twitter',
    pageUrl: location.href,
    messageId,
    userId,
  };
}
