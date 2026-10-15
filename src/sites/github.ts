// GitHub pull requests, on the Files changed page for signed-in users. Each file block's id is
// "diff-" + sha256(path), and the page's embedded data lists every file and the two commits.
// GitHub's CSS class names are hashed per build, so nothing here selects on them.

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

async function pull(): Promise<PullData> {
  const m = PULL.exec(location.pathname)!;
  const key = `${m[1]}/${m[2]}#${m[3]}`;
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

  parts(block) {
    const header = block.querySelector<HTMLElement>('[data-diff-header-wrapper]');
    const body = header?.nextElementSibling as HTMLElement | null;
    return header && body ? { header, body } : null;
  },

  list() {
    const list = document.querySelector<HTMLElement>('[data-testid="progressive-diffs-list"]');
    return list ?? (document.querySelector('[id^="diff-"][role="region"]')?.parentElement?.parentElement as HTMLElement | null) ?? null;
  },

  tree: () => document.getElementById('pr-file-tree'),

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
