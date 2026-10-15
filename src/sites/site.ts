// What Review Hopper needs from a review page. One adapter per site, so a redesign of one site
// breaks one file.

import type { Links } from '../lib/parsers/markdown.ts';

export interface SiteFile {
  path: string;
  oldPath: string;
  status: 'added' | 'modified' | 'removed';
  generated: boolean;
  added: number;
  removed: number;
}

export interface Site {
  name: 'GitLab' | 'GitHub';
  /** A key for the review currently on screen, or undefined when this isn't one of the site's review pages. */
  review(): string | undefined;
  files(): Promise<SiteFile[]>;
  /** The file's block on the page, once the site has rendered it. */
  element(file: SiteFile): HTMLElement | null;
  /** The file block's header and its diff body, which Review Hopper swaps for a card. */
  parts(block: HTMLElement): { header: HTMLElement; body: HTMLElement } | null;
  /** The container of the file blocks, for ordering and the hidden-files bar. */
  list(): HTMLElement | null;
  /** The site's own file tree, which Review Hopper's tree replaces. */
  tree(): HTMLElement | null;
  content(file: SiteFile, side: 'old' | 'new'): Promise<string | null>;
  /** The base and head commits being compared, once files() has run. Results are cached by it. */
  revision(): string | undefined;
  links(file: SiteFile): Links;
  /** Present when Review Hopper renders the site's markdown itself. */
  comment?(file: SiteFile, line: number, text: string): Promise<void>;
}

export async function text(url: string): Promise<string | null> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`${res.status} for ${url}`);
  }
  return res.text();
}
