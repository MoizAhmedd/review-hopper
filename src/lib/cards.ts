// Picks the parser for a file. Runs in the background worker, which holds the YAML and
// markdown libraries so the page script stays small.

import type { Card } from './card.ts';
import type { Kind } from './classify.ts';
import { ciCard } from './parsers/ci.ts';
import { lockSummary, packageCard } from './parsers/deps.ts';
import { dockerCard } from './parsers/docker.ts';
import { openapiCard } from './parsers/openapi.ts';
import { prismaCard } from './parsers/prisma.ts';
import { migrationCard } from './parsers/sql.ts';

export interface Version {
  path: string;
  old: string | null;
  new: string;
}

export function buildCard(kind: Kind, file: Version, lockfile?: Version): Card {
  switch (kind) {
    case 'deps':
      return packageCard(file.old, file.new, lockfile && lockSummary(lockfile.path, lockfile.old, lockfile.new));
    case 'database':
      if (file.path.endsWith('.prisma')) return prismaCard(file.old, file.new);
      if (file.path.endsWith('.sql')) return migrationCard(file.new);
      throw new Error('no reader for this migration format');
    case 'docker':
      return dockerCard(file.old, file.new);
    case 'ci':
      return ciCard(file.path, file.old, file.new);
    case 'openapi':
      return openapiCard(file.path, file.old, file.new);
    default:
      throw new Error(`no card for ${kind}`);
  }
}
