import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta, waitForElement } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

const GMGN_CHAIN_MAP: Record<string, number | null> = {
  base:  8453,
  eth:   1,
  arb:   42161,
  sol:   null,
  bsc:   null,
  trx:   null,
  monad: 143,
};

export async function parseGMGN(): Promise<ScrapedData> {
  // 1. Extract chain + address from URL: /chain/token/address
  const pathParts = location.pathname.split('/').filter(Boolean);
  const chain = pathParts[0] ?? '';
  const tokenAddress = pathParts[2] ?? undefined;
  const chainId = GMGN_CHAIN_MAP[chain] ?? null;

  // 2. Wait for DOM to load (CSR — React SPA)
  await waitForElement('h1, [class*="token-name"], [data-testid]', 5000);

  // 3. Try OG meta first
  const ogTitle = getOgMeta('og:title') ?? '';
  const ogImage = getOgMeta('og:image') ?? '';
  const ogDesc = getOgMeta('og:description') ?? '';

  // 4. DOM fallback for name
  const name = ogTitle || document.querySelector('h1')?.textContent?.trim() || '';

  // 5. Symbol: find "$TICKER" pattern in page text
  const symbolMatch = document.body.innerText.match(/\$([A-Z0-9]{1,8})\b/);
  const symbol = symbolMatch?.[1] ?? generateSymbol(name);

  // 6. Social links
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map(a => (a as HTMLAnchorElement).href);
  const twitter = links.find(h => h.includes('twitter.com') || h.includes('x.com'));
  const telegram = links.find(h => h.includes('t.me/'));
  const website = links.find(h =>
    !h.includes('gmgn.ai') && h.startsWith('https://') &&
    !h.includes('twitter.com') && !h.includes('x.com') && !h.includes('t.me/')
  );

  // 7. messageId: use token address for clanker platform
  const messageId = tokenAddress;

  return {
    name,
    symbol,
    description: ogDesc || undefined,
    imageUrl: ogImage || undefined,
    socials: { twitter, telegram, website },
    detectedChainId: chainId,
    source: 'gmgn',
    pageUrl: location.href,
    messageId,
  };
}
