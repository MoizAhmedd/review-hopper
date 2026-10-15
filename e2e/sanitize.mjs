// Checks src/ui/sanitize.ts in a real browser against hostile and ordinary README HTML.
//   node e2e/sanitize.mjs

import * as esbuild from 'esbuild';
import puppeteer from 'puppeteer';

const root = new URL('..', import.meta.url).pathname;
const { outputFiles } = await esbuild.build({
  stdin: { contents: "import { sanitize } from './src/ui/sanitize.ts'; window.sanitize = sanitize;", resolveDir: root, loader: 'ts' },
  bundle: true,
  format: 'iife',
  write: false,
});

const LINKS = { link: 'https://github.com/o/r/blob/abc/docs/', image: 'https://github.com/o/r/raw/abc/docs/' };
// [input, what the output must (or must not) contain]
const CASES = [
  ['<img src=x onerror="window.pwned=1">', { not: ['onerror'] }],
  ['<a href="javascript:window.pwned=1">x</a>', { not: ['javascript:'], has: ['<a'] }],
  ['<script>window.pwned=1</script>ok', { not: ['<script', 'pwned'], has: ['ok'] }],
  ['<svg onload="window.pwned=1"><circle/></svg>', { not: ['<svg', 'onload'] }],
  ['<iframe src="https://evil.example"></iframe>', { not: ['<iframe'] }],
  ['<div style="position:fixed;inset:0">cover</div>', { not: ['style='], has: ['cover'] }],
  ['<img src="data:image/svg+xml,<svg onload=alert(1)>">', { not: ['data:'] }],
  ['<form action="https://evil.example"><input type="text"></form>', { not: ['<form', 'type="text"'] }],
  ['<noscript><p title="</noscript><img src=x onerror=window.pwned=1>"></noscript>', { not: ['onerror'] }],
  ['<custom-el onclick="window.pwned=1">text</custom-el>', { not: ['custom-el', 'onclick'], has: ['text'] }],
  ['<a href="#install">jump</a>', { has: ['href="#install"'], not: ['target='] }],
  ['<div id="files" name="x">clobber</div>', { not: ['id=', 'name='], has: ['clobber'] }],
  ['<p align="center"><img src="logo.png" width="200" alt="Logo"></p>', { has: ['align="center"', 'src="https://github.com/o/r/raw/abc/docs/logo.png"', 'width="200"'] }],
  ['<a href="../guide.md">guide</a>', { has: ['href="https://github.com/o/r/blob/abc/guide.md"', 'rel="noopener noreferrer"'] }],
  ['<details><summary>More</summary>Hidden text</details>', { has: ['<details>', '<summary>More</summary>'] }],
  ['<input type="checkbox" checked> done', { has: ['type="checkbox"', 'disabled'] }],
];

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.goto('about:blank');
await page.addScriptTag({ content: outputFiles[0].text });
let failures = 0;
for (const [input, expect] of CASES) {
  const html = await page.evaluate((input, links) => {
    const div = document.createElement('div');
    div.append(window.sanitize(input, links));
    document.body.append(div);
    return div.innerHTML;
  }, input, LINKS);
  const bad = [...(expect.not ?? []).filter((s) => html.includes(s)), ...(expect.has ?? []).filter((s) => !html.includes(s)).map((s) => `missing ${s}`)];
  console.log(`${bad.length ? '✖' : '✔'} ${input.slice(0, 60)}${bad.length ? `  → ${html}  (${bad.join('; ')})` : ''}`);
  if (bad.length) failures++;
}
// Give anything that slipped through a moment to run.
await new Promise((r) => setTimeout(r, 300));
const pwned = await page.evaluate(() => window.pwned);
console.log(`${pwned ? '✖' : '✔'} nothing ran`);
if (pwned) failures++;
await browser.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
