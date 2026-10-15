// Toolbar popup: what Review Hopper hides and replaces.

import { type Settings, load, save } from './lib/settings.ts';

const settings = await load();
const fields: [string, (s: Settings) => boolean, (s: Settings, v: boolean) => void][] = [
  ['enabled', (s) => s.enabled, (s, v) => (s.enabled = v)],
  ['tests', (s) => s.hide.tests, (s, v) => (s.hide.tests = v)],
  ['config', (s) => s.hide.config, (s, v) => (s.hide.config = v)],
  ['lockfile', (s) => s.hide.lockfile, (s, v) => (s.hide.lockfile = v)],
  ['generated', (s) => s.hide.generated, (s, v) => (s.hide.generated = v)],
  ['cards', (s) => s.cards, (s, v) => (s.cards = v)],
  ['markdown', (s) => s.markdown, (s, v) => (s.markdown = v)],
];
for (const [id, get, set] of fields) {
  const box = document.getElementById(id) as HTMLInputElement;
  box.checked = get(settings);
  box.addEventListener('change', () => {
    set(settings, box.checked);
    void save(settings);
  });
}
