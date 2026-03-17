import type { ScrapedData } from './messages.js';

interface ClankerDeployContext {
  interface: string;
  platform: string;
  messageId: string;
  id?: string;
}

const PLATFORM_MAP: Record<string, string> = {
  twitter: 'twitter',
  farcaster: 'farcaster',
  gmgn: 'clanker',
  generic: 'website',
};

function generateSyntheticMessageId(): string {
  return (1800000000000000000n + BigInt(Date.now())).toString();
}

export function buildDeployContext(
  scraped: ScrapedData,
  interfaceName = 'ClankerExtension'
): ClankerDeployContext {
  const platform = PLATFORM_MAP[scraped.source ?? 'generic'] ?? 'website';
  const messageId = scraped.messageId?.trim() || generateSyntheticMessageId();

  return {
    interface: interfaceName,
    platform,
    messageId,
    ...(scraped.userId ? { id: scraped.userId } : {}),
  };
}
