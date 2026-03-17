export function getOgMeta(property: string): string | null {
  return document.querySelector(`meta[property="${property}"]`)?.getAttribute('content') ?? null;
}

export function getMetaName(name: string): string | null {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? null;
}

export function extractHandle(ogTitle: string): string | null {
  const match = ogTitle.match(/@([A-Za-z0-9_]+)\)/);
  return match?.[1] ?? null;
}

export function extractTweetId(url: string): string | null {
  const match = url.match(/\/status\/(\d+)/);
  return match?.[1] ?? null;
}

export function extractCastHash(url: string): string | null {
  const match = url.match(/\/(0x[a-fA-F0-9]+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise(resolve => {
    const el = document.querySelector(selector);
    if (el) { resolve(el); return; }
    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) { observer.disconnect(); resolve(found); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
  });
}
