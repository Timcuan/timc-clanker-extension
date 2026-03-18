import { parseTwitter } from '../src/content/parsers/twitter.js';
import { parseFarcaster } from '../src/content/parsers/farcaster.js';
import { parseGMGN } from '../src/content/parsers/gmgn.js';
import { parseGeneric } from '../src/content/parsers/generic.js';
import type { ScrapedData } from '../src/lib/messages.js';
import { generateSymbol } from '../src/lib/symbol.js';

const PARSERS: Record<string, () => Promise<ScrapedData>> = {
  'twitter.com':  parseTwitter,
  'x.com':        parseTwitter,
  'warpcast.com': parseFarcaster,
  'gmgn.ai':      parseGMGN,
};

function getParser(): () => Promise<ScrapedData> {
  return PARSERS[location.hostname] ?? parseGeneric;
}

// ────────────────────────────────────────────────────────────
// Picker helpers (module-level so they're accessible everywhere)
// ────────────────────────────────────────────────────────────
const PICKER_STYLE_ID = '__clanker_picker_style';
const PICKER_OVERLAY_ID = '__clanker_picker_overlay';

let pickerActive = false;
let hoveredEl: Element | null = null;

function injectPickerStyles() {
  if (document.getElementById(PICKER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = PICKER_STYLE_ID;
  style.textContent = `
    .__clanker_hover {
      outline: 2px solid #7b5fe6 !important;
      outline-offset: 2px !important;
      cursor: crosshair !important;
      background: rgba(123,95,230,0.08) !important;
    }
    #${PICKER_OVERLAY_ID} {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 2147483647;
      background: rgba(7,7,14,0.88);
      color: #e8e8ff;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      text-align: center;
      padding: 10px 16px;
      pointer-events: none;
      letter-spacing: -0.01em;
      border-bottom: 1px solid rgba(123,95,230,0.35);
    }
  `;
  document.head.appendChild(style);
}

function cleanupPicker() {
  document.getElementById(PICKER_STYLE_ID)?.remove();
  document.getElementById(PICKER_OVERLAY_ID)?.remove();
}

function extractFromElement(el: Element): ScrapedData {
  const blockTags = ['article', 'section', 'div', 'li', 'blockquote', 'p'];
  let target: Element = el;
  let current: Element | null = el;
  while (current && current !== document.body) {
    const text = current.textContent?.trim() ?? '';
    if (text.length > 20 && blockTags.includes(current.tagName.toLowerCase())) {
      target = current;
      break;
    }
    current = current.parentElement;
  }

  const rawText = target.textContent?.trim() ?? '';
  const name = rawText.slice(0, 60).replace(/\s+/g, ' ').trim() || document.title.slice(0, 60);
  const description = rawText.length > 60
    ? rawText.slice(0, 280).replace(/\s+/g, ' ').trim()
    : undefined;

  let imageUrl: string | undefined;
  const imgs = Array.from(target.querySelectorAll('img')) as HTMLImageElement[];
  for (const img of imgs) {
    const src = img.src || img.getAttribute('data-src') || '';
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (src && w > 40 && h > 40 && !src.includes('1x1') && !src.includes('pixel')) {
      imageUrl = src;
      break;
    }
  }
  if (!imageUrl) {
    imageUrl = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? undefined;
  }

  const source: ScrapedData['source'] = location.hostname.includes('twitter.com') || location.hostname.includes('x.com')
    ? 'twitter'
    : location.hostname.includes('warpcast.com')
    ? 'farcaster'
    : undefined;

  return { name, symbol: generateSymbol(name), description, imageUrl, socials: {}, source, pageUrl: location.href };
}

function onPickMouseOver(e: MouseEvent) {
  if (!pickerActive) return;
  if (hoveredEl) hoveredEl.classList.remove('__clanker_hover');
  hoveredEl = e.target as Element;
  hoveredEl.classList.add('__clanker_hover');
}
function onPickMouseOut(e: MouseEvent) {
  if (!pickerActive) return;
  (e.target as Element).classList.remove('__clanker_hover');
}
function onPickClick(e: MouseEvent) {
  if (!pickerActive) return;
  e.preventDefault();
  e.stopPropagation();
  const data = extractFromElement(e.target as Element);
  exitPickerMode();
  // Write to storage.session — popup reads via onChanged
  chrome.storage.session.set({ __clanker_pick: { data, ts: Date.now() } });
}
function onPickKeyDown(e: KeyboardEvent) {
  if (!pickerActive) return;
  if (e.key === 'Escape') {
    exitPickerMode();
    chrome.storage.session.set({ __clanker_pick: { cancelled: true, ts: Date.now() } });
  }
}

function enterPickerMode() {
  pickerActive = true;
  injectPickerStyles();
  const overlay = document.createElement('div');
  overlay.id = PICKER_OVERLAY_ID;
  overlay.textContent = '🎯 Clanker: Click an element to tokenize it  |  ESC to cancel';
  document.body.appendChild(overlay);
  document.addEventListener('mouseover', onPickMouseOver, true);
  document.addEventListener('mouseout', onPickMouseOut, true);
  document.addEventListener('click', onPickClick, true);
  document.addEventListener('keydown', onPickKeyDown, true);
}

function exitPickerMode() {
  pickerActive = false;
  if (hoveredEl) { hoveredEl.classList.remove('__clanker_hover'); hoveredEl = null; }
  document.removeEventListener('mouseover', onPickMouseOver, true);
  document.removeEventListener('mouseout', onPickMouseOut, true);
  document.removeEventListener('click', onPickClick, true);
  document.removeEventListener('keydown', onPickKeyDown, true);
  cleanupPicker();
}

// ────────────────────────────────────────────────────────────
// Content Script entry
// ────────────────────────────────────────────────────────────
export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    chrome.runtime.sendMessage({ type: 'REGISTER_TAB' }).catch(() => {});

    // Single consolidated listener — avoids conflicts between multiple addListener calls
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // ── SCRAPE ──
      if (msg.type === 'SCRAPE') {
        getParser()()
          .then(data => sendResponse(data))
          .catch(() => sendResponse({ name: '', symbol: '', socials: {} } as ScrapedData));
        return true; // async
      }

      // ── PICKER ──
      if (msg.type === 'ENTER_PICK_MODE') {
        enterPickerMode();
        sendResponse({ ok: true });
        return false;
      }
      if (msg.type === 'EXIT_PICK_MODE') {
        exitPickerMode();
        sendResponse({ ok: true });
        return false;
      }

      // ── WALLET BRIDGE ──
      if (msg.type === 'WALLET_PING') {
        sendResponse({ ready: typeof (window as any).ethereum !== 'undefined' });
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
