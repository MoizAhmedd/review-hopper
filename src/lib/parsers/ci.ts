// CI config: jobs added, removed and changed, for GitLab CI and GitHub Actions.

import { parse } from 'yaml';
import { type Card, type Item, type Pill, count, pill } from '../card.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

const GITLAB_RESERVED = new Set(['stages', 'variables', 'default', 'include', 'workflow', 'image', 'services', 'before_script', 'after_script', 'cache', 'spec', 'pages:deploy']);

function jobs(path: string, text: string | null): Map<string, Obj> {
  if (!text) return new Map();
  const doc = obj(parse(text));
  if (path.startsWith('.github/')) return new Map(Object.entries(obj(doc.jobs)).map(([k, v]) => [k, obj(v)]));
  return new Map(Object.entries(doc).filter(([k]) => !GITLAB_RESERVED.has(k)).map(([k, v]) => [k, obj(v)]));
}

/** One line on when and how a job runs. */
function describe(job: Obj, github: boolean): string {
  const bits: string[] = [];
  if (github) {
    if (job['runs-on']) bits.push(String(job['runs-on']));
    const steps = Array.isArray(job.steps) ? (job.steps as Obj[]) : [];
    const uses = steps.map((s) => s.uses).filter(Boolean).map((u) => String(u).split('@')[0].split('/').pop());
    if (steps.length) bits.push(`${count(steps.length, 'step')}${uses.length ? ` (${uses.slice(0, 3).join(', ')})` : ''}`);
    if (job.needs) bits.push(`after ${[job.needs].flat().join(', ')}`);
    return bits.join(' · ');
  }
  if (job.stage) bits.push(`stage ${job.stage}`);
  if (job.extends) bits.push(`extends ${[job.extends].flat().join(', ')}`);
  const rules = Array.isArray(job.rules) ? (job.rules as Obj[]) : [];
  const ifs = rules.map((r) => r.if).filter(Boolean).map(String);
  if (ifs.some((i) => /MERGE_REQUEST|merge_request_event/.test(i))) bits.push('merge requests');
  if (ifs.some((i) => /DEFAULT_BRANCH|== "main"|== 'main'/.test(i))) bits.push('main');
  if (ifs.some((i) => /SCHEDULE/.test(i))) bits.push('scheduled');
  if (job.only) bits.push(`only ${[job.only].flat().join(', ')}`);
  if (job.when === 'manual' || rules.some((r) => r.when === 'manual')) bits.push('manual');
  if (job.needs) bits.push(`after ${[job.needs].flat().map((n) => (typeof n === 'string' ? n : String(obj(n).job))).join(', ')}`);
  return bits.join(' · ');
}

/** A variable's value as one short string; GitLab allows { value, description } objects. */
const varValue = (v: unknown) => (v && typeof v === 'object' ? String(obj(v).value ?? JSON.stringify(v)) : String(v));

function variableChanges(a: Obj, b: Obj): Item[] {
  const items: Item[] = [];
  for (const [k, v] of Object.entries(b)) {
    if (!(k in a)) items.push({ sign: '+', name: k, detail: varValue(v) });
    else if (varValue(a[k]) !== varValue(v)) items.push({ sign: '↑', name: k, detail: `${varValue(a[k])} → ${varValue(v)}` });
  }
  for (const k of Object.keys(a)) if (!(k in b)) items.push({ sign: '−', name: k, detail: varValue(a[k]) });
  return items;
}

export function ciCard(path: string, oldText: string | null, newText: string): Card {
  const github = path.startsWith('.github/');
  const a = jobs(path, oldText), b = jobs(path, newText);
  const items: Item[] = [];
  let added = 0, removed = 0, changed = 0;
  for (const [name, job] of b) {
    const was = a.get(name);
    if (!was) {
      added++;
      items.push({ sign: '+', name, detail: describe(job, github) });
    } else if (JSON.stringify(was) !== JSON.stringify(job)) {
      changed++;
      const keys = [...new Set([...Object.keys(was), ...Object.keys(job)])].filter((k) => JSON.stringify(was[k]) !== JSON.stringify(job[k]));
      items.push({ sign: '↑', name, detail: `${keys.join(', ')} changed` });
    }
  }
  for (const [name, job] of a)
    if (!b.has(name)) {
      removed++;
      items.push({ sign: '−', name, detail: describe(job, github), tone: 'warn' });
    }
  const pills: Pill[] = [];
  if (added) pills.push(pill(`${count(added, 'job')} added`, 'ok'));
  if (changed) pills.push(pill(`${changed} changed`, 'muted'));
  pills.push(removed ? pill(`${removed} removed`, 'warn') : pill('nothing removed', 'muted'));
  const sections: Card['sections'] = [];
  if (items.length) sections.push({ type: 'list', items });
  const before = obj(parse(oldText ?? '{}')), after = obj(parse(newText));
  // Pipeline-wide variables: GitHub's top-level env, GitLab's variables.
  const varKey = github ? 'env' : 'variables';
  const vars = variableChanges(obj(before[varKey]), obj(after[varKey]));
  if (vars.length && oldText !== null) sections.push({ type: 'list', title: 'Variables', items: vars });
  if (github) {
    // YAML 1.2 reads `on:` as a plain key.
    const triggers = after.on;
    if (oldText === null || JSON.stringify(before.on) !== JSON.stringify(triggers)) {
      const value = typeof triggers === 'string' ? triggers : Array.isArray(triggers) ? triggers.join(', ') : Object.keys(obj(triggers)).join(', ');
      sections.push({ type: 'rows', rows: [{ key: 'Triggers', value }] });
    }
  }
  if (oldText !== null) {
    const keys = (github ? ['permissions', 'concurrency', 'defaults'] : ['stages', 'include', 'workflow', 'default']).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    if (keys.length) sections.push({ type: 'rows', rows: [{ key: 'Also changed', value: keys.join(', '), mono: true }] });
  }
  if (!items.length && !sections.length) pills.unshift(pill('formatting only', 'muted'));
  return { title: 'CI pipeline', pills, sections, checks: [] };
}
