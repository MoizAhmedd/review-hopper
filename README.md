# Review Hopper

Review merge requests and pull requests by what matters. A Chrome extension for GitLab and GitHub.

- **At a glance:** `package.json`, migrations, Prisma schemas, Dockerfiles, CI config and OpenAPI
  specs become summary cards: dependencies added or upgraded, columns added, jobs added,
  endpoints changed, and checks like "no drops" or "non-root". The raw diff is one click away.
- **Docs rendered:** markdown shows as it will be read, with changed blocks marked, on GitLab and
  GitHub, including the HTML READMEs often carry (through a strict allowlist). On GitLab, comment on
  a block and it lands on the source line.
- **Noise hidden:** tests, tool config, lockfiles and generated files move to a Hidden group at
  the end of the list.
- **One file tree** grouped as At a glance, Docs, Code and Hidden, in place of the site's.

It reads only the review page you're on and the files in it, with your existing login. Nothing
leaves your browser.

## Install (development)

```sh
npm install && npm run build
```

Then `chrome://extensions` → Developer mode → Load unpacked → `dist/`.

Works on gitlab.com merge requests (the Changes tab on Rapid Diffs, GitLab's default) and on
GitHub pull requests (the Files changed page, current or classic).

## Develop

```sh
npm test          # classification and parsers
npm run typecheck
npm run e2e       # loads dist/ in Chrome for Testing on a public GitLab MR and GitHub PR
node e2e/shots.mjs      # store and landing screenshots from public PRs
node demo/plates.mjs    # demo screenshots; then in demo/: npm i && node render.mjs ../site/public/demo.mp4
```

`src/sites/` has one adapter per site; `src/lib/parsers/` turns a file's old and new versions into
a card; `src/content.ts` puts them on the page.
