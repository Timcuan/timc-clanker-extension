import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, extractHandle, extractTweetId } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseTwitter(): Promise<ScrapedData> {
  // ── Layer 1: og:meta tags (reliable on profile pages) ──
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc  = getOgMeta('og:description') ?? '';

  let name = '';
  let symbol = '';
  let description: string | undefined;
  let imageUrl: string | undefined;
  const messageId = extractTweetId(location.href) ?? undefined;

  if (ogTitle) {
    const handle = extractHandle(ogTitle);
    name = ogTitle.replace(/\s*\(@[^)]+\)/, '').trim() || ogTitle;
    symbol = handle ? generateSymbol(handle) : generateSymbol(name);
    description = ogDesc || undefined;
    imageUrl = ogImage || undefined;
  }

  // ── Layer 2: DOM selectors fallback (timeline, tweet pages) ──
  if (!name || !imageUrl) {
    // On a tweet page — try to pull from article
    const article = document.querySelector('article[data-testid="tweet"]');
    if (article) {
      // Name from user display name in tweet
      const displayName = article.querySelector('[data-testid="User-Name"] span')?.textContent?.trim();
      const handle = article.querySelector('[data-testid="User-Name"] a[href*="/"]')
        ?.getAttribute('href')?.replace('/', '') ?? '';
      if (!name && displayName) name = displayName;
      if (!symbol && handle) symbol = generateSymbol(handle);

      // Tweet text as description
      const tweetText = article.querySelector('[data-testid="tweetText"]')?.textContent?.trim();
      if (!description && tweetText) description = tweetText.slice(0, 280);

      // Avatar image from tweet context
      if (!imageUrl) {
        const avatarImg = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
        if (avatarImg?.src) imageUrl = avatarImg.src.replace(/_normal\.|_bigger\./, '_400x400.');
      }
    }

    // Profile page — UserName element
    if (!name) {
      const profileName = document.querySelector('[data-testid="UserName"]')?.textContent?.trim();
      if (profileName) name = profileName.split('@')[0].trim();
    }
    // Profile avatar
    if (!imageUrl) {
      const avatar = document.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
      if (avatar?.src) imageUrl = avatar.src.replace(/_normal\.|_bigger\./, '_400x400.');
    }
  }

  // ── Layer 3: fallback to page title ──
  if (!name) name = document.title.replace(/ on X$| on Twitter$/, '').trim();
  if (!symbol && name) symbol = generateSymbol(name);

  const userId = document.querySelector('meta[name="twitter:creator:id"]')?.getAttribute('content')
    ?? document.querySelector('meta[property="al:ios:url"]')?.getAttribute('content')?.match(/user_id=(\d+)/)?.[1]
    ?? undefined;

  return {
    name,
    symbol,
    description,
    imageUrl,
    socials: { twitter: location.href },
    source: 'twitter',
    pageUrl: location.href,
    messageId,
    userId,
  };
}
