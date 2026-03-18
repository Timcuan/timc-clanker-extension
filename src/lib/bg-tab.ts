// src/lib/bg-tab.ts
// Background tab lifecycle manager — opens a hidden tab, waits for content script, scrapes, cleans up.

import type { ScrapedData } from './messages.js';

let isBgTabBusy = false;

/** Reset busy state — exported for tests only */
export function resetBgTabState(): void {
  isBgTabBusy = false;
}

export async function bgTab(url: string): Promise<ScrapedData> {
  if (isBgTabBusy) throw new Error('A fetch is already in progress');
  isBgTabBusy = true;

  let tab: chrome.tabs.Tab | undefined;
  try {
    // 1. Open a hidden, non-active tab
    tab = await chrome.tabs.create({ url, active: false, pinned: false });

    // 2. Wait for tab to finish loading (max 10s)
    await waitForTabComplete(tab.id!, 10_000);

    // 3. Send SCRAPE with retry — content script may not be ready immediately at status=complete
    const send = () =>
      chrome.tabs.sendMessage(tab!.id!, { type: 'SCRAPE' }) as Promise<ScrapedData>;
    const data = await retryMessageForTest(send, 3, 300);

    // 4. Treat empty result as login-wall / blocked page
    if (!data?.name && !data?.imageUrl) {
      throw new Error('Page requires login or returned no content');
    }

    return data;
  } finally {
    // Always cleanup — whether success or error
    if (tab?.id !== undefined) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
    isBgTabBusy = false;
  }
}

/**
 * Retry a sendMessage call up to maxAttempts times with delayMs between tries.
 * Exported as retryMessageForTest to allow unit testing without full chrome.tabs setup.
 */
export async function retryMessageForTest<T>(
  send: () => Promise<T>,
  maxAttempts: number,
  delayMs: number
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await send();
    } catch {
      if (i === maxAttempts - 1) throw new Error('Content script unavailable');
      await delay(delayMs);
    }
  }
  // unreachable — satisfies TypeScript
  throw new Error('Content script unavailable');
}

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      reject(new Error('Tab load timeout'));
    }, timeoutMs);

    function onUpdated(id: number, info: chrome.tabs.TabChangeInfo) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      resolve();
    }

    function onRemoved(id: number) {
      if (id !== tabId) return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      reject(new Error('Tab crashed or was closed'));
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
