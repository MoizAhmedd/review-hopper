# Chrome Web Store submission

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole).
Upload `review-hopper.zip` (run `npm run zip`).

**Status:** DRAFT. The summary and description are promotional copy, so Moiz approves them word
for word before submitting (AGENTS.md).

## Package

- **Upload:** `review-hopper.zip` (version 1.0.0)

## Store listing tab

**Name:** Review Hopper

**Summary** (the manifest's description, 118 of 132 characters):

> Review GitLab merge requests and GitHub pull requests by what matters: summaries, rendered docs, tests out of the way.

**Description:**

> Review what changed. Skip what didn't.
>
> Review Hopper changes the review page on gitlab.com and GitHub so the parts that need a person come first.
>
> At a glance: dependency manifests, database migrations, Dockerfiles, CI config and API specs show as short summaries instead of raw diffs. Packages added and upgraded, columns added, jobs added, endpoints changed, with checks such as "no drops" or "runs as non-root". The raw diff is one click away.
>
> Docs rendered: markdown reads the way it will be published, with changed parts marked. On GitLab you can comment on a passage and it lands on the source line.
>
> Noise hidden: tests, tool config, lockfiles and generated files move to a Hidden group at the end of the list, one click away.
>
> Private by default. Everything happens in your browser with the login you already have. No account, no analytics, no server. Open source: github.com/MoizAhmedd/review-hopper

**Category:** Developer Tools
**Language:** English

**Graphics:**
- Icon: `store-icon-128.png` (also in the package)
- Screenshots, 1280×800, in this order: `shot-migration.png`, `shot-docker.png`, `shot-deps.png`,
  `shot-tree.png`
- Small promo tile, 440×280: `promo-tile-440x280.png`

**Homepage URL:** https://moizahmedd.github.io/review-hopper/
**Support URL:** https://github.com/MoizAhmedd/review-hopper/issues

## Privacy practices tab

**Single purpose:**

> Makes GitLab merge request and GitHub pull request review pages easier to review by summarising, rendering and grouping the changed files.

**Permission justifications:**

- **storage:** Saves the user's settings from the toolbar popup, and keeps the summaries it made in memory for the browser session so a reopened review loads instantly.
- **Host access (gitlab.com, github.com) through the content script:** Needed to change the merge request and pull request review pages, and to read the changed files in a review from the same site with the user's existing login. It acts only on review pages and sends nothing elsewhere.

**Remote code:** No, I am not using remote code.

**Data usage:** Leave every data type unchecked. The extension reads the code under review only
inside the browser and doesn't collect or transmit it. (The one write, a comment the user types and
posts, goes to GitLab as the user's own action.)

Check all three certifications.

**Privacy policy URL:** https://moizahmedd.github.io/review-hopper/privacy.html

## After approval

Point the landing page's Add to Chrome links (`site/public/index.html`) and the README's install
section at the store listing, then push so Pages redeploys.
