// Store and landing screenshots: Review Hopper on saved, signed-in GitHub PR pages.
//   node e2e/shots.mjs
// Each shot is saved twice: store/<name>.png at 1280×800 (what the Chrome Web Store takes) and
// site/public/<name>.png at 2× for the landing page.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}store`, { recursive: true });

// file: the page Moiz saved; url: where it came from; focus: what to frame.
const SHOTS = [
  { name: 'shot-migration', file: 'design/gh-migration.html', url: 'https://github.com/calcom/cal.diy/pull/14943/files', focus: 'card:Database' },
  { name: 'shot-docker', file: 'design/gh-docker.html', url: 'https://github.com/n8n-io/n8n/pull/36291/files', focus: 'card:Docker image' },
  { name: 'shot-deps', file: 'design/gh-deps.html', url: 'https://github.com/excalidraw/excalidraw/pull/5119/files', focus: 'card:Dependencies' },
  { name: 'shot-tree', file: 'design/github-pr-files.html', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', focus: 'top' },
];

// Banners that belong to the account that saved the page, not the PR.
const TIDY = `.flash, .js-notice, [data-testid="banner"], .js-flash-container, #js-flash-container { display: none !important; }`;

const browser = await puppeteer.launch({ headless: true, enableExtensions: [`${root}dist`] });
for (const shot of SHOTS) {
  if (!existsSync(`${root}${shot.file}`)) {
    console.log(`skip ${shot.name}: ${shot.file} not saved yet`);
    continue;
  }
  for (const [scale, out] of [[1, `${root}store/${shot.name}.png`], [2, `${root}site/public/${shot.name}.png`]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: scale });
    const html = readFileSync(`${root}${shot.file}`, 'utf8');
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url() === shot.url ? r.respond({ status: 200, contentType: 'text/html', body: html }) : r.continue()));
    await page.goto(shot.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.addStyleTag({ content: TIDY });
    await page.waitForSelector('.rh-tree', { timeout: 30000 });
    await page.waitForFunction(() => !document.body.innerText.includes('Review Hopper is reading this file'), { timeout: 60000 }).catch(() => {});
    const found = await page.evaluate((focus) => {
      const [type, title] = focus.split(':');
      const target = type === 'card'
        ? [...document.querySelectorAll('.rh-card')].find((c) => c.querySelector('.rh-sum b')?.textContent === title)?.closest('[data-rh-order]')
        : document.querySelector('.rh-tree');
      if (!target) return false;
      target.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -90);
      return true;
    }, shot.focus);
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: out });
    console.log(`${found ? '✔' : '✖ (focus not found)'} ${out.replace(root, '')}`);
    await page.close();
  }
}
await browser.close();
