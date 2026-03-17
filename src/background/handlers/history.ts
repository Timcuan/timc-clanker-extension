import { storage } from '../../lib/storage.js';
import type { DeployRecord } from '../../lib/messages.js';

export async function getHistory(): Promise<{ records: DeployRecord[] }> {
  const config = await storage.get();
  const local = config.deployHistory ?? [];

  // Sort by deployedAt descending
  const sorted = [...local].sort((a, b) => b.deployedAt - a.deployedAt);
  return { records: sorted };
}

export async function addDeployRecord(record: DeployRecord): Promise<void> {
  const config = await storage.get();
  const history = [record, ...(config.deployHistory ?? [])].slice(0, 200); // cap at 200
  await storage.set({ deployHistory: history });
}
