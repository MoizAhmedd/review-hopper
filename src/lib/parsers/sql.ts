// SQL migrations: which tables change, how, and the checks a parser can make for certain.

import { type Card, type Item, type Pill, count, pill } from '../card.ts';

interface Table {
  name: string;
  created: boolean;
  dropped: boolean;
  columns: Item[];
}

/** Splits on semicolons outside quotes, comments and dollar-quoted bodies. */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
      cur += '\n';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (c === "'") {
      const end = sql.indexOf("'", i + 1);
      cur += sql.slice(i, end < 0 ? sql.length : end + 1);
      i = end < 0 ? sql.length : end;
      continue;
    }
    if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const stop = end < 0 ? sql.length : end + tag[0].length;
        cur += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ident = String.raw`(?:"[^"]+"|[\w$]+)(?:\.(?:"[^"]+"|[\w$]+))?`;
const unquote = (s: string) => s.replace(/"/g, '').replace(/^public\./, '');

/** Splits on commas not inside parentheses. */
function splitTop(s: string): string[] {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const c of s) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** "archived_at timestamptz(6) NOT NULL DEFAULT now()" → name and a short description. */
function column(def: string): { name: string; detail: string; notNull: boolean; hasDefault: boolean } {
  const m = new RegExp(String.raw`^(${ident})\s+(.+)$`, 's').exec(def.trim())!;
  const rest = m[2].replace(/\s+/g, ' ');
  const type = rest.split(/\s+(?=NOT|NULL|DEFAULT|PRIMARY|REFERENCES|UNIQUE|CHECK|CONSTRAINT|GENERATED|COLLATE)/i)[0].replace(/\(\d+\)$/, '');
  const notNull = /\bNOT NULL\b/i.test(rest) || /\bPRIMARY KEY\b/i.test(rest);
  const hasDefault = /\bDEFAULT\b|\bGENERATED\b/i.test(rest);
  const ref = /\bREFERENCES\s+(\S+?)\s*\(/i.exec(rest)?.[1];
  const bits = [type.toLowerCase(), notNull ? 'required' : 'nullable'];
  if (hasDefault) bits.push('default');
  if (ref) bits.push(`→ ${unquote(ref)}`);
  return { name: unquote(m[1]), detail: bits.join(' · '), notNull, hasDefault };
}

export function migrationCard(sql: string): Card {
  const stmts = statements(sql);
  const tables = new Map<string, Table>();
  const table = (name: string) => {
    const key = unquote(name);
    if (!tables.has(key)) tables.set(key, { name: key, created: false, dropped: false, columns: [] });
    return tables.get(key)!;
  };
  const grants: string[] = [];
  const indexes: Item[] = [];
  const other: string[] = [];
  let drops = 0, renames = 0, unsafeNotNull = 0, blockingIndexes = 0, transaction = false;

  for (const s of stmts) {
    const flat = s.replace(/\s+/g, ' ');
    if (/^(BEGIN|START TRANSACTION|COMMIT)\b/i.test(flat)) {
      transaction = true;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = new RegExp(String.raw`^CREATE (?:UNLOGGED )?TABLE (?:IF NOT EXISTS )?(${ident}) \((.*)\)`, 'is').exec(flat))) {
      const t = table(m[1]);
      t.created = true;
      for (const def of splitTop(m[2])) {
        if (/^(CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b/i.test(def)) continue;
        const c = column(def);
        t.columns.push({ sign: '+', name: c.name, detail: c.detail });
      }
    } else if ((m = new RegExp(String.raw`^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?(${ident}) (.*)$`, 'is').exec(flat))) {
      const t = table(m[1]);
      for (const action of splitTop(m[2])) {
        let a: RegExpExecArray | null;
        if ((a = /^ADD (?:COLUMN )?(?:IF NOT EXISTS )?(?!CONSTRAINT\b)(.+)$/i.exec(action))) {
          const c = column(a[1]);
          if (c.notNull && !c.hasDefault && !t.created) unsafeNotNull++;
          t.columns.push({ sign: '+', name: c.name, detail: c.detail, tone: c.notNull && !c.hasDefault ? 'bad' : undefined });
        } else if ((a = /^DROP (?:COLUMN )?(?:IF EXISTS )?(?!CONSTRAINT\b)(\S+)/i.exec(action))) {
          drops++;
          t.columns.push({ sign: '−', name: unquote(a[1]), detail: 'dropped', tone: 'bad' });
        } else if ((a = /^RENAME (?:COLUMN )?(\S+) TO (\S+)/i.exec(action))) {
          renames++;
          t.columns.push({ sign: '~', name: unquote(a[2]), detail: `renamed from ${unquote(a[1])}`, tone: 'warn' });
        } else if ((a = /^RENAME TO (\S+)/i.exec(action))) {
          renames++;
          t.columns.push({ sign: '~', name: `table renamed to ${unquote(a[1])}`, tone: 'warn' });
        } else if ((a = /^ALTER (?:COLUMN )?(\S+) (.+)$/i.exec(action))) {
          if (/SET NOT NULL/i.test(a[2])) unsafeNotNull++;
          t.columns.push({ sign: '↑', name: unquote(a[1]), detail: a[2].toLowerCase(), tone: /SET NOT NULL/i.test(a[2]) ? 'warn' : undefined });
        } else if ((a = /^ADD CONSTRAINT (\S+) (.+)$/i.exec(action))) {
          t.columns.push({ sign: '+', name: `constraint ${unquote(a[1])}`, detail: a[2].split(' ').slice(0, 3).join(' ').toLowerCase() });
        } else if ((a = /^DROP CONSTRAINT (?:IF EXISTS )?(\S+)/i.exec(action))) {
          t.columns.push({ sign: '−', name: `constraint ${unquote(a[1])}`, detail: 'dropped' });
        } else {
          t.columns.push({ sign: '~', name: action.slice(0, 80) });
        }
      }
    } else if ((m = new RegExp(String.raw`^DROP TABLE (?:IF EXISTS )?(${ident})`, 'i').exec(flat))) {
      drops++;
      table(m[1]).dropped = true;
    } else if ((m = new RegExp(String.raw`^CREATE (UNIQUE )?INDEX (CONCURRENTLY )?(?:IF NOT EXISTS )?(${ident})? ?ON (?:ONLY )?(${ident})(?: USING \w+)? ?\((.+)\)`, 'i').exec(flat))) {
      const onNewTable = tables.get(unquote(m[4]))?.created;
      if (!m[2] && !onNewTable) blockingIndexes++;
      indexes.push({ sign: '+', name: `${m[1] ? 'unique ' : ''}index on ${unquote(m[4])} (${m[5]})`, tone: !m[2] && !onNewTable ? 'warn' : undefined });
    } else if (/^DROP INDEX\b/i.test(flat)) {
      indexes.push({ sign: '−', name: flat.replace(/^DROP INDEX (CONCURRENTLY )?(IF EXISTS )?/i, 'index ') });
    } else if (!/^GRANT\b|^DO\b|^REVOKE\b/i.test(flat)) {
      other.push(flat.split(' ').slice(0, 3).join(' '));
    }
    // Grants count wherever they appear, including inside DO blocks.
    for (const g of flat.matchAll(new RegExp(String.raw`GRANT (.+?) ON (?:TABLE )?(${ident}) TO (${ident})`, 'gi'))) {
      grants.push(`${g[1].replace(/\s*\(.*\)/, (cols) => ` (${count(cols.split(',').length, 'column')})`)} on ${unquote(g[2])} → ${g[3]}`);
    }
  }

  const all = [...tables.values()];
  const added = all.flatMap((t) => (t.created ? [] : t.columns.filter((c) => c.sign === '+' && !c.name.startsWith('constraint')))).length;
  const pills: Pill[] = [];
  const created = all.filter((t) => t.created).length;
  if (created) pills.push(pill(`${count(created, 'table')} created`, 'ok'));
  if (added) pills.push(pill(`${count(added, 'column')} added`, 'ok'));
  if (drops) pills.push(pill(`${drops} dropped`, 'bad'));
  if (indexes.length) pills.push(pill(count(indexes.length, 'index', 'indexes'), 'muted'));
  if (grants.length) pills.push(pill(count(grants.length, 'grant'), 'muted'));

  const sections: Card['sections'] = [];
  if (all.length)
    sections.push({
      type: 'tables',
      tables: all.map((t) => ({ name: t.name, note: t.created ? 'new table' : t.dropped ? 'dropped' : undefined, columns: t.columns })),
    });
  if (indexes.length) sections.push({ type: 'list', title: 'Indexes', items: indexes });
  const rows = grants.map((g) => ({ key: 'Grant', value: g, mono: true }));
  if (other.length) rows.push({ key: 'Also runs', value: other.join(' · '), mono: true });
  if (rows.length) sections.push({ type: 'rows', rows });

  const checks: Pill[] = [
    drops ? pill(`✕ ${count(drops, 'drop')}`, 'bad') : pill('✓ no drops', 'ok'),
    renames ? pill(`! ${count(renames, 'rename')}`, 'warn') : pill('✓ no renames', 'ok'),
    unsafeNotNull ? pill(`✕ required column without a default`, 'bad') : pill('✓ new columns safe for existing rows', 'ok'),
  ];
  if (blockingIndexes) checks.push(pill(`! ${count(blockingIndexes, 'index', 'indexes')} built without CONCURRENTLY`, 'warn'));
  if (transaction) checks.push(pill('✓ runs in a transaction', 'ok'));
  return { title: 'Database', pills, sections, checks };
}
