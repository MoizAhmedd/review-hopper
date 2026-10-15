// Loads the built extension in Chrome for Testing and checks it on real review pages.
//   node e2e/run.mjs            GitLab MR plus the GitHub page saved in design/
// Screenshots land in e2e/out/.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}e2e/out`;
mkdirSync(out, { recursive: true });

const GITLAB = 'https://gitlab.com/gitlab-org/gitlab/-/merge_requests/261928/diffs';
const GITHUB = 'https://github.com/MoizAhmedd/mcp-here/pull/1/files';
// GitHub serves logged-out visitors its old Files page, so the signed-in page Moiz saved stands in.
const SAVED = `${root}design/github-pr-files.html`;

const browser = await puppeteer.launch({ headless: true, enableExtensions: [`${root}dist`], defaultViewport: { width: 1440, height: 1000, deviceScaleFactor: 2 } });
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✔' : '✖'} ${label}`);
  if (!ok) failures++;
};

async function open(url, { serve } = {}) {
  const page = await browser.newPage();
  // Content-script errors arrive on the console tagged [Review Hopper]; page errors are the site's own.
  const errors = [];
  const siteErrors = [];
  page.on('pageerror', (e) => siteErrors.push(e.message.slice(0, 80)));
  page.on('console', (m) => m.text().includes('[Review Hopper]') && errors.push(m.text()));
  if (serve) {
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url() === url ? r.respond({ status: 200, contentType: 'text/html', body: serve }) : r.continue()));
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('.rh-tree', { timeout: 30000 });
  return { page, errors, siteErrors };
}

/** Scrolls every file block into view so lazy cards load, then waits for them to settle. */
async function loadAll(page) {
  await page.evaluate(async () => {
    for (const el of document.querySelectorAll('[data-rh-order]')) {
      el.scrollIntoView();
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await page.waitForFunction(() => !document.body.innerText.includes('Review Hopper is reading this file'), { timeout: 90000 }).catch(() => {});
}

const summary = (page) => page.evaluate(() => ({
  head: document.querySelector('.rh-tree-head')?.textContent,
  groups: [...document.querySelectorAll('.rh-tree .rh-gh')].map((g) => g.textContent),
  hiddenBlocks: document.querySelectorAll('[data-rh-order][data-rh-hide]').length,
  cards: [...document.querySelectorAll('.rh-card')].map((c) => c.querySelector('.rh-sum')?.textContent),
  markdown: document.querySelectorAll('.rh-md').length,
  notes: [...document.querySelectorAll('.rh-holder .rh-note')].map((n) => n.textContent),
  band: document.querySelector('.rh-band')?.textContent,
}));

// GitLab (skip with ONLY=github: gitlab.com rate-limits repeated logged-out runs)
if (process.env.ONLY !== 'github') {
  const { page, errors, siteErrors } = await open(GITLAB);
  await loadAll(page);
  const s = await summary(page);
  console.log('GitLab', JSON.stringify({ ...s, siteErrors }, null, 1));
  check(s.head?.includes('of 13 files'), 'GitLab: tree counts all 13 files');
  check(s.hiddenBlocks === 6, 'GitLab: the 6 spec files are hidden');
  check(s.cards.some((c) => c?.startsWith('API')), 'GitLab: openapi_v3.yaml becomes an API card');
  check(s.markdown === 2, 'GitLab: both docs render');
  check(s.band?.includes('6 tests'), 'GitLab: the bar at the end says 6 tests are hidden');
  check(errors.length === 0, `GitLab: no errors from Review Hopper ${errors.join(' | ')}`);
  await page.evaluate(() => { document.querySelector('[data-rh-order="0"]')?.scrollIntoView(); window.scrollBy(0, -120); });
  await page.screenshot({ path: `${out}/gitlab-card.png` });
  await page.evaluate(() => { document.querySelector('.rh-md')?.scrollIntoView(); window.scrollBy(0, -160); });
  await page.screenshot({ path: `${out}/gitlab-docs.png` });
  // Show hidden files, then hide them again.
  await page.click('.rh-band .rh-btn');
  await page.waitForFunction(() => document.querySelectorAll('[data-rh-order][data-rh-hide]').length === 0);
  check(true, 'GitLab: "Show hidden files" brings the specs back');
  await page.close();
}

// GitHub
if (existsSync(SAVED)) {
  const { page, errors, siteErrors } = await open(GITHUB, { serve: readFileSync(SAVED, 'utf8') });
  await loadAll(page);
  const s = await summary(page);
  console.log('GitHub', JSON.stringify({ ...s, siteErrors }, null, 1));
  check(s.head?.includes('of 31 files'), 'GitHub: tree counts all 31 files');
  check(s.cards.some((c) => c?.startsWith('Dependencies')), 'GitHub: package.json becomes a Dependencies card');
  check(s.cards.some((c) => c?.startsWith('CI pipeline')), 'GitHub: the workflow becomes a CI card');
  check(errors.length === 0, `GitHub: no errors from Review Hopper ${errors.join(' | ')}`);
  await page.evaluate(() => { document.querySelector('.rh-card')?.closest('[data-rh-order]')?.scrollIntoView(); window.scrollBy(0, -120); });
  await page.screenshot({ path: `${out}/github-card.png` });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${out}/github-tree.png` });
  await page.close();
} else console.log('skipped GitHub: design/github-pr-files.html is missing');

await browser.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
