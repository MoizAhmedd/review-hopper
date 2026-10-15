// Page script for gitlab.com and github.com. Both sites change pages without reloading, so it
// watches the DOM, starts on review pages and re-applies itself when the site re-renders.

import { CARD_KINDS, type Kind, plan } from './lib/classify.ts';
import { ask } from './lib/messages.ts';
import { type Settings, hiddenKinds, load } from './lib/settings.ts';
import { github } from './sites/github.ts';
import { gitlab } from './sites/gitlab.ts';
import type { Site, SiteFile } from './sites/site.ts';
import { cardView } from './ui/card-view.ts';
import { h } from './ui/dom.ts';
import { markdownView } from './ui/markdown-view.ts';
import { CSS } from './ui/styles.ts';
import { type TreeModel, backButton, bandView, treeView } from './ui/tree.ts';

const SITES: Site[] = [gitlab, github];

/** Loads run as soon as a file is on the page, a few at a time, so they're ready before the reviewer scrolls there. */
const queue: (() => Promise<void>)[] = [];
let running = 0;
function enqueue(job: () => Promise<void>) {
  queue.push(job);
  pump();
}
function pump() {
  while (running < 4 && queue.length) {
    const job = queue.shift()!;
    running++;
    void job().finally(() => {
      running--;
      pump();
    });
  }
}
const ORDER: Partial<Record<Kind, string>> = { docs: '2', code: '3', images: '3' };

class Review {
  private files: SiteFile[] = [];
  private kinds = new Map<SiteFile, Kind>();
  private hidden = new Set<SiteFile>();
  private showHidden = false;
  private siteTree = false;
  private signature = '';
  private treeEl?: HTMLElement;
  private bandEl?: HTMLElement;
  private mounted = new Map<string, HTMLElement>();
  private stopped = false;

  readonly site: Site;
  readonly key: string;
  readonly settings: Settings;

  constructor(site: Site, key: string, settings: Settings) {
    this.site = site;
    this.key = key;
    this.settings = settings;
  }

  async apply() {
    this.files = await this.site.files();
    const p = plan(this.files, hiddenKinds(this.settings));
    this.kinds = p.kinds;
    this.hidden = new Set(p.hidden);
    const signature = `${this.files.map((f) => f.path).join('|')}#${this.hidden.size}#${this.showHidden}#${this.siteTree}`;
    const changed = signature !== this.signature;
    this.signature = signature;
    this.tree(changed);
    this.band(changed);
    // Cards first, so the files at the top of the list load first.
    const first = (f: SiteFile) => (CARD_KINDS.has(this.kinds.get(f)!) ? 0 : 1);
    for (const file of [...this.files].sort((a, b) => first(a) - first(b))) this.decorate(file);
  }

  private model(): TreeModel {
    return { site: this.site.name, files: this.files, kinds: this.kinds, hidden: this.hidden, showHidden: this.showHidden };
  }

  private tree(changed: boolean) {
    const host = this.site.tree();
    if (!host) return;
    if (changed || !this.treeEl?.isConnected) {
      const next = this.siteTree
        ? backButton(() => this.setSiteTree(false))
        : treeView(this.model(), {
            open: (f) => this.open(f),
            toggleHidden: () => this.setShowHidden(!this.showHidden),
            showSiteTree: () => this.setSiteTree(true),
          });
      if (this.treeEl?.isConnected) this.treeEl.replaceWith(next);
      else host.prepend(next);
      this.treeEl = next;
    }
    for (const child of host.children) {
      if (child === this.treeEl) continue;
      if (this.siteTree) delete (child as HTMLElement).dataset.rhHide;
      else (child as HTMLElement).dataset.rhHide = '';
    }
  }

  private band(changed: boolean) {
    const list = this.site.list();
    if (!list) return;
    list.dataset.rhList = '';
    if (!this.hidden.size) return this.bandEl?.remove();
    if (changed || !this.bandEl?.isConnected) {
      const next = bandView(this.model(), () => this.setShowHidden(!this.showHidden));
      this.bandEl?.remove();
      list.append(next);
      this.bandEl = next;
    }
  }

  /**
   * The element to order and hide for a file: the block, or a wrapper that holds only it
   * (GitHub's). Shared wrappers in between (GitLab's streamed batches) are made transparent to
   * layout, so every file is ordered as part of one list.
   */
  private slot(block: HTMLElement): HTMLElement {
    const list = this.site.list();
    let el = block;
    while (el.parentElement && el.parentElement !== list && el.parentElement.childElementCount === 1) el = el.parentElement;
    for (let p = el.parentElement; list && p && p !== list && list.contains(p); p = p.parentElement) p.dataset.rhFlat = '';
    return el;
  }

  private decorate(file: SiteFile) {
    const block = this.site.element(file);
    if (!block) return;
    const kind = this.kinds.get(file)!;
    const slot = this.slot(block);
    if (this.hidden.has(file) && !this.showHidden) slot.dataset.rhHide = '';
    else delete slot.dataset.rhHide;
    slot.dataset.rhOrder = this.hidden.has(file) ? '4' : CARD_KINDS.has(kind) ? '1' : ORDER[kind] ?? '3';
    const wantsCard = this.settings.cards && CARD_KINDS.has(kind) && file.status !== 'removed';
    const wantsMarkdown = this.settings.markdown && kind === 'docs' && !!this.site.comment && file.status !== 'removed';
    if ((wantsCard || wantsMarkdown) && !this.mounted.get(file.path)?.isConnected) this.mount(file, kind, block, wantsCard ? 'card' : 'markdown');
  }

  /** Swaps the file's diff for a card or rendered markdown. */
  private mount(file: SiteFile, kind: Kind, block: HTMLElement, mode: 'card' | 'markdown') {
    const body = this.site.body(block);
    if (!body) return;
    const holder = h('div', { class: 'rh rh-holder' }, h('div', { class: 'rh-note' }, 'Review Hopper is reading this file…'));
    body.before(holder);
    body.dataset.rhHide = '';
    this.mounted.set(file.path, holder);
    let view: HTMLElement | undefined;
    const showRaw = (note?: string) => {
      delete body.dataset.rhHide;
      holder.replaceChildren(h('div', { class: 'rh-note' }, note ?? 'Showing the diff. ', view ? h('button', { class: 'rh-btn', onclick: showView }, mode === 'card' ? 'Back to summary' : 'Back to rendered') : null));
    };
    const showView = () => {
      body.dataset.rhHide = '';
      holder.replaceChildren(view!);
    };
    const load = async () => {
      if (this.stopped) return;
      const revision = this.site.revision();
      const cache = revision && `${this.key}@${revision}:${mode}:${file.path}`;
      try {
        const hit = cache ? (await ask({ type: 'cached', cache })).hit : undefined;
        const res = hit ?? (await this.build(file, kind, mode, cache));
        if (!res) return showRaw('Review Hopper has nothing to summarise for a deleted file. ');
        if ('error' in res) return showRaw(`Review Hopper couldn't read this file (${res.error}). Showing the diff. `);
        if ('card' in res) view = cardView(res.card, h('button', { class: 'rh-btn', onclick: () => showRaw() }, 'Raw diff'));
        else {
          const comment = this.site.comment?.bind(this.site);
          view = h('div', { class: 'rh' },
            h('div', { class: 'rh rh-note', style: 'display:flex;align-items:center' }, 'Rendered by Review Hopper. Hover a changed block to comment on it.',
              h('button', { class: 'rh-btn', style: 'margin-left:auto', onclick: () => showRaw() }, 'Diff')),
            markdownView(res.blocks, res.addedLines, comment && ((line, text) => comment(file, line, text))));
        }
        showView();
      } catch (error) {
        showRaw(`Review Hopper couldn't load this file (${error instanceof Error ? error.message : error}). Showing the diff. `);
      }
    };
    enqueue(load);
  }

  /** Reads the file's versions with the site's login and has the background worker summarise them. */
  private async build(file: SiteFile, kind: Kind, mode: 'card' | 'markdown', cache: string | undefined) {
    // A SQL migration's card reads only the new file.
    const needsOld = !(kind === 'database' && file.path.endsWith('.sql'));
    const [oldText, newText] = await Promise.all([needsOld ? this.site.content(file, 'old') : null, this.site.content(file, 'new')]);
    if (newText === null) return undefined;
    const version = { path: file.path, old: oldText, new: newText };
    if (mode === 'markdown') return ask({ type: 'markdown', file: version, links: this.site.links(file), cache });
    return ask({ type: 'card', kind, file: version, lockfile: kind === 'deps' ? await this.lockfile(file) : undefined, cache });
  }

  /** For package.json: the lockfile changed alongside it, if any. */
  private async lockfile(file: SiteFile) {
    const dir = file.path.slice(0, file.path.lastIndexOf('/') + 1);
    const lock = this.files.find((f) => this.kinds.get(f) === 'lockfile' && f.path.startsWith(dir) && !f.path.slice(dir.length).includes('/'));
    if (!lock) return undefined;
    const [oldText, newText] = await Promise.all([this.site.content(lock, 'old'), this.site.content(lock, 'new')]);
    return newText === null ? undefined : { path: lock.path, old: oldText, new: newText };
  }

  private open(file: SiteFile) {
    if (this.hidden.has(file) && !this.showHidden) this.setShowHidden(true);
    const block = this.site.element(file);
    if (!block) return;
    this.slot(block).scrollIntoView({ block: 'start' });
    window.scrollBy(0, -90);
  }

  private setShowHidden(show: boolean) {
    this.showHidden = show;
    void this.apply();
  }

  private setSiteTree(show: boolean) {
    this.siteTree = show;
    void this.apply();
  }

  stop() {
    this.stopped = true;
    this.treeEl?.remove();
    this.bandEl?.remove();
    for (const holder of this.mounted.values()) holder.remove();
    for (const el of document.querySelectorAll<HTMLElement>('[data-rh-hide], [data-rh-order], [data-rh-list], [data-rh-flat]')) {
      delete el.dataset.rhHide;
      delete el.dataset.rhOrder;
      delete el.dataset.rhList;
      delete el.dataset.rhFlat;
    }
  }
}

let current: Review | undefined;
let busy = false;
let again = false;

async function tick() {
  if (busy) return void (again = true);
  busy = true;
  try {
    const site = SITES.find((s) => s.review());
    const key = site?.review();
    if (key !== current?.key) {
      current?.stop();
      current = undefined;
      const settings = await load();
      if (site && key && settings.enabled) current = new Review(site, key, settings);
    }
    await current?.apply();
  } catch (error) {
    console.debug('[Review Hopper]', error);
  } finally {
    busy = false;
    if (again) {
      again = false;
      schedule();
    }
  }
}

// At most one update every 150 ms. A debounce would starve while GitLab streams files in.
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void tick();
  }, 150);
}

document.head.append(Object.assign(document.createElement('style'), { textContent: CSS, id: 'review-hopper-style' }));
new MutationObserver((records) => {
  // Ignore changes Review Hopper made itself.
  if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && n.classList.contains('rh')))) return;
  schedule();
}).observe(document.documentElement, { childList: true, subtree: true });
chrome.storage.onChanged.addListener(() => {
  current?.stop();
  current = undefined;
  schedule();
});
schedule();
