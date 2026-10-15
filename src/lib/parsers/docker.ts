// Dockerfile: the build stages and the facts about the image that ships.

import { type Card, type Pill, pill } from '../card.ts';

interface Instruction {
  op: string;
  args: string;
}

interface Stage {
  name: string;
  from: string;
  steps: Instruction[];
}

export interface Image {
  stages: Stage[];
  /** Facts about the final stage, the image that ships. */
  base: string;
  user: string;
  entrypoint: string;
  cmd: string;
  env: string[];
  expose: string[];
  secretEnv: string[];
  unpinned: string[];
}

export function instructions(text: string): Instruction[] {
  const out: Instruction[] = [];
  const lines = text.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(\w+)\s+([\s\S]*)$/.exec(line);
    if (m) out.push({ op: m[1].toUpperCase(), args: m[2].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

const SECRET = /(SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|ACCESS_KEY)/i;

/** "KEY=value KEY2=value2" or the legacy "KEY value" form. */
function envPairs(args: string): [string, string][] {
  if (!args.includes('=')) {
    const [k, ...v] = args.split(' ');
    return [[k, v.join(' ')]];
  }
  return [...args.matchAll(/([\w.-]+)=("[^"]*"|'[^']*'|\S*)/g)].map((m) => [m[1], m[2]]);
}

export function readImage(text: string): Image {
  const args = new Map<string, string>();
  const stages: Stage[] = [];
  for (const ins of instructions(text)) {
    if (ins.op === 'ARG' && !stages.length) {
      const [k, v] = ins.args.split('=');
      if (v !== undefined) args.set(k, v.replace(/^["']|["']$/g, ''));
      continue;
    }
    if (ins.op === 'FROM') {
      const m = /^(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(ins.args)!;
      const from = m[1].replace(/\$\{?(\w+)\}?/g, (_, k) => args.get(k) ?? `$${k}`);
      stages.push({ name: m[2] ?? `stage ${stages.length + 1}`, from, steps: [] });
      continue;
    }
    stages.at(-1)?.steps.push(ins);
  }
  const last = stages.at(-1) ?? { name: '', from: '', steps: [] };
  const final = (op: string) => last.steps.filter((s) => s.op === op).at(-1)?.args ?? '';
  const env = last.steps.filter((s) => s.op === 'ENV').flatMap((s) => envPairs(s.args));
  const names = new Set(stages.map((s) => s.name));
  return {
    stages,
    base: last.from,
    user: final('USER'),
    entrypoint: final('ENTRYPOINT'),
    cmd: final('CMD'),
    env: env.map(([k, v]) => (v && !SECRET.test(k) ? `${k}=${v}` : k)),
    expose: last.steps.filter((s) => s.op === 'EXPOSE').flatMap((s) => s.args.split(' ')),
    secretEnv: env.filter(([k, v]) => SECRET.test(k) && v && !/^\$/.test(v)).map(([k]) => k),
    unpinned: [...new Set(stages.map((s) => s.from))].filter((f) => !names.has(f) && f !== 'scratch' && !f.includes('@sha256:')),
  };
}

/** What a stage does, from its last RUN, or what it copies when it has none. */
function stageDetail(stage: Stage): string {
  const run = stage.steps.filter((s) => s.op === 'RUN').at(-1)?.args;
  const text = run ?? stage.steps.filter((s) => s.op === 'COPY' || s.op === 'ADD').map((s) => s.args).at(-1) ?? `${stage.steps.length} steps`;
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

const short = (image: string) => image.replace(/@sha256:([0-9a-f]{8})[0-9a-f]+/, '@sha256:$1…');

export function dockerCard(oldText: string | null, newText: string): Card {
  const img = readImage(newText);
  const was = oldText ? readImage(oldText) : undefined;
  const changed = (a?: string, b?: string) => (was && a !== b ? a || '(none)' : undefined);
  const rows = [
    { key: 'Base image', value: short(img.base), mono: true, was: changed(was?.base && short(was.base), short(img.base)) },
    { key: 'Runs as', value: img.user || 'root (no USER set)', mono: true, was: changed(was?.user, img.user) },
    { key: 'Entrypoint', value: img.entrypoint || '—', mono: true, was: changed(was?.entrypoint, img.entrypoint) },
  ];
  if (img.cmd || was?.cmd) rows.push({ key: 'Command', value: img.cmd || '—', mono: true, was: changed(was?.cmd, img.cmd) });
  if (img.env.length || was?.env.length) rows.push({ key: 'Environment', value: img.env.join(' · ') || '—', mono: true, was: changed(was?.env.join(' · '), img.env.join(' · ')) });
  if (img.expose.length || was?.expose.length) rows.push({ key: 'Ports', value: img.expose.join(', ') || '—', mono: true, was: changed(was?.expose.join(', '), img.expose.join(', ')) });

  const root = !img.user || /^(root|0)(:|$)/.test(img.user);
  const execForm = (s: string) => !s || s.startsWith('[');
  const checks: Pill[] = [
    img.unpinned.length ? pill(`! not pinned: ${img.unpinned.map(short).join(', ')}`, 'warn') : pill('✓ base pinned by digest', 'ok'),
    root ? pill('✕ runs as root', 'bad') : pill('✓ non-root', 'ok'),
    execForm(img.entrypoint) && execForm(img.cmd) ? pill('✓ exec-form entrypoint', 'ok') : pill('! shell-form entrypoint (no SIGTERM)', 'warn'),
    img.secretEnv.length ? pill(`✕ secret in ENV: ${img.secretEnv.join(', ')}`, 'bad') : pill('✓ no secrets in ENV', 'ok'),
  ];
  const pills: Pill[] = [pill(`${img.stages.length} stage${img.stages.length === 1 ? '' : 's'}`, 'muted')];
  const changes = rows.filter((r) => r.was !== undefined).length;
  if (was) pills.push(changes ? pill(`${changes} changed`, 'warn') : pill('build steps only', 'muted'));
  return {
    title: 'Docker image',
    pills,
    sections: [
      { type: 'flow', steps: img.stages.map((s, i) => ({ name: s.name, detail: stageDetail(s), highlight: i === img.stages.length - 1 })) },
      { type: 'rows', rows },
    ],
    checks,
  };
}
