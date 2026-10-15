// Requests from the page script to the background worker, where the parsers live.

import type { Card } from './card.ts';
import type { Version } from './cards.ts';
import type { Kind } from './classify.ts';
import type { Block, Links } from './parsers/markdown.ts';

export type CardResult = { card: Card } | { error: string };
export type MarkdownResult = { blocks: Block[]; addedLines: number[] } | { error: string };

/** `cache` names the result for one file at one pair of commits, so it never goes stale. */
export type Request =
  | { type: 'card'; kind: Kind; file: Version; lockfile?: Version; cache?: string }
  | { type: 'markdown'; file: Version; links: Links; cache?: string }
  | { type: 'cached'; cache: string };

export type Response<R extends Request> = R extends { type: 'card' }
  ? CardResult
  : R extends { type: 'markdown' }
    ? MarkdownResult
    : { hit?: CardResult | MarkdownResult };

export function ask<R extends Request>(request: R): Promise<Response<R>> {
  return chrome.runtime.sendMessage(request);
}
