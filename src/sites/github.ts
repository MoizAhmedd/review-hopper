// GitHub pull requests, on both Files changed pages. Each file block's id is "diff-" + sha256(path)
// on either one.
// - The current page (signed in): a React app whose embedded data lists every file and the two
//   commits. Its CSS class names are hashed per build, so nothing here selects on them.
// - The classic page (signed out, or opted out of the new one): server-rendered `.file` blocks that
//   load in batches as you scroll, with the commits in their diff URLs.

import { type Site, type SiteFile, text } from './site.ts';

interface Summary {
  path: string;
  pathDigest: string;
  changeType: 'ADDED' | 'MODIFIED' | 'REMOVED' | 'RENAMED' | string;
  isVendored?: boolean;
  linesAdded: number;
  linesDeleted: number;
}

interface PullData {
  baseOid: string;
  headOid: string;
  summaries: Summary[];
  oldPaths: Map<string, string>;
}

const PULL = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)\/(files|changes)/;
let cache: { key: string; data: PullData } | undefined;
const digests = new Map<string, string>();

/** Finds the PR's comparison and file list anywhere in the embedded JSON. */
function find(json: unknown): PullData | undefined {
  let base: string | undefined, head: string | undefined, summaries: Summary[] | undefined;
  const oldPaths = new Map<string, string>();
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    const o = v as Record<string, unknown>;
    const full = (o.comparison as Record<string, Record<string, string>> | undefined)?.fullDiff;
    if (full?.baseOid && full.headOid) [base, head] = [full.baseOid, full.headOid];
    if (Array.isArray(o.diffSummaries)) summaries = o.diffSummaries as Summary[];
    const oldEntry = o.oldTreeEntry as { path?: string } | undefined, newEntry = o.newTreeEntry as { path?: string } | undefined;
    if (oldEntry?.path && newEntry?.path && oldEntry.path !== newEntry.path) oldPaths.set(newEntry.path, oldEntry.path);
    Object.values(o).forEach(walk);
  };
  walk(json);
  return base && head && summaries ? { baseOid: base, headOid: head, summaries, oldPaths } : undefined;
}

function embedded(doc: Document): PullData | undefined {
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const data = find(JSON.parse(script.textContent ?? ''));
      if (data) return data;
    } catch {
      // Not the payload we want.
    }
  }
  return undefined;
}

const isClassic = () => !!document.querySelector('.file[data-tagsearch-path]') && !document.querySelector('[data-testid="progressive-diffs-list"]');

/** The classic page, read fresh each time because its file blocks arrive in batches. */
function classic(): PullData | undefined {
  const url = document.querySelector('[data-url*="base_commit_oid="]')?.getAttribute('data-url') ?? '';
  const q = new URLSearchParams(url.split('?')[1] ?? '');
  let base = q.get('base_commit_oid'), head = q.get('end_commit_oid');
  const range = /\/diffs\/([0-9a-f]{40})\.\.([0-9a-f]{40})/.exec(document.querySelector('deferred-diff-lines')?.getAttribute('data-url') ?? '');
  if ((!base || !head) && range) [base, head] = [range[1], range[2]];
  const blocks = [...document.querySelectorAll<HTMLElement>('.file[data-tagsearch-path]')];
  if (!base || !head || !blocks.length) return undefined;
  const summaries = blocks.map((b): Summary => {
    const info = b.querySelector('.file-info')?.textContent ?? '';
    const n = (re: RegExp) => Number(re.exec(info)?.[1] ?? 0);
    return {
      path: b.dataset.tagsearchPath!,
      pathDigest: b.id.replace(/^diff-/, ''),
      changeType: b.dataset.fileDeleted === 'true' ? 'REMOVED' : 'MODIFIED',
      linesAdded: n(/(\d+) additions?/),
      linesDeleted: n(/(\d+) deletions?/),
    };
  });
  return { baseOid: base, headOid: head, summaries, oldPaths: new Map() };
}

async function pull(): Promise<PullData> {
  const m = PULL.exec(location.pathname)!;
  const key = `${m[1]}/${m[2]}#${m[3]}`;
  if (isClassic()) {
    const data = classic();
    if (!data) throw new Error('could not read the classic Files changed page');
    cache = { key, data };
    return data;
  }
  if (cache?.key === key) return cache.data;
  // After in-app navigation the embedded data can belong to another page, so check the file
  // blocks on screen match it, and otherwise read the files page fresh.
  let data = embedded(document);
  const firstBlock = document.querySelector('[id^="diff-"][role="region"]');
  if (!data || (firstBlock && !data.summaries.some((s) => `diff-${s.pathDigest}` === firstBlock.id))) {
    const html = await text(`/${m[1]}/${m[2]}/pull/${m[3]}/files`);
    data = html ? embedded(new DOMParser().parseFromString(html, 'text/html')) : undefined;
  }
  if (!data) throw new Error('could not read the pull request data on this page');
  cache = { key, data };
  return data;
}

export const github: Site = {
  name: 'GitHub',

  review() {
    const m = location.hostname === 'github.com' && PULL.exec(location.pathname);
    return m ? `github:${m[1]}/${m[2]}#${m[3]}` : undefined;
  },

  async files() {
    const data = await pull();
    digests.clear();
    return data.summaries.map((s): SiteFile => {
      digests.set(s.path, s.pathDigest);
      return {
        path: s.path,
        oldPath: data.oldPaths.get(s.path) ?? s.path,
        status: s.changeType === 'ADDED' ? 'added' : s.changeType === 'REMOVED' ? 'removed' : 'modified',
        generated: !!s.isVendored,
        added: s.linesAdded,
        removed: s.linesDeleted,
      };
    });
  },

  element(file) {
    const digest = digests.get(file.path);
    return digest ? document.getElementById(`diff-${digest}`) : null;
  },

  body(block) {
    if (block.matches('.file')) return block.querySelector<HTMLElement>('.js-file-content');
    return (block.querySelector('[data-diff-header-wrapper]')?.nextElementSibling as HTMLElement | null) ?? null;
  },

  list() {
    if (isClassic()) return document.getElementById('files');
    const list = document.querySelector<HTMLElement>('[data-testid="progressive-diffs-list"]');
    return list ?? (document.querySelector('[id^="diff-"][role="region"]')?.parentElement?.parentElement as HTMLElement | null) ?? null;
  },

  tree: () => (isClassic() ? document.querySelector<HTMLElement>('file-tree') : document.getElementById('pr-file-tree')),

  async content(file, side) {
    const data = await pull();
    const [, owner, repo] = PULL.exec(location.pathname)!;
    if (side === 'old' && file.status === 'added') return null;
    if (side === 'new' && file.status === 'removed') return null;
    const [oid, path] = side === 'old' ? [data.baseOid, file.oldPath] : [data.headOid, file.path];
    return text(`/${owner}/${repo}/raw/${oid}/${path.split('/').map(encodeURIComponent).join('/')}`);
  },

  revision() {
    return cache && `${cache.data.baseOid}..${cache.data.headOid}`;
  },

  links(file) {
    const [, owner, repo] = PULL.exec(location.pathname)!;
    const head = cache?.data.headOid ?? 'HEAD';
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';
    return {
      link: `${location.origin}/${owner}/${repo}/blob/${head}/${dir}`,
      image: `${location.origin}/${owner}/${repo}/raw/${head}/${dir}`,
    };
  },
};
