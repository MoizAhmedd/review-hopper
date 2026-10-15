// Rendered markdown with changed blocks marked, and comments posted to a source line.

import type { Block, Links } from '../lib/parsers/markdown.ts';
import { h } from './dom.ts';
import { sanitize } from './sanitize.ts';

const LABEL: Record<Block['status'], string> = { same: '', added: 'Added', changed: 'Changed', removed: 'Removed' };

/**
 * `comment` posts to the first line of the block the diff adds; blocks with no added line (and
 * all blocks, when the site can't take comments) get no comment button.
 */
export function markdownView(blocks: Block[], addedLines: number[], links: Links, comment?: (line: number, text: string) => Promise<void>): HTMLElement {
  const added = new Set(addedLines);
  const root = h('div', { class: 'rh rh-md' });
  for (const block of blocks) {
    const el = h('div', { class: `rh-blk ${block.status}`, title: LABEL[block.status] });
    const body = h('div');
    body.append(sanitize(block.html, links));
    el.append(body);
    if (block.oldHtml) {
      const old = h('div', { class: 'rh-old' });
      old.append(sanitize(block.oldHtml, links));
      old.hidden = true;
      el.append(old);
    }
    const tools = h('div', { class: 'rh-blk-tools' });
    if (block.oldHtml)
      tools.append(h('button', { class: 'rh-btn', onclick: () => { const old = el.querySelector<HTMLElement>('.rh-old')!; old.hidden = !old.hidden; } }, 'Before'));
    const line = block.status === 'removed' ? undefined : range(block.lines).find((n) => added.has(n));
    if (comment && line !== undefined) tools.append(h('button', { class: 'rh-btn', onclick: () => compose(el, line, comment) }, 'Comment'));
    if (tools.childElementCount) el.append(tools);
    root.append(el);
  }
  return root;
}

const range = ([a, b]: [number, number]) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function compose(block: HTMLElement, line: number, comment: (line: number, text: string) => Promise<void>) {
  if (block.nextElementSibling?.classList.contains('rh-composer')) return;
  const box = h('textarea', { placeholder: 'Leave a comment' }) as HTMLTextAreaElement;
  const status = h('span', {}, `Posts on line ${line}`);
  const send = h('button', { class: 'rh-btn primary' }, 'Comment');
  const composer = h('div', { class: 'rh-composer' }, box, h('div', { class: 'rh-row' }, status, h('button', { class: 'rh-btn', onclick: () => composer.remove() }, 'Cancel'), send));
  send.addEventListener('click', async () => {
    if (!box.value.trim()) return;
    send.setAttribute('disabled', '');
    status.textContent = 'Posting…';
    try {
      await comment(line, box.value);
      composer.replaceChildren(h('div', { class: 'rh-row' }, `Comment posted on line ${line}. Reload to see it in the thread.`));
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
      send.removeAttribute('disabled');
    }
  });
  block.after(composer);
  box.focus();
}
