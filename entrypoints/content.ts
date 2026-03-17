import { parseTwitter } from '../src/content/parsers/twitter.js';
import { parseFarcaster } from '../src/content/parsers/farcaster.js';
import { parseGMGN } from '../src/content/parsers/gmgn.js';
import { parseGeneric } from '../src/content/parsers/generic.js';
import type { ScrapedData } from '../src/lib/messages.js';

const PARSERS: Record<string, () => Promise<ScrapedData>> = {
  'twitter.com':  parseTwitter,
  'x.com':        parseTwitter,
  'warpcast.com': parseFarcaster,
  'gmgn.ai':      parseGMGN,
};

function getParser(): () => Promise<ScrapedData> {
  return PARSERS[location.hostname] ?? parseGeneric;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    // Register tab with service worker for Mode A wallet bridge
    chrome.runtime.sendMessage({ type: 'REGISTER_TAB' }).catch(() => {
      // SW may not be awake yet — ignore
    });

    // Listen for SCRAPE requests from popup (direct sendMessage)
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'SCRAPE') return false;

      const parser = getParser();
      parser()
        .then(data => sendResponse(data))
        .catch(() => sendResponse({ name: '', symbol: '', socials: {}, source: 'generic' } as ScrapedData));

      return true; // async response
    });

    // Wallet bridge — relay window.ethereum EIP-1193 requests
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'WALLET_PING') {
        const ready = typeof (window as any).ethereum !== 'undefined';
        sendResponse({ ready });
        return false;
      }

      if (msg.type === 'WALLET_REQUEST') {
        const eth = (window as any).ethereum;
        if (!eth) {
          sendResponse({ error: 'No injected wallet found — install Rabby or MetaMask' });
          return false;
        }
        eth.request(msg.request)
          .then((result: unknown) => sendResponse({ result }))
          .catch((e: Error) => sendResponse({ error: e.message }));
        return true;
      }

      return false;
    });
  },
});
