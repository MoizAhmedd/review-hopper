import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classify, plan } from '../src/lib/classify.ts';

const kind = (path: string, generated = false) => classify({ path, generated });

test('sorts the files of a typical backend MR', () => {
  assert.equal(kind('src/users/user.service.ts'), 'code');
  assert.equal(kind('src/users/user.service.spec.ts'), 'tests');
  assert.equal(kind('test/e2e/users.e2e.spec.ts'), 'tests');
  assert.equal(kind('api.openapi.json'), 'openapi');
  assert.equal(kind('prisma/migrations/20260101000000_add_archived_at/migration.sql'), 'database');
  assert.equal(kind('prisma/schema.prisma'), 'database');
  assert.equal(kind('.gitlab/ci/build.yml'), 'ci');
  assert.equal(kind('apps/api/Dockerfile'), 'docker');
  assert.equal(kind('docs/README.md'), 'docs');
  assert.equal(kind('package.json'), 'deps');
  assert.equal(kind('pnpm-lock.yaml'), 'lockfile');
  assert.equal(kind('jest.config.ts'), 'config');
  assert.equal(kind('tsconfig.spec.json'), 'config');
});

test('sorts other ecosystems', () => {
  assert.equal(kind('spec/models/project_export_job_spec.rb'), 'tests');
  assert.equal(kind('pkg/server/handler_test.go'), 'tests');
  assert.equal(kind('tests/test_api.py'), 'tests');
  assert.equal(kind('.github/workflows/ci.yml'), 'ci');
  assert.equal(kind('.gitlab-ci.yml'), 'ci');
  assert.equal(kind('db/migrate/20260101_add_users.rb'), 'database');
  assert.equal(kind('src/__snapshots__/app.test.ts.snap'), 'tests');
  assert.equal(kind('web/app.min.js'), 'generated');
  assert.equal(kind('docs/popup.png'), 'images');
});

test("trusts the site's generated flag", () => {
  assert.equal(kind('data/index.json', true), 'generated');
  assert.equal(kind('data/index.json'), 'code');
});

test('treats a huge data file as generated', () => {
  assert.equal(classify({ path: 'data/index.json', added: 201000, removed: 700 }), 'generated');
  assert.equal(classify({ path: 'data/curated.json', added: 166, removed: 0 }), 'code');
});

test('keeps deploy YAML visible', () => {
  assert.equal(kind('overlays/dev/kustomization.yaml'), 'code');
});

test('hides tests, config and generated files', () => {
  const files = ['src/a.ts', 'src/a.spec.ts', 'jest.config.ts', 'README.md'].map((path) => ({ path }));
  assert.deepEqual(plan(files).hidden.map((f) => f.path), ['src/a.spec.ts', 'jest.config.ts']);
});

test('hides a lockfile only when package.json changed too', () => {
  const alone = plan([{ path: 'src/a.ts' }, { path: 'pnpm-lock.yaml' }]);
  assert.deepEqual(alone.hidden, []);
  const withDeps = plan([{ path: 'package.json' }, { path: 'pnpm-lock.yaml' }]);
  assert.deepEqual(withDeps.hidden.map((f) => f.path), ['pnpm-lock.yaml']);
});

test('hides nothing when everything would be hidden', () => {
  const testOnly = plan([{ path: 'src/a.spec.ts' }, { path: 'src/b.spec.ts' }]);
  assert.deepEqual(testOnly.hidden, []);
});
