import type { DeployFormState } from './messages.js';
import { storage } from './storage.js';

export async function saveTemplate(name: string, config: Partial<DeployFormState>): Promise<void> {
  const current = await storage.get();
  const template = {
    id: crypto.randomUUID(),
    name,
    config,
    createdAt: Date.now(),
  };
  await storage.set({ templates: [...current.templates, template] });
}

export async function deleteTemplate(id: string): Promise<void> {
  const current = await storage.get();
  await storage.set({ templates: current.templates.filter(t => t.id !== id) });
}

export async function listTemplates() {
  const config = await storage.get();
  return config.templates;
}
