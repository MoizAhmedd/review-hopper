// The grouped file tree that replaces the site's own, and the bar that ends the file list.

import { CARD_KINDS, type Kind } from '../lib/classify.ts';
import type { SiteFile } from '../sites/site.ts';
import { basename, h } from './dom.ts';

export interface TreeModel {
  site: string;
  files: SiteFile[];
  kinds: Map<SiteFile, Kind>;
  hidden: Set<SiteFile>;
  showHidden: boolean;
}

export interface TreeActions {
  open(file: SiteFile): void;
  toggleHidden(): void;
  showSiteTree(): void;
}

const HIDDEN_LABEL: Partial<Record<Kind, string>> = { tests: 'test', config: 'config file', lockfile: 'lockfile', generated: 'generated' };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 || w === 'generated' ? '' : 's'}`;
const lines = (fs: SiteFile[]) => fs.reduce((n, f) => n + f.added + f.removed, 0);
const collapsed = new Set<string>();

/** "6 tests · 1 generated": what the hidden files are. */
export function hiddenSummary(m: TreeModel): string[] {
  const counts = new Map<Kind, number>();
  for (const f of m.hidden) counts.set(m.kinds.get(f)!, (counts.get(m.kinds.get(f)!) ?? 0) + 1);
  return [...counts].map(([k, n]) => plural(n, HIDDEN_LABEL[k] ?? k));
}

function row(f: SiteFile, actions: TreeActions) {
  return h('div', { class: 'rh-f', title: f.path, onclick: () => actions.open(f) },
    h('span', { class: 'rh-name' }, basename(f.path)),
    h('span', { class: 'rh-s' }, h('span', { class: 'rh-a' }, `+${f.added}`), h('span', { class: 'rh-r' }, `−${f.removed}`)));
}

function group(name: string, files: SiteFile[], actions: TreeActions, extra?: Node) {
  if (!files.length) return null;
  const open = !collapsed.has(name);
  const el = h('div', { class: 'rh-group' },
    h('div', { class: 'rh-gh', onclick: () => { open ? collapsed.add(name) : collapsed.delete(name); el.replaceWith(group(name, files, actions, extra)!); } },
      h('span', { class: 'rh-chev' }, open ? '▼' : '▶'), name, h('span', { class: 'rh-n' }, String(files.length)), extra ?? null,
      h('span', { class: 'rh-meta' }, `${lines(files)} lines`)),
    ...(open ? files.map((f) => row(f, actions)) : []));
  return el;
}

export function treeView(m: TreeModel, actions: TreeActions): HTMLElement {
  const visible = m.files.filter((f) => !m.hidden.has(f));
  const of = (test: (k: Kind) => boolean) => visible.filter((f) => test(m.kinds.get(f)!));
  const hidden = m.files.filter((f) => m.hidden.has(f));
  const hiddenGroup = hidden.length
    ? h('div', { class: 'rh-hidden-group' },
        h('div', { class: 'rh-gh', onclick: actions.toggleHidden },
          h('span', { class: 'rh-chev' }, m.showHidden ? '▼' : '▶'), 'Hidden', h('span', { class: 'rh-n' }, String(hidden.length)),
          h('span', { class: 'rh-meta' }, m.showHidden ? 'Hide' : 'Show')),
        m.showHidden ? h('div', {}, ...hidden.map((f) => row(f, actions))) : h('div', { class: 'rh-why' }, ...hiddenSummary(m).map((t) => h('span', { class: 'rh-pill muted' }, t))))
    : null;
  return h('div', { class: 'rh rh-tree' },
    h('div', { class: 'rh-tree-head' }, h('b', {}, 'Review Hopper'), `${visible.length} of ${m.files.length} files`,
      h('button', { class: 'rh-btn', title: `Show ${m.site}'s own file tree`, onclick: actions.showSiteTree }, `${m.site} tree`)),
    group('At a glance', of((k) => CARD_KINDS.has(k)), actions),
    group('Docs', of((k) => k === 'docs'), actions),
    group('Code', of((k) => k === 'code'), actions),
    group('Images', of((k) => k === 'images'), actions),
    hiddenGroup);
}

export function bandView(m: TreeModel, toggle: () => void): HTMLElement {
  const hidden = m.files.filter((f) => m.hidden.has(f));
  return h('div', { class: 'rh rh-band' },
    h('div', {}, h('b', {}, m.showHidden ? `Showing ${plural(hidden.length, 'hidden file')}` : `${plural(hidden.length, 'file')} hidden`),
      h('span', { class: 'rh-sub' }, ` · ${lines(hidden)} lines · ${hiddenSummary(m).join(', ')}`)),
    h('button', { class: 'rh-btn', onclick: toggle }, m.showHidden ? 'Hide them again' : 'Show hidden files'));
}

/** Small tree to bring Review Hopper's back after switching to the site's. */
export function backButton(onclick: () => void): HTMLElement {
  return h('div', { class: 'rh', style: 'padding:6px 8px' }, h('button', { class: 'rh-btn', onclick }, 'Review Hopper tree'));
}
