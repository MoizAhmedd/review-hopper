// OpenAPI specs: endpoints and schemas added, removed or changed.

import { parse } from 'yaml';
import { type Card, type Item, type Pill, count, pill } from '../card.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** An operation's source text, for comparing, and its parsed form, read only when needed. */
interface Op {
  raw: string;
  value(): Obj;
}

interface Spec {
  ops: Map<string, Op>;
  schemas: Map<string, string>;
}

function fromObject(spec: Obj): Spec {
  const ops = new Map<string, Op>();
  for (const [route, item] of Object.entries(obj(spec.paths)))
    for (const method of METHODS) {
      const op = obj(item)[method];
      if (op) ops.set(`${method.toUpperCase()} ${route}`, { raw: JSON.stringify(op), value: () => obj(op) });
    }
  const schemas = new Map(Object.entries(obj(obj(spec.components).schemas)).map(([k, v]) => [k, JSON.stringify(v)]));
  return { ops, schemas };
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const unquote = (key: string) => key.replace(/^(['"])(.*)\1$/, '$2');

/**
 * Children of a top-level YAML key, as name → source lines, read by indentation. Big generated
 * specs (GitLab's is 4 MB) take seconds to parse whole; this takes milliseconds.
 */
function children(lines: string[], start: number, depth: number): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let current: string[] | undefined;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) {
      current?.push(line);
      continue;
    }
    const indent = indentOf(line);
    if (indent < depth) break;
    if (indent === depth) {
      const key = /^\s*('[^']*'|"[^"]*"|[^:#]+):/.exec(line)?.[1];
      if (!key) break;
      current = [];
      out.set(unquote(key.trim()), current);
    } else current?.push(line);
  }
  return out;
}

function fromYaml(text: string): Spec | undefined {
  const lines = text.split('\n');
  const top = (key: string) => lines.findIndex((l) => l.startsWith(`${key}:`));
  const paths = top('paths');
  if (paths < 0) return undefined;
  const unit = indentOf(lines.slice(paths + 1).find((l) => l.trim()) ?? '  ') || 2;
  const ops = new Map<string, Op>();
  for (const [route, body] of children(lines, paths + 1, unit))
    for (const [method, opLines] of children(body, 0, unit * 2)) {
      if (!METHODS.includes(method)) continue;
      const raw = opLines.join('\n');
      ops.set(`${method.toUpperCase()} ${route}`, { raw, value: () => obj(parse(opLines.map((l) => l.slice(unit * 3)).join('\n'))) });
    }
  const schemas = new Map<string, string>();
  const components = top('components');
  if (components >= 0) {
    const schemaBlock = children(lines, components + 1, unit).get('schemas');
    if (schemaBlock) for (const [name, body] of children(schemaBlock, 0, unit * 2)) schemas.set(name, body.join('\n'));
  }
  return { ops, schemas };
}

function read(path: string, text: string | null): Spec {
  if (!text) return { ops: new Map(), schemas: new Map() };
  if (path.endsWith('.json')) return fromObject(obj(JSON.parse(text)));
  return fromYaml(text) ?? fromObject(obj(parse(text)));
}

/** Which parts of an operation changed, in words. */
function opChanges(a: Obj, b: Obj): string {
  const parts: string[] = [];
  if (JSON.stringify(a.parameters) !== JSON.stringify(b.parameters)) parts.push('parameters');
  if (JSON.stringify(a.requestBody) !== JSON.stringify(b.requestBody)) parts.push('request body');
  const ra = obj(a.responses), rb = obj(b.responses);
  const newCodes = Object.keys(rb).filter((c) => !(c in ra));
  const goneCodes = Object.keys(ra).filter((c) => !(c in rb));
  if (newCodes.length) parts.push(`+${newCodes.join(', ')}`);
  if (goneCodes.length) parts.push(`−${goneCodes.join(', ')}`);
  if (!newCodes.length && !goneCodes.length && JSON.stringify(ra) !== JSON.stringify(rb)) parts.push('responses');
  if (JSON.stringify(a.security) !== JSON.stringify(b.security)) parts.push('auth');
  return parts.join(', ') || 'description';
}

const label = (op: Op) => {
  const v = op.value();
  return String(v.summary ?? v.operationId ?? '') || undefined;
};

export function openapiCard(path: string, oldText: string | null, newText: string): Card {
  const a = read(path, oldText), b = read(path, newText);
  const endpoints: Item[] = [];
  let added = 0, changed = 0, removed = 0;
  for (const [key, op] of b.ops) {
    const was = a.ops.get(key);
    if (!was) {
      added++;
      endpoints.push({ sign: '+', name: key, detail: label(op) });
    } else if (was.raw !== op.raw) {
      changed++;
      endpoints.push({ sign: '↑', name: key, detail: opChanges(was.value(), op.value()) });
    }
  }
  for (const [key, op] of a.ops)
    if (!b.ops.has(key)) {
      removed++;
      endpoints.push({ sign: '−', name: key, detail: label(op), tone: 'bad' });
    }
  const schemas: Item[] = [];
  for (const [name, raw] of b.schemas) {
    if (!a.schemas.has(name)) schemas.push({ sign: '+', name });
    else if (a.schemas.get(name) !== raw) schemas.push({ sign: '↑', name });
  }
  for (const name of a.schemas.keys()) if (!b.schemas.has(name)) schemas.push({ sign: '−', name, tone: 'warn' });

  const pills: Pill[] = [];
  if (added) pills.push(pill(`${count(added, 'endpoint')} added`, 'ok'));
  if (changed) pills.push(pill(`${changed} changed`, 'muted'));
  if (removed) pills.push(pill(`${removed} removed`, 'bad'));
  if (schemas.length) pills.push(pill(count(schemas.length, 'schema'), 'muted'));
  if (!endpoints.length && !schemas.length) pills.push(pill('descriptions only', 'muted'));
  const sections: Card['sections'] = [];
  if (endpoints.length) sections.push({ type: 'list', items: endpoints });
  if (schemas.length) sections.push({ type: 'list', title: 'Schemas', items: schemas });
  return {
    title: 'API',
    pills,
    sections,
    checks: oldText ? [removed ? pill(`✕ ${count(removed, 'endpoint')} removed`, 'bad') : pill('✓ no endpoints removed', 'ok')] : [],
  };
}
