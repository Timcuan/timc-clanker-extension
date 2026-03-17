import { uploadToPinata } from './pinata.js';
import { storage } from './storage.js';

async function sha1hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function processImageUrl(url: string): Promise<string> {
  // Already IPFS — pass through
  if (url.startsWith('ipfs://')) return url;

  // Check cache
  const cacheKey = `imgcache:${await sha1hex(url)}`;
  const cached = await chrome.storage.local.get(cacheKey);
  if (cached[cacheKey]) return cached[cacheKey] as string;

  const config = await storage.get();
  if (!config.pinataApiKey || !config.pinataSecretKey) {
    throw new Error('Pinata API keys not configured — set them in Options');
  }

  // Fetch image in service worker (CORS-free for extension origins)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const blob = await res.blob();

  if (blob.size > 5 * 1024 * 1024) {
    throw new Error('Image too large (>5MB). Please use a smaller image.');
  }

  const ext = blob.type.split('/')[1] ?? 'jpg';
  const filename = `token-image.${ext}`;
  const ipfsUrl = await uploadToPinata(blob, filename, config.pinataApiKey, config.pinataSecretKey);

  // Cache result
  await chrome.storage.local.set({ [cacheKey]: ipfsUrl });

  return ipfsUrl;
}

export async function processImageBlob(data: ArrayBuffer, filename: string): Promise<string> {
  const config = await storage.get();
  if (!config.pinataApiKey || !config.pinataSecretKey) {
    throw new Error('Pinata API keys not configured — set them in Options');
  }

  const blob = new Blob([data]);
  return uploadToPinata(blob, filename, config.pinataApiKey, config.pinataSecretKey);
}
