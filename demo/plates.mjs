// Captures the screenshots the demo scene is drawn from: live public GitHub PRs with and without
// Review Hopper, at 1920×1080 and 2× so camera zooms stay sharp. Also records where the cards sit,
// in screen coordinates, in plates.js for scene.html.
//   node demo/plates.mjs        (after npm run build)

import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}demo/plates`;
mkdirSync(out, { recursive: true });
const TIDY = `.flash, .js-notice, .js-flash-container { display: none !important; } * { overflow-anchor: none !important; }`;

const PLATES = [
  // name, url, with the extension?, what to frame and measure
  { name: 'cal-before', url: 'https://github.com/calcom/cal.diy/pull/14943/files', ext: false },
  { name: 'cal-after', url: 'https://github.com/calcom/cal.diy/pull/14943/files', ext: true, boxes: { card: 'card:Database', tree: '.rh-tree' } },
  { name: 'n8n-after', url: 'https://github.com/n8n-io/n8n/pull/36291/files', ext: true, boxes: { card: 'card:Docker image' } },
  { name: 'mcp-after', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', ext: true, collapseCode: true, boxes: { hidden: 'hidden', tree: '.rh-tree' } },
  { name: 'mcp-shown', url: 'https://github.com/MoizAhmedd/mcp-here/pull/1/files', ext: true, collapseCode: true, showHidden: true, boxes: { tree: '.rh-tree' } },
];

const boxes = {};
for (const ext of [false, true]) {
  const browser = await puppeteer.launch({ headless: true, ...(ext ? { enableExtensions: [`${root}dist`] } : {}) });
  for (const plate of PLATES.filter((p) => p.ext === ext)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    await page.goto(plate.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.addStyleTag({ content: TIDY });
    await page.waitForSelector('#files .file', { timeout: 30000 });
    if (ext) {
      await page.waitForSelector('.rh-tree', { timeout: 30000 });
      // Load every batch of files, then let the cards finish.
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
    }
    const measured = await page.evaluate(async (plate) => {
      const clickGroup = (prefix) => [...document.querySelectorAll('.rh-tree .rh-gh')].find((g) => g.textContent.startsWith(prefix))?.click();
      if (plate.collapseCode) clickGroup('▼Code');
      if (plate.showHidden) clickGroup('▶Hidden');
      await new Promise((r) => setTimeout(r, 500));
      // Frame the top of the file list, the same way with or without the extension.
      for (let i = 0; i < 2; i++) {
        const first = document.querySelector('[data-rh-order]:not([data-rh-hide])') ?? document.querySelector('#files .file');
        const tops = [...document.querySelectorAll('[data-rh-order]:not([data-rh-hide])')].map((e) => e.getBoundingClientRect().top + scrollY);
        window.scrollTo(0, (tops.length ? Math.min(...tops) : first.getBoundingClientRect().top + scrollY) - 70);
        await new Promise((r) => setTimeout(r, 600));
      }
      const box = (el) => { const r = el.getBoundingClientRect(); return el ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; };
      const out = {};
      for (const [key, sel] of Object.entries(plate.boxes ?? {})) {
        let el;
        if (sel.startsWith('card:')) el = [...document.querySelectorAll('.rh-card')].find((c) => c.querySelector('.rh-sum b')?.textContent === sel.slice(5))?.closest('[data-rh-order]');
        else if (sel === 'hidden') el = document.querySelector('.rh-hidden-group .rh-gh');
        else el = document.querySelector(sel);
        out[key] = el ? box(el) : null;
      }
      return out;
    }, plate);
    await page.screenshot({ path: `${out}/${plate.name}.png` });
    boxes[plate.name] = measured;
    console.log(plate.name, JSON.stringify(measured));
    await page.close();
  }
  await browser.close();
}
writeFileSync(`${root}demo/plates.js`, `// Written by plates.mjs: boxes [x, y, w, h] in 1920×1080 screen coordinates.\nwindow.PLATES = ${JSON.stringify(boxes, null, 1)};\n`);
