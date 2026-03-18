import type { ScrapedData } from '../../lib/messages.js';
import { getOgMeta } from '../../lib/dom-helpers.js';
import { generateSymbol } from '../../lib/symbol.js';

export async function parseGeneric(): Promise<ScrapedData> {
  // ── Layer 1: Open Graph meta ──
  let name    = getOgMeta('og:title') ?? '';
  let desc    = getOgMeta('og:description') ?? '';
  let image   = getOgMeta('og:image') ?? '';
  const siteName = getOgMeta('og:site_name') ?? '';

  // ── Layer 2: HTML fallbacks ──
  if (!name) {
    name = document.title.trim()
      // Strip site suffix patterns: "Title | Site" or "Title - Site" or "Title — Site"
      .replace(/\s*[|—\-–]\s*.{3,30}$/, '')
      .trim();
  }
  if (!name) {
    // Try first H1
    name = document.querySelector('h1')?.textContent?.trim() ?? '';
  }

  if (!desc) {
    // Try meta description
    desc = document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';
  }
  if (!desc) {
    // Try first paragraph with enough text
    const paras = Array.from(document.querySelectorAll('p')) as HTMLParagraphElement[];
    for (const p of paras) {
      const text = p.textContent?.trim() ?? '';
      if (text.length > 50) { desc = text.slice(0, 280); break; }
    }
  }

  // ── Layer 3: meaningful image ──
  if (!image) {
    // Find first large visible img (not icon/pixel/logo)
    const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    for (const img of imgs) {
      const src = img.src || img.getAttribute('data-src') || '';
      const w = img.naturalWidth || img.width || parseInt(img.getAttribute('width') ?? '0');
      const h = img.naturalHeight || img.height || parseInt(img.getAttribute('height') ?? '0');
      if (src && w > 80 && h > 80 && !src.match(/logo|icon|sprite|pixel|1x1|avatar.*_normal/i)) {
        image = src;
        break;
      }
    }
  }

  // Build name cap
  const finalName = (name || siteName || location.hostname).slice(0, 60).trim();

  return {
    name: finalName,
    symbol: generateSymbol(finalName),
    description: desc ? desc.slice(0, 280) : undefined,
    imageUrl: image || undefined,
    socials: {},
    pageUrl: location.href,
  };
}
