// Sorts a changed file into a review group from its path alone.

export type Kind =
  | 'docs'
  | 'code'
  | 'deps'
  | 'database'
  | 'docker'
  | 'ci'
  | 'openapi'
  | 'images'
  | 'tests'
  | 'config'
  | 'lockfile'
  | 'generated';

/** Kinds that get a summary card instead of the raw diff. */
export const CARD_KINDS: ReadonlySet<Kind> = new Set(['deps', 'database', 'docker', 'ci', 'openapi']);

/** Kinds kept out of sight unless the reviewer asks for them. */
export const HIDDEN_KINDS: ReadonlySet<Kind> = new Set(['tests', 'config', 'lockfile', 'generated']);

export interface ChangedFile {
  path: string;
  /** The site marks it generated (GitLab's gitlab-generated, GitHub's linguist-generated or vendored). */
  generated?: boolean;
  added?: number;
  removed?: number;
}

/** A data file this big was written by a tool, whether or not the repo says so. */
const BIG_DATA = 1000;
const DATA = /\.(json|jsonl|csv|tsv|ya?ml|xml|lock)$/i;

const TESTS = [
  /(^|\/)(spec|specs|test|tests|__tests__|e2e|testdata|fixtures|__snapshots__)\//,
  /[._-](spec|test)\.[cm]?[jt]sx?$/,
  /_spec\.rb$/,
  /_test\.(go|py|rb|exs?)$/,
  /(^|\/)test_[^/]+\.py$/,
  /(Test|Tests|Spec)\.(java|kt|cs|swift)$/,
];
const LOCKFILES = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Gemfile\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|go\.sum|composer\.lock|Podfile\.lock|mix\.lock)$/;
const CI = [/^\.gitlab-ci\.ya?ml$/, /^\.gitlab\/ci\/.+\.ya?ml$/, /^\.github\/workflows\/.+\.ya?ml$/];
const DATABASE = [/(^|\/)migrations?\/.+\.sql$/, /(^|\/)db\/migrate\/.+\.rb$/, /(^|\/)schema\.prisma$/, /\.prisma$/];
const DOCKER = /(^|\/)(Dockerfile|Containerfile)(\.[\w.-]+)?$|\.dockerfile$/i;
const OPENAPI = /(^|\/)[^/]*(openapi|swagger)[^/]*\.(json|ya?ml)$/i;
const GENERATED = [/\.snap$/, /\.min\.(js|css)$/, /(^|\/)(dist|build|vendor|generated|__generated__)\//, /\.generated\.\w+$/, /\.pb\.go$/, /_pb2\.py$/];
const CONFIG = [
  /(^|\/)tsconfig[^/]*\.json$/,
  /(^|\/)jsconfig[^/]*\.json$/,
  /(^|\/)\.?(eslint|prettier|stylelint|babel|lint-staged|commitlint|swc|nycrc|mocharc)[^/]*$/,
  /(^|\/)(jest|vitest|vite|webpack|rollup|tailwind|postcss|nest-cli|turbo|nx|biome)[^/]*\.(c?[jt]s|mjs|json|ya?ml)$/,
  /(^|\/)(\.editorconfig|\.nvmrc|\.node-version|\.tool-versions|\.npmrc|\.gitignore|\.gitattributes|\.dockerignore|\.prettierignore|\.eslintignore)$/,
  /(^|\/)[^/]+\.config\.(c?[jt]s|mjs)$/,
];
const DOCS = /\.(md|mdx|markdown)$/i;
const IMAGES = /\.(png|jpe?g|gif|webp|svg|ico|avif)$/i;

export function classify(file: ChangedFile): Kind {
  const p = file.path;
  // Cards come before tests so a migration or Dockerfile inside a test folder still shows.
  if (OPENAPI.test(p)) return 'openapi';
  if (CI.some((r) => r.test(p))) return 'ci';
  if (/(^|\/)package\.json$/.test(p)) return 'deps';
  if (DATABASE.some((r) => r.test(p))) return 'database';
  if (DOCKER.test(p)) return 'docker';
  if (LOCKFILES.test(p)) return 'lockfile';
  if (TESTS.some((r) => r.test(p))) return 'tests';
  if (file.generated || GENERATED.some((r) => r.test(p))) return 'generated';
  if (DATA.test(p) && (file.added ?? 0) + (file.removed ?? 0) > BIG_DATA) return 'generated';
  if (CONFIG.some((r) => r.test(p))) return 'config';
  if (DOCS.test(p)) return 'docs';
  if (IMAGES.test(p)) return 'images';
  return 'code';
}

export interface Plan<F extends ChangedFile> {
  kinds: Map<F, Kind>;
  /** Files to hide. Empty when hiding would leave nothing to look at. */
  hidden: F[];
}

/**
 * Decides what to hide. A lockfile only hides when a package.json changed too, since
 * the dependency card then summarises it. Nothing hides if nothing would be left.
 */
export function plan<F extends ChangedFile>(files: F[], hide: ReadonlySet<Kind> = HIDDEN_KINDS): Plan<F> {
  const kinds = new Map(files.map((f) => [f, classify(f)] as const));
  const hasDeps = [...kinds.values()].includes('deps');
  const hidden = files.filter((f) => {
    const kind = kinds.get(f)!;
    if (kind === 'lockfile') return hasDeps && hide.has('lockfile');
    return hide.has(kind);
  });
  return { kinds, hidden: hidden.length === files.length ? [] : hidden };
}
