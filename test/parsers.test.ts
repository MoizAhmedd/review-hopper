import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Card, Section } from '../src/lib/card.ts';
import { ciCard } from '../src/lib/parsers/ci.ts';
import { lockSummary, major, packageCard } from '../src/lib/parsers/deps.ts';
import { dockerCard } from '../src/lib/parsers/docker.ts';
import { markdownDiff } from '../src/lib/parsers/markdown.ts';
import { openapiCard } from '../src/lib/parsers/openapi.ts';
import { prismaCard } from '../src/lib/parsers/prisma.ts';
import { migrationCard, statements } from '../src/lib/parsers/sql.ts';

const pills = (c: Card) => c.pills.map((p) => p.text);
const checks = (c: Card) => c.checks.map((p) => `${p.tone}:${p.text}`);
const section = <T extends Section['type']>(c: Card, type: T) => c.sections.find((s) => s.type === type) as Extract<Section, { type: T }>;

test('package.json: added, upgraded with a major flag, removed, scripts', () => {
  const before = JSON.stringify({ dependencies: { a: '^1.2.0', gone: '1.0.0' }, devDependencies: { jest: '^29.7.0' }, scripts: { test: 'jest' } });
  const after = JSON.stringify({ dependencies: { a: '^1.3.0', b: '2.0.0' }, devDependencies: { jest: '^30.2.0' }, scripts: { test: 'jest', 'test:types': 'tsc --noEmit' } });
  const card = packageCard(before, after);
  assert.deepEqual(pills(card), ['1 added', '2 upgraded', '1 major upgrade', '1 removed', '1 script']);
  const items = section(card, 'list').items.map((i) => `${i.sign} ${i.name}`);
  assert.deepEqual(items, ['↑ a', '− gone', '+ b', '↑ jest']);
  assert.equal(major('workspace:*'), undefined);
});

test('package.json with only a script change says so', () => {
  const card = packageCard('{"scripts":{}}', '{"scripts":{"build":"tsc"}}');
  assert.deepEqual(pills(card), ['no dependency changes', '1 script']);
});

test('lockfile summary counts packages that changed underneath', () => {
  const v = (deps: Record<string, string>) =>
    JSON.stringify({ packages: Object.fromEntries(Object.entries(deps).map(([n, ver]) => [`node_modules/${n}`, { version: ver }])) });
  const s = lockSummary('package-lock.json', v({ a: '1.0.0', b: '1.0.0' }), v({ a: '1.1.0', c: '1.0.0' }));
  assert.deepEqual(s, { added: 1, removed: 1, changed: 1 });
  const pnpm = (body: string) => `lockfileVersion: '9.0'\n\npackages:\n${body}`;
  assert.deepEqual(lockSummary('pnpm-lock.yaml', pnpm("  '@nestjs/core@11.0.1':\n    resolution: x\n"), pnpm("  '@nestjs/core@11.1.0':\n    resolution: x\n")), { added: 0, removed: 0, changed: 1 });
});

test('SQL: statements survive dollar-quoted bodies and comments', () => {
  const sql = "BEGIN;\n-- note; not a split\nDO $do$ BEGIN RAISE NOTICE 'a;b'; END; $do$;\nCOMMIT;";
  assert.deepEqual(statements(sql).map((s) => s.split(/\s/)[0]), ['BEGIN', 'DO', 'COMMIT']);
});

test('SQL: a nullable column added inside a transaction, with grants in a DO block', () => {
  const card = migrationCard(`BEGIN;
ALTER TABLE public.users ADD COLUMN archived_at timestamptz(6);
ALTER TABLE public.projects ADD COLUMN archived_at timestamptz(6);
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'app') THEN
    GRANT UPDATE (name, archived_at) ON public.users TO app;
  END IF;
END;
$do$;
COMMIT;`);
  assert.deepEqual(pills(card), ['2 columns added', '1 grant']);
  const tables = section(card, 'tables').tables;
  assert.deepEqual(tables.map((t) => [t.name, t.columns.map((c) => `${c.name}: ${c.detail}`)]), [
    ['users', ['archived_at: timestamptz · nullable']],
    ['projects', ['archived_at: timestamptz · nullable']],
  ]);
  assert.ok(checks(card).every((c) => c.startsWith('ok:')));
  assert.ok(checks(card).includes('ok:✓ runs in a transaction'));
});

test('SQL: flags drops, renames, required columns without defaults and blocking indexes', () => {
  const card = migrationCard(`ALTER TABLE users DROP COLUMN legacy;
ALTER TABLE users RENAME COLUMN name TO full_name;
ALTER TABLE users ADD COLUMN org_id uuid NOT NULL;
CREATE INDEX users_org ON users (org_id);`);
  assert.deepEqual(checks(card), ['bad:✕ 1 drop', 'warn:! 1 rename', 'bad:✕ required column without a default', 'warn:! 1 index built without CONCURRENTLY']);
});

test('SQL: a new table lists its columns and its indexes are not flagged', () => {
  const card = migrationCard(`CREATE TABLE "Payout" ("id" TEXT NOT NULL, "amount" DECIMAL(65,30) NOT NULL, "accountId" TEXT REFERENCES "Account"("id"), CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"));
CREATE INDEX "Payout_accountId_idx" ON "Payout"("accountId");`);
  const t = section(card, 'tables').tables[0];
  assert.equal(t.note, 'new table');
  assert.deepEqual(t.columns.map((c) => c.detail), ['text · required', 'decimal(65,30) · required', 'text · nullable · → Account']);
  assert.equal(checks(card).filter((c) => c.startsWith('warn')).length, 0);
});

test('Prisma: added field, changed field and a new model', () => {
  const before = 'model User {\n  id String @id\n  name String\n}\n';
  const after = 'model User {\n  id String @id\n  name String?\n  archivedAt DateTime?\n}\n\nenum Role {\n  ADMIN\n}\n';
  const card = prismaCard(before, after);
  assert.deepEqual(pills(card), ['1 model added', '1 field added']);
  assert.deepEqual(section(card, 'tables').tables.map((t) => [t.name, t.columns.map((c) => `${c.sign}${c.name}`)]), [
    ['User', ['↑name', '+archivedAt']],
    ['Role', ['+ADMIN']],
  ]);
});

const DOCKERFILE = `ARG NODE_IMAGE=node:24-slim@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
FROM \${NODE_IMAGE} AS deps
WORKDIR /app
RUN corepack pnpm install --frozen-lockfile --prod
FROM \${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV SSL_CERT_FILE=/app/ca.pem
COPY --from=deps /app/node_modules ./node_modules
USER node
ENTRYPOINT ["node", "dist/main.js"]
`;

test('Dockerfile: stages, the shipped image and passing checks', () => {
  const card = dockerCard(null, DOCKERFILE);
  assert.deepEqual(section(card, 'flow').steps.map((s) => s.name), ['deps', 'runtime']);
  const rows = Object.fromEntries(section(card, 'rows').rows.map((r) => [r.key, r.value]));
  assert.equal(rows['Base image'], 'node:24-slim@sha256:01234567…');
  assert.equal(rows['Runs as'], 'node');
  assert.equal(rows.Environment, 'NODE_ENV=production · SSL_CERT_FILE=/app/ca.pem');
  assert.ok(checks(card).every((c) => c.startsWith('ok:')), checks(card).join());
});

test('Dockerfile: flags root, a floating tag, shell form and a secret in ENV', () => {
  const card = dockerCard(null, 'FROM node:24\nENV API_KEY=abc123\nCMD node main.js\n');
  assert.deepEqual(checks(card), ['warn:! not pinned: node:24', 'bad:✕ runs as root', 'warn:! shell-form entrypoint (no SIGTERM)', 'bad:✕ secret in ENV: API_KEY']);
});

test('Dockerfile: a modified file says what changed', () => {
  const card = dockerCard(DOCKERFILE, DOCKERFILE.replace('USER node', 'USER root'));
  const user = section(card, 'rows').rows.find((r) => r.key === 'Runs as')!;
  assert.deepEqual([user.value, user.was], ['root', 'node']);
  assert.deepEqual(pills(card), ['2 stages', '1 changed']);
});

test('GitLab CI: jobs added with when they run', () => {
  const before = 'stages: [build]\nlint:\n  stage: build\n  script: [pnpm lint]\n';
  const after = `${before}docker_build:\n  stage: build\n  rules:\n    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH\n  script: [docker build .]\ndocker_build_mr:\n  stage: build\n  rules:\n    - if: $CI_PIPELINE_SOURCE == "merge_request_event"\n  script: [docker build .]\n`;
  const card = ciCard('.gitlab/ci/build.yml', before, after);
  assert.deepEqual(pills(card), ['2 jobs added', 'nothing removed']);
  assert.deepEqual(section(card, 'list').items.map((i) => `${i.name}: ${i.detail}`), ['docker_build: stage build · main', 'docker_build_mr: stage build · merge requests']);
});

test('GitHub Actions: a new workflow lists its triggers and jobs', () => {
  const card = ciCard('.github/workflows/ci.yml', null, 'on:\n  push:\n  pull_request:\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n');
  assert.deepEqual(section(card, 'list').items.map((i) => `${i.name}: ${i.detail}`), ['check: ubuntu-latest · 2 steps (checkout)']);
  assert.deepEqual(section(card, 'rows').rows, [{ key: 'Triggers', value: 'push, pull_request' }]);
});

test('OpenAPI: endpoints added, changed and removed', () => {
  const spec = (paths: object) => JSON.stringify({ openapi: '3.1.0', paths, components: { schemas: {} } });
  const before = spec({ '/v1/projects': { get: { summary: 'List', responses: { 200: {} } } }, '/v1/old': { get: { responses: {} } } });
  const after = spec({
    '/v1/projects': { get: { summary: 'List', responses: { 200: {}, 403: {} } } },
    '/v1/projects/{id}': { patch: { summary: 'Update a project', responses: { 200: {} } }, delete: { summary: 'Archive', responses: { 204: {} } } },
  });
  const card = openapiCard('api.openapi.json', before, after);
  assert.deepEqual(pills(card), ['2 endpoints added', '1 changed', '1 removed']);
  assert.deepEqual(section(card, 'list').items.map((i) => `${i.sign} ${i.name} ${i.detail ?? ''}`.trim()), [
    '↑ GET /v1/projects +403',
    '+ DELETE /v1/projects/{id} Archive',
    '+ PATCH /v1/projects/{id} Update a project',
    '− GET /v1/old',
  ]);
});

test('markdown: marks added and changed blocks and keeps their source lines', () => {
  const before = '# Title\n\nIntro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const after = '# Title\n\nIntro.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\n## New section\n\nMore text.\n';
  const blocks = markdownDiff(before, after);
  assert.deepEqual(blocks.map((b) => [b.status, b.lines]), [
    ['same', [1, 1]],
    ['same', [3, 3]],
    ['changed', [5, 8]],
    ['added', [10, 10]],
    ['added', [12, 12]],
  ]);
  assert.match(blocks[2].oldHtml!, /<table>/);
});

test('markdown: escapes HTML in the file and resolves relative links', () => {
  const [block] = markdownDiff(null, '<img src=x onerror=alert(1)> [guide](../guide.md) ![d](img/d.png)', {
    link: 'https://gitlab.com/g/p/-/blob/abc/docs/',
    image: 'https://gitlab.com/g/p/-/raw/abc/docs/',
  });
  assert.doesNotMatch(block.html, /<img src=x/);
  assert.match(block.html, /href="https:\/\/gitlab\.com\/g\/p\/-\/blob\/abc\/guide\.md"/);
  assert.match(block.html, /src="https:\/\/gitlab\.com\/g\/p\/-\/raw\/abc\/docs\/img\/d\.png"/);
});

test('markdown: skips YAML front matter but keeps line numbers', () => {
  const blocks = markdownDiff(null, '---\ntitle: Export API\nstage: Import\n---\n\n# Export a project\n');
  assert.deepEqual(blocks.map((b) => [b.status, b.lines, b.html.trim()]), [['added', [6, 6], '<h1>Export a project</h1>']]);
});

test('OpenAPI YAML: read by indentation, only changed endpoints parsed', () => {
  const spec = (extra: string) => `openapi: 3.0.1
paths:
  "/api/v4/projects/{id}/export":
    post:
      summary: Start a project export
      parameters:
      - name: id
        in: path
${extra}    get:
      summary: Export status
      responses:
        '200':
          description: OK
components:
  schemas:
    postApiV4ProjectsIdExport:
      type: object
`;
  const before = spec('');
  const after = spec('      - name: excluded_relations\n        in: query\n').replace('    postApiV4ProjectsIdExport:\n      type: object\n', '    postApiV4ProjectsIdExport:\n      type: object\n      description: new\n    Relation:\n      type: string\n');
  const card = openapiCard('doc/api/openapi/openapi_v3.yaml', before, after);
  assert.deepEqual(section(card, 'list').items.map((i) => `${i.sign} ${i.name} ${i.detail ?? ''}`.trim()), ['↑ POST /api/v4/projects/{id}/export parameters']);
  assert.deepEqual(card.sections[1].type === 'list' && card.sections[1].items.map((i) => `${i.sign}${i.name}`), ['↑postApiV4ProjectsIdExport', '+Relation']);
});

test('CI: a changed pipeline variable is listed with its old and new values', () => {
  const before = 'env:\n  NODE_VERSION: 24\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: make\n';
  const card = ciCard('.github/workflows/docker.yml', before, before.replace('NODE_VERSION: 24', 'NODE_VERSION: 26'));
  const vars = card.sections.find((s) => s.type === 'list' && s.title === 'Variables');
  assert.deepEqual(vars?.type === 'list' && vars.items.map((i) => `${i.name}: ${i.detail}`), ['NODE_VERSION: 24 → 26']);
  assert.ok(!pills(card).includes('formatting only'));
});

test("Dockerfile: an unnamed last stage is called 'final'", () => {
  const card = dockerCard(null, 'FROM node:24 AS build\nRUN make\nFROM node:24-slim\nUSER node\nCMD ["node", "x.js"]\n');
  assert.deepEqual(section(card, 'flow').steps.map((s) => s.name), ['build', 'final']);
});
