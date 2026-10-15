// Markdown: renders both versions and marks which blocks were added, changed or removed.

import MarkdownIt from 'markdown-it';

type Md = InstanceType<typeof MarkdownIt>;
type Token = ReturnType<Md['parse']>[number];

export type BlockStatus = 'same' | 'added' | 'changed' | 'removed';

export interface Block {
  status: BlockStatus;
  html: string;
  /** For changed blocks, how the block read before. */
  oldHtml?: string;
  /** 1-based first and last line of the block in the new file (old file for removed blocks). */
  lines: [number, number];
}

export interface Links {
  /** Base for relative links, e.g. the blob URL of the file's folder at the new commit. */
  link: string;
  /** Base for relative images, e.g. the raw URL of the folder. */
  image: string;
}

function renderer(links?: Links): Md {
  // html: false escapes raw HTML in the file, so nothing from the repo runs on the page.
  const md = new MarkdownIt({ html: false, linkify: true });
  if (links) {
    const resolve = (url: string, base: string) => {
      if (/^([a-z]+:|#|\/\/)/i.test(url)) return url;
      try {
        return new URL(url, base).href;
      } catch {
        return url;
      }
    };
    const link = md.renderer.rules.link_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
    md.renderer.rules.link_open = (tokens, i, opts, env, self) => {
      const href = tokens[i].attrGet('href');
      if (href) tokens[i].attrSet('href', resolve(String(href), links.link));
      tokens[i].attrSet('target', '_blank');
      tokens[i].attrSet('rel', 'noopener');
      return link(tokens, i, opts, env, self);
    };
    const image = md.renderer.rules.image!;
    md.renderer.rules.image = (tokens, i, opts, env, self) => {
      const src = tokens[i].attrGet('src');
      if (src) tokens[i].attrSet('src', resolve(String(src), links.image));
      return image(tokens, i, opts, env, self);
    };
  }
  return md;
}

interface Raw {
  source: string;
  html: string;
  lines: [number, number];
}

/** Top-level blocks: each heading, paragraph, list, table, fence or quote on its own. */
/** Blanks out YAML front matter, keeping the line count so source lines still match. */
function withoutFrontMatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\n---[ \t]*(\r?\n|$)/.exec(text);
  return m ? m[0].replace(/[^\n]/g, '') + text.slice(m[0].length) : text;
}

function blocks(md: Md, text: string): Raw[] {
  text = withoutFrontMatter(text);
  const tokens = md.parse(text, {});
  const lines = text.split('\n');
  const out: Raw[] = [];
  let start = 0;
  let depth = 0;
  tokens.forEach((t: Token, i: number) => {
    if (depth === 0) start = i;
    depth += t.nesting;
    if (depth !== 0) return;
    const group = tokens.slice(start, i + 1);
    const map = group.find((g: Token) => g.map)?.map;
    if (!map) return;
    out.push({
      source: lines.slice(map[0], map[1]).join('\n').trim(),
      html: md.renderer.render(group, md.options, {}),
      lines: [map[0] + 1, map[1]],
    });
  });
  return out;
}

/** Longest common subsequence of block sources, as index pairs. */
function lcs(a: Raw[], b: Raw[]): [number, number][] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].source === b[j].source ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i].source === b[j].source) pairs.push([i++, j++]);
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * 1-based line numbers in the new text that the diff adds. GitLab only accepts a new comment on
 * a line the diff shows, and an added line needs no old line number.
 */
export function addedLines(oldText: string | null, newText: string): number[] {
  const b = newText.split('\n');
  if (oldText === null) return b.map((_, i) => i + 1);
  const a = oldText.split('\n');
  // Trim the common head and tail so the table only covers the changed middle.
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const x = a.slice(head, a.length - tail), y = b.slice(head, b.length - tail);
  const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--)
    for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const added: number[] = [];
  let i = 0, j = 0;
  while (j < y.length) {
    if (i < x.length && x[i] === y[j]) i++, j++;
    else if (i < x.length && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else added.push(head + ++j);
  }
  return added;
}

export function markdownDiff(oldText: string | null, newText: string, links?: Links): Block[] {
  const md = renderer(links);
  const a = oldText === null ? [] : blocks(md, oldText);
  const b = blocks(md, newText);
  const out: Block[] = [];
  let i = 0, j = 0;
  // Between two matched blocks, pair up the unmatched old and new blocks as changes.
  const flush = (iEnd: number, jEnd: number) => {
    while (i < iEnd && j < jEnd) out.push({ status: 'changed', html: b[j].html, oldHtml: a[i++].html, lines: b[j++].lines });
    while (i < iEnd) out.push({ status: 'removed', html: a[i].html, lines: a[i++].lines });
    while (j < jEnd) out.push({ status: 'added', html: b[j].html, lines: b[j++].lines });
  };
  for (const [ai, bj] of lcs(a, b)) {
    flush(ai, bj);
    out.push({ status: 'same', html: b[bj].html, lines: b[bj].lines });
    i = ai + 1;
    j = bj + 1;
  }
  flush(a.length, b.length);
  return out;
}
