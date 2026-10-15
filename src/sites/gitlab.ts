// GitLab merge requests, on the Rapid Diffs Changes page (the default on gitlab.com).
// Each file is a <diff-file> element whose data-file-data JSON carries its paths and commits.

import { type Site, type SiteFile, text } from './site.ts';

interface FileData {
  old_path: string;
  new_path: string;
  blob_raw_path?: string;
  diff_refs?: { base_sha: string; start_sha: string; head_sha: string };
}

const MR = /^\/(.+?)\/-\/merge_requests\/(\d+)/;
const data = (el: Element): FileData => JSON.parse((el as HTMLElement).dataset.fileData ?? '{}');
const blocks = () => [...document.querySelectorAll<HTMLElement>('diff-file')];
const byPath = new Map<string, HTMLElement>();

function stats(el: Element): { added: number; removed: number } {
  const text = el.querySelector('.rd-diff-file-stats')?.textContent ?? '';
  const n = (re: RegExp) => Number(re.exec(text)?.[1] ?? 0);
  return { added: n(/\+(\d+)/), removed: n(/[−-](\d+)/) };
}

function refs() {
  const first = blocks()[0];
  return first ? data(first).diff_refs : undefined;
}

// New and deleted files show up as a missing old or new version when their content is read.
function toFile(el: HTMLElement): SiteFile {
  const d = data(el);
  return { path: d.new_path, oldPath: d.old_path, status: 'modified', generated: false, ...stats(el) };
}

export const gitlab: Site = {
  name: 'GitLab',

  review() {
    if (location.hostname !== 'gitlab.com' || !document.querySelector('.rd-app')) return undefined;
    const m = MR.exec(location.pathname);
    return m ? `gitlab:${m[1]}!${m[2]}` : undefined;
  },

  async files() {
    byPath.clear();
    return blocks().map((el) => {
      const file = toFile(el);
      byPath.set(file.path, el);
      return file;
    });
  },

  element(file) {
    const el = byPath.get(file.path);
    if (el?.isConnected) return el;
    const found = blocks().find((b) => data(b).new_path === file.path) ?? null;
    if (found) byPath.set(file.path, found);
    return found;
  },

  parts(block) {
    const header = block.querySelector<HTMLElement>('.rd-diff-file-header');
    const body = block.querySelector<HTMLElement>('.rd-diff-file-body');
    return header && body ? { header, body } : null;
  },

  list: () => document.querySelector<HTMLElement>('.rd-app-diffs-list'),
  tree: () => document.querySelector<HTMLElement>('.rd-app-sidebar'),

  async content(file, side) {
    const r = refs();
    const project = MR.exec(location.pathname)![1];
    if (side === 'old') {
      if (!r) return null;
      return text(`/${project}/-/raw/${r.base_sha}/${encodePath(file.oldPath)}`);
    }
    const el = this.element(file);
    const raw = el && data(el).blob_raw_path;
    return text(raw ?? `/${project}/-/raw/${r!.head_sha}/${encodePath(file.path)}`);
  },

  revision() {
    const r = refs();
    return r && `${r.base_sha}..${r.head_sha}`;
  },

  links(file) {
    const project = MR.exec(location.pathname)![1];
    const sha = refs()?.head_sha ?? 'HEAD';
    const dir = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/') + 1) : '';
    return {
      link: `${location.origin}/${project}/-/blob/${sha}/${encodePath(dir)}`,
      image: `${location.origin}/${project}/-/raw/${sha}/${encodePath(dir)}`,
    };
  },

  async comment(file, line, body) {
    const [, project, iid] = MR.exec(location.pathname)!;
    const r = refs();
    if (!r) throw new Error('no diff refs on the page');
    const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
    const res = await fetch(`/api/v4/projects/${encodeURIComponent(project)}/merge_requests/${iid}/discussions`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        body,
        position: { position_type: 'text', ...r, old_path: file.oldPath, new_path: file.path, new_line: line },
      }),
    });
    if (!res.ok) throw new Error(`GitLab said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  },
};

const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/');
