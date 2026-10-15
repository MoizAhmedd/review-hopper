// Prisma schema: models and enums added, removed or changed between two versions.

import { type Card, type Item, type Pill, count, pill } from '../card.ts';

type Block = { kind: string; name: string; fields: Map<string, string> };

export function prismaBlocks(text: string): Map<string, Block> {
  const out = new Map<string, Block>();
  for (const m of text.matchAll(/^(model|enum|view|type)\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields = new Map<string, string>();
    for (const raw of m[3].split('\n')) {
      const line = raw.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const [name, ...rest] = line.split(/\s+/);
      fields.set(name, rest.join(' '));
    }
    out.set(m[2], { kind: m[1], name: m[2], fields });
  }
  return out;
}

export function prismaCard(oldText: string | null, newText: string): Card {
  const a = oldText ? prismaBlocks(oldText) : new Map<string, Block>();
  const b = prismaBlocks(newText);
  const tables: { name: string; note?: string; columns: Item[] }[] = [];
  let fieldsAdded = 0, removed = 0;
  for (const [name, block] of b) {
    const was = a.get(name);
    if (!was) {
      tables.push({ name, note: `new ${block.kind}`, columns: [...block.fields].map(([f, d]) => ({ sign: '+' as const, name: f, detail: d })) });
      continue;
    }
    const columns: Item[] = [];
    for (const [f, d] of block.fields) {
      const old = was.fields.get(f);
      if (old === undefined) {
        fieldsAdded++;
        columns.push({ sign: '+', name: f, detail: d });
      } else if (old !== d) columns.push({ sign: '↑', name: f, detail: `${old} → ${d}` });
    }
    for (const [f, d] of was.fields)
      if (!block.fields.has(f)) {
        removed++;
        columns.push({ sign: '−', name: f, detail: d, tone: 'bad' });
      }
    if (columns.length) tables.push({ name, columns });
  }
  for (const [name, block] of a)
    if (!b.has(name)) {
      removed++;
      tables.push({ name, note: `${block.kind} removed`, columns: [] });
    }
  const created = tables.filter((t) => t.note?.startsWith('new')).length;
  const pills: Pill[] = [];
  if (created) pills.push(pill(`${count(created, 'model')} added`, 'ok'));
  if (fieldsAdded) pills.push(pill(`${count(fieldsAdded, 'field')} added`, 'ok'));
  if (removed) pills.push(pill(`${removed} removed`, 'bad'));
  if (!tables.length) pills.push(pill('formatting only', 'muted'));
  return {
    title: 'Database schema',
    pills,
    sections: tables.length ? [{ type: 'tables', tables }] : [],
    checks: removed ? [pill(`✕ ${count(removed, 'removal')}`, 'bad')] : [],
  };
}
