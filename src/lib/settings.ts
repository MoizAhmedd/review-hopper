// What the reviewer turned on or off in the popup. Synced across their browsers.

import type { Kind } from './classify.ts';

export interface Settings {
  enabled: boolean;
  hide: Record<'tests' | 'config' | 'lockfile' | 'generated', boolean>;
  cards: boolean;
  markdown: boolean;
}

export const DEFAULTS: Settings = {
  enabled: true,
  hide: { tests: true, config: true, lockfile: true, generated: true },
  cards: true,
  markdown: true,
};

export async function load(): Promise<Settings> {
  const { settings } = await chrome.storage.sync.get('settings');
  const s = (settings ?? {}) as Partial<Settings>;
  return { ...DEFAULTS, ...s, hide: { ...DEFAULTS.hide, ...s.hide } };
}

export const save = (settings: Settings) => chrome.storage.sync.set({ settings });

export function hiddenKinds(s: Settings): Set<Kind> {
  return new Set((Object.keys(s.hide) as (keyof Settings['hide'])[]).filter((k) => s.hide[k]));
}
