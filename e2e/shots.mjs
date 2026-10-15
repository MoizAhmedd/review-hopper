// Store and landing screenshots: Review Hopper on live public GitHub PRs (GitHub serves the classic
// Files page when signed out, which Review Hopper supports).
//   node e2e/shots.mjs
// Each shot is saved twice: store/<name>.png at 1280×800 (what the Chrome Web Store takes) and
// site/public/<name>.png at 2× for the landing page.

import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
mkdirSync(`${root}store`, { recursive: true });

// focus: the card to frame, or 'top' for the tree and the first cards.
const SHOTS = [
  // The same README rendered and as GitHub shows it, for a side-by-side.
  // The landing page crops these to the file itself so the pair reads at half width.
  { name: 'shot-docs', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', focus: 'file:README.md', crop: true },
  { name: 'shot-docs-raw', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', focus: 'file:README.md', ext: false, crop: true },
  { name: 'shot-migration', url: 'https://github.com/calcom/cal.diy/pull/14943/files', focus: 'card:Database' },
  { name: 'shot-docker', url: 'https://github.com/n8n-io/n8n/pull/36291/files', focus: 'card:Docker image' },
  { name: 'shot-deps', url: 'https://github.com/excalidraw/excalidraw/pull/5119/files', focus: 'card:Dependencies' },
  { name: 'shot-tree', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', focus: 'top' },
];

// Banners that belong to the account that saved the page, not the PR.
const TIDY = `.flash, .js-notice, [data-testid="banner"], .js-flash-container, #js-flash-container { display: none !important; }
* { overflow-anchor: none !important; }`;

const withExt = await puppeteer.launch({ headless: true, enableExtensions: [`${root}dist`] });
const without = await puppeteer.launch({ headless: true });
for (const shot of SHOTS) {
  const ext = shot.ext !== false;
  const browser = ext ? withExt : without;
  for (const [scale, out] of [[1, `${root}store/${shot.name}.png`], [2, `${root}site/public/${shot.name}.png`]]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: scale });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(shot.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.addStyleTag({ content: TIDY });
    if (ext) await page.waitForSelector('.rh-tree', { timeout: 30000 });
    else await page.waitForSelector('#files .file', { timeout: 30000 });
    // GitHub's classic page loads files in batches as you scroll: load them all first.
    await page.evaluate(async () => {
      for (let i = 0, last = -1; i < 40; i++) {
        const n = document.querySelectorAll('[id^="diff-"]').length;
        if (n === last && i > 3) break;
        last = n;
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((r) => setTimeout(r, 700));
      }
    });
    await page.waitForFunction(() => !document.body.innerText.includes('Review Hopper is reading this file'), { timeout: 60000 }).catch(() => {});
    const found = await page.evaluate(async (focus) => {
      const [type, title] = focus.split(':');
      if (type === 'file') {
        const block = document.querySelector(`[data-tagsearch-path="${title}"], [id^="diff-"][role="region"]:has(h3 code)`);
        if (!block) return false;
        for (let i = 0; i < 2; i++) {
          window.scrollTo(0, block.getBoundingClientRect().top + window.scrollY - 90);
          await new Promise((r) => setTimeout(r, 800));
        }
        const r = block.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.min(560, Math.round(window.innerHeight - r.top)) };
      }
      if (type === 'top') {
        // Collapse the long Code group so the Hidden group shows, then frame the top of the list.
        [...document.querySelectorAll('.rh-tree .rh-gh')].find((g) => g.textContent.startsWith('▼Code'))?.click();
        await new Promise((r) => setTimeout(r, 500));
        for (let i = 0; i < 2; i++) {
          const tops = [...document.querySelectorAll('[data-rh-order]:not([data-rh-hide])')].map((e) => e.getBoundingClientRect().top + window.scrollY);
          if (!tops.length) return false;
          window.scrollTo(0, Math.min(...tops) - 70);
          await new Promise((r) => setTimeout(r, 800));
        }
        return true;
      }
      const target = [...document.querySelectorAll('.rh-card')].find((c) => c.querySelector('.rh-sum b')?.textContent === title)?.closest('[data-rh-order]');
      if (!target) return false;
      // Twice, after a pause: GitHub keeps adjusting the page for a moment after it loads.
      for (let i = 0; i < 2; i++) {
        window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 90);
        await new Promise((r) => setTimeout(r, 800));
      }
      return true;
    }, shot.focus);
    await new Promise((r) => setTimeout(r, 400));
    const clip = scale === 2 && shot.crop && typeof found === 'object' ? found : undefined;
    await page.screenshot({ path: out, ...(clip ? { clip } : {}) });
    console.log(`${found ? '✔' : '✖ (focus not found)'} ${out.replace(root, '')}`);
    await page.close();
  }
}
await withExt.close();
await without.close();
