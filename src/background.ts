// Background worker: runs the parsers for the page script. It never fetches anything; the page
// script sends the file contents it read with the site's own login.

import { buildCard } from './lib/cards.ts';
import type { Request } from './lib/messages.ts';
import { addedLines, markdownDiff } from './lib/parsers/markdown.ts';

// Results for one file at one pair of commits never change, so they're kept for the browser
// session. chrome.storage.session lives in memory and is cleared when Chrome quits.
async function handle(request: Request) {
  if (request.type === 'cached') return { hit: (await chrome.storage.session.get(request.cache))[request.cache] };
  const result = build(request);
  if (request.cache && !('error' in result)) await chrome.storage.session.set({ [request.cache]: result }).catch(() => {});
  return result;
}

function build(request: Exclude<Request, { type: 'cached' }>) {
  try {
    if (request.type === 'card') return { card: buildCard(request.kind, request.file, request.lockfile) };
    return {
      blocks: markdownDiff(request.file.old, request.file.new, request.links),
      addedLines: addedLines(request.file.old, request.file.new),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((request: Request, _sender, reply) => {
  handle(request).then(reply);
  return true;
});
