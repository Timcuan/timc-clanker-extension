import type { BgMessage, BgResult } from './messages.js';

export async function bgSend<T extends BgMessage>(
  msg: T
): Promise<BgResult<T['type']>> {
  return chrome.runtime.sendMessage(msg);
}
