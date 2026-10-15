// package.json: what changed in dependencies and scripts, plus a lockfile summary.

import { type Card, type Item, count, pill } from '../card.ts';

const DEP_FIELDS = [
  ['dependencies', 'runtime'],
  ['devDependencies', 'dev'],
  ['peerDependencies', 'peer'],
  ['optionalDependencies', 'optional'],
] as const;

type Pkg = Record<string, unknown>;
const record = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' ? (v as Record<string, string>) : {};

/** The first number in a version range ("^29.7.0" → 29), or undefined for tags and URLs. */
export function major(range: string): number | undefined {
  const m = /(\d+)(?:\.\d+)?/.exec(range.replace(/^(npm:)?@?[^@\d]*@/, ''));
  return m ? Number(m[1]) : undefined;
}

export interface LockSummary {
  added: number;
  removed: number;
  changed: number;
}

export function packageCard(oldText: string | null, newText: string, lock?: LockSummary): Card {
  const before: Pkg = oldText ? JSON.parse(oldText) : {};
  const after: Pkg = JSON.parse(newText);
  const deps: Item[] = [];
  let added = 0, upgraded = 0, removed = 0, majors = 0;
  for (const [field, label] of DEP_FIELDS) {
    const a = record(before[field]), b = record(after[field]);
    for (const name of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const was = a[name], now = b[name];
      if (was === now) continue;
      if (was === undefined) {
        added++;
        deps.push({ sign: '+', name, detail: `${now} · ${label}` });
      } else if (now === undefined) {
        removed++;
        deps.push({ sign: '−', name, detail: `${was} · ${label}` });
      } else {
        upgraded++;
        const isMajor = (major(now) ?? 0) > (major(was) ?? Infinity);
        if (isMajor) majors++;
        deps.push({ sign: '↑', name, detail: `${was} → ${now} · ${label}${isMajor ? ' · major' : ''}`, tone: isMajor ? 'warn' : undefined });
      }
    }
  }
  const scripts: Item[] = [];
  const sa = record(before.scripts), sb = record(after.scripts);
  for (const name of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    if (sa[name] === sb[name]) continue;
    scripts.push({ sign: sa[name] === undefined ? '+' : sb[name] === undefined ? '−' : '↑', name, detail: sb[name] ?? sa[name] });
  }
  const skip = new Set(['scripts', ...DEP_FIELDS.map(([f]) => f)]);
  const other = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !skip.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );

  const pills = [];
  if (added) pills.push(pill(`${added} added`, 'ok'));
  if (upgraded) pills.push(pill(`${upgraded} upgraded`, 'muted'));
  if (majors) pills.push(pill(count(majors, 'major upgrade'), 'warn'));
  if (removed) pills.push(pill(`${removed} removed`, 'muted'));
  if (!deps.length) pills.push(pill('no dependency changes', 'muted'));
  if (scripts.length) pills.push(pill(count(scripts.length, 'script'), 'muted'));

  const sections: Card['sections'] = [];
  if (deps.length) sections.push({ type: 'list', items: deps });
  if (scripts.length) sections.push({ type: 'list', title: 'Scripts', items: scripts });
  const rows = [];
  if (other.length) rows.push({ key: 'Also changed', value: other.join(', '), mono: true });
  if (lock) rows.push({ key: 'Lockfile', value: lockText(lock) });
  if (rows.length) sections.push({ type: 'rows', rows });
  return { title: 'Dependencies', pills, sections, checks: [] };
}

const lockText = (l: LockSummary) =>
  l.added + l.removed + l.changed === 0
    ? 'no resolved versions changed'
    : `${count(l.added + l.removed + l.changed, 'package')} changed underneath (${l.added} added, ${l.changed} upgraded, ${l.removed} removed)`;

/** name → versions resolved in a lockfile. Understands npm, pnpm and yarn lockfiles. */
export function lockVersions(path: string, text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (name: string, version: string) => {
    if (!out.has(name)) out.set(name, new Set());
    out.get(name)!.add(version);
  };
  if (/package-lock\.json$|npm-shrinkwrap\.json$/.test(path)) {
    const packages = record(JSON.parse(text).packages) as unknown as Record<string, { version?: string }>;
    for (const [key, info] of Object.entries(packages)) {
      const name = key.split('node_modules/').pop();
      if (name && info?.version) add(name, info.version);
    }
  } else if (/pnpm-lock\.yaml$/.test(path)) {
    const start = text.search(/^packages:/m);
    // Keys look like `  /name@1.2.3:`, `  name@1.2.3:` or `  '@scope/name@1.2.3(peer@1)':`.
    for (const m of text.slice(start < 0 ? 0 : start).matchAll(/^ {2}'?\/?((?:@[^@/\s']+\/)?[^@\s'/]+)@([^:'(\s]+)/gm)) add(m[1], m[2]);
  } else if (/yarn\.lock$/.test(path)) {
    for (const m of text.matchAll(/^"?((?:@[^@/\s"]+\/)?[^@\s",]+)@[^\n]*\n\s+version:? "?([^"\n]+)"?/gm)) add(m[1], m[2]);
  }
  return out;
}

export function lockSummary(path: string, oldText: string | null, newText: string): LockSummary {
  const a = oldText ? lockVersions(path, oldText) : new Map<string, Set<string>>();
  const b = lockVersions(path, newText);
  let added = 0, removed = 0, changed = 0;
  for (const [name, versions] of b) {
    const was = a.get(name);
    if (!was) added++;
    else if ([...versions].sort().join() !== [...was].sort().join()) changed++;
  }
  for (const name of a.keys()) if (!b.has(name)) removed++;
  return { added, removed, changed };
}
